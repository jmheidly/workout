import { fail, redirect } from '@sveltejs/kit'
import {
  createRecipe,
  createTemplate,
  getRecipesByBakery,
  promoteRecipeToTemplate,
} from '$lib/server/db.js'
import { requireRole } from '$lib/server/auth.js'
import { requireEntitlement } from '$lib/server/billing.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  requireRole(locals, 'owner', 'admin', 'member')
  const recipes = getRecipesByBakery(locals.bakery.id)
  return { recipes }
}

/** @type {import('./$types').Actions} */
export const actions = {
  create: async ({ request, locals }) => {
    requireRole(locals, 'owner', 'admin', 'member')
    requireEntitlement(locals, 'templates')
    const form = await request.formData()
    const name = form.get('name')?.toString()?.trim()
    const templateType = form.get('template_type')?.toString() || 'preferment'

    if (!name) {
      return fail(400, { error: 'Template name is required', name, template_type: templateType })
    }

    // Create a new recipe to back the template
    const recipeId = createRecipe(locals.user.id, locals.bakery.id, {
      name,
      yield_per_piece: 0,
      ddt: 24,
    })

    createTemplate(locals.bakery.id, name, templateType, recipeId)
    redirect(302, `/recipes/${recipeId}`)
  },

  promote: async ({ request, locals }) => {
    requireRole(locals, 'owner', 'admin', 'member')
    requireEntitlement(locals, 'templates')
    const form = await request.formData()
    const recipeId = form.get('recipe_id')?.toString()
    const templateType = form.get('template_type')?.toString() || 'preferment'

    if (!recipeId) {
      return fail(400, { error: 'Please select a recipe', template_type: templateType })
    }

    const templateId = promoteRecipeToTemplate(locals.bakery.id, recipeId, templateType)
    if (!templateId) {
      return fail(404, { error: 'Recipe not found' })
    }

    redirect(302, '/templates')
  },
}
