import { fail } from '@sveltejs/kit'
import crypto from 'crypto'
import { requireRole } from '$lib/server/auth.js'
import {
  getBakeryMembers,
  getInvitationsByBakery,
  createInvitation,
  deleteInvitation,
  updateBakeryMemberRole,
  removeBakeryMember,
  getBakeryMember,
} from '$lib/server/db.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  requireRole(locals, 'owner', 'admin')
  const members = getBakeryMembers(locals.bakery.id)
  const invitations = getInvitationsByBakery(locals.bakery.id)
  return { members, invitations }
}

/** @type {import('./$types').Actions} */
export const actions = {
  invite: async ({ request, locals }) => {
    requireRole(locals, 'owner', 'admin')

    const form = await request.formData()
    const email = form.get('email')?.toString()?.trim()?.toLowerCase()
    const role = form.get('role')?.toString() || 'member'

    if (!email) return fail(400, { error: 'Email is required' })
    if (!['member', 'admin'].includes(role)) return fail(400, { error: 'Invalid role' })

    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    try {
      createInvitation(locals.bakery.id, email, role, locals.user.id, token, expiresAt)
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return fail(400, { error: 'An invitation for this email already exists' })
      }
      throw e
    }

    return { success: true, inviteToken: token }
  },

  cancelInvite: async ({ request, locals }) => {
    requireRole(locals, 'owner', 'admin')

    const form = await request.formData()
    const id = form.get('id')?.toString()
    if (!id) return fail(400, { error: 'Missing invitation ID' })

    deleteInvitation(id)
    return { success: true }
  },

  changeRole: async ({ request, locals }) => {
    const form = await request.formData()
    const userId = form.get('user_id')?.toString()
    const role = form.get('role')?.toString()

    if (!userId || !role) return fail(400, { error: 'Missing data' })
    if (!['owner', 'admin', 'member', 'viewer'].includes(role)) {
      return fail(400, { error: 'Invalid role' })
    }

    const target = getBakeryMember(locals.bakery.id, userId)
    if (!target) return fail(404, { error: 'Member not found' })

    // Only owners can change admin/owner roles
    if (target.role === 'owner' || target.role === 'admin' || role === 'owner' || role === 'admin') {
      requireRole(locals, 'owner')
    } else {
      requireRole(locals, 'owner', 'admin')
    }

    // Prevent removing last owner
    if (target.role === 'owner' && role !== 'owner') {
      const members = getBakeryMembers(locals.bakery.id)
      const ownerCount = members.filter((m) => m.role === 'owner').length
      if (ownerCount <= 1) {
        return fail(400, { error: 'Cannot demote the last owner' })
      }
    }

    updateBakeryMemberRole(locals.bakery.id, userId, role)
    return { success: true }
  },

  removeMember: async ({ request, locals }) => {
    const form = await request.formData()
    const userId = form.get('user_id')?.toString()
    if (!userId) return fail(400, { error: 'Missing user ID' })

    const target = getBakeryMember(locals.bakery.id, userId)
    if (!target) return fail(404, { error: 'Member not found' })

    // Only owners can remove admins/owners
    if (target.role === 'owner' || target.role === 'admin') {
      requireRole(locals, 'owner')
    } else {
      requireRole(locals, 'owner', 'admin')
    }

    // Prevent removing last owner
    if (target.role === 'owner') {
      const members = getBakeryMembers(locals.bakery.id)
      const ownerCount = members.filter((m) => m.role === 'owner').length
      if (ownerCount <= 1) {
        return fail(400, { error: 'Cannot remove the last owner' })
      }
    }

    removeBakeryMember(locals.bakery.id, userId)
    return { success: true }
  },
}
