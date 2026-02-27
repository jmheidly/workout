import crypto from 'crypto'
import { json } from '@sveltejs/kit'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import {
  getMfaPending,
  getWebAuthnCredential,
  updateWebAuthnCredentialCounter,
  incrementMfaPendingAttempts,
  deleteMfaPending,
} from '$lib/server/db.js'
import { createSession, setSessionCookie } from '$lib/server/auth.js'
import { rpID, origin } from '$lib/server/webauthn-config.js'
import { MFA_PENDING_COOKIE } from '$lib/server/mfa-login.js'

/** @type {import('./$types').RequestHandler} */
export async function POST({ cookies, request }) {
  const token = cookies.get(MFA_PENDING_COOKIE)
  if (!token) {
    return json({ error: 'No MFA session' }, { status: 401 })
  }

  const pendingId = crypto.createHash('sha256').update(token).digest('hex')
  const pending = getMfaPending(pendingId)
  if (!pending || !pending.challenge || pending.expires_at < Date.now()) {
    return json({ error: 'MFA session expired' }, { status: 401 })
  }

  if (pending.attempts >= 5) {
    return json({ error: 'Too many attempts' }, { status: 429 })
  }

  const body = await request.json()

  const credential = getWebAuthnCredential(body.id)
  if (!credential || credential.user_id !== pending.user_id) {
    incrementMfaPendingAttempts(pendingId)
    return json({ ok: false, error: 'MFA verification failed' }, { status: 400 })
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: pending.challenge,
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
    incrementMfaPendingAttempts(pendingId)
    return json({ ok: false, error: 'MFA verification failed' }, { status: 400 })
  }

  if (!verification.verified) {
    incrementMfaPendingAttempts(pendingId)
    return json({ ok: false, error: 'MFA verification failed' }, { status: 400 })
  }

  updateWebAuthnCredentialCounter(
    credential.id,
    verification.authenticationInfo.newCounter,
    Date.now()
  )

  deleteMfaPending(pendingId)
  cookies.delete(MFA_PENDING_COOKIE, { path: '/' })

  const session = createSession(pending.user_id)
  setSessionCookie(cookies, session.token, session.expiresAt)

  return json({ ok: true, next: pending.redirect_to })
}
