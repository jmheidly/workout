import { error } from '@sveltejs/kit'
import { getRecipe, getMixerProfile } from '$lib/server/db.js'
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
  } catch {
    // return recipe without calculations if engine fails
  }

  const mixerProfile = recipe.mixer_profile_id
    ? getMixerProfile(recipe.mixer_profile_id)
    : null

  return { recipe, calculated, mixerProfile }
}
