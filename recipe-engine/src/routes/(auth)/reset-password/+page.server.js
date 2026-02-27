import { fail, redirect } from '@sveltejs/kit'
import { hashPassword } from '$lib/server/auth.js'
import {
  getPasswordResetByOtp,
  markPasswordResetTokenUsed,
  updateUserPassword,
} from '$lib/server/db.js'

/** @type {import('./$types').Actions} */
export const actions = {
  default: async ({ request }) => {
    const form = await request.formData()
    const otp = form.get('otp')?.toString()?.trim()
    const password = form.get('password')?.toString()
    const confirmPassword = form.get('confirmPassword')?.toString()

    if (!otp || otp.length !== 6) {
      return fail(400, { error: 'Please enter a valid 6-digit code' })
    }

    const record = getPasswordResetByOtp(otp)

    if (!record) return fail(400, { error: 'Invalid code. Please check and try again.' })
    if (record.used_at) return fail(400, { error: 'This code has already been used' })
    if (new Date(record.expires_at) < new Date())
      return fail(400, { error: 'This code has expired. Please ask your administrator for a new one.' })

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
