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
    fermentation_duration_min INTEGER
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
    notes TEXT
  );
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
    'INSERT INTO recipes (id, user_id, bakery_id, name, yield_per_piece, ddt, mixer_profile_id, mix_type, dough_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    recipeId,
    userId,
    bakeryId,
    recipeDef.name,
    recipeDef.yield_per_piece,
    recipeDef.ddt,
    recipeDef.mixer_profile_id || null,
    recipeDef.mix_type || 'Improved Mix',
    recipeDef.dough_type || null
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
        'INSERT INTO preferment_settings (ingredient_id, enabled, type, ddt, fermentation_duration_min) VALUES (?, ?, ?, ?, ?)'
      ).run(
        pfIngId,
        pf.enabled ? 1 : 0,
        pf.type,
        pf.ddt ?? null,
        pf.fermentation_duration_min ?? null
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

  console.log(
    `  Inserted recipe: ${recipeDef.name} (${
      recipeDef.ingredients.length
    } ingredients, mix_type: ${recipeDef.mix_type || 'Improved Mix'})`
  )
  return recipeId
}

console.log('\nSeeding recipes...\n')

// Clear existing recipes for bakery
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

console.log(
  '\nDone! Seeded 4 recipes + 4 mixer profiles'
)
console.log('  Owner: demo@example.com / demo123')
console.log('  Viewer: viewer@example.com / viewer123\n')
db.close()
