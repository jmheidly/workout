import { fail, redirect } from '@sveltejs/kit'
import { hashPassword } from '$lib/server/auth.js'
import {
  getPasswordResetToken,
  markPasswordResetTokenUsed,
  updateUserPassword,
} from '$lib/server/db.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ params }) {
  const record = getPasswordResetToken(params.token)

  if (!record) return { status: 'invalid' }
  if (record.used_at) return { status: 'used' }
  if (new Date(record.expires_at) < new Date()) return { status: 'expired' }

  return { status: 'valid' }
}

/** @type {import('./$types').Actions} */
export const actions = {
  default: async ({ request, params }) => {
    const record = getPasswordResetToken(params.token)

    if (!record) return fail(400, { error: 'Invalid reset link' })
    if (record.used_at) return fail(400, { error: 'This reset link has already been used' })
    if (new Date(record.expires_at) < new Date())
      return fail(400, { error: 'This reset link has expired' })

    const form = await request.formData()
    const password = form.get('password')?.toString()
    const confirmPassword = form.get('confirmPassword')?.toString()

    if (!password || password.length < 6) {
      return fail(400, { error: 'Password must be at least 6 characters' })
    }
    if (password !== confirmPassword) {
      return fail(400, { error: 'Passwords do not match' })
    }

    const passwordHash = hashPassword(password)
    updateUserPassword(record.user_id, passwordHash)
    markPasswordResetTokenUsed(record.id)

    redirect(303, '/login')
  },
}
