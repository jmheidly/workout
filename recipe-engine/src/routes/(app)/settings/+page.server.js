import { fail, redirect } from '@sveltejs/kit'
import {
  getUserByEmail,
  updateUser,
  updateUserPassword,
  deleteUser,
} from '$lib/server/db.js'
import {
  hashPassword,
  verifyPassword,
  invalidateSession,
  deleteSessionCookie,
  SESSION_COOKIE,
} from '$lib/server/auth.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  const full = getUserByEmail(locals.user.email)
  return {
    profile: {
      name: locals.user.name || '',
      email: locals.user.email,
      hasPassword: !!full?.password_hash,
      hasGoogle: !!full?.google_id,
    },
  }
}

/** @type {import('./$types').Actions} */
export const actions = {
  updateProfile: async ({ request, locals }) => {
    const form = await request.formData()
    const name = form.get('name')?.toString()?.trim()

    if (!name) return fail(400, { profileError: 'Name is required' })

    updateUser(locals.user.id, { name })
    return { profileSuccess: true }
  },

  changePassword: async ({ request, locals }) => {
    const form = await request.formData()
    const currentPassword = form.get('currentPassword')?.toString() || ''
    const newPassword = form.get('newPassword')?.toString() || ''
    const confirmPassword = form.get('confirmPassword')?.toString() || ''

    if (newPassword.length < 6) {
      return fail(400, {
        passwordError: 'New password must be at least 6 characters',
      })
    }
    if (newPassword !== confirmPassword) {
      return fail(400, { passwordError: 'Passwords do not match' })
    }

    const full = getUserByEmail(locals.user.email)

    // If user already has a password, verify the current one
    if (full?.password_hash) {
      if (!currentPassword) {
        return fail(400, { passwordError: 'Current password is required' })
      }
      if (!verifyPassword(currentPassword, full.password_hash)) {
        return fail(400, { passwordError: 'Current password is incorrect' })
      }
    }

    const hashed = hashPassword(newPassword)
    updateUserPassword(locals.user.id, hashed)
    return { passwordSuccess: true }
  },

  deleteAccount: async ({ locals, cookies }) => {
    const token = cookies.get(SESSION_COOKIE)
    if (token) invalidateSession(token)
    deleteSessionCookie(cookies)
    deleteUser(locals.user.id)
    redirect(302, '/login')
  },
}
