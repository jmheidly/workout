import Database from 'better-sqlite3'
import { resolve } from 'path'

const DB_PATH =
  process.env.DATABASE_PATH || resolve(process.cwd(), 'data/workout.db')

const EXCLUDED_CATEGORIES = [
  'Yoga',
  'TRX',
  'Medicine Ball',
  'Machine',
  'Cables',
  'Stretches',
]
const EXCLUDED_DIFFICULTIES = ['Yoga']

let _db
function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
  }
  return _db
}

function attachArraysToExercises(exercises) {
  if (!exercises.length) return exercises

  const db = getDb()
  const ids = exercises.map((e) => e._id)
  const ph = ids.map(() => '?').join(',')

  const targets = db
    .prepare(
      `SELECT exercise_id, target FROM exercise_targets WHERE exercise_id IN (${ph}) ORDER BY position`
    )
    .all(...ids)
  const equipment = db
    .prepare(
      `SELECT exercise_id, equipment FROM exercise_equipment WHERE exercise_id IN (${ph})`
    )
    .all(...ids)
  const steps = db
    .prepare(
      `SELECT exercise_id, step FROM exercise_steps WHERE exercise_id IN (${ph}) ORDER BY position`
    )
    .all(...ids)
  const videos = db
    .prepare(
      `SELECT exercise_id, url FROM exercise_videos WHERE exercise_id IN (${ph}) ORDER BY position`
    )
    .all(...ids)

  const targetMap = {}
  const equipmentMap = {}
  const stepMap = {}
  const videoMap = {}

  for (const t of targets) {
    ;(targetMap[t.exercise_id] ??= []).push(t.target)
  }
  for (const e of equipment) {
    ;(equipmentMap[e.exercise_id] ??= []).push(e.equipment)
  }
  for (const s of steps) {
    ;(stepMap[s.exercise_id] ??= []).push(s.step)
  }
  for (const v of videos) {
    ;(videoMap[v.exercise_id] ??= []).push(v.url)
  }

  return exercises.map((e) => ({
    _id: e._id,
    title: e.title,
    category: e.category,
    difficulty: e.difficulty,
    mainMuscle: e.main_muscle,
    targets: targetMap[e._id] || [],
    equipment: equipmentMap[e._id] || [],
    steps: stepMap[e._id] || [],
    videos: videoMap[e._id] || [],
  }))
}

function assembleUser(row, projection = {}) {
  if (!row) return null

  const db = getDb()
  const userId = row.id

  const user = {
    _id: row.id,
    email: row.email,
    password: row.password,
    provider: row.provider,
    slug: row.slug,
  }

  // Load equipment
  if (projection.equipment !== 0) {
    const equipRows = db
      .prepare('SELECT equipment FROM user_equipment WHERE user_id = ?')
      .all(userId)
    user.equipment = equipRows.map((r) => r.equipment)
  }

  // Load workouts
  const workoutRows = db
    .prepare(
      'SELECT id, created_at FROM workouts WHERE user_id = ? ORDER BY created_at'
    )
    .all(userId)

  if (workoutRows.length > 0) {
    const workoutIds = workoutRows.map((w) => w.id)
    const wPh = workoutIds.map(() => '?').join(',')

    const exerciseRows = db
      .prepare(
        `SELECT workout_id, exercise_id, completed, position FROM workout_exercises WHERE workout_id IN (${wPh}) ORDER BY position`
      )
      .all(...workoutIds)
    const setRows = db
      .prepare(
        `SELECT workout_id, position, set_number, reps FROM workout_exercise_sets WHERE workout_id IN (${wPh}) ORDER BY position, set_number`
      )
      .all(...workoutIds)

    const setMap = {}
    for (const s of setRows) {
      const key = `${s.workout_id}:${s.position}`
      ;(setMap[key] ??= []).push({ reps: s.reps })
    }

    const exerciseMap = {}
    for (const e of exerciseRows) {
      ;(exerciseMap[e.workout_id] ??= []).push({
        id: e.exercise_id,
        completed: !!e.completed,
        sets: setMap[`${e.workout_id}:${e.position}`] || [],
      })
    }

    user.workouts = workoutRows.map((w) => ({
      id: w.id,
      created_at: w.created_at,
      exercises: exerciseMap[w.id] || [],
    }))
  } else {
    user.workouts = []
  }

  // Apply projection (MongoDB-style: field: 0 = exclude)
  for (const [key, val] of Object.entries(projection)) {
    if (val === 0) {
      delete user[key]
    }
  }

  return user
}

// ---- Exported functions ----

export const getUserByQuery = async (query, projection) => {
  try {
    const db = getDb()
    let row

    if (query.email) {
      row = db.prepare('SELECT * FROM users WHERE email = ?').get(query.email)
    } else if (query.slug) {
      row = db.prepare('SELECT * FROM users WHERE slug = ?').get(query.slug)
    } else if (query['workouts.id']) {
      row = db
        .prepare(
          'SELECT u.* FROM users u JOIN workouts w ON w.user_id = u.id WHERE w.id = ?'
        )
        .get(query['workouts.id'])
    }

    if (!row) return []
    const user = assembleUser(row, projection)
    return user ? [user] : []
  } catch (e) {
    console.log('error on getting user', e)
    return []
  }
}

export const createUser = async (user) => {
  try {
    const db = getDb()
    return db
      .prepare(
        'INSERT INTO users (email, password, provider, slug) VALUES (?, ?, ?, ?)'
      )
      .run(user.email, user.password || null, user.provider || null, user.slug)
  } catch (e) {
    console.log('error on creating user', e)
    return null
  }
}

export const updateUserByQuery = async (query, update) => {
  try {
    const db = getDb()

    let userRow
    if (query.email) {
      userRow = db
        .prepare('SELECT id FROM users WHERE email = ?')
        .get(query.email)
    } else if (query.slug) {
      userRow = db
        .prepare('SELECT id FROM users WHERE slug = ?')
        .get(query.slug)
    } else if (query._id) {
      userRow = db.prepare('SELECT id FROM users WHERE id = ?').get(query._id)
    }

    if (!userRow) return null
    const userId = userRow.id

    db.transaction(() => {
      // Scalar fields
      for (const field of ['email', 'password', 'provider', 'slug']) {
        if (update[field] !== undefined) {
          db.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`).run(
            update[field],
            userId
          )
        }
      }

      // Equipment array
      if (update.equipment !== undefined) {
        db.prepare('DELETE FROM user_equipment WHERE user_id = ?').run(userId)
        const ins = db.prepare(
          'INSERT INTO user_equipment (user_id, equipment) VALUES (?, ?)'
        )
        for (const eq of update.equipment || []) {
          ins.run(userId, eq)
        }
      }

      // Workouts
      if (update.workouts !== undefined) {
        const existing = db
          .prepare('SELECT id FROM workouts WHERE user_id = ?')
          .all(userId)
        if (existing.length) {
          const wIds = existing.map((w) => w.id)
          const wPh = wIds.map(() => '?').join(',')
          db.prepare(
            `DELETE FROM workout_exercise_sets WHERE workout_id IN (${wPh})`
          ).run(...wIds)
          db.prepare(
            `DELETE FROM workout_exercises WHERE workout_id IN (${wPh})`
          ).run(...wIds)
        }
        db.prepare('DELETE FROM workouts WHERE user_id = ?').run(userId)

        const insW = db.prepare(
          'INSERT INTO workouts (id, user_id, created_at) VALUES (?, ?, ?)'
        )
        const insWE = db.prepare(
          'INSERT INTO workout_exercises (workout_id, exercise_id, completed, position) VALUES (?, ?, ?, ?)'
        )
        const insS = db.prepare(
          'INSERT INTO workout_exercise_sets (workout_id, position, set_number, reps) VALUES (?, ?, ?, ?)'
        )

        for (const w of update.workouts || []) {
          insW.run(w.id, userId, w.created_at || new Date().toISOString())
          for (let i = 0; i < (w.exercises || []).length; i++) {
            const ex = w.exercises[i]
            insWE.run(w.id, ex.id, ex.completed ? 1 : 0, i)
            for (let j = 0; j < (ex.sets || []).length; j++) {
              insS.run(w.id, i, j, ex.sets[j].reps || '')
            }
          }
        }
      }
    })()

    return { ok: 1 }
  } catch (e) {
    console.log('error on updating user', e)
    return null
  }
}

export const createExercise = async (exercise) => {
  try {
    const db = getDb()
    const id = exercise._id || crypto.randomUUID()
    const targets = exercise.targets || []

    db.transaction(() => {
      db.prepare(
        'INSERT INTO exercises (_id, title, category, difficulty, main_muscle) VALUES (?, ?, ?, ?, ?)'
      ).run(
        id,
        exercise.title,
        exercise.category,
        exercise.difficulty,
        targets[0] || null
      )

      const insT = db.prepare(
        'INSERT INTO exercise_targets (exercise_id, target, position) VALUES (?, ?, ?)'
      )
      for (let i = 0; i < targets.length; i++) insT.run(id, targets[i], i)

      const insE = db.prepare(
        'INSERT INTO exercise_equipment (exercise_id, equipment) VALUES (?, ?)'
      )
      for (const eq of exercise.equipment || []) insE.run(id, eq)

      const insS = db.prepare(
        'INSERT INTO exercise_steps (exercise_id, step, position) VALUES (?, ?, ?)'
      )
      for (let i = 0; i < (exercise.steps || []).length; i++)
        insS.run(id, exercise.steps[i], i)

      const insV = db.prepare(
        'INSERT INTO exercise_videos (exercise_id, url, position) VALUES (?, ?, ?)'
      )
      for (let i = 0; i < (exercise.videos || []).length; i++)
        insV.run(id, exercise.videos[i], i)
    })()

    return { insertedId: id }
  } catch (e) {
    console.log('error on creating exercise', e)
    return null
  }
}

export const updateExercise = async ({ _id, update }) => {
  try {
    const db = getDb()
    for (const field of ['title', 'category', 'difficulty']) {
      if (update[field] !== undefined) {
        db.prepare(`UPDATE exercises SET ${field} = ? WHERE _id = ?`).run(
          update[field],
          _id
        )
      }
    }
    if (update.targets) {
      db.prepare('UPDATE exercises SET main_muscle = ? WHERE _id = ?').run(
        update.targets[0] || null,
        _id
      )
    }
    return { ok: 1 }
  } catch (e) {
    console.log('error on updating exercise', e)
    return null
  }
}

export const getAllExercises = async () => {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM exercises').all()
    return attachArraysToExercises(rows)
  } catch (e) {
    console.log('error on getting all exercises', e)
    return []
  }
}

export const getAllUsers = async () => {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM users').all()
    return rows.map((row) => assembleUser(row))
  } catch (e) {
    console.log('error on getting all users', e)
    return []
  }
}

// New exports replacing getExercisesByAggregation

export const getFilteredExercises = async ({
  muscles,
  equipment,
  difficulties,
}) => {
  try {
    const db = getDb()
    let sql = 'SELECT * FROM exercises e WHERE 1=1'
    const params = []

    sql += ` AND e.category NOT IN (${EXCLUDED_CATEGORIES.map(() => '?').join(
      ','
    )})`
    params.push(...EXCLUDED_CATEGORIES)

    sql += ` AND e.difficulty NOT IN (${EXCLUDED_DIFFICULTIES.map(
      () => '?'
    ).join(',')})`
    params.push(...EXCLUDED_DIFFICULTIES)

    if (muscles && muscles.length) {
      sql += ` AND e.main_muscle IN (${muscles.map(() => '?').join(',')})`
      params.push(...muscles)
    }

    if (equipment && equipment.length) {
      sql += ` AND NOT EXISTS (SELECT 1 FROM exercise_equipment ee WHERE ee.exercise_id = e._id AND ee.equipment NOT IN (${equipment
        .map(() => '?')
        .join(',')}))`
      params.push(...equipment)
    }

    if (difficulties && difficulties.length) {
      sql += ` AND e.difficulty IN (${difficulties.map(() => '?').join(',')})`
      params.push(...difficulties)
    }

    const rows = db.prepare(sql).all(...params)
    return attachArraysToExercises(rows)
  } catch (e) {
    console.log('error on getting filtered exercises', e)
    return []
  }
}

export const getExercisesByIds = async (ids) => {
  try {
    if (!ids || !ids.length) return []

    const db = getDb()
    const ph = ids.map(() => '?').join(',')
    let sql = `SELECT * FROM exercises e WHERE e._id IN (${ph})`
    const params = [...ids]

    sql += ` AND e.category NOT IN (${EXCLUDED_CATEGORIES.map(() => '?').join(
      ','
    )})`
    params.push(...EXCLUDED_CATEGORIES)

    sql += ` AND e.difficulty NOT IN (${EXCLUDED_DIFFICULTIES.map(
      () => '?'
    ).join(',')})`
    params.push(...EXCLUDED_DIFFICULTIES)

    const rows = db.prepare(sql).all(...params)
    return attachArraysToExercises(rows)
  } catch (e) {
    console.log('error on getting exercises by ids', e)
    return []
  }
}

export const getMuscleGroups = async ({ equipment }) => {
  try {
    const db = getDb()
    let sql = `
      SELECT
        e.main_muscle as _id,
        COUNT(*) as count,
        SUM(CASE WHEN e.difficulty = 'Beginner' THEN 1 ELSE 0 END) as beginner,
        SUM(CASE WHEN e.difficulty = 'Intermediate' THEN 1 ELSE 0 END) as intermediate,
        SUM(CASE WHEN e.difficulty = 'Advanced' THEN 1 ELSE 0 END) as advanced
      FROM exercises e
      WHERE 1=1
    `
    const params = []

    sql += ` AND e.category NOT IN (${EXCLUDED_CATEGORIES.map(() => '?').join(
      ','
    )})`
    params.push(...EXCLUDED_CATEGORIES)

    sql += ` AND e.difficulty NOT IN (${EXCLUDED_DIFFICULTIES.map(
      () => '?'
    ).join(',')})`
    params.push(...EXCLUDED_DIFFICULTIES)

    if (equipment && equipment.length) {
      sql += ` AND NOT EXISTS (SELECT 1 FROM exercise_equipment ee WHERE ee.exercise_id = e._id AND ee.equipment NOT IN (${equipment
        .map(() => '?')
        .join(',')}))`
      params.push(...equipment)
    }

    sql += ' GROUP BY e.main_muscle'

    return db.prepare(sql).all(...params)
  } catch (e) {
    console.log('error on getting muscle groups', e)
    return []
  }
}
