import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { BSON } from 'bson'
import Database from 'better-sqlite3'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const BSON_PATH = resolve(ROOT, 'lib/dump/prod/exercises.bson')
const DB_PATH = process.env.DATABASE_PATH || resolve(ROOT, 'data/workout.db')

function parseBson(filePath) {
  const buf = readFileSync(filePath)
  const docs = []
  let offset = 0
  while (offset < buf.length) {
    const size = buf.readInt32LE(offset)
    docs.push(BSON.deserialize(buf.slice(offset, offset + size)))
    offset += size
  }
  return docs
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS exercises (
      _id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT,
      difficulty TEXT,
      main_muscle TEXT
    );

    CREATE TABLE IF NOT EXISTS exercise_targets (
      exercise_id TEXT NOT NULL REFERENCES exercises(_id),
      target TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (exercise_id, position)
    );

    CREATE TABLE IF NOT EXISTS exercise_equipment (
      exercise_id TEXT NOT NULL REFERENCES exercises(_id),
      equipment TEXT NOT NULL,
      PRIMARY KEY (exercise_id, equipment)
    );

    CREATE TABLE IF NOT EXISTS exercise_steps (
      exercise_id TEXT NOT NULL REFERENCES exercises(_id),
      step TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (exercise_id, position)
    );

    CREATE TABLE IF NOT EXISTS exercise_videos (
      exercise_id TEXT NOT NULL REFERENCES exercises(_id),
      url TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (exercise_id, position)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT,
      provider TEXT,
      slug TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_equipment (
      user_id INTEGER NOT NULL REFERENCES users(id),
      equipment TEXT NOT NULL,
      PRIMARY KEY (user_id, equipment)
    );

    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_exercises (
      workout_id TEXT NOT NULL REFERENCES workouts(id),
      exercise_id TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL,
      PRIMARY KEY (workout_id, position)
    );

    CREATE TABLE IF NOT EXISTS workout_exercise_sets (
      workout_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      set_number INTEGER NOT NULL,
      reps TEXT NOT NULL,
      PRIMARY KEY (workout_id, position, set_number),
      FOREIGN KEY (workout_id, position) REFERENCES workout_exercises(workout_id, position)
    );
  `)
}

function seedExercises(db, exercises) {
  const insertExercise = db.prepare(
    'INSERT OR REPLACE INTO exercises (_id, title, category, difficulty, main_muscle) VALUES (?, ?, ?, ?, ?)'
  )
  const insertTarget = db.prepare(
    'INSERT OR REPLACE INTO exercise_targets (exercise_id, target, position) VALUES (?, ?, ?)'
  )
  const insertEquipment = db.prepare(
    'INSERT OR REPLACE INTO exercise_equipment (exercise_id, equipment) VALUES (?, ?)'
  )
  const insertStep = db.prepare(
    'INSERT OR REPLACE INTO exercise_steps (exercise_id, step, position) VALUES (?, ?, ?)'
  )
  const insertVideo = db.prepare(
    'INSERT OR REPLACE INTO exercise_videos (exercise_id, url, position) VALUES (?, ?, ?)'
  )

  const insertAll = db.transaction((exercises) => {
    for (const ex of exercises) {
      const id =
        typeof ex._id === 'string' ? ex._id : ex._id.toString('hex')
      const targets = ex.targets || []
      const mainMuscle = targets[0] || null

      insertExercise.run(id, ex.title, ex.category, ex.difficulty, mainMuscle)

      for (let i = 0; i < targets.length; i++) {
        insertTarget.run(id, targets[i], i)
      }

      for (const eq of ex.equipment || []) {
        insertEquipment.run(id, eq)
      }

      for (let i = 0; i < (ex.steps || []).length; i++) {
        insertStep.run(id, ex.steps[i], i)
      }

      for (let i = 0; i < (ex.videos || []).length; i++) {
        insertVideo.run(id, ex.videos[i], i)
      }
    }
  })

  insertAll(exercises)
}

console.log('Parsing BSON from', BSON_PATH)
const exercises = parseBson(BSON_PATH)
console.log(`Found ${exercises.length} exercises`)

console.log('Creating database at', DB_PATH)
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

createSchema(db)
seedExercises(db, exercises)

const count = db.prepare('SELECT COUNT(*) as count FROM exercises').get()
console.log(`Seeded ${count.count} exercises`)

db.close()
console.log('Done!')
