import { requireRole } from '$lib/server/auth.js'
import {
  getBakerySubscription,
  getBakeryMemberCount,
  getBakeryUsage,
} from '$lib/server/db.js'
import {
  getSubscriptionStatus,
  getRecommendedPlan,
  PLAN_TIERS,
} from '$lib/server/plans.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, url }) {
  requireRole(locals, 'owner', 'admin')

  const sub = getBakerySubscription(locals.bakery.id)
  const status = getSubscriptionStatus(sub)
  const memberCount = getBakeryMemberCount(locals.bakery.id)
  const usage = getBakeryUsage(locals.bakery.id)
  const recommendation = getRecommendedPlan(usage)

  // Serialize tiers for the comparison grid (replace Infinity with null for JSON)
  const tiers = Object.entries(PLAN_TIERS).map(([key, tier]) => ({
    key,
    name: tier.name,
    description: tier.description,
    limits: Object.fromEntries(
      Object.entries(tier.limits).map(([k, v]) => [k, v === Infinity ? null : v])
    ),
  }))

  return {
    subscription: {
      active: status.active,
      reason: status.reason,
      plan: status.plan,
      trialDaysLeft: status.trialDaysLeft,
      cancelAtPeriodEnd: sub?.cancel_at_period_end === 1,
      currentPeriodEnd: sub?.current_period_end ?? null,
      hasStripeSubscription: !!sub?.stripe_subscription_id,
      hasStripeCustomer: !!sub?.stripe_customer_id,
    },
    usage,
    recommendation,
    tiers,
    memberCount: {
      members: memberCount.members,
      pendingInvites: memberCount.pendingInvites,
    },
    success: url.searchParams.get('success') === '1',
    canceled: url.searchParams.get('canceled') === '1',
  }
}
