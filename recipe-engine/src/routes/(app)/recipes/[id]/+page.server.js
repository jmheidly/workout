import { error, fail } from '@sveltejs/kit'
import {
  getRecipe,
  updateRecipe,
  getMixerProfiles,
  createMixerProfile,
  getIngredientLibrary,
  syncIngredientLibrary,
  getRecipeVersionCount,
} from '$lib/server/db.js'
import { calculateRecipe } from '$lib/server/engine.js'
import { requireRole } from '$lib/server/auth.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ params, locals }) {
  const recipe = getRecipe(params.id, locals.bakery.id)

  if (!recipe) {
    error(404, 'Recipe not found')
  }

  let calculated = null
  try {
    calculated = calculateRecipe(recipe)
  } catch (e) {
    // return recipe without calculations if engine fails
  }

  const mixerProfiles = getMixerProfiles(locals.bakery.id)
  const ingredientLibrary = getIngredientLibrary(locals.bakery.id)
  const versionCount = getRecipeVersionCount(params.id)

  return { recipe, calculated, mixerProfiles, ingredientLibrary, versionCount, canEdit: locals.bakery.role !== 'viewer' }
}

/** @type {import('./$types').Actions} */
export const actions = {
  save: async ({ request, params, locals }) => {
    requireRole(locals, 'owner', 'admin', 'member')
    const form = await request.formData()
    const dataStr = form.get('data')?.toString()
    const changeNotes = form.get('change_notes')?.toString() || null
    if (!dataStr) return fail(400, { error: 'Missing data' })

    let data
    try {
      data = JSON.parse(dataStr)
    } catch {
      return fail(400, { error: 'Invalid data' })
    }

    // Verify bakery ownership
    const existing = getRecipe(params.id, locals.bakery.id)
    if (!existing) {
      return fail(403, { error: 'Not authorized' })
    }

    updateRecipe(params.id, locals.bakery.id, data, locals.user.id, changeNotes)
    syncIngredientLibrary(locals.user.id, locals.bakery.id, data.ingredients || [])

    // Return updated recipe + calculation
    const recipe = getRecipe(params.id)
    let calculated = null
    try {
      calculated = calculateRecipe(recipe)
    } catch {
      // ignore
    }

    const ingredientLibrary = getIngredientLibrary(locals.bakery.id)
    const versionCount = getRecipeVersionCount(params.id)

    return { success: true, recipe, calculated, ingredientLibrary, versionCount }
  },

  createMixer: async ({ request, locals }) => {
    requireRole(locals, 'owner', 'admin', 'member')
    const form = await request.formData()
    const dataStr = form.get('data')?.toString()
    if (!dataStr) return fail(400, { error: 'Missing data' })

    let data
    try {
      data = JSON.parse(dataStr)
    } catch {
      return fail(400, { error: 'Invalid data' })
    }

    if (!data.name?.trim()) return fail(400, { error: 'Name is required' })

    const mixerId = createMixerProfile(locals.user.id, locals.bakery.id, data)
    return { success: true, mixerId }
  },
}
