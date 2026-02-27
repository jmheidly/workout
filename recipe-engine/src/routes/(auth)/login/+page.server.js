import crypto from 'node:crypto'
import { fail, redirect } from '@sveltejs/kit'
import {
  getUserByEmail,
  getUserById,
  getBakeryMember,
  invalidateLoginCodes,
  createLoginCode,
  getLoginCode,
  markLoginCodeUsed,
  incrementLoginCodeAttempts,
} from '$lib/server/db.js'
import {
  verifyPassword,
  createSession,
  setSessionCookie,
} from '$lib/server/auth.js'
import { sendEmail, loginCodeEmail } from '$lib/server/email.js'

// ─── Generic rate limiter ────────────────────────────────────────────────────

/** @type {Map<string, Map<string, number[]>>} */
const rateLimiters = new Map()

function isRateLimited(limiterName, key, windowMs, max) {
  if (!rateLimiters.has(limiterName)) rateLimiters.set(limiterName, new Map())
  const limiter = rateLimiters.get(limiterName)
  const now = Date.now()
  const attempts = (limiter.get(key) || []).filter((t) => now - t < windowMs)
  limiter.set(key, attempts)
  return attempts.length >= max
}

function recordAttempt(limiterName, key) {
  if (!rateLimiters.has(limiterName)) rateLimiters.set(limiterName, new Map())
  const limiter = rateLimiters.get(limiterName)
  const attempts = limiter.get(key) || []
  attempts.push(Date.now())
  limiter.set(key, attempts)
}

// ─── Shared redirect helper ─────────────────────────────────────────────────

function getRedirectUrl(userId, url) {
  const inviteToken = url.searchParams.get('invite')
  if (
    inviteToken &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      inviteToken
    )
  ) {
    return `/invite/${inviteToken}`
  }

  const fullUser = getUserById(userId)
  if (fullUser?.active_bakery_id) {
    const member = getBakeryMember(fullUser.active_bakery_id, userId)
    if (member) return '/recipes'
  }

  return '/bakeries'
}

// ─── Load ────────────────────────────────────────────────────────────────────

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, url }) {
  if (locals.user) {
    redirect(302, '/recipes')
  }
  return { invite: url.searchParams.get('invite') || null }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** @type {import('./$types').Actions} */
export const actions = {
  password: async ({ request, cookies, url }) => {
    const form = await request.formData()
    const email = form.get('email')?.toString()?.trim()?.toLowerCase()
    const password = form.get('password')?.toString()

    if (!email || !password) {
      return fail(400, {
        error: 'Email and password are required',
        email,
        tab: 'password',
      })
    }

    if (isRateLimited('login', email, 15 * 60 * 1000, 5)) {
      return fail(429, {
        error: 'Too many login attempts. Try again later.',
        email,
        tab: 'password',
      })
    }

    const user = getUserByEmail(email)
    if (!user) {
      recordAttempt('login', email)
      return fail(400, {
        error: 'Invalid email or password',
        email,
        tab: 'password',
      })
    }

    if (!user.password_hash) {
      return fail(400, {
        error:
          'This account uses passwordless login. Use the Email Code tab instead.',
        email,
        tab: 'password',
      })
    }

    if (!verifyPassword(password, user.password_hash)) {
      recordAttempt('login', email)
      return fail(400, {
        error: 'Invalid email or password',
        email,
        tab: 'password',
      })
    }

    const { token, expiresAt } = createSession(user.id)
    setSessionCookie(cookies, token, expiresAt)
    redirect(302, getRedirectUrl(user.id, url))
  },

  sendCode: async ({ request }) => {
    const form = await request.formData()
    const email = form.get('email')?.toString()?.trim()?.toLowerCase()

    if (!email) {
      return fail(400, { error: 'Email is required', tab: 'otp' })
    }

    if (isRateLimited('otpSend', email, 10 * 60 * 1000, 3)) {
      return fail(429, {
        error: 'Too many code requests. Try again later.',
        email,
        tab: 'otp',
      })
    }

    const user = getUserByEmail(email)
    if (user) {
      invalidateLoginCodes(user.id)
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
      createLoginCode(user.id, code, expiresAt)
      const { subject, html } = loginCodeEmail(code)
      await sendEmail(email, subject, html)
    }

    recordAttempt('otpSend', email)
    return { codeSent: true, email, tab: 'otp' }
  },

  verifyCode: async ({ request, cookies, url }) => {
    const form = await request.formData()
    const email = form.get('email')?.toString()?.trim()?.toLowerCase()
    const code = form.get('code')?.toString()?.trim()

    if (!email || !code) {
      return fail(400, {
        error: 'Email and code are required',
        email,
        tab: 'otp',
        codeSent: true,
      })
    }

    if (isRateLimited('otpVerify', email, 10 * 60 * 1000, 5)) {
      return fail(429, {
        error: 'Too many attempts. Try again later.',
        email,
        tab: 'otp',
        codeSent: true,
      })
    }

    const record = getLoginCode(code)
    if (!record || new Date(record.expires_at) < new Date()) {
      recordAttempt('otpVerify', email)
      return fail(400, {
        error: 'Invalid or expired code',
        email,
        tab: 'otp',
        codeSent: true,
      })
    }

    const attempts = incrementLoginCodeAttempts(record.id)
    if (attempts > 5) {
      markLoginCodeUsed(record.id)
      return fail(400, {
        error: 'Too many attempts for this code. Please request a new one.',
        email,
        tab: 'otp',
      })
    }

    const user = getUserByEmail(email)
    if (!user || user.id !== record.user_id) {
      recordAttempt('otpVerify', email)
      return fail(400, {
        error: 'Invalid or expired code',
        email,
        tab: 'otp',
        codeSent: true,
      })
    }

    markLoginCodeUsed(record.id)
    const { token, expiresAt } = createSession(user.id)
    setSessionCookie(cookies, token, expiresAt)
    redirect(302, getRedirectUrl(user.id, url))
  },
}
