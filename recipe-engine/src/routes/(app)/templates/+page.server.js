import { fail } from '@sveltejs/kit'
import { getTemplatesByBakery, deleteTemplate } from '$lib/server/db.js'
import { requireRole } from '$lib/server/auth.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  const templates = getTemplatesByBakery(locals.bakery.id)
  return {
    templates,
    canEdit: locals.bakery.role !== 'viewer',
  }
}

/** @type {import('./$types').Actions} */
export const actions = {
  delete: async ({ request, locals }) => {
    requireRole(locals, 'owner', 'admin', 'member')
    const form = await request.formData()
    const id = form.get('id')?.toString()
    if (!id) return fail(400, { error: 'Missing template ID' })

    deleteTemplate(id, locals.bakery.id)
    return { success: true }
  },
}
