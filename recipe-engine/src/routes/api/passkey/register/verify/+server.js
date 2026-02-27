import { json } from '@sveltejs/kit'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import {
  getWebAuthnChallenge,
  deleteWebAuthnChallenge,
  createWebAuthnCredential,
} from '$lib/server/db.js'
import { rpID, origin } from '$lib/server/webauthn-config.js'

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, request }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { challengeId, registrationResponse } = body

  if (!challengeId || !registrationResponse) {
    return json({ error: 'Missing fields' }, { status: 400 })
  }

  const challenge = getWebAuthnChallenge(challengeId)
  if (
    !challenge ||
    challenge.user_id !== locals.user.id ||
    challenge.purpose !== 'passkey_register' ||
    challenge.expires_at < Date.now()
  ) {
    return json({ error: 'Invalid or expired challenge' }, { status: 400 })
  }

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    })
  } catch {
    return json({ error: 'Registration verification failed' }, { status: 400 })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return json({ error: 'Registration verification failed' }, { status: 400 })
  }

  const { credential } = verification.registrationInfo

  createWebAuthnCredential({
    id: credential.id,
    userId: locals.user.id,
    publicKey: Buffer.from(credential.publicKey),
    counter: credential.counter,
    transports: registrationResponse.response?.transports
      ? JSON.stringify(registrationResponse.response.transports)
      : null,
    kind: 'passkey',
  })

  deleteWebAuthnChallenge(challengeId)

  return json({ ok: true })
}
