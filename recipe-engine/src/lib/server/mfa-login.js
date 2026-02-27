import crypto from 'crypto'
import { redirect } from '@sveltejs/kit'
import { createSession, setSessionCookie } from './auth.js'
import { countUserMfaKeys, createMfaPending } from './db.js'

export const MFA_PENDING_COOKIE = 'mfa_pending'

/**
 * After primary auth succeeds, either create a session directly or redirect to MFA.
 * @param {{ cookies: import('@sveltejs/kit').Cookies, user: { id: string, mfa_enabled?: number }, redirectTo: string }} opts
 */
export function beginMfaOrCreateSession({ cookies, user, redirectTo }) {
  if (user.mfa_enabled === 1 && countUserMfaKeys(user.id) > 0) {
    const token = crypto.randomBytes(32).toString('hex')
    const pendingId = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex')
    const expiresAt = Date.now() + 5 * 60 * 1000

    createMfaPending({ id: pendingId, userId: user.id, redirectTo, expiresAt })

    cookies.set(MFA_PENDING_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 300,
    })

    redirect(302, '/mfa')
  }

  const { token, expiresAt } = createSession(user.id)
  setSessionCookie(cookies, token, expiresAt)
  redirect(302, redirectTo)
}
