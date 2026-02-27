import { json } from '@sveltejs/kit'
import { getUserMfaKeys, getUserByEmail } from '$lib/server/db.js'

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const keys = getUserMfaKeys(locals.user.id)
  const user = getUserByEmail(locals.user.email)

  return json({
    mfaEnabled: user?.mfa_enabled === 1,
    keys: keys.map((k) => ({
      id: k.id,
      createdAt: k.created_at,
      lastUsedAt: k.last_used_at,
    })),
  })
}
