import { error, fail } from '@sveltejs/kit'
import { getRecipe, updateRecipe, getMixerProfiles, getIngredientLibrary, syncIngredientLibrary } from '$lib/server/db.js'
import { calculateRecipe } from '$lib/server/engine.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ params, locals }) {
  const recipe = getRecipe(params.id)

  if (!recipe) {
    error(404, 'Recipe not found')
  }

  if (recipe.user_id !== locals.user.id) {
    error(403, 'Not authorized')
  }

  let calculated = null
  try {
    calculated = calculateRecipe(recipe)
  } catch (e) {
    // return recipe without calculations if engine fails
  }

  const mixerProfiles = getMixerProfiles(locals.user.id)
  const ingredientLibrary = getIngredientLibrary(locals.user.id)

  return { recipe, calculated, mixerProfiles, ingredientLibrary }
}

/** @type {import('./$types').Actions} */
export const actions = {
  save: async ({ request, params, locals }) => {
    const form = await request.formData()
    const dataStr = form.get('data')?.toString()
    if (!dataStr) return fail(400, { error: 'Missing data' })

    let data
    try {
      data = JSON.parse(dataStr)
    } catch {
      return fail(400, { error: 'Invalid data' })
    }

    // Verify ownership
    const existing = getRecipe(params.id)
    if (!existing || existing.user_id !== locals.user.id) {
      return fail(403, { error: 'Not authorized' })
    }

    updateRecipe(params.id, data)
    syncIngredientLibrary(locals.user.id, data.ingredients || [])

    // Return updated recipe + calculation
    const recipe = getRecipe(params.id)
    let calculated = null
    try {
      calculated = calculateRecipe(recipe)
    } catch {
      // ignore
    }

    const ingredientLibrary = getIngredientLibrary(locals.user.id)

    return { success: true, recipe, calculated, ingredientLibrary }
  }
}
