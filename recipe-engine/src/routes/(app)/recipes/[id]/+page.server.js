import { error, fail } from '@sveltejs/kit'
import {
  getRecipe,
  updateRecipe,
  getIngredientLibrary,
  syncIngredientLibrary,
  getRecipeVersionCount,
  getRecipesByBakery,
  getParentsForRecipe,
  getPfTemplates,
  getCompanionTemplates,
  getStaleTemplateLinks,
  getTemplate,
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

  const ingredientLibrary = getIngredientLibrary(locals.bakery.id)
  const versionCount = getRecipeVersionCount(params.id)
  const bakeryRecipes = getRecipesByBakery(locals.bakery.id)

  // Load companion recipe details (ingredients + calculation) for inline display
  const companionDetails = {}
  for (const c of recipe.companions || []) {
    const compRecipe = getRecipe(c.companion_recipe_id, locals.bakery.id)
    if (!compRecipe) continue
    let calc = null
    try { calc = calculateRecipe(compRecipe) } catch {}
    companionDetails[c.companion_recipe_id] = {
      ingredients: compRecipe.ingredients || [],
      calculated: calc,
    }
  }

  const usedInRecipes = getParentsForRecipe(params.id)
  const pfTemplates = getPfTemplates(locals.bakery.id)
  const companionTemplates = getCompanionTemplates(locals.bakery.id)
  const staleLinks = getStaleTemplateLinks(params.id, locals.bakery.id)

  return {
    recipe,
    calculated,
    ingredientLibrary,
    versionCount,
    bakeryRecipes,
    companionDetails,
    usedInRecipes,
    pfTemplates,
    companionTemplates,
    staleLinks,
    canEdit: locals.bakery.role !== 'viewer',
  }
}

/** @type {import('./$types').Actions} */
export const actions = {
  pullTemplate: async ({ request, params, locals }) => {
    requireRole(locals, 'owner', 'admin', 'member')
    const form = await request.formData()
    const templateId = form.get('template_id')?.toString()
    if (!templateId) return fail(400, { error: 'Missing template ID' })

    const template = getTemplate(templateId, locals.bakery.id)
    if (!template) return fail(404, { error: 'Template not found' })

    // Load the template's backing recipe
    const templateRecipe = getRecipe(template.recipe_id, locals.bakery.id)
    if (!templateRecipe) return fail(404, { error: 'Template recipe not found' })

    return {
      templateData: {
        templateId: template.id,
        templateName: template.name,
        recipeVersion: template.recipe_version,
        ingredients: templateRecipe.ingredients || [],
        process_steps: templateRecipe.process_steps || [],
        ddt: templateRecipe.ddt,
        dough_type: templateRecipe.dough_type,
        mix_type: templateRecipe.mix_type,
      },
    }
  },

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
    syncIngredientLibrary(
      locals.user.id,
      locals.bakery.id,
      data.ingredients || []
    )

    // Return updated recipe + calculation
    const recipe = getRecipe(params.id, locals.bakery.id)
    let calculated = null
    try {
      calculated = calculateRecipe(recipe)
    } catch {
      // ignore
    }

    const ingredientLibrary = getIngredientLibrary(locals.bakery.id)
    const versionCount = getRecipeVersionCount(params.id)

    // Reload companion details
    const companionDetails = {}
    for (const c of recipe.companions || []) {
      const compRecipe = getRecipe(c.companion_recipe_id, locals.bakery.id)
      if (!compRecipe) continue
      let calc = null
      try { calc = calculateRecipe(compRecipe) } catch {}
      companionDetails[c.companion_recipe_id] = {
        ingredients: compRecipe.ingredients || [],
        calculated: calc,
      }
    }

    const staleLinks = getStaleTemplateLinks(params.id, locals.bakery.id)

    return {
      success: true,
      recipe,
      calculated,
      ingredientLibrary,
      versionCount,
      companionDetails,
      staleLinks,
    }
  },
}
