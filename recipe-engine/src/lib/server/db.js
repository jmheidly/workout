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
 * @returns {{ id: string, email: string, name: string | null } | undefined}
 */
export function getUserById(id) {
  const db = getDb()
  return db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(id)
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
 * @param {RecipeInput} data
 * @returns {string} recipe id
 */
export function createRecipe(userId, data) {
  const db = getDb()
  const recipeId = generateId()

  const insertRecipe = db.prepare(`
    INSERT INTO recipes (id, user_id, name, yield_per_piece, ddt, process_loss_pct, bake_loss_pct, autolyse, autolyse_duration_min, mixer_profile_id, mix_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.name,
      data.yield_per_piece || 0,
      data.ddt || 24,
      data.process_loss_pct || 0,
      data.bake_loss_pct || 0,
      data.autolyse ? 1 : 0,
      data.autolyse_duration_min || 20,
      data.mixer_profile_id || null,
      data.mix_type || 'Improved Mix'
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
 * @returns {object | null}
 */
export function getRecipe(id) {
  const db = getDb()

  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id)
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

  const assembled = {
    ...recipe,
    ingredients: ingredients.map((ing) => ({
      ...ing,
      preferment_bakers_pcts: pfBpMap[ing.id] || {},
      preferment_settings: pfSettingsMap[ing.id] || null
    })),
    process_steps: processSteps
  }

  return assembled
}

/**
 * @param {string} userId
 * @returns {Array<object>}
 */
export function getRecipesByUser(userId) {
  const db = getDb()
  return db
    .prepare(
      `SELECT r.id, r.name, r.yield_per_piece, r.ddt,
              r.process_loss_pct, r.bake_loss_pct, r.autolyse,
              r.mixer_profile_id, r.mix_type,
              r.created_at, r.updated_at,
              (SELECT COUNT(*) FROM recipe_ingredients WHERE recipe_id = r.id) as ingredient_count,
              (SELECT COUNT(*) FROM process_steps WHERE recipe_id = r.id) as step_count
       FROM recipes r
       WHERE r.user_id = ?
       ORDER BY r.updated_at DESC`
    )
    .all(userId)
}

/**
 * @param {string} id
 * @param {RecipeInput} data
 */
export function updateRecipe(id, data) {
  const db = getDb()

  const txn = db.transaction(() => {
    db.prepare(
      `UPDATE recipes SET name = ?, yield_per_piece = ?, ddt = ?,
       process_loss_pct = ?, bake_loss_pct = ?, autolyse = ?, autolyse_duration_min = ?,
       mixer_profile_id = ?, mix_type = ?,
       updated_at = datetime('now')
       WHERE id = ?`
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
      id
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
  })

  txn()
}

/** @param {string} id */
export function deleteRecipe(id) {
  const db = getDb()
  db.prepare('DELETE FROM recipes WHERE id = ?').run(id)
}

// ─── Mixer Profiles ──────────────────────────────────────────────────────────

/**
 * @param {string} userId
 * @returns {Array<object>}
 */
export function getMixerProfiles(userId) {
  const db = getDb()
  const profiles = db
    .prepare('SELECT * FROM mixer_profiles WHERE user_id = ? ORDER BY name')
    .all(userId)

  const calibrations = db
    .prepare(
      `SELECT mc.* FROM mixer_calibrations mc
       JOIN mixer_profiles mp ON mp.id = mc.mixer_id
       WHERE mp.user_id = ?`
    )
    .all(userId)

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
 * @param {object} data
 * @returns {string} mixer profile id
 */
export function createMixerProfile(userId, data) {
  const db = getDb()
  const id = generateId()

  const txn = db.transaction(() => {
    db.prepare(
      `INSERT INTO mixer_profiles (id, user_id, name, type, friction_factor, first_speed_rpm, second_speed_rpm)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, data.name, data.type, data.friction_factor, data.first_speed_rpm, data.second_speed_rpm)

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
 * @param {object} data
 */
export function updateMixerProfile(id, data) {
  const db = getDb()

  const txn = db.transaction(() => {
    db.prepare(
      `UPDATE mixer_profiles SET name = ?, type = ?, friction_factor = ?,
       first_speed_rpm = ?, second_speed_rpm = ?
       WHERE id = ?`
    ).run(data.name, data.type, data.friction_factor, data.first_speed_rpm, data.second_speed_rpm, id)

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
 */
export function deleteMixerProfile(id) {
  const db = getDb()
  db.prepare('DELETE FROM mixer_profiles WHERE id = ?').run(id)
}

// ─── Ingredient Library ──────────────────────────────────────────────────────

/**
 * @param {string} userId
 * @returns {Array<{id: string, name: string, category: string}>}
 */
export function getIngredientLibrary(userId) {
  const db = getDb()
  return db
    .prepare('SELECT id, name, category FROM ingredient_library WHERE user_id = ? ORDER BY name')
    .all(userId)
}

/**
 * @param {string} userId
 * @param {string} name
 * @param {string} category
 * @returns {{id: string, name: string, category: string}}
 */
export function createIngredientLibraryEntry(userId, name, category) {
  const db = getDb()
  const id = generateId()
  db.prepare(
    'INSERT INTO ingredient_library (id, user_id, name, category) VALUES (?, ?, ?, ?)'
  ).run(id, userId, name, category)
  return { id, name, category }
}

/**
 * @param {string} id
 * @param {string} name
 * @param {string} category
 */
export function updateIngredientLibraryEntry(id, name, category) {
  const db = getDb()
  db.prepare('UPDATE ingredient_library SET name = ?, category = ? WHERE id = ?').run(
    name,
    category,
    id
  )
}

/**
 * @param {string} id
 */
export function deleteIngredientLibraryEntry(id) {
  const db = getDb()
  db.prepare('DELETE FROM ingredient_library WHERE id = ?').run(id)
}

/**
 * Sync ingredients into the user's library on recipe save.
 * Inserts new entries and updates category if it changed.
 * Skips PREFERMENT ingredients and empty names.
 * @param {string} userId
 * @param {Array<{name: string, category: string}>} ingredients
 */
export function syncIngredientLibrary(userId, ingredients) {
  const db = getDb()
  const upsert = db.prepare(`
    INSERT INTO ingredient_library (id, user_id, name, category)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, name COLLATE NOCASE) DO UPDATE SET category = excluded.category
  `)

  const txn = db.transaction(() => {
    for (const ing of ingredients) {
      if (!ing.name || !ing.name.trim() || ing.category === 'PREFERMENT') continue
      upsert.run(generateId(), userId, ing.name.trim(), ing.category)
    }
  })

  txn()
}
