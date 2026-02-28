import { getDb } from './db.js'

export function isRateLimited(limiter, key, windowMs, max) {
  const db = getDb()
  const cutoff = Date.now() - windowMs
  const row = db
    .prepare(
      'SELECT COUNT(*) as count FROM rate_limits WHERE limiter = ? AND key = ? AND attempted_at > ?'
    )
    .get(limiter, key, cutoff)
  return row.count >= max
}

export function recordAttempt(limiter, key) {
  const db = getDb()
  db.prepare(
    'INSERT INTO rate_limits (limiter, key, attempted_at) VALUES (?, ?, ?)'
  ).run(limiter, key, Date.now())
}

export function deleteExpiredRateLimits() {
  const db = getDb()
  const cutoff = Date.now() - 60 * 60 * 1000
  db.prepare('DELETE FROM rate_limits WHERE attempted_at < ?').run(cutoff)
}
