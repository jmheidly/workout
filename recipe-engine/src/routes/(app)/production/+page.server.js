import {
  getRecentBatchSessions,
  getAllRecipeRollingAverages,
  getBakerySettings,
} from '$lib/server/db.js'

const DRIFT_THRESHOLD = 0.02

/** @type {import('./$types').PageServerLoad} */
export function load({ locals }) {
  const settings = getBakerySettings(locals.bakery.id)
  const rollingWindow = settings.rolling_average_window || 10

  const recentSessions = getRecentBatchSessions(locals.bakery.id)
  const recipeAverages = getAllRecipeRollingAverages(
    locals.bakery.id,
    rollingWindow
  )

  const driftAlerts = recipeAverages.filter((r) => {
    const processDrift =
      r.avg_process_loss_pct != null
        ? Math.abs(r.avg_process_loss_pct - (r.recipe_process_loss_pct || 0))
        : 0
    const bakeDrift =
      r.avg_bake_loss_pct != null
        ? Math.abs(r.avg_bake_loss_pct - (r.recipe_bake_loss_pct || 0))
        : 0
    return processDrift >= DRIFT_THRESHOLD || bakeDrift >= DRIFT_THRESHOLD
  })

  return {
    recentSessions,
    recipeAverages,
    driftAlerts,
    rollingWindow,
  }
}
