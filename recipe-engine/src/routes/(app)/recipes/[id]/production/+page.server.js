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

  return { recipe, calculated, mixerProfiles }
}
