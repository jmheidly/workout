import { redirect, error } from '@sveltejs/kit'
import { decodeIdToken } from 'arctic'
import { google } from '$lib/server/oauth.js'
import {
  getUserByGoogleId,
  getUserByEmail,
  getUserById,
  createGoogleUser,
  updateUser,
  createBakery,
  addBakeryMember,
  setActiveBakery,
  getBakeryMember,
} from '$lib/server/db.js'
import { createSession, setSessionCookie } from '$lib/server/auth.js'

/** @type {import('./$types').RequestHandler} */
export async function GET({ url, cookies }) {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const storedState = cookies.get('google_oauth_state')
  const codeVerifier = cookies.get('google_oauth_code_verifier')

  if (
    !code ||
    !state ||
    !storedState ||
    !codeVerifier ||
    state !== storedState
  ) {
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
  let isNewUser = false

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
      const fields = {
        google_id: googleId,
        name: name || existingByEmail.name,
      }
      if (!existingByEmail.email_verified_at) {
        fields.email_verified_at = new Date().toISOString()
      }
      updateUser(existingByEmail.id, fields)
      user = existingByEmail
    } else {
      // New user
      user = createGoogleUser(email, name, googleId)
      isNewUser = true
    }
  }

  const { token, expiresAt } = createSession(user.id)
  setSessionCookie(cookies, token, expiresAt)

  // Clean up OAuth cookies
  cookies.delete('google_oauth_state', { path: '/' })
  cookies.delete('google_oauth_code_verifier', { path: '/' })

  // Check for invite token (UUID format only)
  const inviteToken = cookies.get('oauth_invite_token')
  if (inviteToken) {
    cookies.delete('oauth_invite_token', { path: '/' })
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inviteToken)) {
      redirect(302, `/invite/${inviteToken}`)
    }
  }

  if (isNewUser) {
    // Create personal bakery for new user
    const slug = email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
    const displayName = name || email.split('@')[0]
    const bakery = createBakery(`${displayName}'s Bakery`, slug, user.id)
    addBakeryMember(bakery.id, user.id, 'owner')
    setActiveBakery(user.id, bakery.id)
    redirect(302, '/recipes')
  }

  // Existing user — check active bakery
  const fullUser = getUserById(user.id)
  if (fullUser?.active_bakery_id) {
    const member = getBakeryMember(fullUser.active_bakery_id, user.id)
    if (member) {
      redirect(302, '/recipes')
    }
  }

  redirect(302, '/bakeries')
}
