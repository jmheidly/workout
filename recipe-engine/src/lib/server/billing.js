import { redirect, error } from '@sveltejs/kit'
import {
  getBakerySubscription,
  getBakeryMemberCount,
  getBakeryUsage,
  getRecipeVersionCount,
} from '$lib/server/db.js'
import { getSubscriptionStatus, checkEntitlement } from '$lib/server/plans.js'

/**
 * Require an active subscription. Redirects to billing if inactive.
 * @param {object} locals — SvelteKit event.locals
 * @returns {{ active: boolean, reason: string, plan: string, trialDaysLeft: number | null }}
 */
export function requireSubscription(locals) {
  if (!locals.bakery) {
    redirect(302, '/bakeries')
  }
  const sub = getBakerySubscription(locals.bakery.id)
  const status = getSubscriptionStatus(sub)
  if (!status.active) {
    redirect(303, '/bakeries/settings/billing')
  }
  return status
}

/**
 * Require a specific entitlement under the current plan.
 * @param {object} locals
 * @param {'recipes' | 'templates' | 'mixers' | 'inventory_items' | 'member_count' | 'versions_per_recipe' | 'export'} entitlement
 * @param {{ recipeId?: string }} [opts]
 */
export function requireEntitlement(locals, entitlement, opts = {}) {
  const status = requireSubscription(locals)

  let currentCount

  if (entitlement === 'member_count') {
    const { total } = getBakeryMemberCount(locals.bakery.id)
    currentCount = total
  } else if (entitlement === 'versions_per_recipe') {
    if (!opts.recipeId) {
      error(500, 'recipeId required for versions_per_recipe entitlement')
    }
    currentCount = getRecipeVersionCount(opts.recipeId)
  } else if (
    ['recipes', 'templates', 'mixers', 'inventory_items'].includes(entitlement)
  ) {
    const usage = getBakeryUsage(locals.bakery.id)
    const entitlementToUsageKey = {
      recipes: 'recipes',
      templates: 'templates',
      mixers: 'mixers',
      inventory_items: 'inventoryItems',
    }
    currentCount = usage[entitlementToUsageKey[entitlement]]
  } else if (entitlement === 'export') {
    const result = checkEntitlement(status.plan, entitlement)
    if (!result.allowed) {
      error(403, result.reason)
    }
    return result
  }

  const result = checkEntitlement(status.plan, entitlement, { currentCount })
  if (!result.allowed) {
    error(403, result.reason)
  }
  return result
}
