import crypto from 'node:crypto'
import { fail, redirect } from '@sveltejs/kit'
import {
  getUserByEmail,
  createUser,
  getInvitationsByEmail,
  acceptInvitation,
  addBakeryMember,
  setActiveBakery,
  createBakery,
  invalidateLoginCodes,
  createLoginCode,
} from '$lib/server/db.js'
import {
  hashPassword,
  createSession,
  setSessionCookie,
} from '$lib/server/auth.js'
import { sendEmail, verificationEmail } from '$lib/server/email.js'

async function sendVerificationCode(userId, email) {
  invalidateLoginCodes(userId)
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  createLoginCode(userId, code, codeExpiresAt)
  const { subject, html } = verificationEmail(code)
  await sendEmail(email, subject, html)
}

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
    const name = form.get('name')?.toString()?.trim()
    const email = form.get('email')?.toString()?.trim()?.toLowerCase()
    const isPasswordless = form.get('passwordless') === '1'

    if (!name || !email) {
      return fail(400, { error: 'Name and email are required', email, name })
    }

    let hash = null
    if (!isPasswordless) {
      const password = form.get('password')?.toString()
      const confirmPassword = form.get('confirmPassword')?.toString()

      if (!password || !confirmPassword) {
        return fail(400, { error: 'All fields are required', email, name })
      }

      if (password.length < 6) {
        return fail(400, {
          error: 'Password must be at least 6 characters',
          email,
          name,
        })
      }

      if (password !== confirmPassword) {
        return fail(400, { error: 'Passwords do not match', email, name })
      }

      hash = hashPassword(password)
    }

    const existing = getUserByEmail(email)
    if (existing) {
      return fail(400, {
        error: 'An account with this email already exists',
        email,
      })
    }

    const user = createUser(email, hash, name)

    const session = createSession(user.id)
    setSessionCookie(cookies, session.token, session.expiresAt)

    // Check for invite token in query params (UUID format only)
    const inviteToken = url.searchParams.get('invite')
    if (inviteToken && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inviteToken)) {
      await sendVerificationCode(user.id, email)
      redirect(302, `/invite/${inviteToken}`)
    }

    // Check for pending invitations by email
    const pendingInvites = getInvitationsByEmail(email)
    if (pendingInvites.length > 0) {
      const invite = pendingInvites[0]
      acceptInvitation(invite.id)
      addBakeryMember(invite.bakery_id, user.id, invite.role)
      setActiveBakery(user.id, invite.bakery_id)
    } else {
      // No invite — create personal bakery
      const slug = email
        .split('@')[0]
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
      const bakery = createBakery(`${name}'s Bakery`, slug, user.id)
      addBakeryMember(bakery.id, user.id, 'owner')
      setActiveBakery(user.id, bakery.id)
    }

    await sendVerificationCode(user.id, email)
    redirect(302, '/verify-email')
  },
}
