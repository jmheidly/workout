import { fail, redirect } from '@sveltejs/kit'
import { getUserByEmail } from '$lib/server/db.js'
import {
  verifyPassword,
  createSession,
  setSessionCookie
} from '$lib/server/auth.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  if (locals.user) {
    redirect(302, '/recipes')
  }
}

/** @type {import('./$types').Actions} */
export const actions = {
  default: async ({ request, cookies }) => {
    const form = await request.formData()
    const email = form.get('email')?.toString()?.trim()?.toLowerCase()
    const password = form.get('password')?.toString()

    if (!email || !password) {
      return fail(400, { error: 'Email and password are required', email })
    }

    const user = getUserByEmail(email)
    if (!user || !verifyPassword(password, user.password_hash)) {
      return fail(400, { error: 'Invalid email or password', email })
    }

    const { token, expiresAt } = createSession(user.id)
    setSessionCookie(cookies, token, expiresAt)

    redirect(302, '/recipes')
  }
}
