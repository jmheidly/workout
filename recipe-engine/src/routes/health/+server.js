import { json } from '@sveltejs/kit'
import { getDb } from '$lib/server/db.js'

/** @type {import('./$types').RequestHandler} */
export function GET() {
  try {
    getDb().prepare('SELECT 1').get()
    return json({ status: 'ok' })
  } catch {
    return json({ status: 'error' }, { status: 503 })
  }
}
