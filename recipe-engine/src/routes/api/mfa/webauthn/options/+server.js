import crypto from 'crypto'
import { json } from '@sveltejs/kit'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import {
  deleteExpiredMfaPending,
  getMfaPending,
  getUserMfaKeys,
  updateMfaPendingChallenge,
} from '$lib/server/db.js'
import { rpID } from '$lib/server/webauthn-config.js'
import { MFA_PENDING_COOKIE } from '$lib/server/mfa-login.js'

/** @type {import('./$types').RequestHandler} */
export async function POST({ cookies }) {
  deleteExpiredMfaPending()

  const token = cookies.get(MFA_PENDING_COOKIE)
  if (!token) {
    return json({ error: 'No MFA session' }, { status: 401 })
  }

  const pendingId = crypto.createHash('sha256').update(token).digest('hex')
  const pending = getMfaPending(pendingId)
  if (!pending || pending.expires_at < Date.now()) {
    return json({ error: 'MFA session expired' }, { status: 401 })
  }

  const keys = getUserMfaKeys(pending.user_id)
  if (keys.length === 0) {
    return json({ error: 'No MFA keys enrolled' }, { status: 400 })
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
    allowCredentials: keys.map((k) => ({
      id: k.id,
      type: 'public-key',
      transports: k.transports ? JSON.parse(k.transports) : undefined,
    })),
  })

  updateMfaPendingChallenge(pendingId, options.challenge)

  return json(options)
}
