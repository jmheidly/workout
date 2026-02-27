import crypto from 'crypto'
import { redirect, error } from '@sveltejs/kit'
import {
  createSession as dbCreateSession,
  getSession as dbGetSession,
  deleteSession as dbDeleteSession,
  updateSessionExpiry,
  getUserById,
} from './db.js'

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const EXTEND_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000 // 15 days

const SCRYPT_KEYLEN = 64
const SCRYPT_COST = 16384 // N=2^14

/** @returns {string} */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Hash a session token to a session ID (fast, non-secret mapping)
 * @param {string} token
 * @returns {string}
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Hash a password with scrypt (salted, high work factor)
 * @param {string} password
 * @returns {string} Format: salt:hash (both hex)
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto
    .scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST })
    .toString('hex')
  return `${salt}:${hash}`
}

/**
 * Verify a password against a scrypt hash
 * @param {string} password
 * @param {string} stored - Format: salt:hash
 * @returns {boolean}
 */
export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = crypto
    .scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST })
    .toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'))
}

/**
 * Create a new session
 * @param {string} userId
 * @returns {{ token: string, expiresAt: number }}
 */
export function createSession(userId) {
  const token = generateSessionToken()
  const expiresAt = Date.now() + SESSION_DURATION_MS
  const sessionId = hashToken(token)
  dbCreateSession(sessionId, userId, expiresAt)
  return { token, expiresAt }
}

/**
 * Validate a session token and return user info
 * @param {string} token
 * @returns {{ user: { id: string, email: string }, session: { id: string, expiresAt: number } } | null}
 */
export function validateSession(token) {
  const sessionId = hashToken(token)
  const session = dbGetSession(sessionId)

  if (!session) return null
  if (session.expires_at < Date.now()) {
    dbDeleteSession(sessionId)
    return null
  }

  const user = getUserById(session.user_id)
  if (!user) {
    dbDeleteSession(sessionId)
    return null
  }

  // Extend session if near expiry
  if (session.expires_at - Date.now() < EXTEND_THRESHOLD_MS) {
    const newExpiry = Date.now() + SESSION_DURATION_MS
    updateSessionExpiry(sessionId, newExpiry)
    session.expires_at = newExpiry
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name || null,
      email_verified_at: user.email_verified_at || null,
    },
    session: { id: sessionId, expiresAt: session.expires_at },
  }
}

/**
 * Invalidate a session by token
 * @param {string} token
 */
export function invalidateSession(token) {
  const sessionId = hashToken(token)
  dbDeleteSession(sessionId)
}

/** Session cookie name */
export const SESSION_COOKIE = 'recipe_session'

/**
 * Set session cookie on response
 * @param {import('@sveltejs/kit').Cookies} cookies
 * @param {string} token
 * @param {number} expiresAt
 */
export function setSessionCookie(cookies, token, expiresAt) {
  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(expiresAt),
  })
}

/**
 * Delete session cookie
 * @param {import('@sveltejs/kit').Cookies} cookies
 */
export function deleteSessionCookie(cookies) {
  cookies.delete(SESSION_COOKIE, { path: '/' })
}

/**
 * Require the current user to have one of the specified bakery roles.
 * Throws redirect to /bakeries if no bakery context, or 403 if role insufficient.
 * @param {object} locals
 * @param {...string} allowedRoles
 */
export function requireRole(locals, ...allowedRoles) {
  if (!locals.bakery) throw redirect(303, '/bakeries')
  if (!allowedRoles.includes(locals.bakery.role)) {
    throw error(403, 'Insufficient permissions')
  }
}
