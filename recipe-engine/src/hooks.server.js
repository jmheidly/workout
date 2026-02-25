import { validateSession, SESSION_COOKIE } from '$lib/server/auth.js'

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const token = event.cookies.get(SESSION_COOKIE)

  if (token) {
    const result = validateSession(token)
    if (result) {
      event.locals.user = result.user
      event.locals.session = result.session
    }
  }

  return resolve(event)
}
