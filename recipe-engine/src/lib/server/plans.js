export const TRIAL_DURATION_DAYS = 14
export const GRACE_PERIOD_DAYS = 7

export const PLANS = {
  trial: { maxMembers: 25, exportEnabled: true },
  pro: { maxMembers: 25, exportEnabled: true },
}

/**
 * Derive billing status from a subscription row.
 * @param {object | undefined} sub — bakery_subscriptions row
 * @returns {{ active: boolean, reason: string, plan: string, trialDaysLeft: number | null }}
 */
export function getSubscriptionStatus(sub) {
  if (!sub) {
    return { active: false, reason: 'no_subscription', plan: 'trial', trialDaysLeft: null }
  }

  const now = Math.floor(Date.now() / 1000)

  switch (sub.status) {
    case 'trialing': {
      if (sub.trial_ends_at && now < sub.trial_ends_at) {
        const daysLeft = Math.ceil((sub.trial_ends_at - now) / 86400)
        return { active: true, reason: 'trial', plan: sub.plan, trialDaysLeft: daysLeft }
      }
      return { active: false, reason: 'trial_expired', plan: sub.plan, trialDaysLeft: 0 }
    }
    case 'active':
      return { active: true, reason: 'subscribed', plan: sub.plan, trialDaysLeft: null }
    case 'past_due': {
      if (sub.current_period_end) {
        const graceEnd = sub.current_period_end + GRACE_PERIOD_DAYS * 86400
        if (now < graceEnd) {
          return { active: true, reason: 'past_due_grace', plan: sub.plan, trialDaysLeft: null }
        }
      }
      return { active: false, reason: 'past_due', plan: sub.plan, trialDaysLeft: null }
    }
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
    case 'paused':
      return { active: false, reason: sub.status, plan: sub.plan, trialDaysLeft: null }
    case 'incomplete':
      return { active: false, reason: 'incomplete', plan: sub.plan, trialDaysLeft: null }
    default:
      return { active: false, reason: 'unknown', plan: sub.plan, trialDaysLeft: null }
  }
}

/**
 * Check if a specific entitlement is allowed under the current plan.
 * @param {string} plan
 * @param {'member_count' | 'export'} entitlement
 * @param {{ currentMemberCount?: number }} [context]
 * @returns {{ allowed: boolean, limit?: number, current?: number, reason?: string }}
 */
export function checkEntitlement(plan, entitlement, context = {}) {
  const config = PLANS[plan] || PLANS.trial

  switch (entitlement) {
    case 'member_count': {
      const current = context.currentMemberCount ?? 0
      const limit = config.maxMembers
      if (current >= limit) {
        return {
          allowed: false,
          limit,
          current,
          reason: `Member limit reached (${current}/${limit}). Upgrade your plan for more members.`,
        }
      }
      return { allowed: true, limit, current }
    }
    case 'export': {
      if (!config.exportEnabled) {
        return { allowed: false, reason: 'Data export requires a Pro subscription.' }
      }
      return { allowed: true }
    }
    default:
      return { allowed: false, reason: `Unknown entitlement: ${entitlement}` }
  }
}
