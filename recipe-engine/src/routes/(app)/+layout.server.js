import { redirect } from '@sveltejs/kit'
import { getBakerySubscription } from '$lib/server/db.js'
import { getSubscriptionStatus } from '$lib/server/plans.js'

/** @type {import('./$types').LayoutServerLoad} */
export function load({ locals }) {
  if (!locals.user) {
    redirect(302, '/login')
  }
  if (!locals.bakery) {
    redirect(302, '/bakeries')
  }

  const sub = getBakerySubscription(locals.bakery.id)
  const status = getSubscriptionStatus(sub)

  return {
    user: locals.user,
    bakery: locals.bakery,
    subscription: {
      active: status.active,
      reason: status.reason,
      plan: status.plan,
      trialDaysLeft: status.trialDaysLeft,
      cancelAtPeriodEnd: sub?.cancel_at_period_end === 1,
    },
  }
}
