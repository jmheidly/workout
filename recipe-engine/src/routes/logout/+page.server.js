import { redirect } from '@sveltejs/kit'
import {
  invalidateSession,
  SESSION_COOKIE,
  deleteSessionCookie
} from '$lib/server/auth.js'

/** @type {import('./$types').Actions} */
export const actions = {
  default: async ({ cookies }) => {
    const token = cookies.get(SESSION_COOKIE)
    if (token) {
      invalidateSession(token)
    }
    deleteSessionCookie(cookies)
    redirect(302, '/login')
  }
}
