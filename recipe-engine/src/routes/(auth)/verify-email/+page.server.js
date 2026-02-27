import crypto from 'node:crypto'
import { fail, redirect } from '@sveltejs/kit'
import {
  getUserById,
  invalidateLoginCodes,
  createLoginCode,
  getLoginCode,
  markLoginCodeUsed,
  incrementLoginCodeAttempts,
  markEmailVerified,
  getBakeryMember,
} from '$lib/server/db.js'
import { sendEmail, verificationEmail } from '$lib/server/email.js'

// ─── Rate limiter ────────────────────────────────────────────────────────────

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

// ─── Load ────────────────────────────────────────────────────────────────────

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  if (!locals.user) {
    redirect(302, '/login')
  }

  if (locals.user.email_verified_at) {
    const user = getUserById(locals.user.id)
    if (user?.active_bakery_id) {
      const member = getBakeryMember(user.active_bakery_id, user.id)
      if (member) redirect(302, '/recipes')
    }
    redirect(302, '/bakeries')
  }

  return {
    user: { email: locals.user.email },
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** @type {import('./$types').Actions} */
export const actions = {
  sendCode: async ({ locals }) => {
    if (!locals.user) {
      redirect(302, '/login')
    }

    const userId = locals.user.id
    const email = locals.user.email

    if (isRateLimited('verifySend', userId, 10 * 60 * 1000, 3)) {
      return fail(429, {
        error: 'Too many code requests. Try again later.',
      })
    }

    invalidateLoginCodes(userId)
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    createLoginCode(userId, code, expiresAt)
    const { subject, html } = verificationEmail(code)
    await sendEmail(email, subject, html)

    recordAttempt('verifySend', userId)
    return { codeSent: true }
  },

  verifyCode: async ({ request, locals }) => {
    if (!locals.user) {
      redirect(302, '/login')
    }

    const userId = locals.user.id

    const form = await request.formData()
    const code = form.get('code')?.toString()?.trim()

    if (!code) {
      return fail(400, { error: 'Code is required', codeSent: true })
    }

    if (isRateLimited('verifyCheck', userId, 10 * 60 * 1000, 5)) {
      return fail(429, {
        error: 'Too many attempts. Try again later.',
        codeSent: true,
      })
    }

    const record = getLoginCode(code)
    if (!record || new Date(record.expires_at) < new Date()) {
      recordAttempt('verifyCheck', userId)
      return fail(400, {
        error: 'Invalid or expired code',
        codeSent: true,
      })
    }

    if (record.user_id !== userId) {
      recordAttempt('verifyCheck', userId)
      return fail(400, {
        error: 'Invalid or expired code',
        codeSent: true,
      })
    }

    const attempts = incrementLoginCodeAttempts(record.id)
    if (attempts > 5) {
      markLoginCodeUsed(record.id)
      return fail(400, {
        error: 'Too many attempts for this code. Please request a new one.',
      })
    }

    markLoginCodeUsed(record.id)
    markEmailVerified(userId)

    const user = getUserById(userId)
    if (user?.active_bakery_id) {
      const member = getBakeryMember(user.active_bakery_id, userId)
      if (member) redirect(302, '/recipes')
    }
    redirect(302, '/bakeries')
  },
}
