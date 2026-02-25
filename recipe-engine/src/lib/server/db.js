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
      type TEXT NOT NULL DEFAULT 'CUSTOM',
      base_source_ingredient_id TEXT REFERENCES recipe_ingredients(id)
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
  `)

  // Migrations — add new columns to recipes (SQLite has no IF NOT EXISTS for columns)
  const migrations = [
    'ALTER TABLE recipes ADD COLUMN process_loss_pct REAL NOT NULL DEFAULT 0',
    'ALTER TABLE recipes ADD COLUMN bake_loss_pct REAL NOT NULL DEFAULT 0',
    'ALTER TABLE recipes ADD COLUMN autolyse INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE recipes ADD COLUMN autolyse_duration_min INTEGER NOT NULL DEFAULT 20',
  ]
  for (const sql of migrations) {
    try {
      db.exec(sql)
    } catch {
      // Column already exists — safe to ignore
    }
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/**
 * @param {string} email
 * @param {string} passwordHash
 * @returns {{ id: string, email: string }}
 */
export function createUser(email, passwordHash) {
  const db = getDb()
  const id = generateId()
  db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(
    id,
    email,
    passwordHash
  )
  return { id, email }
}

/**
 * @param {string} email
 * @returns {{ id: string, email: string, password_hash: string } | undefined}
 */
export function getUserByEmail(email) {
  const db = getDb()
  return db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email)
}

/**
 * @param {string} id
 * @returns {{ id: string, email: string } | undefined}
 */
export function getUserById(id) {
  const db = getDb()
  return db.prepare('SELECT id, email FROM users WHERE id = ?').get(id)
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
    INSERT INTO recipes (id, user_id, name, yield_per_piece, ddt, process_loss_pct, bake_loss_pct, autolyse, autolyse_duration_min)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    INSERT INTO preferment_settings (ingredient_id, enabled, type, base_source_ingredient_id)
    VALUES (?, ?, ?, ?)
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
      data.autolyse_duration_min || 20
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
            ing.preferment_settings.base_source_ingredient_id || null
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
        `INSERT INTO preferment_settings (ingredient_id, enabled, type, base_source_ingredient_id)
         VALUES (?, ?, ?, ?)`
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
            ing.preferment_settings.base_source_ingredient_id || null
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
