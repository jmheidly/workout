import { redirect } from '@sveltejs/kit'
import { getBakerySubscription, getBakeryUsage } from '$lib/server/db.js'
import { getSubscriptionStatus, getRecommendedPlan } from '$lib/server/plans.js'

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

  const subscription = {
    active: status.active,
    reason: status.reason,
    plan: status.plan,
    trialDaysLeft: status.trialDaysLeft,
    cancelAtPeriodEnd: sub?.cancel_at_period_end === 1,
  }

  // During trial, compute recommended plan for sidebar display
  if (status.reason === 'trial') {
    const usage = getBakeryUsage(locals.bakery.id)
    const rec = getRecommendedPlan(usage)
    subscription.recommendedPlan = rec.plan
    subscription.recommendedPlanName = rec.name
  }

  return {
    user: locals.user,
    bakery: locals.bakery,
    subscription,
  }
}
