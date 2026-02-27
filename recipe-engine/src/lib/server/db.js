import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateId } from '$lib/utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, '../../../data/recipe-engine.db')

/** @type {Database.Database | null} */
let _db = null

/** @returns {Database.Database} */
export function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    initSchema(_db)
  }
  return _db
}

/** @param {Database.Database} db */
function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      yield_per_piece REAL NOT NULL DEFAULT 0,
      ddt REAL NOT NULL DEFAULT 24,
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
      type TEXT NOT NULL DEFAULT 'CUSTOM'
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
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      UNIQUE(user_id, name COLLATE NOCASE)
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

    CREATE TABLE IF NOT EXISTS recipe_companions (
      id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      companion_recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'other',
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      UNIQUE(recipe_id, companion_recipe_id)
    );
  `)

  // Migrations — add new columns to recipes (SQLite has no IF NOT EXISTS for columns)
  const migrations = [
    'ALTER TABLE recipes ADD COLUMN process_loss_pct REAL NOT NULL DEFAULT 0',
    'ALTER TABLE recipes ADD COLUMN bake_loss_pct REAL NOT NULL DEFAULT 0',
    'ALTER TABLE recipes ADD COLUMN autolyse INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE recipes ADD COLUMN autolyse_duration_min INTEGER NOT NULL DEFAULT 20',
    'ALTER TABLE preferment_settings ADD COLUMN ddt REAL',
    'ALTER TABLE preferment_settings ADD COLUMN fermentation_duration_min INTEGER',
    'ALTER TABLE recipes ADD COLUMN mixer_profile_id TEXT',
    "ALTER TABLE recipes ADD COLUMN mix_type TEXT NOT NULL DEFAULT 'Improved Mix'",
    'ALTER TABLE users ADD COLUMN name TEXT',
    'ALTER TABLE users ADD COLUMN google_id TEXT',
    'ALTER TABLE users ADD COLUMN active_bakery_id TEXT REFERENCES bakeries(id)',
    'ALTER TABLE recipes ADD COLUMN bakery_id TEXT REFERENCES bakeries(id)',
    'ALTER TABLE recipes ADD COLUMN version INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE mixer_profiles ADD COLUMN bakery_id TEXT REFERENCES bakeries(id)',
    'ALTER TABLE ingredient_library ADD COLUMN bakery_id TEXT REFERENCES bakeries(id)',
    "ALTER TABLE recipes ADD COLUMN autolyse_overrides TEXT NOT NULL DEFAULT '{}'",
    'ALTER TABLE recipes ADD COLUMN dough_type TEXT',
  ]
  for (const sql of migrations) {
    try {
      db.exec(sql)
    } catch {
      // Column already exists — safe to ignore
    }
  }

  // Unique indexes
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL')

  // Bakery indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bakery_members_user ON bakery_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_bakery_members_bakery ON bakery_members(bakery_id);
    CREATE INDEX IF NOT EXISTS idx_recipes_bakery ON recipes(bakery_id);
    CREATE INDEX IF NOT EXISTS idx_mixer_profiles_bakery ON mixer_profiles(bakery_id);
    CREATE INDEX IF NOT EXISTS idx_ingredient_library_bakery ON ingredient_library(bakery_id);
    CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
    CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
    CREATE INDEX IF NOT EXISTS idx_recipe_companions_recipe ON recipe_companions(recipe_id);
  `)

  // Data migration: move existing users to bakeries
  migrateToMultiTenant(db)
}

/** @param {Database.Database} db */
function migrateToMultiTenant(db) {
  const bakeryCount = db.prepare('SELECT COUNT(*) as count FROM bakeries').get().count
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count

  // Only run if bakeries table is empty but users exist
  if (bakeryCount > 0 || userCount === 0) return

  const users = db.prepare('SELECT id, email, name FROM users').all()

  const txn = db.transaction(() => {
    for (const user of users) {
      const bakeryId = generateId()
      const name = user.name ? `${user.name}'s Bakery` : `${user.email.split('@')[0]}'s Bakery`
      const slug = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-')

      // Create bakery
      db.prepare(
        'INSERT INTO bakeries (id, name, slug, created_by) VALUES (?, ?, ?, ?)'
      ).run(bakeryId, name, slug, user.id)

      // Create bakery member (owner)
      db.prepare(
        'INSERT INTO bakery_members (id, bakery_id, user_id, role) VALUES (?, ?, ?, ?)'
      ).run(generateId(), bakeryId, user.id, 'owner')

      // Update all recipes for this user
      db.prepare('UPDATE recipes SET bakery_id = ? WHERE user_id = ?').run(bakeryId, user.id)

      // Update all mixer profiles for this user
      db.prepare('UPDATE mixer_profiles SET bakery_id = ? WHERE user_id = ?').run(
        bakeryId,
        user.id
      )

      // Update all ingredient library entries for this user
      db.prepare('UPDATE ingredient_library SET bakery_id = ? WHERE user_id = ?').run(
        bakeryId,
        user.id
      )

      // Set active bakery
      db.prepare('UPDATE users SET active_bakery_id = ? WHERE id = ?').run(bakeryId, user.id)
    }

    // Migrate ingredient_library UNIQUE constraint from (user_id, name) to (bakery_id, name)
    // Check if old index still exists
    const oldIndex = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ingredient_library' AND sql LIKE '%user_id%name%'"
      )
      .get()

    if (oldIndex) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ingredient_library_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          bakery_id TEXT REFERENCES bakeries(id),
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          UNIQUE(bakery_id, name COLLATE NOCASE)
        );
        INSERT INTO ingredient_library_new SELECT id, user_id, bakery_id, name, category FROM ingredient_library;
        DROP TABLE ingredient_library;
        ALTER TABLE ingredient_library_new RENAME TO ingredient_library;
        CREATE INDEX IF NOT EXISTS idx_ingredient_library_bakery ON ingredient_library(bakery_id);
      `)
    }
  })

  txn()
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/**
 * @param {string} email
 * @param {string} passwordHash
 * @param {string} [name]
 * @returns {{ id: string, email: string, name: string | null }}
 */
export function createUser(email, passwordHash, name) {
  const db = getDb()
  const id = generateId()
  db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
    id,
    email,
    passwordHash,
    name || null
  )
  return { id, email, name: name || null }
}

/**
 * @param {string} email
 * @returns {{ id: string, email: string, name: string | null, password_hash: string, google_id: string | null } | undefined}
 */
export function getUserByEmail(email) {
  const db = getDb()
  return db
    .prepare('SELECT id, email, name, password_hash, google_id FROM users WHERE email = ?')
    .get(email)
}

/**
 * @param {string} id
 * @returns {{ id: string, email: string, name: string | null, active_bakery_id: string | null } | undefined}
 */
export function getUserById(id) {
  const db = getDb()
  return db.prepare('SELECT id, email, name, active_bakery_id FROM users WHERE id = ?').get(id)
}

/**
 * @param {string} googleId
 * @returns {{ id: string, email: string, name: string | null, google_id: string } | undefined}
 */
export function getUserByGoogleId(googleId) {
  const db = getDb()
  return db
    .prepare('SELECT id, email, name, google_id FROM users WHERE google_id = ?')
    .get(googleId)
}

/**
 * @param {string} email
 * @param {string} name
 * @param {string} googleId
 * @returns {{ id: string, email: string, name: string }}
 */
export function createGoogleUser(email, name, googleId) {
  const db = getDb()
  const id = generateId()
  db.prepare('INSERT INTO users (id, email, name, google_id) VALUES (?, ?, ?, ?)').run(
    id,
    email,
    name,
    googleId
  )
  return { id, email, name }
}

/**
 * @param {string} id
 * @param {object} fields
 * @param {string} [fields.name]
 * @param {string} [fields.google_id]
 */
export function updateUser(id, fields) {
  const db = getDb()
  const sets = []
  const values = []
  if (fields.name !== undefined) {
    sets.push('name = ?')
    values.push(fields.name)
  }
  if (fields.google_id !== undefined) {
    sets.push('google_id = ?')
    values.push(fields.google_id)
  }
  if (sets.length === 0) return
  values.push(id)
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

/**
 * @param {string} id
 * @param {string} userId
 * @param {number} expiresAt - Unix timestamp ms
 */
export function createSession(id, userId, expiresAt) {
  const db = getDb()
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    id,
    userId,
    expiresAt
  )
}

/**
 * @param {string} id
 * @returns {{ id: string, user_id: string, expires_at: number } | undefined}
 */
export function getSession(id) {
  const db = getDb()
  return db.prepare('SELECT id, user_id, expires_at FROM sessions WHERE id = ?').get(id)
}

/** @param {string} id */
export function deleteSession(id) {
  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

/**
 * @param {string} id
 * @param {number} expiresAt
 */
export function updateSessionExpiry(id, expiresAt) {
  const db = getDb()
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(expiresAt, id)
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RecipeInput
 * @property {string} name
 * @property {number} yield_per_piece
 * @property {number} ddt
 * @property {number} [process_loss_pct]
 * @property {number} [bake_loss_pct]
 * @property {number} [autolyse]
 * @property {number} [autolyse_duration_min]
 * @property {Array<IngredientInput>} [ingredients]
 * @property {Array<ProcessStepInput>} [process_steps]
 */

/**
 * @typedef {Object} ProcessStepInput
 * @property {string} [id]
 * @property {string} stage
 * @property {number} sort_order
 * @property {string} title
 * @property {string} [description]
 * @property {number|null} [duration_min]
 * @property {number|null} [temperature]
 * @property {string|null} [mixer_speed]
 * @property {string|null} [notes]
 */

/**
 * @typedef {Object} IngredientInput
 * @property {string} [id]
 * @property {string} name
 * @property {string} category
 * @property {number} base_qty
 * @property {number} sort_order
 * @property {Object.<string, number|null>} [preferment_bakers_pcts]
 */

/**
 * @param {string} userId
 * @param {string} bakeryId
 * @param {RecipeInput} data
 * @returns {string} recipe id
 */
export function createRecipe(userId, bakeryId, data) {
  const db = getDb()
  const recipeId = generateId()

  const insertRecipe = db.prepare(`
    INSERT INTO recipes (id, user_id, bakery_id, name, yield_per_piece, ddt, process_loss_pct, bake_loss_pct, autolyse, autolyse_duration_min, mixer_profile_id, mix_type, autolyse_overrides, dough_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertIngredient = db.prepare(`
    INSERT INTO recipe_ingredients (id, recipe_id, name, category, base_qty, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const insertPfBp = db.prepare(`
    INSERT INTO preferment_bakers_pcts (ingredient_id, preferment_ingredient_id, bakers_pct)
    VALUES (?, ?, ?)
  `)

  const insertPfSettings = db.prepare(`
    INSERT INTO preferment_settings (ingredient_id, enabled, type, ddt, fermentation_duration_min)
    VALUES (?, ?, ?, ?, ?)
  `)

  const txn = db.transaction(() => {
    insertRecipe.run(
      recipeId,
      userId,
      bakeryId,
      data.name,
      data.yield_per_piece || 0,
      data.ddt || 24,
      data.process_loss_pct || 0,
      data.bake_loss_pct || 0,
      data.autolyse ? 1 : 0,
      data.autolyse_duration_min || 20,
      data.mixer_profile_id || null,
      data.mix_type || 'Improved Mix',
      JSON.stringify(data.autolyse_overrides || {}),
      data.dough_type || null
    )

    if (data.ingredients) {
      for (const ing of data.ingredients) {
        const ingId = ing.id || generateId()
        insertIngredient.run(ingId, recipeId, ing.name, ing.category, ing.base_qty, ing.sort_order)

        if (ing.category === 'PREFERMENT' && ing.preferment_settings) {
          insertPfSettings.run(
            ingId,
            ing.preferment_settings.enabled ? 1 : 0,
            ing.preferment_settings.type || 'CUSTOM',
            ing.preferment_settings.ddt ?? null,
            ing.preferment_settings.fermentation_duration_min ?? null
          )
        }
      }

      // Second pass: insert PF baker's pcts (need all ingredient IDs first)
      const allIngredients = data.ingredients.map((ing, idx) => ({
        ...ing,
        _id: ing.id || data.ingredients[idx]._resolvedId
      }))

      // We need to re-fetch the inserted ingredients to get their IDs
      const dbIngredients = db
        .prepare('SELECT id, name FROM recipe_ingredients WHERE recipe_id = ?')
        .all(recipeId)
      const nameToId = Object.fromEntries(dbIngredients.map((i) => [i.name, i.id]))
      const pfIngredients = dbIngredients.filter((i) => {
        const source = data.ingredients.find((si) => si.name === i.name)
        return source && source.category === 'PREFERMENT'
      })

      for (const ing of data.ingredients) {
        if (ing.preferment_bakers_pcts) {
          const ingId = nameToId[ing.name]
          for (const [pfName, bp] of Object.entries(ing.preferment_bakers_pcts)) {
            const pfIngId = nameToId[pfName]
            if (pfIngId && bp !== undefined) {
              insertPfBp.run(ingId, pfIngId, bp)
            }
          }
        }
      }
    }

    // Insert process steps
    if (data.process_steps) {
      const insertStep = db.prepare(`
        INSERT INTO process_steps (id, recipe_id, stage, sort_order, title, description, duration_min, temperature, mixer_speed, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const step of data.process_steps) {
        insertStep.run(
          step.id || generateId(),
          recipeId,
          step.stage,
          step.sort_order,
          step.title || '',
          step.description || '',
          step.duration_min ?? null,
          step.temperature ?? null,
          step.mixer_speed || null,
          step.notes || null
        )
      }
    }
  })

  txn()
  return recipeId
}

/**
 * Get a full recipe with all ingredients and PF data
 * @param {string} id
 * @param {string} [bakeryId] - if provided, also checks bakery ownership
 * @returns {object | null}
 */
export function getRecipe(id, bakeryId) {
  const db = getDb()

  const recipe = bakeryId
    ? db.prepare('SELECT * FROM recipes WHERE id = ? AND bakery_id = ?').get(id, bakeryId)
    : db.prepare('SELECT * FROM recipes WHERE id = ?').get(id)
  if (!recipe) return null

  const ingredients = db
    .prepare('SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order')
    .all(id)

  const pfSettings = db
    .prepare(
      `SELECT ps.* FROM preferment_settings ps
       JOIN recipe_ingredients ri ON ri.id = ps.ingredient_id
       WHERE ri.recipe_id = ?`
    )
    .all(id)

  const pfBps = db
    .prepare(
      `SELECT pb.* FROM preferment_bakers_pcts pb
       JOIN recipe_ingredients ri ON ri.id = pb.ingredient_id
       WHERE ri.recipe_id = ?`
    )
    .all(id)

  // Assemble
  const pfSettingsMap = Object.fromEntries(pfSettings.map((s) => [s.ingredient_id, s]))
  const pfBpMap = {}
  for (const bp of pfBps) {
    if (!pfBpMap[bp.ingredient_id]) pfBpMap[bp.ingredient_id] = {}
    pfBpMap[bp.ingredient_id][bp.preferment_ingredient_id] = bp.bakers_pct
  }

  const processSteps = db
    .prepare('SELECT * FROM process_steps WHERE recipe_id = ? ORDER BY sort_order')
    .all(id)

  const companions = db
    .prepare(
      `SELECT rc.*, r.name as companion_name, r.dough_type as companion_dough_type
       FROM recipe_companions rc
       JOIN recipes r ON r.id = rc.companion_recipe_id
       WHERE rc.recipe_id = ?
       ORDER BY rc.sort_order`
    )
    .all(id)

  const assembled = {
    ...recipe,
    autolyse_overrides: JSON.parse(recipe.autolyse_overrides || '{}'),
    ingredients: ingredients.map((ing) => ({
      ...ing,
      preferment_bakers_pcts: pfBpMap[ing.id] || {},
      preferment_settings: pfSettingsMap[ing.id] || null
    })),
    process_steps: processSteps,
    companions
  }

  return assembled
}

/**
 * @param {string} bakeryId
 * @returns {Array<object>}
 */
export function getRecipesByBakery(bakeryId) {
  const db = getDb()
  return db
    .prepare(
      `SELECT r.id, r.name, r.yield_per_piece, r.ddt,
              r.process_loss_pct, r.bake_loss_pct, r.autolyse,
              r.mixer_profile_id, r.mix_type, r.dough_type,
              r.created_at, r.updated_at,
              (SELECT COUNT(*) FROM recipe_ingredients WHERE recipe_id = r.id) as ingredient_count,
              (SELECT COUNT(*) FROM process_steps WHERE recipe_id = r.id) as step_count,
              (SELECT COUNT(*) FROM recipe_companions WHERE recipe_id = r.id) as companion_count
       FROM recipes r
       WHERE r.bakery_id = ?
       ORDER BY r.updated_at DESC`
    )
    .all(bakeryId)
}

/**
 * @param {string} id
 * @param {string} bakeryId
 * @param {RecipeInput} data
 */
export function updateRecipe(id, bakeryId, data, userId, changeNotes) {
  const db = getDb()

  const txn = db.transaction(() => {
    // §12.4: Snapshot the CURRENT state before overwriting
    if (userId) {
      snapshotBeforeUpdate(id, userId, changeNotes)
    }

    db.prepare(
      `UPDATE recipes SET name = ?, yield_per_piece = ?, ddt = ?,
       process_loss_pct = ?, bake_loss_pct = ?, autolyse = ?, autolyse_duration_min = ?,
       mixer_profile_id = ?, mix_type = ?, autolyse_overrides = ?, dough_type = ?,
       version = version + 1, updated_at = datetime('now')
       WHERE id = ? AND bakery_id = ?`
    ).run(
      data.name,
      data.yield_per_piece || 0,
      data.ddt || 24,
      data.process_loss_pct || 0,
      data.bake_loss_pct || 0,
      data.autolyse ? 1 : 0,
      data.autolyse_duration_min || 20,
      data.mixer_profile_id || null,
      data.mix_type || 'Improved Mix',
      JSON.stringify(data.autolyse_overrides || {}),
      data.dough_type || null,
      id,
      bakeryId
    )

    // Delete existing ingredients (CASCADE deletes PF BPs and settings)
    db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(id)

    if (data.ingredients) {
      const insertIngredient = db.prepare(
        `INSERT INTO recipe_ingredients (id, recipe_id, name, category, base_qty, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      const insertPfBp = db.prepare(
        `INSERT INTO preferment_bakers_pcts (ingredient_id, preferment_ingredient_id, bakers_pct)
         VALUES (?, ?, ?)`
      )
      const insertPfSettings = db.prepare(
        `INSERT INTO preferment_settings (ingredient_id, enabled, type, ddt, fermentation_duration_min)
         VALUES (?, ?, ?, ?, ?)`
      )

      // First pass: insert all ingredients
      for (const ing of data.ingredients) {
        const ingId = ing.id || generateId()
        ing._resolvedId = ingId
        insertIngredient.run(ingId, id, ing.name, ing.category, ing.base_qty, ing.sort_order)

        if (ing.category === 'PREFERMENT' && ing.preferment_settings) {
          insertPfSettings.run(
            ingId,
            ing.preferment_settings.enabled ? 1 : 0,
            ing.preferment_settings.type || 'CUSTOM',
            ing.preferment_settings.ddt ?? null,
            ing.preferment_settings.fermentation_duration_min ?? null
          )
        }
      }

      // Second pass: insert PF baker's pcts
      const idLookup = Object.fromEntries(
        data.ingredients.map((ing) => [ing.id || ing._resolvedId, ing.id || ing._resolvedId])
      )

      for (const ing of data.ingredients) {
        if (ing.preferment_bakers_pcts) {
          const ingId = ing.id || ing._resolvedId
          for (const [pfIngId, bp] of Object.entries(ing.preferment_bakers_pcts)) {
            if (bp !== undefined && bp !== null) {
              insertPfBp.run(ingId, pfIngId, bp)
            }
          }
        }
      }
    }

    // Delete + reinsert process steps
    db.prepare('DELETE FROM process_steps WHERE recipe_id = ?').run(id)
    if (data.process_steps) {
      const insertStep = db.prepare(`
        INSERT INTO process_steps (id, recipe_id, stage, sort_order, title, description, duration_min, temperature, mixer_speed, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const step of data.process_steps) {
        insertStep.run(
          step.id || generateId(),
          id,
          step.stage,
          step.sort_order,
          step.title || '',
          step.description || '',
          step.duration_min ?? null,
          step.temperature ?? null,
          step.mixer_speed || null,
          step.notes || null
        )
      }
    }

    // Delete + reinsert companion links
    db.prepare('DELETE FROM recipe_companions WHERE recipe_id = ?').run(id)
    if (data.companions?.length) {
      const insertComp = db.prepare(
        `INSERT INTO recipe_companions (id, recipe_id, companion_recipe_id, role, sort_order, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const [idx, c] of data.companions.entries()) {
        // Defense in depth: prevent self-link
        if (c.companion_recipe_id === id) continue
        // Defense in depth: verify companion recipe belongs to same bakery
        const companionRecipe = db
          .prepare('SELECT id FROM recipes WHERE id = ? AND bakery_id = ?')
          .get(c.companion_recipe_id, bakeryId)
        if (!companionRecipe) continue
        insertComp.run(
          generateId(),
          id,
          c.companion_recipe_id,
          c.role || 'other',
          idx,
          c.notes || null
        )
      }
    }
  })

  txn()
}

/**
 * @param {string} id
 * @param {string} bakeryId
 */
export function deleteRecipe(id, bakeryId) {
  const db = getDb()
  db.prepare('DELETE FROM recipes WHERE id = ? AND bakery_id = ?').run(id, bakeryId)
}

// ─── Recipe Versioning ───────────────────────────────────────────────────────

/**
 * Build a snapshot object from a loaded recipe (as returned by getRecipe).
 * Captures all inputs needed to reconstruct via calculateRecipe().
 * @param {object} recipe - full recipe from getRecipe()
 * @returns {object}
 */
export function buildRecipeSnapshot(recipe) {
  return {
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
    ingredients: (recipe.ingredients || []).map((ing) => ({
      id: ing.id,
      name: ing.name,
      category: ing.category,
      base_qty: ing.base_qty,
      sort_order: ing.sort_order,
      preferment_bakers_pcts: ing.preferment_bakers_pcts || {},
      preferment_settings: ing.preferment_settings || null,
    })),
    process_steps: (recipe.process_steps || []).map((s) => ({
      id: s.id,
      stage: s.stage,
      sort_order: s.sort_order,
      title: s.title,
      description: s.description,
      duration_min: s.duration_min,
      temperature: s.temperature,
      mixer_speed: s.mixer_speed,
      notes: s.notes,
    })),
    companions: (recipe.companions || []).map((c) => ({
      companion_recipe_id: c.companion_recipe_id,
      companion_name: c.companion_name,
      role: c.role,
      sort_order: c.sort_order,
      notes: c.notes,
    })),
  }
}

/**
 * Snapshot the current recipe state before applying an update.
 * Called inside updateRecipe's transaction.
 * @param {string} recipeId
 * @param {string} userId - who is saving
 * @param {string|null} [changeNotes]
 */
export function snapshotBeforeUpdate(recipeId, userId, changeNotes) {
  const db = getDb()
  const recipe = getRecipe(recipeId)
  if (!recipe) return

  const currentVersion = recipe.version || 1
  const snapshot = JSON.stringify(buildRecipeSnapshot(recipe))

  // Check if this version is already snapshotted (idempotency)
  const existing = db
    .prepare('SELECT id FROM recipe_versions WHERE recipe_id = ? AND version_number = ?')
    .get(recipeId, currentVersion)
  if (existing) return

  db.prepare(
    `INSERT INTO recipe_versions (id, recipe_id, version_number, snapshot, change_notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(generateId(), recipeId, currentVersion, snapshot, changeNotes || null, userId)
}

/**
 * Get all versions for a recipe (metadata only, no snapshots).
 * @param {string} recipeId
 * @returns {Array<{id: string, version_number: number, change_notes: string|null, created_by: string, created_at: string, creator_name: string|null, creator_email: string}>}
 */
export function getRecipeVersions(recipeId, { limit, offset } = {}) {
  const db = getDb()
  let sql = `SELECT rv.id, rv.version_number, rv.change_notes, rv.created_by, rv.created_at,
              u.name as creator_name, u.email as creator_email
       FROM recipe_versions rv
       LEFT JOIN users u ON u.id = rv.created_by
       WHERE rv.recipe_id = ?
       ORDER BY rv.version_number DESC`
  const params = [recipeId]
  if (limit != null) {
    sql += ' LIMIT ?'
    params.push(limit)
    if (offset != null) {
      sql += ' OFFSET ?'
      params.push(offset)
    }
  }
  return db.prepare(sql).all(...params)
}

export function getRecipeVersionCount(recipeId) {
  const db = getDb()
  return db
    .prepare('SELECT COUNT(*) as count FROM recipe_versions WHERE recipe_id = ?')
    .get(recipeId).count
}

/**
 * Get a specific version's snapshot.
 * @param {string} recipeId
 * @param {number} versionNumber
 * @returns {{id: string, version_number: number, snapshot: string, change_notes: string|null, created_by: string, created_at: string} | undefined}
 */
export function getRecipeVersion(recipeId, versionNumber) {
  const db = getDb()
  return db
    .prepare('SELECT * FROM recipe_versions WHERE recipe_id = ? AND version_number = ?')
    .get(recipeId, versionNumber)
}

// ─── Mixer Profiles ──────────────────────────────────────────────────────────

/**
 * @param {string} bakeryId
 * @returns {Array<object>}
 */
export function getMixerProfiles(bakeryId) {
  const db = getDb()
  const profiles = db
    .prepare('SELECT * FROM mixer_profiles WHERE bakery_id = ? ORDER BY name')
    .all(bakeryId)

  const calibrations = db
    .prepare(
      `SELECT mc.* FROM mixer_calibrations mc
       JOIN mixer_profiles mp ON mp.id = mc.mixer_id
       WHERE mp.bakery_id = ?`
    )
    .all(bakeryId)

  const calMap = {}
  for (const cal of calibrations) {
    if (!calMap[cal.mixer_id]) calMap[cal.mixer_id] = []
    calMap[cal.mixer_id].push({
      mix_type: cal.mix_type,
      first_speed_rounds: cal.first_speed_rounds,
    })
  }

  return profiles.map((p) => ({ ...p, calibrations: calMap[p.id] || [] }))
}

/**
 * @param {string} id
 * @returns {object | null}
 */
export function getMixerProfile(id) {
  const db = getDb()
  const profile = db.prepare('SELECT * FROM mixer_profiles WHERE id = ?').get(id)
  if (!profile) return null

  const calibrations = db
    .prepare('SELECT mix_type, first_speed_rounds FROM mixer_calibrations WHERE mixer_id = ?')
    .all(id)

  return { ...profile, calibrations }
}

/**
 * @param {string} userId
 * @param {string} bakeryId
 * @param {object} data
 * @returns {string} mixer profile id
 */
export function createMixerProfile(userId, bakeryId, data) {
  const db = getDb()
  const id = generateId()

  const txn = db.transaction(() => {
    db.prepare(
      `INSERT INTO mixer_profiles (id, user_id, bakery_id, name, type, friction_factor, first_speed_rpm, second_speed_rpm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, bakeryId, data.name, data.type, data.friction_factor, data.first_speed_rpm, data.second_speed_rpm)

    if (data.calibrations) {
      const insertCal = db.prepare(
        `INSERT INTO mixer_calibrations (id, mixer_id, mix_type, first_speed_rounds)
         VALUES (?, ?, ?, ?)`
      )
      for (const cal of data.calibrations) {
        insertCal.run(generateId(), id, cal.mix_type, cal.first_speed_rounds)
      }
    }
  })

  txn()
  return id
}

/**
 * @param {string} id
 * @param {string} bakeryId
 * @param {object} data
 */
export function updateMixerProfile(id, bakeryId, data) {
  const db = getDb()

  const txn = db.transaction(() => {
    db.prepare(
      `UPDATE mixer_profiles SET name = ?, type = ?, friction_factor = ?,
       first_speed_rpm = ?, second_speed_rpm = ?
       WHERE id = ? AND bakery_id = ?`
    ).run(data.name, data.type, data.friction_factor, data.first_speed_rpm, data.second_speed_rpm, id, bakeryId)

    db.prepare('DELETE FROM mixer_calibrations WHERE mixer_id = ?').run(id)
    if (data.calibrations) {
      const insertCal = db.prepare(
        `INSERT INTO mixer_calibrations (id, mixer_id, mix_type, first_speed_rounds)
         VALUES (?, ?, ?, ?)`
      )
      for (const cal of data.calibrations) {
        insertCal.run(generateId(), id, cal.mix_type, cal.first_speed_rounds)
      }
    }
  })

  txn()
}

/**
 * @param {string} id
 * @param {string} bakeryId
 */
export function deleteMixerProfile(id, bakeryId) {
  const db = getDb()
  db.prepare('DELETE FROM mixer_profiles WHERE id = ? AND bakery_id = ?').run(id, bakeryId)
}

// ─── Ingredient Library ──────────────────────────────────────────────────────

/**
 * @param {string} bakeryId
 * @returns {Array<{id: string, name: string, category: string}>}
 */
export function getIngredientLibrary(bakeryId) {
  const db = getDb()
  return db
    .prepare('SELECT id, name, category FROM ingredient_library WHERE bakery_id = ? ORDER BY name')
    .all(bakeryId)
}

/**
 * @param {string} userId
 * @param {string} bakeryId
 * @param {string} name
 * @param {string} category
 * @returns {{id: string, name: string, category: string}}
 */
export function createIngredientLibraryEntry(userId, bakeryId, name, category) {
  const db = getDb()
  const id = generateId()
  db.prepare(
    'INSERT INTO ingredient_library (id, user_id, bakery_id, name, category) VALUES (?, ?, ?, ?, ?)'
  ).run(id, userId, bakeryId, name, category)
  return { id, name, category }
}

/**
 * @param {string} id
 * @param {string} bakeryId
 * @param {string} name
 * @param {string} category
 */
export function updateIngredientLibraryEntry(id, bakeryId, name, category) {
  const db = getDb()
  db.prepare('UPDATE ingredient_library SET name = ?, category = ? WHERE id = ? AND bakery_id = ?').run(
    name,
    category,
    id,
    bakeryId
  )
}

/**
 * @param {string} id
 * @param {string} bakeryId
 */
export function deleteIngredientLibraryEntry(id, bakeryId) {
  const db = getDb()
  db.prepare('DELETE FROM ingredient_library WHERE id = ? AND bakery_id = ?').run(id, bakeryId)
}

/**
 * Sync ingredients into the bakery's library on recipe save.
 * Inserts new entries and updates category if it changed.
 * Skips PREFERMENT ingredients and empty names.
 * @param {string} userId
 * @param {string} bakeryId
 * @param {Array<{name: string, category: string}>} ingredients
 */
export function syncIngredientLibrary(userId, bakeryId, ingredients) {
  const db = getDb()
  const upsert = db.prepare(`
    INSERT INTO ingredient_library (id, user_id, bakery_id, name, category)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(bakery_id, name COLLATE NOCASE) DO UPDATE SET category = excluded.category
  `)

  const txn = db.transaction(() => {
    for (const ing of ingredients) {
      if (!ing.name || !ing.name.trim() || ing.category === 'PREFERMENT') continue
      upsert.run(generateId(), userId, bakeryId, ing.name.trim(), ing.category)
    }
  })

  txn()
}

// ─── Bakeries ─────────────────────────────────────────────────────────────────

/**
 * @param {string} name
 * @param {string} slug
 * @param {string} createdBy
 * @returns {{ id: string, name: string, slug: string, created_by: string }}
 */
export function createBakery(name, slug, createdBy) {
  const db = getDb()
  const id = generateId()
  db.prepare('INSERT INTO bakeries (id, name, slug, created_by) VALUES (?, ?, ?, ?)').run(
    id,
    name,
    slug,
    createdBy
  )
  return { id, name, slug, created_by: createdBy }
}

/** @param {string} id */
export function getBakery(id) {
  const db = getDb()
  return db.prepare('SELECT * FROM bakeries WHERE id = ?').get(id)
}

/** @param {string} slug */
export function getBakeryBySlug(slug) {
  const db = getDb()
  return db.prepare('SELECT * FROM bakeries WHERE slug = ?').get(slug)
}

/**
 * @param {string} id
 * @param {{ name?: string, slug?: string }} fields
 */
export function updateBakery(id, fields) {
  const db = getDb()
  const sets = []
  const values = []
  if (fields.name !== undefined) {
    sets.push('name = ?')
    values.push(fields.name)
  }
  if (fields.slug !== undefined) {
    sets.push('slug = ?')
    values.push(fields.slug)
  }
  if (sets.length === 0) return
  values.push(id)
  db.prepare(`UPDATE bakeries SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

/** @param {string} id */
export function deleteBakery(id) {
  const db = getDb()
  const txn = db.transaction(() => {
    // Domain tables lack ON DELETE CASCADE on bakery_id, so delete explicitly
    db.prepare('DELETE FROM recipes WHERE bakery_id = ?').run(id)
    db.prepare('DELETE FROM mixer_profiles WHERE bakery_id = ?').run(id)
    db.prepare('DELETE FROM ingredient_library WHERE bakery_id = ?').run(id)
    // Clear active_bakery_id for any user pointing to this bakery
    db.prepare('UPDATE users SET active_bakery_id = NULL WHERE active_bakery_id = ?').run(id)
    // bakery_members and invitations CASCADE from bakeries FK
    db.prepare('DELETE FROM bakeries WHERE id = ?').run(id)
  })
  txn()
}

/**
 * @param {string} userId
 * @returns {Array<{ id: string, name: string, slug: string, role: string }>}
 */
export function getUserBakeries(userId) {
  const db = getDb()
  return db
    .prepare(
      `SELECT b.id, b.name, b.slug, bm.role
       FROM bakeries b
       JOIN bakery_members bm ON bm.bakery_id = b.id
       WHERE bm.user_id = ?
       ORDER BY b.name`
    )
    .all(userId)
}

/**
 * @param {string} bakeryId
 * @returns {Array<{ id: string, user_id: string, email: string, name: string | null, role: string }>}
 */
export function getBakeryMembers(bakeryId) {
  const db = getDb()
  return db
    .prepare(
      `SELECT bm.id, bm.user_id, u.email, u.name, bm.role
       FROM bakery_members bm
       JOIN users u ON u.id = bm.user_id
       WHERE bm.bakery_id = ?
       ORDER BY bm.role, u.name`
    )
    .all(bakeryId)
}

/**
 * @param {string} bakeryId
 * @param {string} userId
 * @param {string} role
 */
export function addBakeryMember(bakeryId, userId, role) {
  const db = getDb()
  db.prepare(
    'INSERT INTO bakery_members (id, bakery_id, user_id, role) VALUES (?, ?, ?, ?)'
  ).run(generateId(), bakeryId, userId, role)
}

/**
 * @param {string} bakeryId
 * @param {string} userId
 * @param {string} role
 */
export function updateBakeryMemberRole(bakeryId, userId, role) {
  const db = getDb()
  db.prepare('UPDATE bakery_members SET role = ? WHERE bakery_id = ? AND user_id = ?').run(
    role,
    bakeryId,
    userId
  )
}

/**
 * @param {string} bakeryId
 * @param {string} userId
 */
export function removeBakeryMember(bakeryId, userId) {
  const db = getDb()
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM bakery_members WHERE bakery_id = ? AND user_id = ?').run(
      bakeryId,
      userId
    )
    // Clear active_bakery_id if it points to the bakery they were removed from
    db.prepare('UPDATE users SET active_bakery_id = NULL WHERE id = ? AND active_bakery_id = ?').run(
      userId,
      bakeryId
    )
  })
  txn()
}

/**
 * @param {string} bakeryId
 * @param {string} userId
 * @returns {{ id: string, bakery_id: string, user_id: string, role: string } | undefined}
 */
export function getBakeryMember(bakeryId, userId) {
  const db = getDb()
  return db
    .prepare('SELECT * FROM bakery_members WHERE bakery_id = ? AND user_id = ?')
    .get(bakeryId, userId)
}

/**
 * @param {string} userId
 * @param {string} bakeryId
 */
export function setActiveBakery(userId, bakeryId) {
  const db = getDb()
  db.prepare('UPDATE users SET active_bakery_id = ? WHERE id = ?').run(bakeryId, userId)
}

// ─── Invitations ──────────────────────────────────────────────────────────────

/**
 * @param {string} bakeryId
 * @param {string} email
 * @param {string} role
 * @param {string} invitedBy
 * @param {string} token
 * @param {string} expiresAt
 */
export function createInvitation(bakeryId, email, role, invitedBy, token, expiresAt) {
  const db = getDb()
  const id = generateId()
  db.prepare(
    'INSERT INTO invitations (id, bakery_id, email, role, invited_by, token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, bakeryId, email, role, invitedBy, token, expiresAt)
  return { id, bakery_id: bakeryId, email, role, token, expires_at: expiresAt }
}

/** @param {string} token */
export function getInvitationByToken(token) {
  const db = getDb()
  return db.prepare('SELECT * FROM invitations WHERE token = ?').get(token)
}

/** @param {string} bakeryId */
export function getInvitationsByBakery(bakeryId) {
  const db = getDb()
  return db
    .prepare('SELECT * FROM invitations WHERE bakery_id = ? AND accepted_at IS NULL ORDER BY expires_at DESC')
    .all(bakeryId)
}

/** @param {string} email */
export function getInvitationsByEmail(email) {
  const db = getDb()
  return db
    .prepare('SELECT * FROM invitations WHERE email = ? AND accepted_at IS NULL ORDER BY expires_at DESC')
    .all(email)
}

/** @param {string} id */
export function acceptInvitation(id) {
  const db = getDb()
  db.prepare("UPDATE invitations SET accepted_at = datetime('now') WHERE id = ?").run(id)
}

/** @param {string} id */
export function deleteInvitation(id) {
  const db = getDb()
  db.prepare('DELETE FROM invitations WHERE id = ?').run(id)
}
