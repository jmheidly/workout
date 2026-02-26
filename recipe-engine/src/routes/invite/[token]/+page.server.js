import { error, fail, redirect } from '@sveltejs/kit'
import {
  getInvitationByToken,
  getBakery,
  getBakeryMember,
  acceptInvitation,
  addBakeryMember,
  setActiveBakery,
} from '$lib/server/db.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ params, locals }) {
  const invitation = getInvitationByToken(params.token)
  if (!invitation) {
    error(404, 'Invitation not found')
  }

  const bakery = getBakery(invitation.bakery_id)
  if (!bakery) {
    error(404, 'Bakery not found')
  }

  const now = new Date()
  const expiresAt = new Date(invitation.expires_at)

  if (invitation.accepted_at) {
    return { status: 'accepted', bakeryName: bakery.name }
  }

  if (now > expiresAt) {
    return { status: 'expired', bakeryName: bakery.name }
  }

  if (!locals.user) {
    redirect(302, `/login?invite=${params.token}`)
  }

  // Check if already a member
  const existing = getBakeryMember(invitation.bakery_id, locals.user.id)
  if (existing) {
    return { status: 'already_member', bakeryName: bakery.name }
  }

  return {
    status: 'pending',
    bakeryName: bakery.name,
    role: invitation.role,
    invitationId: invitation.id,
  }
}

/** @type {import('./$types').Actions} */
export const actions = {
  accept: async ({ request, locals, params }) => {
    if (!locals.user) {
      redirect(302, `/login?invite=${params.token}`)
    }

    const invitation = getInvitationByToken(params.token)
    if (!invitation) return fail(404, { error: 'Invitation not found' })
    if (invitation.accepted_at) return fail(400, { error: 'Already accepted' })

    const now = new Date()
    const expiresAt = new Date(invitation.expires_at)
    if (now > expiresAt) return fail(400, { error: 'Invitation expired' })

    const existing = getBakeryMember(invitation.bakery_id, locals.user.id)
    if (existing) return fail(400, { error: 'Already a member' })

    acceptInvitation(invitation.id)
    addBakeryMember(invitation.bakery_id, locals.user.id, invitation.role)
    setActiveBakery(locals.user.id, invitation.bakery_id)

    redirect(302, '/recipes')
  },
}
