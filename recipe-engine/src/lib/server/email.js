import { Resend } from 'resend'
import { env } from '$env/dynamic/private'

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Send an email. Falls back to console logging if RESEND_API_KEY is missing or is a test key.
 */
export async function sendEmail(to, subject, html) {
  const apiKey = env.RESEND_API_KEY
  const from = env.FROM_EMAIL

  if (!apiKey || apiKey.startsWith('re_test_')) {
    console.log(`[email] To: ${to}`)
    console.log(`[email] Subject: ${subject}`)
    console.log(`[email] Body:\n${html}`)
    return
  }

  try {
    const resend = new Resend(apiKey)
    await resend.emails.send({ from, to, subject, html })
  } catch (err) {
    console.error('[email] Failed to send:', err)
  }
}

export function passwordResetEmail(resetUrl, otpCode) {
  const subject = 'Reset your password'
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="margin-bottom: 16px;">Reset your password</h2>
      <p>Click the button below to set a new password:</p>
      <a href="${escapeHtml(resetUrl)}" style="display: inline-block; background: #171717; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">Reset Password</a>
      <p>Or enter this code on the reset page:</p>
      <p style="font-size: 28px; font-family: monospace; letter-spacing: 4px; font-weight: bold; margin: 16px 0;">${escapeHtml(otpCode)}</p>
      <p style="color: #666; font-size: 14px;">This link and code expire in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `.trim()

  return { subject, html }
}

export function loginCodeEmail(otpCode) {
  const subject = 'Your login code'
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="margin-bottom: 16px;">Sign in to your account</h2>
      <p>Enter this code to sign in:</p>
      <p style="font-size: 28px; font-family: monospace; letter-spacing: 4px; font-weight: bold; margin: 16px 0;">${escapeHtml(otpCode)}</p>
      <p style="color: #666; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `.trim()

  return { subject, html }
}

export function verificationEmail(otpCode) {
  const subject = 'Verify your email'
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="margin-bottom: 16px;">Verify your email address</h2>
      <p>Enter this code to verify your email address:</p>
      <p style="font-size: 28px; font-family: monospace; letter-spacing: 4px; font-weight: bold; margin: 16px 0;">${escapeHtml(otpCode)}</p>
      <p style="color: #666; font-size: 14px;">This code expires in 10 minutes. If you didn't create an account, you can safely ignore this email.</p>
    </div>
  `.trim()

  return { subject, html }
}

export function invitationEmail(bakeryName, role, inviteUrl) {
  const subject = `You've been invited to ${bakeryName}`
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="margin-bottom: 16px;">You're invited!</h2>
      <p>You've been invited to join <strong>${escapeHtml(bakeryName)}</strong> as a <strong>${escapeHtml(role)}</strong>.</p>
      <a href="${escapeHtml(inviteUrl)}" style="display: inline-block; background: #171717; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">Accept Invitation</a>
      <p style="color: #666; font-size: 14px;">This invitation expires in 7 days. If you weren't expecting this, you can safely ignore this email.</p>
    </div>
  `.trim()

  return { subject, html }
}
