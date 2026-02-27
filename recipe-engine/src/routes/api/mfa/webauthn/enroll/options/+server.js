import crypto from 'crypto'
import { json } from '@sveltejs/kit'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import {
  getUserMfaKeys,
  createWebAuthnChallenge,
  deleteExpiredWebAuthnChallenges,
} from '$lib/server/db.js'
import { generateId } from '$lib/utils.js'
import { rpName, rpID } from '$lib/server/webauthn-config.js'

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  deleteExpiredWebAuthnChallenges()

  const existingKeys = getUserMfaKeys(locals.user.id)
  const userID = crypto.createHash('sha256').update(locals.user.id).digest()

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID,
    userName: locals.user.email,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'discouraged',
      userVerification: 'required',
    },
    excludeCredentials: existingKeys.map((k) => ({
      id: k.id,
      type: 'public-key',
      transports: k.transports ? JSON.parse(k.transports) : undefined,
    })),
  })

  const challengeId = generateId()
  createWebAuthnChallenge({
    id: challengeId,
    userId: locals.user.id,
    purpose: 'enroll',
    challenge: options.challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
  })

  return json({ challengeId, options })
}
