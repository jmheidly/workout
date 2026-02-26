import { fail, redirect } from '@sveltejs/kit'
import { requireRole } from '$lib/server/auth.js'
import { getBakery, getBakeryBySlug, updateBakery, deleteBakery } from '$lib/server/db.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  requireRole(locals, 'owner', 'admin')
  const bakery = getBakery(locals.bakery.id)
  return { bakeryDetails: bakery }
}

/** @type {import('./$types').Actions} */
export const actions = {
  update: async ({ request, locals }) => {
    requireRole(locals, 'owner', 'admin')

    const form = await request.formData()
    const name = form.get('name')?.toString()?.trim()
    let slug = form.get('slug')?.toString()?.trim()?.toLowerCase()

    if (!name) return fail(400, { error: 'Name is required' })
    if (!slug) return fail(400, { error: 'Slug is required' })

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return fail(400, { error: 'Slug can only contain lowercase letters, numbers, and hyphens' })
    }

    // Check slug uniqueness (excluding self)
    const existing = getBakeryBySlug(slug)
    if (existing && existing.id !== locals.bakery.id) {
      return fail(400, { error: 'A bakery with this slug already exists' })
    }

    updateBakery(locals.bakery.id, { name, slug })
    return { success: true }
  },

  delete: async ({ locals }) => {
    requireRole(locals, 'owner')
    deleteBakery(locals.bakery.id)
    redirect(302, '/bakeries')
  },
}
