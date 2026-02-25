import { redirect, error } from '@sveltejs/kit'
import { decodeIdToken } from 'arctic'
import { google } from '$lib/server/oauth.js'
import {
  getUserByGoogleId,
  getUserByEmail,
  createGoogleUser,
  updateUser,
} from '$lib/server/db.js'
import { createSession, setSessionCookie } from '$lib/server/auth.js'

/** @type {import('./$types').RequestHandler} */
export async function GET({ url, cookies }) {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const storedState = cookies.get('google_oauth_state')
  const codeVerifier = cookies.get('google_oauth_code_verifier')

  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    error(400, 'Invalid OAuth callback')
  }

  let tokens
  try {
    tokens = await google.validateAuthorizationCode(code, codeVerifier)
  } catch {
    error(400, 'Failed to validate authorization code')
  }

  const claims = decodeIdToken(tokens.idToken())
  const googleId = /** @type {string} */ (claims.sub)
  const email = /** @type {string} */ (claims.email)
  const name = /** @type {string} */ (claims.name || '')

  let user

  // Check if user already exists by google_id
  const existingByGoogle = getUserByGoogleId(googleId)
  if (existingByGoogle) {
    user = existingByGoogle
    // Update name if changed
    if (name && name !== user.name) {
      updateUser(user.id, { name })
    }
  } else {
    // Check if user exists by email (link accounts)
    const existingByEmail = getUserByEmail(email)
    if (existingByEmail) {
      updateUser(existingByEmail.id, { google_id: googleId, name: name || existingByEmail.name })
      user = existingByEmail
    } else {
      // New user
      user = createGoogleUser(email, name, googleId)
    }
  }

  const { token, expiresAt } = createSession(user.id)
  setSessionCookie(cookies, token, expiresAt)

  // Clean up OAuth cookies
  cookies.delete('google_oauth_state', { path: '/' })
  cookies.delete('google_oauth_code_verifier', { path: '/' })

  redirect(302, '/recipes')
}
