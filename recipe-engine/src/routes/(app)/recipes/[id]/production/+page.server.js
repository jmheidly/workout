import { error, fail } from '@sveltejs/kit'
import {
  getRecipe,
  getMixerProfiles,
  getBatchSessionsForRecipe,
  getRollingAverages,
  getBakerySettings,
  createBatchSession,
  deleteBatchSession,
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

  const settings = getBakerySettings(locals.bakery.id)
  const rollingWindow = settings.rolling_average_window || 10
  const batchSessions = getBatchSessionsForRecipe(
    params.id,
    locals.bakery.id
  )
  const rollingAverages = getRollingAverages(
    params.id,
    locals.bakery.id,
    rollingWindow
  )
  const canEdit = locals.bakery.role !== 'viewer'

  return {
    recipe,
    calculated,
    mixerProfiles,
    companionDetails,
    batchSessions,
    rollingAverages,
    rollingWindow,
    canEdit,
  }
}

/** @type {import('./$types').Actions} */
export const actions = {
  createSession: async ({ request, params, locals }) => {
    requireRole(locals, 'owner', 'admin', 'member')

    const form = await request.formData()
    let data
    try {
      data = JSON.parse(form.get('data')?.toString() || '{}')
    } catch {
      return fail(400, { error: 'Invalid data' })
    }

    if (
      !data.planned_total_weight ||
      data.planned_total_weight <= 0 ||
      !data.planned_pieces ||
      data.planned_pieces <= 0 ||
      data.planned_piece_weight == null
    ) {
      return fail(400, { error: 'Planned values are required' })
    }

    const hasMeasured =
      data.dough_weight_off_mixer != null ||
      data.pieces_loaded != null ||
      data.finished_piece_weight != null
    if (!hasMeasured) {
      return fail(400, {
        error: 'At least one measured value is required',
      })
    }

    createBatchSession(locals.user.id, locals.bakery.id, {
      ...data,
      recipe_id: params.id,
    })

    return { success: true }
  },

  deleteSession: async ({ request, locals }) => {
    requireRole(locals, 'owner', 'admin', 'member')

    const form = await request.formData()
    const id = form.get('id')?.toString()
    if (!id) return fail(400, { error: 'Session ID required' })

    deleteBatchSession(id, locals.bakery.id)
    return { success: true }
  },
}
