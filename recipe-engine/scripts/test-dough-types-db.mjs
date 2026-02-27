/**
 * Test DB CRUD operations for dough_type.
 * Uses an in-memory SQLite DB to avoid touching production data.
 * Run: node scripts/test-dough-types-db.mjs
 */

import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

console.log('\n═══ DB CRUD Tests ═══\n')

// Create in-memory DB with same schema
const db = new Database(':memory:')
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    name TEXT,
    google_id TEXT,
    active_bakery_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE bakeries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT NOT NULL REFERENCES users(id)
  );
  CREATE TABLE bakery_members (
    id TEXT PRIMARY KEY,
    bakery_id TEXT NOT NULL REFERENCES bakeries(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(bakery_id, user_id)
  );
  CREATE TABLE recipes (
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
    autolyse_overrides TEXT NOT NULL DEFAULT '{}',
    dough_type TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE recipe_ingredients (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    base_qty REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE preferment_bakers_pcts (
    ingredient_id TEXT NOT NULL REFERENCES recipe_ingredients(id) ON DELETE CASCADE,
    preferment_ingredient_id TEXT NOT NULL REFERENCES recipe_ingredients(id) ON DELETE CASCADE,
    bakers_pct REAL,
    PRIMARY KEY (ingredient_id, preferment_ingredient_id)
  );
  CREATE TABLE preferment_settings (
    ingredient_id TEXT PRIMARY KEY REFERENCES recipe_ingredients(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 1,
    type TEXT NOT NULL DEFAULT 'CUSTOM',
    ddt REAL,
    fermentation_duration_min INTEGER
  );
  CREATE TABLE process_steps (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    duration_min INTEGER,
    temperature REAL,
    mixer_speed TEXT,
    notes TEXT
  );
  CREATE TABLE recipe_versions (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    snapshot TEXT NOT NULL,
    change_notes TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(recipe_id, version_number)
  );
`)

// Create test user and bakery
const userId = randomUUID()
const bakeryId = randomUUID()

db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(userId, 'test@test.com', 'hash')
db.prepare('INSERT INTO bakeries (id, name, slug, created_by) VALUES (?, ?, ?, ?)').run(bakeryId, 'Test Bakery', 'test', userId)
db.prepare('INSERT INTO bakery_members (id, bakery_id, user_id, role) VALUES (?, ?, ?, ?)').run(randomUUID(), bakeryId, userId, 'owner')

// ── Test 1: Create recipe with dough_type ────────────────────────────────

{
  const recipeId = randomUUID()
  db.prepare(`
    INSERT INTO recipes (id, user_id, bakery_id, name, yield_per_piece, ddt, dough_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(recipeId, userId, bakeryId, 'Test Croissant', 80, 22, 'LAMINATED_YEASTED')

  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId)
  assert.equal(recipe.dough_type, 'LAMINATED_YEASTED')
  assert.equal(recipe.name, 'Test Croissant')
  console.log('  ✓ Create recipe with dough_type')
}

// ── Test 2: Create recipe without dough_type (null) ──────────────────────

{
  const recipeId = randomUUID()
  db.prepare(`
    INSERT INTO recipes (id, user_id, bakery_id, name, yield_per_piece, ddt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(recipeId, userId, bakeryId, 'Legacy Recipe', 350, 24)

  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId)
  assert.equal(recipe.dough_type, null)
  console.log('  ✓ Create recipe without dough_type → null')
}

// ── Test 3: Update recipe dough_type ─────────────────────────────────────

{
  const recipeId = randomUUID()
  db.prepare(`
    INSERT INTO recipes (id, user_id, bakery_id, name, yield_per_piece, ddt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(recipeId, userId, bakeryId, 'Evolving Recipe', 350, 24)

  // Start with null
  let recipe = db.prepare('SELECT dough_type FROM recipes WHERE id = ?').get(recipeId)
  assert.equal(recipe.dough_type, null)

  // Update to SOURDOUGH
  db.prepare('UPDATE recipes SET dough_type = ? WHERE id = ?').run('SOURDOUGH', recipeId)
  recipe = db.prepare('SELECT dough_type FROM recipes WHERE id = ?').get(recipeId)
  assert.equal(recipe.dough_type, 'SOURDOUGH')

  // Update back to null
  db.prepare('UPDATE recipes SET dough_type = ? WHERE id = ?').run(null, recipeId)
  recipe = db.prepare('SELECT dough_type FROM recipes WHERE id = ?').get(recipeId)
  assert.equal(recipe.dough_type, null)

  console.log('  ✓ Update dough_type: null → SOURDOUGH → null')
}

// ── Test 4: getRecipesByBakery includes dough_type ───────────────────────

{
  const recipes = db.prepare(`
    SELECT r.id, r.name, r.dough_type
    FROM recipes r
    WHERE r.bakery_id = ?
    ORDER BY r.updated_at DESC
  `).all(bakeryId)

  assert.ok(recipes.length >= 3, 'Should have at least 3 recipes')
  const croissant = recipes.find((r) => r.name === 'Test Croissant')
  assert.equal(croissant.dough_type, 'LAMINATED_YEASTED')
  const legacy = recipes.find((r) => r.name === 'Legacy Recipe')
  assert.equal(legacy.dough_type, null)
  console.log(`  ✓ Recipe list query includes dough_type (${recipes.length} recipes)`)
}

// ── Test 5: Snapshot includes dough_type ─────────────────────────────────

{
  // Simulate buildRecipeSnapshot
  const recipe = {
    name: 'Test', yield_per_piece: 350, ddt: 24,
    dough_type: 'LEAN',
    autolyse: 1, autolyse_duration_min: 20,
    autolyse_overrides: {},
    mix_type: 'Short Mix', mixer_profile_id: null,
    process_loss_pct: 0.03, bake_loss_pct: 0.12,
    ingredients: [], process_steps: [],
  }

  const snapshot = {
    name: recipe.name,
    yield_per_piece: recipe.yield_per_piece,
    ddt: recipe.ddt,
    dough_type: recipe.dough_type ?? null,
    autolyse: recipe.autolyse,
    autolyse_duration_min: recipe.autolyse_duration_min,
    autolyse_overrides: recipe.autolyse_overrides || {},
    mix_type: recipe.mix_type,
    mixer_profile_id: recipe.mixer_profile_id,
    process_loss_pct: recipe.process_loss_pct,
    bake_loss_pct: recipe.bake_loss_pct,
    ingredients: [],
    process_steps: [],
  }

  assert.equal(snapshot.dough_type, 'LEAN')
  const json = JSON.stringify(snapshot)
  const parsed = JSON.parse(json)
  assert.equal(parsed.dough_type, 'LEAN')
  console.log('  ✓ Snapshot includes dough_type, survives JSON round-trip')
}

// ── Test 6: Snapshot with null dough_type ─────────────────────────────────

{
  const recipe = {
    name: 'Old Recipe', ddt: 24,
    // dough_type intentionally missing (pre-migration snapshot)
    autolyse: 0,
  }

  const normalized = recipe.dough_type ?? null
  assert.equal(normalized, null, 'Missing dough_type normalizes to null')
  console.log('  ✓ Missing dough_type normalizes to null')
}

// ── Test 7: Full createRecipe → getRecipe round trip ─────────────────────

{
  const recipeId = randomUUID()
  db.prepare(`
    INSERT INTO recipes (id, user_id, bakery_id, name, yield_per_piece, ddt, process_loss_pct, bake_loss_pct, autolyse, autolyse_duration_min, mixer_profile_id, mix_type, autolyse_overrides, dough_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    recipeId, userId, bakeryId, 'Full Test Baguette',
    350, 24, 0.03, 0.12, 1, 20, null, 'Short Mix', '{}', 'LEAN'
  )

  // Add an ingredient
  const ingId = randomUUID()
  db.prepare(`
    INSERT INTO recipe_ingredients (id, recipe_id, name, category, base_qty, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ingId, recipeId, 'Bread flour', 'FLOUR', 1000, 0)

  // Read back
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId)
  assert.equal(recipe.dough_type, 'LEAN')
  assert.equal(recipe.name, 'Full Test Baguette')
  assert.equal(recipe.autolyse, 1)
  assert.equal(recipe.mix_type, 'Short Mix')

  // Simulate updateRecipe with dough_type change
  db.prepare(`
    UPDATE recipes SET name = ?, yield_per_piece = ?, ddt = ?,
    process_loss_pct = ?, bake_loss_pct = ?, autolyse = ?, autolyse_duration_min = ?,
    mixer_profile_id = ?, mix_type = ?, autolyse_overrides = ?, dough_type = ?,
    version = version + 1, updated_at = datetime('now')
    WHERE id = ? AND bakery_id = ?
  `).run(
    'Full Test Sourdough', 800, 24,
    0.03, 0.14, 1, 30,
    null, 'Short Mix', '{}', 'SOURDOUGH',
    recipeId, bakeryId
  )

  const updated = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId)
  assert.equal(updated.dough_type, 'SOURDOUGH')
  assert.equal(updated.name, 'Full Test Sourdough')
  assert.equal(updated.version, 2)
  console.log('  ✓ Full create → update round trip with dough_type change')
}

db.close()

console.log('\n═══════════════════════════════════')
console.log('  All DB tests passed!')
console.log('═══════════════════════════════════\n')
