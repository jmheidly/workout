import { fail, redirect } from '@sveltejs/kit'
import {
  getUserByEmail,
  createUser,
  getInvitationsByEmail,
  acceptInvitation,
  addBakeryMember,
  setActiveBakery,
  createBakery,
} from '$lib/server/db.js'
import {
  hashPassword,
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
    const name = form.get('name')?.toString()?.trim()
    const email = form.get('email')?.toString()?.trim()?.toLowerCase()
    const password = form.get('password')?.toString()
    const confirmPassword = form.get('confirmPassword')?.toString()

    if (!name || !email || !password || !confirmPassword) {
      return fail(400, { error: 'All fields are required', email, name })
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
    const user = createUser(email, hash, name)

    const { token, expiresAt } = createSession(user.id)
    setSessionCookie(cookies, token, expiresAt)

    // Check for invite token in query params
    const inviteToken = url.searchParams.get('invite')
    if (inviteToken) {
      redirect(302, `/invite/${inviteToken}`)
    }

    // Check for pending invitations by email
    const pendingInvites = getInvitationsByEmail(email)
    if (pendingInvites.length > 0) {
      const invite = pendingInvites[0]
      acceptInvitation(invite.id)
      addBakeryMember(invite.bakery_id, user.id, invite.role)
      setActiveBakery(user.id, invite.bakery_id)
      redirect(302, '/recipes')
    }

    // No invite — create personal bakery
    const slug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const bakery = createBakery(`${name}'s Bakery`, slug, user.id)
    addBakeryMember(bakery.id, user.id, 'owner')
    setActiveBakery(user.id, bakery.id)

    redirect(302, '/recipes')
  },
}
