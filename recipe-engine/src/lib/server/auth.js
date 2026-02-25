import crypto from 'crypto'
import CryptoJS from 'crypto-js'
import {
  createSession as dbCreateSession,
  getSession as dbGetSession,
  deleteSession as dbDeleteSession,
  updateSessionExpiry,
  getUserById
} from './db.js'

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const EXTEND_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000 // 15 days

/** @returns {string} */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Hash a password with SHA256
 * @param {string} password
 * @returns {string}
 */
export function hashPassword(password) {
  return CryptoJS.SHA256(password).toString()
}

/**
 * Verify a password against a hash
 * @param {string} password
 * @param {string} hash
 * @returns {boolean}
 */
export function verifyPassword(password, hash) {
  return CryptoJS.SHA256(password).toString() === hash
}

/**
 * Create a new session
 * @param {string} userId
 * @returns {{ token: string, expiresAt: number }}
 */
export function createSession(userId) {
  const token = generateSessionToken()
  const expiresAt = Date.now() + SESSION_DURATION_MS
  // Use SHA256 of token as session ID for storage
  const sessionId = CryptoJS.SHA256(token).toString()
  dbCreateSession(sessionId, userId, expiresAt)
  return { token, expiresAt }
}

/**
 * Validate a session token and return user info
 * @param {string} token
 * @returns {{ user: { id: string, email: string }, session: { id: string, expiresAt: number } } | null}
 */
export function validateSession(token) {
  const sessionId = CryptoJS.SHA256(token).toString()
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
    user: { id: user.id, email: user.email, name: user.name || null },
    session: { id: sessionId, expiresAt: session.expires_at }
  }
}

/**
 * Invalidate a session by token
 * @param {string} token
 */
export function invalidateSession(token) {
  const sessionId = CryptoJS.SHA256(token).toString()
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
    secure: false, // set to true in production
    expires: new Date(expiresAt)
  })
}

/**
 * Delete session cookie
 * @param {import('@sveltejs/kit').Cookies} cookies
 */
export function deleteSessionCookie(cookies) {
  cookies.delete(SESSION_COOKIE, { path: '/' })
}
