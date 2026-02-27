/**
 * Seed script — inserts 4 recipes + 3 mixer profiles from spec §14/§7.6 into the DB.
 * Run: node scripts/seed.mjs
 */

import Database from 'better-sqlite3'
import crypto, { randomUUID } from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, '../data/recipe-engine.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Ensure schema exists
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    name TEXT,
    google_id TEXT,
    active_bakery_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bakeries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT NOT NULL REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS bakery_members (
    id TEXT PRIMARY KEY,
    bakery_id TEXT NOT NULL REFERENCES bakeries(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(bakery_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    bakery_id TEXT NOT NULL REFERENCES bakeries(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    invited_by TEXT NOT NULL REFERENCES users(id),
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    UNIQUE(bakery_id, email)
  );
  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bakery_id TEXT REFERENCES bakeries(id),
    name TEXT NOT NULL,
    yield_per_piece REAL NOT NULL DEFAULT 0,
    ddt REAL NOT NULL DEFAULT 24,
    process_loss_pct REAL NOT NULL DEFAULT 0,
    bake_loss_pct REAL NOT NULL DEFAULT 0,
    autolyse INTEGER NOT NULL DEFAULT 0,
    autolyse_duration_min INTEGER NOT NULL DEFAULT 20,
    mixer_profile_id TEXT,
    mix_type TEXT NOT NULL DEFAULT 'Improved Mix',
    dough_type TEXT,
    base_ingredient_category TEXT NOT NULL DEFAULT 'FLOUR',
    autolyse_overrides TEXT NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    base_qty REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS preferment_bakers_pcts (
    ingredient_id TEXT NOT NULL REFERENCES recipe_ingredients(id) ON DELETE CASCADE,
    preferment_ingredient_id TEXT NOT NULL REFERENCES recipe_ingredients(id) ON DELETE CASCADE,
    bakers_pct REAL,
    PRIMARY KEY (ingredient_id, preferment_ingredient_id)
  );
  CREATE TABLE IF NOT EXISTS preferment_settings (
    ingredient_id TEXT PRIMARY KEY REFERENCES recipe_ingredients(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 1,
    type TEXT NOT NULL DEFAULT 'CUSTOM',
    ddt REAL,
    fermentation_duration_min INTEGER,
    source_template_id TEXT,
    source_version INTEGER
  );
  CREATE TABLE IF NOT EXISTS process_steps (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    duration_min INTEGER,
    temperature REAL,
    mixer_speed TEXT,
    notes TEXT,
    preferment_ingredient_id TEXT REFERENCES recipe_ingredients(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS recipe_companions (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    companion_recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'other',
    sort_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    qty REAL NOT NULL DEFAULT 0,
    source_template_id TEXT,
    source_version INTEGER,
    UNIQUE(recipe_id, companion_recipe_id)
  );
  CREATE TABLE IF NOT EXISTS recipe_templates (
    id TEXT PRIMARY KEY,
    bakery_id TEXT NOT NULL REFERENCES bakeries(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    template_type TEXT NOT NULL DEFAULT 'preferment',
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_recipe_templates_bakery ON recipe_templates(bakery_id);
  CREATE INDEX IF NOT EXISTS idx_recipe_templates_recipe ON recipe_templates(recipe_id);
  CREATE INDEX IF NOT EXISTS idx_recipe_companions_recipe ON recipe_companions(recipe_id);
  CREATE TABLE IF NOT EXISTS mixer_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bakery_id TEXT REFERENCES bakeries(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'SPIRAL',
    friction_factor REAL NOT NULL DEFAULT 12,
    first_speed_rpm REAL NOT NULL DEFAULT 105,
    second_speed_rpm REAL NOT NULL DEFAULT 204
  );
  CREATE TABLE IF NOT EXISTS mixer_calibrations (
    id TEXT PRIMARY KEY,
    mixer_id TEXT NOT NULL REFERENCES mixer_profiles(id) ON DELETE CASCADE,
    mix_type TEXT NOT NULL,
    first_speed_rounds REAL NOT NULL,
    UNIQUE(mixer_id, mix_type)
  );
  CREATE TABLE IF NOT EXISTS ingredient_library (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bakery_id TEXT REFERENCES bakeries(id),
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    UNIQUE(bakery_id, name COLLATE NOCASE)
  );
  CREATE TABLE IF NOT EXISTS recipe_versions (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    snapshot TEXT NOT NULL,
    change_notes TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(recipe_id, version_number)
  );
  CREATE INDEX IF NOT EXISTS idx_recipe_versions_recipe ON recipe_versions(recipe_id);

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    otp_code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_otp ON password_reset_tokens(otp_code);
`)

// Create demo user
const DEMO_EMAIL = 'demo@example.com'
const DEMO_PASSWORD = 'demo123'
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384 }).toString('hex')
  return `${salt}:${hash}`
}

const passwordHash = hashPassword(DEMO_PASSWORD)

let demoUser = db
  .prepare('SELECT id FROM users WHERE email = ?')
  .get(DEMO_EMAIL)
if (!demoUser) {
  const userId = randomUUID()
  db.prepare(
    'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)'
  ).run(userId, DEMO_EMAIL, passwordHash, 'Demo Baker')
  demoUser = { id: userId }
  console.log(`Created demo user: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)
} else {
  console.log(`Demo user already exists: ${DEMO_EMAIL}`)
}

const userId = demoUser.id

// ─── Create Demo Bakery ──────────────────────────────────────────────────────

const demoBakeryId = randomUUID()
let existingBakery = db
  .prepare("SELECT id FROM bakeries WHERE slug = 'demo'")
  .get()

if (!existingBakery) {
  db.prepare(
    'INSERT INTO bakeries (id, name, slug, created_by) VALUES (?, ?, ?, ?)'
  ).run(demoBakeryId, 'Demo Bakery', 'demo', userId)

  db.prepare(
    'INSERT INTO bakery_members (id, bakery_id, user_id, role) VALUES (?, ?, ?, ?)'
  ).run(randomUUID(), demoBakeryId, userId, 'owner')

  db.prepare('UPDATE users SET active_bakery_id = ? WHERE id = ?').run(
    demoBakeryId,
    userId
  )

  console.log('Created Demo Bakery with demo user as owner')
} else {
  console.log('Demo bakery already exists')
}

const bakeryId = existingBakery?.id || demoBakeryId

// ─── Create Viewer User ─────────────────────────────────────────────────────

const VIEWER_EMAIL = 'viewer@example.com'
const VIEWER_PASSWORD = 'viewer123'
const viewerHash = hashPassword(VIEWER_PASSWORD)

let viewerUser = db
  .prepare('SELECT id FROM users WHERE email = ?')
  .get(VIEWER_EMAIL)
if (!viewerUser) {
  const viewerId = randomUUID()
  db.prepare(
    'INSERT INTO users (id, email, password_hash, name, active_bakery_id) VALUES (?, ?, ?, ?, ?)'
  ).run(viewerId, VIEWER_EMAIL, viewerHash, 'Demo Viewer', bakeryId)
  viewerUser = { id: viewerId }
  console.log(`Created viewer user: ${VIEWER_EMAIL} / ${VIEWER_PASSWORD}`)
} else {
  console.log(`Viewer user already exists: ${VIEWER_EMAIL}`)
}

// Add viewer to Demo Bakery if not already a member
const viewerMembership = db
  .prepare(
    'SELECT id FROM bakery_members WHERE bakery_id = ? AND user_id = ?'
  )
  .get(bakeryId, viewerUser.id)
if (!viewerMembership) {
  db.prepare(
    'INSERT INTO bakery_members (id, bakery_id, user_id, role) VALUES (?, ?, ?, ?)'
  ).run(randomUUID(), bakeryId, viewerUser.id, 'viewer')
  console.log('Added viewer user to Demo Bakery as viewer')
} else {
  console.log('Viewer user already a member of Demo Bakery')
}

// ─── Seed Mixer Profiles (§7.6) ─────────────────────────────────────────────

console.log('\nSeeding mixer profiles...\n')

// Clear existing mixer profiles for bakery
const existingMixers = db
  .prepare('SELECT COUNT(*) as count FROM mixer_profiles WHERE bakery_id = ?')
  .get(bakeryId)
if (existingMixers.count > 0) {
  db.prepare('DELETE FROM mixer_profiles WHERE bakery_id = ?').run(bakeryId)
  console.log(`  Cleared ${existingMixers.count} existing mixer profiles\n`)
}

function insertMixerProfile(def) {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO mixer_profiles (id, user_id, bakery_id, name, type, friction_factor, first_speed_rpm, second_speed_rpm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    bakeryId,
    def.name,
    def.type,
    def.friction_factor,
    def.first_speed_rpm,
    def.second_speed_rpm
  )

  for (const [mixType, rounds] of Object.entries(def.calibrations)) {
    db.prepare(
      `INSERT INTO mixer_calibrations (id, mixer_id, mix_type, first_speed_rounds)
       VALUES (?, ?, ?, ?)`
    ).run(randomUUID(), id, mixType, rounds)
  }

  console.log(`  Inserted mixer: ${def.name} (${def.type})`)
  return id
}

const caplainId = insertMixerProfile({
  name: 'Caplain',
  type: 'SPIRAL',
  friction_factor: 12,
  first_speed_rpm: 105,
  second_speed_rpm: 204,
  calibrations: {
    'Improved Mix': 420,
    'Intensive Mix': 525,
    'Short Improved': 525,
  },
})

insertMixerProfile({
  name: 'Haussler',
  type: 'SPIRAL',
  friction_factor: 14,
  first_speed_rpm: 130,
  second_speed_rpm: 180,
  calibrations: {
    'Improved Mix': 455,
    'Intensive Mix': 455,
    'Short Improved': 520,
  },
})

insertMixerProfile({
  name: 'Bhk',
  type: 'SPIRAL',
  friction_factor: 10,
  first_speed_rpm: 150,
  second_speed_rpm: 300,
  calibrations: {
    'Improved Mix': 420,
    'Intensive Mix': 450,
    'Short Improved': 525,
  },
})

insertMixerProfile({
  name: 'Artofex Oblique',
  type: 'OBLIQUE',
  friction_factor: 8,
  first_speed_rpm: 40,
  second_speed_rpm: 80,
  calibrations: {
    'Improved Mix': 180,
    'Intensive Mix': 200,
    'Short Improved': 200,
  },
})

// ─── Seed Recipes ────────────────────────────────────────────────────────────

// Helper to insert a recipe
function insertRecipe(recipeDef) {
  const recipeId = randomUUID()

  db.prepare(
    `INSERT INTO recipes (id, user_id, bakery_id, name, yield_per_piece, ddt, mixer_profile_id, mix_type, dough_type, process_loss_pct, bake_loss_pct)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    recipeId,
    userId,
    bakeryId,
    recipeDef.name,
    recipeDef.yield_per_piece,
    recipeDef.ddt,
    recipeDef.mixer_profile_id || null,
    recipeDef.mix_type || 'Improved Mix',
    recipeDef.dough_type || null,
    recipeDef.process_loss_pct || 0,
    recipeDef.bake_loss_pct || 0
  )

  // Build name -> id map, insert ingredients
  const nameToId = {}
  const pfNames = new Set()

  for (let i = 0; i < recipeDef.ingredients.length; i++) {
    const ing = recipeDef.ingredients[i]
    const ingId = randomUUID()
    nameToId[ing.name] = ingId
    if (ing.category === 'PREFERMENT') pfNames.add(ing.name)

    db.prepare(
      'INSERT INTO recipe_ingredients (id, recipe_id, name, category, base_qty, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(ingId, recipeId, ing.name, ing.category, ing.K, i)
  }

  // Insert preferment settings and baker's pcts
  if (recipeDef.preferments) {
    for (const pf of recipeDef.preferments) {
      const pfIngId = nameToId[pf.name]
      if (!pfIngId) {
        console.warn(`  Warning: PF "${pf.name}" not found in ingredients`)
        continue
      }

      db.prepare(
        `INSERT INTO preferment_settings (ingredient_id, enabled, type, ddt, fermentation_duration_min, source_template_id, source_version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        pfIngId,
        pf.enabled ? 1 : 0,
        pf.type,
        pf.ddt ?? null,
        pf.fermentation_duration_min ?? null,
        pf.source_template_id || null,
        pf.source_version ?? null
      )

      // Insert baker's pcts for each ingredient in this PF
      for (const [ingName, bp] of Object.entries(pf.bakers_pcts)) {
        const ingId = nameToId[ingName]
        if (ingId && bp != null) {
          db.prepare(
            'INSERT OR REPLACE INTO preferment_bakers_pcts (ingredient_id, preferment_ingredient_id, bakers_pct) VALUES (?, ?, ?)'
          ).run(ingId, pfIngId, bp)
        }
      }
    }
  }

  // Insert process steps
  if (recipeDef.process_steps) {
    for (let i = 0; i < recipeDef.process_steps.length; i++) {
      const step = recipeDef.process_steps[i]
      db.prepare(
        `INSERT INTO process_steps (id, recipe_id, stage, sort_order, title, description, duration_min, temperature, mixer_speed, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        recipeId,
        step.stage,
        i,
        step.title || '',
        step.description || '',
        step.duration_min ?? null,
        step.temperature ?? null,
        step.mixer_speed || null,
        step.notes || null
      )
    }
  }

  console.log(
    `  Inserted recipe: ${recipeDef.name} (${
      recipeDef.ingredients.length
    } ingredients, mix_type: ${recipeDef.mix_type || 'Improved Mix'})`
  )
  return recipeId
}

/**
 * Insert a companion link between two recipes.
 */
function insertCompanion(parentRecipeId, companionRecipeId, role, qty, opts = {}) {
  db.prepare(
    `INSERT INTO recipe_companions (id, recipe_id, companion_recipe_id, role, sort_order, notes, qty, source_template_id, source_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    parentRecipeId,
    companionRecipeId,
    role || 'other',
    opts.sort_order || 0,
    opts.notes || null,
    qty || 0,
    opts.source_template_id || null,
    opts.source_version ?? null
  )
}

/**
 * Create a template pointing to a recipe.
 */
function insertTemplate(name, templateType, recipeId) {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO recipe_templates (id, bakery_id, name, template_type, recipe_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, bakeryId, name, templateType, recipeId)
  console.log(`  Inserted template: ${name} (${templateType}) → recipe ${recipeId.slice(0, 8)}…`)
  return id
}

console.log('\nSeeding recipes...\n')

// Clear existing templates and recipes for bakery
const existingTemplates = db
  .prepare('SELECT COUNT(*) as count FROM recipe_templates WHERE bakery_id = ?')
  .get(bakeryId)
if (existingTemplates.count > 0) {
  db.prepare('DELETE FROM recipe_templates WHERE bakery_id = ?').run(bakeryId)
  console.log(`  Cleared ${existingTemplates.count} existing templates`)
}

const existing = db
  .prepare('SELECT COUNT(*) as count FROM recipes WHERE bakery_id = ?')
  .get(bakeryId)
if (existing.count > 0) {
  db.prepare('DELETE FROM recipes WHERE bakery_id = ?').run(bakeryId)
  console.log(`  Cleared ${existing.count} existing recipes\n`)
}

// 14.1 Panettone
insertRecipe({
  name: 'Panettone',
  yield_per_piece: 80,
  ddt: 24,
  mixer_profile_id: caplainId,
  mix_type: 'Improved Mix',
  dough_type: 'RICH',
  ingredients: [
    { name: 'Bread flour', category: 'FLOUR', K: 234 },
    { name: 'Butter', category: 'ENRICHMENT', K: 357 },
    { name: 'Water', category: 'LIQUID', K: 322 },
    { name: 'Salt', category: 'SEASONING', K: 14 },
    { name: 'Honey', category: 'SWEETENER', K: 54 },
    { name: 'Sugar', category: 'SWEETENER', K: 234 },
    { name: 'Egg Yolks', category: 'ENRICHMENT', K: 70 },
    { name: 'Candied lemon peel', category: 'MIXIN', K: 124 },
    { name: 'Candied orange peel', category: 'MIXIN', K: 357 },
    { name: 'Raisins', category: 'MIXIN', K: 357 },
    { name: 'Vanilla Bean', category: 'FLAVORING', K: 2.5 },
    { name: 'Orange Peel', category: 'FLAVORING', K: 1.5 },
    { name: 'Yeast', category: 'LEAVENING', K: 0 },
    { name: 'Malt', category: 'FLAVORING', K: 0 },
    { name: 'Levain', category: 'PREFERMENT', K: 2413 },
  ],
  preferments: [
    {
      name: 'Levain',
      type: 'LEVAIN',
      enabled: true,
      ddt: 27,
      fermentation_duration_min: 480,
      bakers_pcts: {
        'Bread flour': 1.0,
        Butter: 0.24,
        Water: 0.55,
        Yeast: 0.003,
        Malt: 0.02,
        Sugar: 0.24,
        'Egg Yolks': 0.16,
        Levain: 0.25,
      },
    },
  ],
})

// 14.2 French Baguette
insertRecipe({
  name: 'French Baguette',
  yield_per_piece: 350,
  ddt: 24,
  mixer_profile_id: caplainId,
  mix_type: 'Short Mix',
  dough_type: 'LEAN',
  ingredients: [
    { name: 'Bread flour', category: 'FLOUR', K: 1000 },
    { name: 'Water', category: 'LIQUID', K: 700 },
    { name: 'Salt', category: 'SEASONING', K: 20 },
    { name: 'Yeast', category: 'LEAVENING', K: 3 },
    { name: 'Poolish', category: 'PREFERMENT', K: 400 },
  ],
  preferments: [
    {
      name: 'Poolish',
      type: 'POOLISH',
      enabled: true,
      bakers_pcts: {
        'Bread flour': 1.0,
        Water: 1.0,
        Yeast: 0.001,
      },
    },
  ],
})

// 14.3 Country Sourdough Batard
insertRecipe({
  name: 'Country Sourdough Batard',
  yield_per_piece: 800,
  ddt: 24,
  mixer_profile_id: caplainId,
  mix_type: 'Short Mix',
  dough_type: 'SOURDOUGH',
  ingredients: [
    { name: 'Bread flour', category: 'FLOUR', K: 850 },
    { name: 'WW Flour', category: 'FLOUR', K: 150 },
    { name: 'Water', category: 'LIQUID', K: 750 },
    { name: 'Salt', category: 'SEASONING', K: 20 },
    { name: 'Liquid Levain', category: 'PREFERMENT', K: 200 },
  ],
  preferments: [
    {
      name: 'Liquid Levain',
      type: 'LEVAIN',
      enabled: true,
      bakers_pcts: {
        'Bread flour': 1.0,
        Water: 1.0,
        'Liquid Levain': 0.2,
      },
    },
  ],
})

// 14.4 Brioche
insertRecipe({
  name: 'Brioche',
  yield_per_piece: 60,
  ddt: 22,
  mixer_profile_id: caplainId,
  mix_type: 'Intensive Mix',
  dough_type: 'RICH',
  ingredients: [
    { name: 'Bread flour', category: 'FLOUR', K: 1000 },
    { name: 'Eggs', category: 'ENRICHMENT', K: 500 },
    { name: 'Butter', category: 'ENRICHMENT', K: 500 },
    { name: 'Sugar', category: 'SWEETENER', K: 120 },
    { name: 'Salt', category: 'SEASONING', K: 20 },
    { name: 'Yeast', category: 'LEAVENING', K: 30 },
    { name: 'Milk', category: 'LIQUID', K: 50 },
    { name: 'Sponge', category: 'PREFERMENT', K: 400 },
  ],
  preferments: [
    {
      name: 'Sponge',
      type: 'SPONGE',
      enabled: true,
      bakers_pcts: {
        'Bread flour': 1.0,
        Milk: 0.5,
        Yeast: 0.03,
        Sugar: 0.1,
      },
    },
  ],
})

// ─── Seed Template Recipes ──────────────────────────────────────────────────

console.log('\nSeeding template recipes & templates...\n')

// Template 1: "Italian Levain" — a preferment template used by Panettone + Pan d'Oro
const italianLevainRecipeId = insertRecipe({
  name: 'Italian Levain',
  yield_per_piece: 0,
  ddt: 27,
  dough_type: 'RICH',
  mix_type: 'Improved Mix',
  mixer_profile_id: caplainId,
  ingredients: [
    { name: 'Bread flour', category: 'FLOUR', K: 1000 },
    { name: 'Water', category: 'LIQUID', K: 550 },
    { name: 'Sugar', category: 'SWEETENER', K: 240 },
    { name: 'Butter', category: 'ENRICHMENT', K: 240 },
    { name: 'Egg Yolks', category: 'ENRICHMENT', K: 160 },
    { name: 'Yeast', category: 'LEAVENING', K: 3 },
    { name: 'Malt', category: 'FLAVORING', K: 20 },
    { name: 'Starter', category: 'PREFERMENT', K: 250 },
  ],
  preferments: [
    {
      name: 'Starter',
      type: 'LEVAIN',
      enabled: true,
      ddt: 27,
      fermentation_duration_min: 480,
      bakers_pcts: {
        'Bread flour': 1.0,
        Water: 0.5,
        Starter: 0.2,
      },
    },
  ],
  process_steps: [
    { stage: 'MIX', title: 'Incorporate flour & water', description: 'Mix on 1st speed until combined', duration_min: 5, mixer_speed: '1st' },
    { stage: 'MIX', title: 'Add sugar & butter', description: 'Add in stages on 2nd speed', duration_min: 8, mixer_speed: '2nd' },
    { stage: 'MIX', title: 'Add yolks', description: 'Add egg yolks one at a time', duration_min: 4, mixer_speed: '2nd' },
    { stage: 'BULK_FERMENT', title: 'Bulk fermentation', description: 'Ferment at 27°C', duration_min: 480, temperature: 27 },
  ],
})

const italianLevainTemplateId = insertTemplate('Italian Levain', 'preferment', italianLevainRecipeId)

// Bump the version to 2 so we can test "stale" detection
db.prepare('UPDATE recipes SET version = 2 WHERE id = ?').run(italianLevainRecipeId)

// Template 2: "Pastry Cream" — a filling template used as companion
const pastryCreamRecipeId = insertRecipe({
  name: 'Pastry Cream',
  yield_per_piece: 0,
  ddt: 20,
  dough_type: null,
  mix_type: 'Improved Mix',
  process_loss_pct: 0.03,
  ingredients: [
    { name: 'Whole Milk', category: 'LIQUID', K: 1000 },
    { name: 'Sugar', category: 'SWEETENER', K: 200 },
    { name: 'Egg Yolks', category: 'ENRICHMENT', K: 180 },
    { name: 'Cornstarch', category: 'FLOUR', K: 80 },
    { name: 'Butter', category: 'ENRICHMENT', K: 50 },
    { name: 'Vanilla Bean', category: 'FLAVORING', K: 2 },
  ],
  preferments: [],
  process_steps: [
    { stage: 'MIX', title: 'Heat milk', description: 'Bring milk with half the sugar to boil', duration_min: 8, temperature: 85 },
    { stage: 'MIX', title: 'Whisk yolks', description: 'Whisk yolks, remaining sugar, and cornstarch', duration_min: 3 },
    { stage: 'MIX', title: 'Temper & cook', description: 'Pour hot milk into yolk mixture, return to heat, cook until thick', duration_min: 5, temperature: 85 },
    { stage: 'COOLING', title: 'Cool', description: 'Add butter, cover with plastic, chill', duration_min: 60, temperature: 4 },
  ],
})

const pastryCreamTemplateId = insertTemplate('Pastry Cream', 'filling', pastryCreamRecipeId)

// Template 3: "Apricot Glaze" — a glaze template
const apricotGlazeRecipeId = insertRecipe({
  name: 'Apricot Glaze',
  yield_per_piece: 0,
  ddt: 20,
  dough_type: null,
  mix_type: 'Improved Mix',
  ingredients: [
    { name: 'Apricot jam', category: 'SWEETENER', K: 500 },
    { name: 'Water', category: 'LIQUID', K: 100 },
    { name: 'Sugar', category: 'SWEETENER', K: 50 },
    { name: 'Lemon juice', category: 'LIQUID', K: 15 },
  ],
  preferments: [],
  process_steps: [
    { stage: 'MIX', title: 'Combine & heat', description: 'Combine all ingredients and bring to boil', duration_min: 5, temperature: 100 },
    { stage: 'MIX', title: 'Strain', description: 'Pass through fine sieve while hot', duration_min: 2 },
  ],
})

const apricotGlazeTemplateId = insertTemplate('Apricot Glaze', 'glaze', apricotGlazeRecipeId)

// Template 4: "Streusel Topping" — a garnish template
const streuselRecipeId = insertRecipe({
  name: 'Streusel Topping',
  yield_per_piece: 0,
  ddt: 20,
  dough_type: null,
  mix_type: 'Improved Mix',
  ingredients: [
    { name: 'All-purpose flour', category: 'FLOUR', K: 300 },
    { name: 'Butter', category: 'ENRICHMENT', K: 200 },
    { name: 'Sugar', category: 'SWEETENER', K: 200 },
    { name: 'Cinnamon', category: 'FLAVORING', K: 5 },
    { name: 'Salt', category: 'SEASONING', K: 2 },
  ],
  preferments: [],
  process_steps: [
    { stage: 'MIX', title: 'Cut butter', description: 'Rub cold butter into dry ingredients until pea-sized', duration_min: 5 },
    { stage: 'COOLING', title: 'Chill', description: 'Refrigerate until firm', duration_min: 30, temperature: 4 },
  ],
})

const streuselTemplateId = insertTemplate('Streusel Topping', 'garnish', streuselRecipeId)

// Template 5: "Poolish 12h" — another preferment template for lean breads
const poolish12hRecipeId = insertRecipe({
  name: 'Poolish 12h',
  yield_per_piece: 0,
  ddt: 22,
  dough_type: 'LEAN',
  mix_type: 'Short Mix',
  ingredients: [
    { name: 'Bread flour', category: 'FLOUR', K: 1000 },
    { name: 'Water', category: 'LIQUID', K: 1000 },
    { name: 'Yeast', category: 'LEAVENING', K: 1 },
  ],
  preferments: [],
  process_steps: [
    { stage: 'MIX', title: 'Combine', description: 'Mix flour, water, and yeast until smooth', duration_min: 2 },
    { stage: 'BULK_FERMENT', title: 'Ferment 12h', description: 'Ferment at room temp (22°C) for 12 hours', duration_min: 720, temperature: 22 },
  ],
})

const poolish12hTemplateId = insertTemplate('Poolish 12h', 'preferment', poolish12hRecipeId)

// ─── Seed Recipes with Template Links ──────────────────────────────────────

console.log('\nSeeding recipes with template links...\n')

// Pan d'Oro — uses Italian Levain template (linked, at version 1 so it's STALE since template is v2)
const pandoroId = insertRecipe({
  name: "Pan d'Oro",
  yield_per_piece: 500,
  ddt: 24,
  mixer_profile_id: caplainId,
  mix_type: 'Improved Mix',
  dough_type: 'RICH',
  ingredients: [
    { name: 'Bread flour', category: 'FLOUR', K: 500 },
    { name: 'Butter', category: 'ENRICHMENT', K: 350 },
    { name: 'Water', category: 'LIQUID', K: 200 },
    { name: 'Salt', category: 'SEASONING', K: 10 },
    { name: 'Sugar', category: 'SWEETENER', K: 250 },
    { name: 'Egg Yolks', category: 'ENRICHMENT', K: 120 },
    { name: 'Vanilla Bean', category: 'FLAVORING', K: 3 },
    { name: 'Lemon Zest', category: 'FLAVORING', K: 2 },
    { name: 'Yeast', category: 'LEAVENING', K: 0 },
    { name: 'Italian Levain', category: 'PREFERMENT', K: 1200 },
  ],
  preferments: [
    {
      name: 'Italian Levain',
      type: 'LEVAIN',
      enabled: true,
      ddt: 27,
      fermentation_duration_min: 480,
      source_template_id: italianLevainTemplateId,
      source_version: 1, // Stale! Template is at version 2
      bakers_pcts: {
        'Bread flour': 1.0,
        Water: 0.55,
        Sugar: 0.24,
        Butter: 0.24,
        'Egg Yolks': 0.16,
        Yeast: 0.003,
        'Italian Levain': 0.25,
      },
    },
  ],
  process_steps: [
    { stage: 'MIX', title: 'Incorporate dry', description: 'Mix flour, sugar, levain on 1st speed', duration_min: 5, mixer_speed: '1st' },
    { stage: 'MIX', title: 'Add butter & yolks', description: 'Gradually add butter and egg yolks', duration_min: 12, mixer_speed: '2nd' },
    { stage: 'BULK_FERMENT', title: 'First rise', description: 'Ferment at 27°C until doubled', duration_min: 120, temperature: 27 },
    { stage: 'SHAPE', title: 'Shape into pan d\'oro mold', description: 'Gently shape and place in star mold', duration_min: 10 },
    { stage: 'PROOF', title: 'Final proof', description: 'Proof at 28°C until dough reaches mold rim', duration_min: 180, temperature: 28 },
    { stage: 'BAKE', title: 'Bake', description: 'Bake at 170°C', duration_min: 45, temperature: 170 },
  ],
})

// Add Apricot Glaze as companion (linked from template)
insertCompanion(pandoroId, apricotGlazeRecipeId, 'glaze', 80, {
  sort_order: 0,
  notes: 'Brush while warm',
  source_template_id: apricotGlazeTemplateId,
  source_version: 1,
})

console.log("  Linked Pan d'Oro: Italian Levain (PF, stale), Apricot Glaze (companion)")

// Colomba — also uses Italian Levain template (linked, at version 1 so stale)
const colombaId = insertRecipe({
  name: 'Colomba Pasquale',
  yield_per_piece: 750,
  ddt: 24,
  mixer_profile_id: caplainId,
  mix_type: 'Improved Mix',
  dough_type: 'RICH',
  ingredients: [
    { name: 'Bread flour', category: 'FLOUR', K: 600 },
    { name: 'Butter', category: 'ENRICHMENT', K: 250 },
    { name: 'Water', category: 'LIQUID', K: 250 },
    { name: 'Salt', category: 'SEASONING', K: 12 },
    { name: 'Sugar', category: 'SWEETENER', K: 200 },
    { name: 'Egg Yolks', category: 'ENRICHMENT', K: 100 },
    { name: 'Honey', category: 'SWEETENER', K: 30 },
    { name: 'Candied orange peel', category: 'MIXIN', K: 180 },
    { name: 'Almonds', category: 'MIXIN', K: 100 },
    { name: 'Yeast', category: 'LEAVENING', K: 0 },
    { name: 'Italian Levain', category: 'PREFERMENT', K: 1000 },
  ],
  preferments: [
    {
      name: 'Italian Levain',
      type: 'LEVAIN',
      enabled: true,
      ddt: 27,
      fermentation_duration_min: 480,
      source_template_id: italianLevainTemplateId,
      source_version: 1,
      bakers_pcts: {
        'Bread flour': 1.0,
        Water: 0.55,
        Sugar: 0.24,
        Butter: 0.24,
        'Egg Yolks': 0.16,
        Yeast: 0.003,
        'Italian Levain': 0.25,
      },
    },
  ],
  process_steps: [
    { stage: 'MIX', title: 'Mix first dough', description: 'Combine flour, levain, water, sugar on 1st speed', duration_min: 6, mixer_speed: '1st' },
    { stage: 'MIX', title: 'Add enrichments', description: 'Add butter, yolks, honey gradually on 2nd speed', duration_min: 10, mixer_speed: '2nd' },
    { stage: 'MIX', title: 'Fold in mix-ins', description: 'Gently fold candied peels at end of mix', duration_min: 2, mixer_speed: '1st' },
    { stage: 'BULK_FERMENT', title: 'First rise', description: 'Ferment at 27°C', duration_min: 120, temperature: 27 },
    { stage: 'SHAPE', title: 'Shape colomba', description: 'Shape and place in dove mold', duration_min: 15 },
    { stage: 'PROOF', title: 'Final proof', description: 'Proof at 28°C until dough fills mold', duration_min: 240, temperature: 28 },
    { stage: 'BAKE', title: 'Bake', description: 'Bake at 165°C', duration_min: 50, temperature: 165 },
  ],
})

// Add Streusel + Apricot Glaze as companions (both linked from templates)
insertCompanion(colombaId, streuselRecipeId, 'garnish', 120, {
  sort_order: 0,
  notes: 'Sprinkle on top before baking',
  source_template_id: streuselTemplateId,
  source_version: 1,
})
insertCompanion(colombaId, apricotGlazeRecipeId, 'glaze', 60, {
  sort_order: 1,
  notes: 'Brush after baking',
  source_template_id: apricotGlazeTemplateId,
  source_version: 1,
})

console.log('  Linked Colomba: Italian Levain (PF, stale), Streusel (companion), Apricot Glaze (companion)')

// Fruit Danish — uses Pastry Cream (companion from template) + Apricot Glaze (companion from template)
const fruitDanishId = insertRecipe({
  name: 'Fruit Danish',
  yield_per_piece: 120,
  ddt: 20,
  mixer_profile_id: caplainId,
  mix_type: 'Short Mix',
  dough_type: 'LAMINATED',
  ingredients: [
    { name: 'Bread flour', category: 'FLOUR', K: 500 },
    { name: 'Pastry flour', category: 'FLOUR', K: 500 },
    { name: 'Butter (dough)', category: 'ENRICHMENT', K: 100 },
    { name: 'Butter (block)', category: 'ENRICHMENT', K: 500 },
    { name: 'Milk', category: 'LIQUID', K: 500 },
    { name: 'Sugar', category: 'SWEETENER', K: 120 },
    { name: 'Salt', category: 'SEASONING', K: 20 },
    { name: 'Eggs', category: 'ENRICHMENT', K: 100 },
    { name: 'Yeast', category: 'LEAVENING', K: 40 },
    { name: 'Vanilla extract', category: 'FLAVORING', K: 5 },
  ],
  preferments: [],
  process_steps: [
    { stage: 'MIX', title: 'Mix dough', description: 'Combine all except butter block on 1st speed', duration_min: 6, mixer_speed: '1st' },
    { stage: 'COOLING', title: 'Chill dough', description: 'Wrap and chill at 4°C', duration_min: 60, temperature: 4 },
    { stage: 'SHAPE', title: 'Laminate', description: '3 single folds with butter block', duration_min: 45 },
    { stage: 'COOLING', title: 'Rest between folds', description: 'Chill 20 min between each fold', duration_min: 60, temperature: 4 },
    { stage: 'SHAPE', title: 'Cut & shape', description: 'Roll out, cut squares, shape pinwheels', duration_min: 20 },
    { stage: 'PROOF', title: 'Proof', description: 'Proof at 27°C until puffy', duration_min: 75, temperature: 27 },
    { stage: 'BAKE', title: 'Bake', description: 'Bake at 190°C', duration_min: 18, temperature: 190 },
  ],
})

// Add Pastry Cream + Apricot Glaze as companions
insertCompanion(fruitDanishId, pastryCreamRecipeId, 'filling', 30, {
  sort_order: 0,
  notes: 'Pipe 30g into center before baking',
  source_template_id: pastryCreamTemplateId,
  source_version: 1,
})
insertCompanion(fruitDanishId, apricotGlazeRecipeId, 'glaze', 10, {
  sort_order: 1,
  notes: 'Brush immediately after baking',
  source_template_id: apricotGlazeTemplateId,
  source_version: 1,
})

console.log('  Linked Fruit Danish: Pastry Cream (filling), Apricot Glaze (glaze)')

// Coffee Cake — uses Streusel (companion from template), no PF templates
const coffeeCakeId = insertRecipe({
  name: 'Coffee Cake',
  yield_per_piece: 400,
  ddt: 22,
  mixer_profile_id: caplainId,
  mix_type: 'Improved Mix',
  dough_type: 'SOFT_ENRICHED',
  ingredients: [
    { name: 'All-purpose flour', category: 'FLOUR', K: 1000 },
    { name: 'Butter', category: 'ENRICHMENT', K: 250 },
    { name: 'Milk', category: 'LIQUID', K: 400 },
    { name: 'Sugar', category: 'SWEETENER', K: 300 },
    { name: 'Eggs', category: 'ENRICHMENT', K: 200 },
    { name: 'Salt', category: 'SEASONING', K: 10 },
    { name: 'Baking powder', category: 'LEAVENING', K: 15 },
    { name: 'Vanilla extract', category: 'FLAVORING', K: 10 },
    { name: 'Sour cream', category: 'LIQUID', K: 250 },
    { name: 'Cinnamon', category: 'FLAVORING', K: 8 },
  ],
  preferments: [],
  process_steps: [
    { stage: 'MIX', title: 'Cream butter & sugar', description: 'Beat until light and fluffy', duration_min: 5, mixer_speed: '2nd' },
    { stage: 'MIX', title: 'Add eggs & vanilla', description: 'Add eggs one at a time', duration_min: 3, mixer_speed: '1st' },
    { stage: 'MIX', title: 'Fold dry ingredients', description: 'Alternate flour mixture and sour cream', duration_min: 3, mixer_speed: '1st' },
    { stage: 'SHAPE', title: 'Pan & layer', description: 'Layer batter and cinnamon swirl in pan', duration_min: 5 },
    { stage: 'BAKE', title: 'Bake', description: 'Bake at 175°C', duration_min: 45, temperature: 175 },
  ],
})

insertCompanion(coffeeCakeId, streuselRecipeId, 'garnish', 200, {
  sort_order: 0,
  notes: 'Cover top generously before baking',
  source_template_id: streuselTemplateId,
  source_version: 1,
})

console.log('  Linked Coffee Cake: Streusel (garnish)')

// Ciabatta — uses Poolish 12h template (PF link, NOT stale since version matches)
const ciabattaId = insertRecipe({
  name: 'Ciabatta',
  yield_per_piece: 350,
  ddt: 24,
  mixer_profile_id: caplainId,
  mix_type: 'Short Mix',
  dough_type: 'LEAN',
  ingredients: [
    { name: 'Bread flour', category: 'FLOUR', K: 1000 },
    { name: 'Water', category: 'LIQUID', K: 800 },
    { name: 'Salt', category: 'SEASONING', K: 22 },
    { name: 'Yeast', category: 'LEAVENING', K: 3 },
    { name: 'Olive oil', category: 'ENRICHMENT', K: 30 },
    { name: 'Poolish', category: 'PREFERMENT', K: 500 },
  ],
  preferments: [
    {
      name: 'Poolish',
      type: 'POOLISH',
      enabled: true,
      ddt: 22,
      fermentation_duration_min: 720,
      source_template_id: poolish12hTemplateId,
      source_version: 1, // Matches template version — NOT stale
      bakers_pcts: {
        'Bread flour': 1.0,
        Water: 1.0,
        Yeast: 0.001,
      },
    },
  ],
  process_steps: [
    { stage: 'MIX', title: 'Autolyse', description: 'Mix flour, water, poolish — rest 30 min', duration_min: 30 },
    { stage: 'MIX', title: 'Add salt & yeast', description: 'Add salt and yeast on 1st speed', duration_min: 4, mixer_speed: '1st' },
    { stage: 'BULK_FERMENT', title: 'Bulk fermentation', description: 'Stretch and fold every 30 min × 3', duration_min: 120, temperature: 24 },
    { stage: 'SHAPE', title: 'Cut & shape', description: 'Flour top, flip, stretch gently into rectangles', duration_min: 10 },
    { stage: 'PROOF', title: 'Final proof', description: 'Rest on couche 30 min', duration_min: 30 },
    { stage: 'BAKE', title: 'Bake', description: 'Bake at 230°C with steam', duration_min: 25, temperature: 230 },
  ],
})

console.log('  Linked Ciabatta: Poolish 12h (PF, current)')

// ─── Summary ────────────────────────────────────────────────────────────────

const finalRecipeCount = db
  .prepare('SELECT COUNT(*) as count FROM recipes WHERE bakery_id = ?')
  .get(bakeryId).count
const finalTemplateCount = db
  .prepare('SELECT COUNT(*) as count FROM recipe_templates WHERE bakery_id = ?')
  .get(bakeryId).count
const finalCompanionCount = db
  .prepare(
    `SELECT COUNT(*) as count FROM recipe_companions rc
     JOIN recipes r ON r.id = rc.recipe_id
     WHERE r.bakery_id = ?`
  )
  .get(bakeryId).count
const linkedPfCount = db
  .prepare(
    `SELECT COUNT(*) as count FROM preferment_settings ps
     JOIN recipe_ingredients ri ON ri.id = ps.ingredient_id
     JOIN recipes r ON r.id = ri.recipe_id
     WHERE r.bakery_id = ? AND ps.source_template_id IS NOT NULL`
  )
  .get(bakeryId).count

console.log(
  `\nDone! Seeded ${finalRecipeCount} recipes + ${finalTemplateCount} templates + ${finalCompanionCount} companions + ${linkedPfCount} template-linked PFs + 4 mixer profiles`
)
console.log('  Owner: demo@example.com / demo123')
console.log('  Viewer: viewer@example.com / viewer123')
console.log('')
console.log('  Templates:')
console.log('    Italian Levain (preferment) — linked by Pan d\'Oro (stale!) + Colomba (stale!)')
console.log('    Poolish 12h (preferment) — linked by Ciabatta (current)')
console.log('    Pastry Cream (filling) — linked by Fruit Danish')
console.log('    Apricot Glaze (glaze) — linked by Pan d\'Oro, Colomba, Fruit Danish')
console.log('    Streusel Topping (garnish) — linked by Colomba, Coffee Cake')
console.log('')
db.close()
