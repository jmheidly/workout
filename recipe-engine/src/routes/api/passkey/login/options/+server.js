import { json } from '@sveltejs/kit'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import {
  createWebAuthnChallenge,
  deleteExpiredWebAuthnChallenges,
} from '$lib/server/db.js'
import { generateId } from '$lib/utils.js'
import { rpID } from '$lib/server/webauthn-config.js'

/** @type {import('./$types').RequestHandler} */
export async function POST() {
  deleteExpiredWebAuthnChallenges()

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
    allowCredentials: [],
  })

  const challengeId = generateId()
  createWebAuthnChallenge({
    id: challengeId,
    userId: '__passkey_login__',
    purpose: 'passkey_login',
    challenge: options.challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
  })

  return json({ challengeId, options })
}
