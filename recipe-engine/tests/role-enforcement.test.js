/**
 * Role Enforcement Tests
 *
 * Verifies that all domain route mutation actions reject viewer access (403)
 * and that load functions return the correct `canEdit` flag.
 *
 * Strategy: mock DB/engine modules so no real DB is needed, but use the real
 * requireRole() function so we test actual security behavior.
 */
import { describe, it, expect, vi } from 'vitest'

// ── Mock DB and engine ──────────────────────────────────
vi.mock('$lib/server/db.js', () => ({
  getRecipesByBakery: vi.fn(() => []),
  getRecipe: vi.fn(() => ({
    id: 'r1',
    name: 'Test',
    ingredients: [],
    version: 1,
  })),
  deleteRecipe: vi.fn(),
  createRecipe: vi.fn(() => 'new-id'),
  updateRecipe: vi.fn(),
  getMixerProfiles: vi.fn(() => []),
  createMixerProfile: vi.fn(() => 'mixer-1'),
  updateMixerProfile: vi.fn(),
  deleteMixerProfile: vi.fn(),
  getIngredientLibrary: vi.fn(() => []),
  createIngredientLibraryEntry: vi.fn(),
  updateIngredientLibraryEntry: vi.fn(),
  deleteIngredientLibraryEntry: vi.fn(),
  syncIngredientLibrary: vi.fn(),
  getRecipeVersions: vi.fn(() => []),
  getRecipeVersionCount: vi.fn(() => 0),
  getParentsForRecipe: vi.fn(() => []),
  getBakerySettings: vi.fn(() => ({})),
}))

vi.mock('$lib/server/engine.js', () => ({
  calculateRecipe: vi.fn(() => ({
    totals: {
      hydration: 0.65,
      total_weight: 1000,
      num_pieces: 10,
      total_flour: 600,
      total_prefermented_flour_pct: 0,
    },
    preferments: [],
  })),
}))

// ── Helpers ─────────────────────────────────────────────

function makeLocals(role) {
  return {
    user: { id: 'u1', email: 'test@test.com' },
    bakery: { id: 'b1', name: 'Test Bakery', slug: 'test', role },
  }
}

function makeRequest(entries = {}) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) {
    fd.append(k, v)
  }
  return { formData: () => Promise.resolve(fd) }
}

/**
 * SvelteKit's error() throws HttpError: { status, body: { message } }
 * SvelteKit's redirect() throws Redirect: { status, location }
 */
function isHttpError(e, status) {
  return !!(
    e &&
    typeof e === 'object' &&
    e.status === status &&
    e.body?.message
  )
}

function isRedirect(e) {
  return !!(
    e &&
    typeof e === 'object' &&
    e.status >= 300 &&
    e.status < 400 &&
    e.location
  )
}

// ── Top-level imports (after mocks) ─────────────────────

const { requireRole } = await import('$lib/server/auth.js')

const recipesListModule = await import(
  '../src/routes/(app)/recipes/+page.server.js'
)
const recipesNewModule = await import(
  '../src/routes/(app)/recipes/new/+page.server.js'
)
const recipeDetailModule = await import(
  '../src/routes/(app)/recipes/[id]/+page.server.js'
)
const mixersModule = await import('../src/routes/(app)/mixers/+page.server.js')
const inventoryModule = await import(
  '../src/routes/(app)/inventory/+page.server.js'
)

// ── Tests ───────────────────────────────────────────────

describe('requireRole — unit', () => {
  it('allows owner', () => {
    expect(() =>
      requireRole(makeLocals('owner'), 'owner', 'admin', 'member')
    ).not.toThrow()
  })

  it('allows admin', () => {
    expect(() =>
      requireRole(makeLocals('admin'), 'owner', 'admin', 'member')
    ).not.toThrow()
  })

  it('allows member', () => {
    expect(() =>
      requireRole(makeLocals('member'), 'owner', 'admin', 'member')
    ).not.toThrow()
  })

  it('rejects viewer with 403', () => {
    try {
      requireRole(makeLocals('viewer'), 'owner', 'admin', 'member')
      expect.fail('should have thrown')
    } catch (e) {
      expect(isHttpError(e, 403)).toBe(true)
    }
  })

  it('redirects when no bakery context', () => {
    try {
      requireRole({ user: { id: 'u1' } }, 'owner', 'admin', 'member')
      expect.fail('should have thrown')
    } catch (e) {
      expect(isRedirect(e)).toBe(true)
    }
  })
})

// ── canEdit in load functions ───────────────────────────

describe('canEdit flag in load functions', () => {
  const loadCases = [
    {
      name: 'recipes list',
      load: recipesListModule.load,
      args: (l) => ({ locals: l }),
    },
    {
      name: 'recipe detail',
      load: recipeDetailModule.load,
      args: (l) => ({ locals: l, params: { id: 'r1' } }),
    },
    {
      name: 'mixers',
      load: mixersModule.load,
      args: (l) => ({ locals: l }),
    },
    {
      name: 'inventory',
      load: inventoryModule.load,
      args: (l) => ({ locals: l }),
    },
  ]

  for (const { name, load, args } of loadCases) {
    for (const role of ['owner', 'admin', 'member']) {
      it(`${name}: canEdit=true for ${role}`, () => {
        const result = load(args(makeLocals(role)))
        expect(result.canEdit).toBe(true)
      })
    }

    it(`${name}: canEdit=false for viewer`, () => {
      const result = load(args(makeLocals('viewer')))
      expect(result.canEdit).toBe(false)
    })
  }
})

// ── recipes/new: viewer blocked from load ───────────────

describe('recipes/new — viewer blocked from load', () => {
  it('rejects viewer on load with 403', () => {
    try {
      recipesNewModule.load({ locals: makeLocals('viewer') })
      expect.fail('should have thrown')
    } catch (e) {
      expect(isHttpError(e, 403)).toBe(true)
    }
  })

  it('allows owner on load', () => {
    expect(() =>
      recipesNewModule.load({ locals: makeLocals('owner') })
    ).not.toThrow()
  })
})

// ── Mutation action enforcement ─────────────────────────

describe('viewer rejected from all mutation actions (403)', () => {
  const viewerLocals = makeLocals('viewer')

  const actionCases = [
    {
      name: 'recipes list: delete',
      fn: () =>
        recipesListModule.actions.delete({
          request: makeRequest({ id: 'r1' }),
          locals: viewerLocals,
        }),
    },
    {
      name: 'recipes/new: default',
      fn: () =>
        recipesNewModule.actions.default({
          request: makeRequest({
            name: 'Test',
            yield_per_piece: '500',
            ddt: '24',
          }),
          locals: viewerLocals,
        }),
    },
    {
      name: 'recipe detail: save',
      fn: () =>
        recipeDetailModule.actions.save({
          request: makeRequest({ data: '{}', change_notes: '' }),
          params: { id: 'r1' },
          locals: viewerLocals,
        }),
    },
    {
      name: 'mixers: create',
      fn: () =>
        mixersModule.actions.create({
          request: makeRequest({ data: JSON.stringify({ name: 'Test' }) }),
          locals: viewerLocals,
        }),
    },
    {
      name: 'mixers: update',
      fn: () =>
        mixersModule.actions.update({
          request: makeRequest({
            id: 'm1',
            data: JSON.stringify({ name: 'Test' }),
          }),
          locals: viewerLocals,
        }),
    },
    {
      name: 'mixers: delete',
      fn: () =>
        mixersModule.actions.delete({
          request: makeRequest({ id: 'm1' }),
          locals: viewerLocals,
        }),
    },
    {
      name: 'inventory: create',
      fn: () =>
        inventoryModule.actions.create({
          request: makeRequest({ name: 'Flour', category: 'FLOUR' }),
          locals: viewerLocals,
        }),
    },
    {
      name: 'inventory: update',
      fn: () =>
        inventoryModule.actions.update({
          request: makeRequest({
            id: 'i1',
            name: 'Flour',
            category: 'FLOUR',
          }),
          locals: viewerLocals,
        }),
    },
    {
      name: 'inventory: delete',
      fn: () =>
        inventoryModule.actions.delete({
          request: makeRequest({ id: 'i1' }),
          locals: viewerLocals,
        }),
    },
  ]

  for (const { name, fn } of actionCases) {
    it(`${name}`, async () => {
      try {
        await fn()
        expect.fail('should have thrown 403')
      } catch (e) {
        expect(isHttpError(e, 403)).toBe(true)
      }
    })
  }
})

// ── Allowed roles succeed ───────────────────────────────

describe('allowed roles can call mutation actions', () => {
  for (const role of ['owner', 'admin', 'member']) {
    it(`recipes list: delete succeeds for ${role}`, async () => {
      const result = await recipesListModule.actions.delete({
        request: makeRequest({ id: 'r1' }),
        locals: makeLocals(role),
      })
      expect(result.success).toBe(true)
    })

    it(`mixers: create succeeds for ${role}`, async () => {
      const result = await mixersModule.actions.create({
        request: makeRequest({ data: JSON.stringify({ name: 'Test Mixer' }) }),
        locals: makeLocals(role),
      })
      expect(result.success).toBe(true)
    })

    it(`inventory: create succeeds for ${role}`, async () => {
      const result = await inventoryModule.actions.create({
        request: makeRequest({ name: 'Flour', category: 'FLOUR' }),
        locals: makeLocals(role),
      })
      expect(result.success).toBe(true)
    })
  }
})
