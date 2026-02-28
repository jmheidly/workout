export const TRIAL_DURATION_DAYS = 14
export const GRACE_PERIOD_DAYS = 7

export const PLAN_TIERS = {
  starter: {
    name: 'Starter',
    description: 'For home bakers and small operations',
    stripePriceEnvKey: 'STRIPE_STARTER_PRICE_ID',
    limits: {
      recipes: 10,
      templates: 3,
      mixers: 2,
      inventoryItems: 50,
      members: 2,
      maxVersionsPerRecipe: 5,
    },
  },
  pro: {
    name: 'Pro',
    description: 'For growing bakeries',
    stripePriceEnvKey: 'STRIPE_PRO_PRICE_ID',
    limits: {
      recipes: 50,
      templates: 20,
      mixers: 10,
      inventoryItems: 250,
      members: 10,
      maxVersionsPerRecipe: 25,
    },
  },
  team: {
    name: 'Team',
    description: 'For large bakeries and multi-location teams',
    stripePriceEnvKey: 'STRIPE_TEAM_PRICE_ID',
    limits: {
      recipes: Infinity,
      templates: Infinity,
      mixers: Infinity,
      inventoryItems: Infinity,
      members: 25,
      maxVersionsPerRecipe: Infinity,
    },
  },
}

const TIER_ORDER = ['starter', 'pro', 'team']

const METRIC_LABELS = {
  recipes: 'Recipes',
  templates: 'Templates',
  mixers: 'Mixers',
  inventoryItems: 'Inventory items',
  members: 'Team members',
  maxVersionsPerRecipe: 'Versions per recipe',
}

/**
 * Find the lowest tier that fits ALL current usage.
 * @param {{ recipes: number, templates: number, mixers: number, inventoryItems: number, members: number, maxVersionsPerRecipe: number }} usage
 * @returns {{ plan: string, name: string, breakdown: Array<{ metric: string, label: string, current: number, fitsIn: string }> }}
 */
export function getRecommendedPlan(usage) {
  const breakdown = []

  for (const [metric, label] of Object.entries(METRIC_LABELS)) {
    const current = usage[metric] ?? 0
    let fitsIn = 'starter'
    for (const tier of TIER_ORDER) {
      if (current <= PLAN_TIERS[tier].limits[metric]) {
        fitsIn = tier
        break
      }
    }
    breakdown.push({ metric, label, current, fitsIn })
  }

  // The recommended plan is the highest tier required by any single metric
  let recommended = 'starter'
  for (const item of breakdown) {
    if (TIER_ORDER.indexOf(item.fitsIn) > TIER_ORDER.indexOf(recommended)) {
      recommended = item.fitsIn
    }
  }

  return {
    plan: recommended,
    name: PLAN_TIERS[recommended].name,
    breakdown,
  }
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
 * During trial, uses team-level limits (nothing gated).
 * After trial, uses the subscribed tier's limits.
 * @param {string} plan
 * @param {'member_count' | 'export' | 'recipes' | 'templates' | 'mixers' | 'inventory_items' | 'versions_per_recipe'} entitlement
 * @param {{ currentCount?: number }} [context]
 * @returns {{ allowed: boolean, limit?: number, current?: number, reason?: string }}
 */
export function checkEntitlement(plan, entitlement, context = {}) {
  // Trial and unknown plans get team-level limits (nothing gated)
  const isTrialLike = plan === 'trial' || !PLAN_TIERS[plan]
  const tier = isTrialLike ? PLAN_TIERS.team : PLAN_TIERS[plan]

  const entitlementToMetric = {
    member_count: 'members',
    recipes: 'recipes',
    templates: 'templates',
    mixers: 'mixers',
    inventory_items: 'inventoryItems',
    versions_per_recipe: 'maxVersionsPerRecipe',
  }

  const metric = entitlementToMetric[entitlement]

  if (metric) {
    const current = context.currentCount ?? 0
    const limit = tier.limits[metric]
    if (limit !== Infinity && current >= limit) {
      return {
        allowed: false,
        limit,
        current,
        reason: `Limit reached (${current}/${limit}). ${isTrialLike ? '' : 'Upgrade your plan for more.'}`,
      }
    }
    return { allowed: true, limit: limit === Infinity ? null : limit, current }
  }

  if (entitlement === 'export') {
    return { allowed: true }
  }

  return { allowed: false, reason: `Unknown entitlement: ${entitlement}` }
}

/**
 * Reverse-lookup: given a Stripe price ID, find which tier it belongs to.
 * @param {string} priceId
 * @param {Record<string, string>} envVars — environment variables object
 * @returns {'starter' | 'pro' | 'team' | null}
 */
export function planTierFromPriceId(priceId, envVars) {
  if (!priceId) return null
  for (const [tier, config] of Object.entries(PLAN_TIERS)) {
    const envPriceId = envVars[config.stripePriceEnvKey]
    if (envPriceId && envPriceId === priceId) {
      return tier
    }
  }
  return null
}
