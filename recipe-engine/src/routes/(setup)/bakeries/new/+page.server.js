import { fail, redirect } from '@sveltejs/kit'
import {
  getBakeryBySlug,
  createBakeryWithSubscription,
} from '$lib/server/db.js'

/** @type {import('./$types').Actions} */
export const actions = {
  default: async ({ request, locals }) => {
    const form = await request.formData()
    const name = form.get('name')?.toString()?.trim()
    let slug = form.get('slug')?.toString()?.trim()?.toLowerCase()

    if (!name) {
      return fail(400, { error: 'Bakery name is required', name, slug })
    }

    if (!slug) {
      slug = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return fail(400, {
        error: 'Slug can only contain lowercase letters, numbers, and hyphens',
        name,
        slug,
      })
    }

    const existing = getBakeryBySlug(slug)
    if (existing) {
      return fail(400, {
        error: 'A bakery with this slug already exists',
        name,
        slug,
      })
    }

    createBakeryWithSubscription(name, slug, locals.user.id)

    redirect(302, '/recipes')
  },
}
