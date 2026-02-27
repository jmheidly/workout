import { fail } from '@sveltejs/kit'
import {
  getIngredientLibrary,
  createIngredientLibraryEntry,
  updateIngredientLibraryEntry,
  deleteIngredientLibraryEntry,
} from '$lib/server/db.js'
import { requireRole } from '$lib/server/auth.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  return {
    ingredients: getIngredientLibrary(locals.bakery.id),
    canEdit: locals.bakery.role !== 'viewer',
  }
}

/** @type {import('./$types').Actions} */
export const actions = {
  create: async ({ request, locals }) => {
    requireRole(locals, 'owner', 'admin', 'member')
    const form = await request.formData()
    const name = form.get('name')?.toString()?.trim()
    const category = form.get('category')?.toString()
    if (!name) return fail(400, { error: 'Name is required' })
    if (!category) return fail(400, { error: 'Category is required' })

    try {
      createIngredientLibraryEntry(
        locals.user.id,
        locals.bakery.id,
        name,
        category
      )
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return fail(400, {
          error: 'An ingredient with that name already exists',
        })
      }
      throw e
    }
    return { success: true }
  },

  update: async ({ request, locals }) => {
    requireRole(locals, 'owner', 'admin', 'member')
    const form = await request.formData()
    const id = form.get('id')?.toString()
    const name = form.get('name')?.toString()?.trim()
    const category = form.get('category')?.toString()
    if (!id) return fail(400, { error: 'Missing id' })
    if (!name) return fail(400, { error: 'Name is required' })
    if (!category) return fail(400, { error: 'Category is required' })

    try {
      updateIngredientLibraryEntry(id, locals.bakery.id, name, category)
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return fail(400, {
          error: 'An ingredient with that name already exists',
        })
      }
      throw e
    }
    return { success: true }
  },

  delete: async ({ request, locals }) => {
    requireRole(locals, 'owner', 'admin', 'member')
    const form = await request.formData()
    const id = form.get('id')?.toString()
    if (!id) return fail(400, { error: 'Missing id' })

    deleteIngredientLibraryEntry(id, locals.bakery.id)
    return { success: true }
  },
}
