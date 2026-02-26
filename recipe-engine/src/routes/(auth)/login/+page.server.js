import { fail, redirect } from '@sveltejs/kit'
import { getUserByEmail, getUserById, getBakeryMember } from '$lib/server/db.js'
import {
  verifyPassword,
  createSession,
  setSessionCookie,
} from '$lib/server/auth.js'

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

    const user = getUserByEmail(email)
    if (!user || !verifyPassword(password, user.password_hash)) {
      return fail(400, { error: 'Invalid email or password', email })
    }

    const { token, expiresAt } = createSession(user.id)
    setSessionCookie(cookies, token, expiresAt)

    // Check for invite token
    const inviteToken = url.searchParams.get('invite')
    if (inviteToken) {
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
