import { redirect } from '@sveltejs/kit'
import { generateState, generateCodeVerifier } from 'arctic'
import { google } from '$lib/server/oauth.js'

/** @type {import('./$types').RequestHandler} */
export function GET({ cookies }) {
  const state = generateState()
  const codeVerifier = generateCodeVerifier()

  const url = google.createAuthorizationURL(state, codeVerifier, [
    'openid',
    'profile',
    'email',
  ])

  cookies.set('google_oauth_state', state, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 60 * 10,
  })

  cookies.set('google_oauth_code_verifier', codeVerifier, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 60 * 10,
  })

  redirect(302, url.toString())
}
