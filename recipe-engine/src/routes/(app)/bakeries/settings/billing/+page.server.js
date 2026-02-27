import { requireRole } from '$lib/server/auth.js'
import {
  getBakerySubscription,
  getBakeryMemberCount,
} from '$lib/server/db.js'
import { getSubscriptionStatus, PLANS } from '$lib/server/plans.js'

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, url }) {
  requireRole(locals, 'owner', 'admin')

  const sub = getBakerySubscription(locals.bakery.id)
  const status = getSubscriptionStatus(sub)
  const memberCount = getBakeryMemberCount(locals.bakery.id)
  const planConfig = PLANS[status.plan] || PLANS.trial

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
    usage: {
      members: memberCount.members,
      pendingInvites: memberCount.pendingInvites,
      total: memberCount.total,
      maxMembers: planConfig.maxMembers,
    },
    success: url.searchParams.get('success') === '1',
    canceled: url.searchParams.get('canceled') === '1',
  }
}
