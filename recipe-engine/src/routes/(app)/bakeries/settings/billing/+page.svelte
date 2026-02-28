<script>
  import * as Card from '$lib/components/ui/card/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'

  let { data } = $props()
  let loading = $state('')

  const sub = $derived(data.subscription)
  const usage = $derived(data.usage)
  const recommendation = $derived(data.recommendation)
  const tiers = $derived(data.tiers)

  const metricLabels = {
    recipes: 'Recipes',
    templates: 'Templates',
    mixers: 'Mixers',
    inventoryItems: 'Inventory items',
    members: 'Team members',
    maxVersionsPerRecipe: 'Versions per recipe',
  }

  function statusLabel(reason) {
    switch (reason) {
      case 'trial': return 'Trial'
      case 'trial_expired': return 'Trial Expired'
      case 'subscribed': return tierName(sub.plan)
      case 'past_due_grace': return 'Past Due'
      case 'past_due': return 'Past Due'
      case 'canceled': return 'Canceled'
      case 'no_subscription': return 'No Plan'
      default: return 'Inactive'
    }
  }

  function statusVariant(reason) {
    switch (reason) {
      case 'trial': return 'secondary'
      case 'subscribed': return 'default'
      case 'past_due_grace':
      case 'past_due':
      case 'trial_expired':
      case 'canceled':
        return 'destructive'
      default: return 'outline'
    }
  }

  function tierName(plan) {
    const tier = tiers.find((t) => t.key === plan)
    return tier?.name || 'Pro'
  }

  function tierBadgeVariant(tierKey) {
    switch (tierKey) {
      case 'starter': return 'secondary'
      case 'pro': return 'default'
      case 'team': return 'outline'
      default: return 'secondary'
    }
  }

  function formatLimit(value) {
    return value === null ? 'Unlimited' : value
  }

  let errorMsg = $state('')

  async function handleCheckout(tier) {
    loading = tier
    errorMsg = ''
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      const body = await res.json()
      if (body.url) {
        window.location.href = body.url
      } else {
        errorMsg = body.error || body.message || 'Failed to create checkout session'
        loading = ''
      }
    } catch {
      errorMsg = 'Failed to connect to billing service'
      loading = ''
    }
  }

  async function handlePortal() {
    loading = 'portal'
    errorMsg = ''
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const body = await res.json()
      if (body.url) {
        window.location.href = body.url
      } else {
        errorMsg = body.error || body.message || 'Failed to open billing portal'
        loading = ''
      }
    } catch {
      errorMsg = 'Failed to connect to billing service'
      loading = ''
    }
  }

  function formatPeriodEnd(epoch) {
    if (!epoch) return ''
    return new Date(epoch * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }
</script>

<div class="mx-auto max-w-4xl space-y-6">
  <h1 class="text-2xl font-bold">Billing</h1>

  {#if data.success}
    <div class="rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
      Subscription activated successfully.
    </div>
  {/if}
  {#if data.canceled}
    <div class="rounded-md bg-amber-100 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
      Checkout was canceled. You can try again anytime.
    </div>
  {/if}

  <!-- Current Plan -->
  <Card.Card>
    <Card.CardHeader>
      <div class="flex items-center justify-between">
        <Card.CardTitle>Current Plan</Card.CardTitle>
        <Badge variant={statusVariant(sub.reason)}>{statusLabel(sub.reason)}</Badge>
      </div>
    </Card.CardHeader>
    <Card.CardContent>
      <div class="space-y-2 text-sm">
        {#if sub.reason === 'trial' && sub.trialDaysLeft != null}
          <p>
            Your free trial has <strong>{sub.trialDaysLeft} day{sub.trialDaysLeft === 1 ? '' : 's'}</strong> remaining.
            All features are available during the trial.
          </p>
        {:else if sub.reason === 'trial_expired'}
          <p>Your free trial has expired. Subscribe to a plan to regain access.</p>
        {:else if sub.reason === 'subscribed'}
          <p>
            You're on the <strong>{tierName(sub.plan)}</strong> plan.
            {#if sub.currentPeriodEnd}
              Next billing date: {formatPeriodEnd(sub.currentPeriodEnd)}.
            {/if}
          </p>
          {#if sub.cancelAtPeriodEnd}
            <p class="text-amber-600 dark:text-amber-400">
              Your subscription will cancel at the end of the current billing period.
            </p>
          {/if}
        {:else if sub.reason === 'past_due_grace'}
          <p class="text-red-600 dark:text-red-400">
            Your last payment failed. Please update your billing info to avoid losing access.
          </p>
        {:else if sub.reason === 'canceled'}
          <p>Your subscription has been canceled. Subscribe to a plan to regain access.</p>
        {:else if sub.reason === 'no_subscription'}
          <p>No subscription found. Subscribe to a plan to get started.</p>
        {:else}
          <p>Your subscription is inactive. Subscribe to a plan to regain access.</p>
        {/if}

        {#if sub.hasStripeSubscription && sub.active}
          <div class="pt-1">
            <Button variant="outline" size="sm" onclick={handlePortal} disabled={!!loading}>
              {loading === 'portal' ? 'Loading...' : 'Manage Billing'}
            </Button>
          </div>
        {/if}
      </div>
    </Card.CardContent>
  </Card.Card>

  <!-- Your Usage -->
  <Card.Card>
    <Card.CardHeader>
      <div class="flex items-center justify-between">
        <Card.CardTitle>Your Usage</Card.CardTitle>
        {#if recommendation}
          <div class="text-sm text-muted-foreground">
            Recommended: <Badge variant={tierBadgeVariant(recommendation.plan)}>{recommendation.name}</Badge>
          </div>
        {/if}
      </div>
    </Card.CardHeader>
    <Card.CardContent>
      <div class="space-y-3">
        {#each recommendation.breakdown as item}
          {@const tierLimits = tiers.map((t) => ({ key: t.key, name: t.name, limit: t.limits[item.metric] }))}
          <div class="space-y-1">
            <div class="flex items-center justify-between text-sm">
              <span>{item.label}</span>
              <div class="flex items-center gap-2">
                <span class="font-medium tabular-nums">{item.current}</span>
                <Badge variant={tierBadgeVariant(item.fitsIn)} class="text-[10px] px-1.5 py-0">
                  {tiers.find((t) => t.key === item.fitsIn)?.name}
                </Badge>
              </div>
            </div>
            <div class="flex h-1.5 overflow-hidden rounded-full bg-secondary">
              {#each tierLimits as tier, i}
                {@const prevLimit = i > 0 ? (tierLimits[i - 1].limit ?? 0) : 0}
                {@const segmentMax = tier.limit ?? (prevLimit > 0 ? prevLimit * 2 : 100)}
                {@const totalMax = tierLimits[tierLimits.length - 1].limit ?? segmentMax}
                {@const segWidth = ((segmentMax - prevLimit) / totalMax) * 100}
                {@const fillPct = item.current <= prevLimit ? 0 : Math.min(100, ((Math.min(item.current, segmentMax) - prevLimit) / (segmentMax - prevLimit)) * 100)}
                <div
                  class="relative h-full {i < tierLimits.length - 1 ? 'border-r border-background' : ''}"
                  style="width: {segWidth}%"
                >
                  {#if fillPct > 0}
                    <div
                      class="absolute inset-y-0 left-0 rounded-full {tier.key === 'starter' ? 'bg-blue-400' : tier.key === 'pro' ? 'bg-primary' : 'bg-violet-500'}"
                      style="width: {fillPct}%"
                    ></div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
        {#if data.memberCount.pendingInvites > 0}
          <p class="text-xs text-muted-foreground">
            +{data.memberCount.pendingInvites} pending invitation{data.memberCount.pendingInvites === 1 ? '' : 's'}
          </p>
        {/if}
      </div>
    </Card.CardContent>
  </Card.Card>

  {#if errorMsg}
    <div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      {errorMsg}
    </div>
  {/if}

  <!-- Plans Comparison -->
  <Card.Card>
    <Card.CardHeader>
      <Card.CardTitle>Plans</Card.CardTitle>
    </Card.CardHeader>
    <Card.CardContent>
      <div class="grid grid-cols-3 gap-4">
        {#each tiers as tier}
          {@const isRecommended = tier.key === recommendation.plan}
          {@const isCurrent = sub.reason === 'subscribed' && sub.plan === tier.key}
          <div
            class="relative rounded-lg border p-4 {isRecommended ? 'border-primary ring-1 ring-primary' : 'border-border'}"
          >
            {#if isRecommended && !isCurrent}
              <div class="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <Badge variant="default" class="text-[10px]">Recommended</Badge>
              </div>
            {/if}

            <div class="mb-3">
              <h3 class="font-semibold">{tier.name}</h3>
              <p class="text-xs text-muted-foreground">{tier.description}</p>
            </div>

            <ul class="mb-4 space-y-1.5 text-sm">
              {#each Object.entries(tier.limits) as [metric, limit]}
                {@const metricItem = recommendation.breakdown.find((b) => b.metric === metric)}
                {@const overLimit = metricItem && limit !== null && metricItem.current > limit}
                <li class="flex items-center justify-between {overLimit ? 'text-destructive' : ''}">
                  <span>{metricLabels[metric]}</span>
                  <span class="font-medium tabular-nums">{formatLimit(limit)}</span>
                </li>
              {/each}
            </ul>

            {#if isCurrent}
              <Button variant="outline" size="sm" class="w-full" disabled>
                Current plan
              </Button>
            {:else if sub.hasStripeSubscription && sub.active}
              <Button variant="outline" size="sm" class="w-full" onclick={handlePortal} disabled={!!loading}>
                {loading === 'portal' ? 'Loading...' : 'Change plan'}
              </Button>
            {:else}
              <Button
                variant={isRecommended ? 'default' : 'outline'}
                size="sm"
                class="w-full"
                onclick={() => handleCheckout(tier.key)}
                disabled={!!loading}
              >
                {loading === tier.key ? 'Loading...' : `Subscribe to ${tier.name}`}
              </Button>
            {/if}
          </div>
        {/each}
      </div>
    </Card.CardContent>
  </Card.Card>
</div>
