import { fail, redirect } from '@sveltejs/kit'
import { getUserByEmail, createUser } from '$lib/server/db.js'
import {
  hashPassword,
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
    const confirmPassword = form.get('confirmPassword')?.toString()

    if (!email || !password || !confirmPassword) {
      return fail(400, { error: 'All fields are required', email })
    }

    if (password.length < 6) {
      return fail(400, { error: 'Password must be at least 6 characters', email })
    }

    if (password !== confirmPassword) {
      return fail(400, { error: 'Passwords do not match', email })
    }

    const existing = getUserByEmail(email)
    if (existing) {
      return fail(400, { error: 'An account with this email already exists', email })
    }

    const hash = hashPassword(password)
    const user = createUser(email, hash)

    const { token, expiresAt } = createSession(user.id)
    setSessionCookie(cookies, token, expiresAt)

    redirect(302, '/recipes')
  }
}
