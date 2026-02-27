import crypto from 'crypto'
import { ORIGIN } from '$env/static/private'
import {
  getUserByEmail,
  createPasswordResetToken,
} from '$lib/server/db.js'
import { sendEmail, passwordResetEmail } from '$lib/server/email.js'

/** @type {import('./$types').Actions} */
export const actions = {
  default: async ({ request }) => {
    const form = await request.formData()
    const email = form.get('email')?.toString()?.trim()?.toLowerCase()

    if (!email) return { submitted: true }

    const user = getUserByEmail(email)
    if (user) {
      const token = crypto.randomUUID()
      const otpCode = String(
        Math.floor(Math.random() * 1_000_000)
      ).padStart(6, '0')
      const expiresAt = new Date(
        Date.now() + 60 * 60 * 1000
      ).toISOString()

      createPasswordResetToken(user.id, token, otpCode, expiresAt)

      const resetUrl = `${ORIGIN}/reset-password/${token}`
      const { subject, html } = passwordResetEmail(resetUrl, otpCode)
      sendEmail(email, subject, html)
    }

    return { submitted: true }
  },
}
