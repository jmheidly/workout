import { fail, redirect } from '@sveltejs/kit'
import { getUserByEmail, getUserById, getBakeryMember } from '$lib/server/db.js'
import {
  verifyPassword,
  createSession,
  setSessionCookie,
} from '$lib/server/auth.js'

// In-memory rate limiter: max 5 attempts per email per 15-minute window
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 5
/** @type {Map<string, number[]>} */
const loginAttempts = new Map()

function isRateLimited(email) {
  const now = Date.now()
  const attempts = (loginAttempts.get(email) || []).filter(
    (t) => now - t < LOGIN_WINDOW_MS
  )
  loginAttempts.set(email, attempts)
  return attempts.length >= LOGIN_MAX_ATTEMPTS
}

function recordAttempt(email) {
  const attempts = loginAttempts.get(email) || []
  attempts.push(Date.now())
  loginAttempts.set(email, attempts)
}

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, url }) {
  if (locals.user) {
    redirect(302, '/recipes')
  }
  return { invite: url.searchParams.get('invite') || null }
}

/** @type {import('./$types').Actions} */
export const actions = {
  default: async ({ request, cookies, url }) => {
    const form = await request.formData()
    const email = form.get('email')?.toString()?.trim()?.toLowerCase()
    const password = form.get('password')?.toString()

    if (!email || !password) {
      return fail(400, { error: 'Email and password are required', email })
    }

    if (isRateLimited(email)) {
      return fail(429, { error: 'Too many login attempts. Try again later.', email })
    }

    const user = getUserByEmail(email)
    if (!user || !verifyPassword(password, user.password_hash)) {
      recordAttempt(email)
      return fail(400, { error: 'Invalid email or password', email })
    }

    const { token, expiresAt } = createSession(user.id)
    setSessionCookie(cookies, token, expiresAt)

    // Check for invite token (UUID format only)
    const inviteToken = url.searchParams.get('invite')
    if (inviteToken && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inviteToken)) {
      redirect(302, `/invite/${inviteToken}`)
    }

    // Check if user has an active bakery
    const fullUser = getUserById(user.id)
    if (fullUser?.active_bakery_id) {
      const member = getBakeryMember(fullUser.active_bakery_id, user.id)
      if (member) {
        redirect(302, '/recipes')
      }
    }

    redirect(302, '/bakeries')
  },
}
