import { error } from '@sveltejs/kit'
import { getRecipe, getMixerProfiles } from '$lib/server/db.js'
import { calculateRecipe } from '$lib/server/engine.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ params, locals }) {
  const recipe = getRecipe(params.id, locals.bakery.id)

  if (!recipe) {
    error(404, 'Recipe not found')
  }

  let calculated = null
  try {
    calculated = calculateRecipe(recipe)
  } catch {
    // return recipe without calculations if engine fails
  }

  const mixerProfiles = getMixerProfiles(locals.bakery.id)

  // Load + calculate companion recipes for production scaling
  const companionDetails = (recipe.companions || [])
    .map((c) => {
      const companionRecipe = getRecipe(c.companion_recipe_id, locals.bakery.id)
      if (!companionRecipe) return null
      let calc = null
      try {
        calc = calculateRecipe(companionRecipe)
      } catch {
        // ignore calc errors
      }
      return { ...c, recipe: companionRecipe, calculated: calc }
    })
    .filter(Boolean)

  return { recipe, calculated, mixerProfiles, companionDetails }
}
