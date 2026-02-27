import { redirect, error } from '@sveltejs/kit'
import { getBakerySubscription, getBakeryMemberCount } from '$lib/server/db.js'
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
 * @param {'member_count' | 'export'} entitlement
 */
export function requireEntitlement(locals, entitlement) {
  const status = requireSubscription(locals)

  if (entitlement === 'member_count') {
    const { total } = getBakeryMemberCount(locals.bakery.id)
    const result = checkEntitlement(status.plan, 'member_count', {
      currentMemberCount: total,
    })
    if (!result.allowed) {
      error(403, result.reason)
    }
    return result
  }

  const result = checkEntitlement(status.plan, entitlement)
  if (!result.allowed) {
    error(403, result.reason)
  }
  return result
}
