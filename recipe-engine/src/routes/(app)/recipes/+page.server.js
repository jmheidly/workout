import { fail } from '@sveltejs/kit'
import { getRecipesByUser, deleteRecipe, getRecipe } from '$lib/server/db.js'
import { calculateRecipe } from '$lib/server/engine.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  const recipes = getRecipesByUser(locals.user.id)

  // Calculate hydration + totals for each recipe
  const enriched = recipes.map((r) => {
    try {
      const full = getRecipe(r.id)
      if (full && full.ingredients?.length > 0) {
        const calc = calculateRecipe(full)
        return {
          ...r,
          hydration: calc.totals.hydration,
          total_weight: calc.totals.total_weight,
          num_pieces: calc.totals.num_pieces,
          total_flour: calc.totals.total_flour,
          pf_flour_pct: calc.totals.total_prefermented_flour_pct,
          pf_count: calc.preferments?.length || 0,
        }
      }
    } catch {
      // ignore calc errors
    }
    return {
      ...r,
      hydration: null,
      total_weight: null,
      num_pieces: null,
      total_flour: null,
      pf_flour_pct: null,
      pf_count: 0,
    }
  })

  return { recipes: enriched }
}

/** @type {import('./$types').Actions} */
export const actions = {
  delete: async ({ request, locals }) => {
    const form = await request.formData()
    const id = form.get('id')?.toString()
    if (!id) return fail(400, { error: 'Missing recipe ID' })

    // Verify ownership
    const recipe = getRecipe(id)
    if (!recipe || recipe.user_id !== locals.user.id) {
      return fail(403, { error: 'Not authorized' })
    }

    deleteRecipe(id)
    return { success: true }
  }
}
