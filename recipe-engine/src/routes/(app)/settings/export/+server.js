import {
  getRecipesByBakery,
  getRecipe,
  getMixerProfiles,
  getIngredientLibrary,
  getBakery,
} from '$lib/server/db.js'
import { requireSubscription } from '$lib/server/billing.js'

/** @type {import('./$types').RequestHandler} */
export function GET({ locals }) {
  requireSubscription(locals)
  const bakeryId = locals.bakery.id
  const bakery = getBakery(bakeryId)

  // Fetch all recipes with full detail
  const recipeSummaries = getRecipesByBakery(bakeryId)
  const recipes = recipeSummaries.map((r) => getRecipe(r.id, bakeryId))

  const mixerProfiles = getMixerProfiles(bakeryId)
  const ingredientLibrary = getIngredientLibrary(bakeryId)

  const exportData = {
    exported_at: new Date().toISOString(),
    bakery: { name: bakery.name, slug: bakery.slug },
    recipes,
    mixer_profiles: mixerProfiles,
    ingredient_library: ingredientLibrary,
  }

  const date = new Date().toISOString().slice(0, 10)
  const filename = `bakery-export-${bakery.slug}-${date}.json`

  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
