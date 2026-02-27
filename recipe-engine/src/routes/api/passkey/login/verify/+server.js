import { json } from '@sveltejs/kit'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import {
  getWebAuthnChallenge,
  deleteWebAuthnChallenge,
  getWebAuthnCredential,
  updateWebAuthnCredentialCounter,
  getUserById,
  getBakeryMember,
} from '$lib/server/db.js'
import { createSession, setSessionCookie } from '$lib/server/auth.js'
import { rpID, origin } from '$lib/server/webauthn-config.js'

/** Rate limit: max attempts per challengeId */
const attempts = new Map()
const MAX_ATTEMPTS = 5

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, cookies }) {
  const body = await request.json()
  const { challengeId, assertionResponse } = body

  if (!challengeId || !assertionResponse) {
    return json({ error: 'Missing fields' }, { status: 400 })
  }

  // Rate limit by challengeId
  const count = attempts.get(challengeId) || 0
  if (count >= MAX_ATTEMPTS) {
    return json({ error: 'Too many attempts' }, { status: 429 })
  }
  attempts.set(challengeId, count + 1)

  const challenge = getWebAuthnChallenge(challengeId)
  if (
    !challenge ||
    challenge.purpose !== 'passkey_login' ||
    challenge.expires_at < Date.now()
  ) {
    return json({ error: 'Invalid or expired challenge' }, { status: 400 })
  }

  const credential = getWebAuthnCredential(assertionResponse.id)
  if (!credential) {
    attempts.set(challengeId, (attempts.get(challengeId) || 0) + 1)
    return json({ error: 'Credential not found' }, { status: 400 })
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: assertionResponse,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credential.id,
        publicKey: credential.public_key,
        counter: credential.counter,
        transports: credential.transports
          ? JSON.parse(credential.transports)
          : undefined,
      },
    })
  } catch {
    return json({ error: 'Verification failed' }, { status: 400 })
  }

  if (!verification.verified) {
    return json({ error: 'Verification failed' }, { status: 400 })
  }

  // Success — clean up
  updateWebAuthnCredentialCounter(
    credential.id,
    verification.authenticationInfo.newCounter,
    Date.now()
  )
  deleteWebAuthnChallenge(challengeId)
  attempts.delete(challengeId)

  // Create session directly (passkey is inherently multi-factor)
  const session = createSession(credential.user_id)
  setSessionCookie(cookies, session.token, session.expiresAt)

  // Determine redirect
  const user = getUserById(credential.user_id)
  let next = '/bakeries'
  if (user?.active_bakery_id) {
    const member = getBakeryMember(user.active_bakery_id, user.id)
    if (member) next = '/recipes'
  }

  return json({ ok: true, next })
}
