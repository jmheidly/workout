<script>
  import * as Card from '$lib/components/ui/card/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'

  let { data } = $props()
  let loading = $state(false)

  const sub = $derived(data.subscription)
  const usage = $derived(data.usage)

  function statusLabel(reason) {
    switch (reason) {
      case 'trial': return 'Trial'
      case 'trial_expired': return 'Trial Expired'
      case 'subscribed': return 'Pro'
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

  let errorMsg = $state('')

  async function handleCheckout() {
    loading = true
    errorMsg = ''
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const body = await res.json()
      if (body.url) {
        window.location.href = body.url
      } else {
        errorMsg = body.error || body.message || 'Failed to create checkout session'
        loading = false
      }
    } catch {
      errorMsg = 'Failed to connect to billing service'
      loading = false
    }
  }

  async function handlePortal() {
    loading = true
    errorMsg = ''
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const body = await res.json()
      if (body.url) {
        window.location.href = body.url
      } else {
        errorMsg = body.error || body.message || 'Failed to open billing portal'
        loading = false
      }
    } catch {
      errorMsg = 'Failed to connect to billing service'
      loading = false
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

<div class="mx-auto max-w-2xl space-y-6">
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
            Subscribe to Pro to keep access after the trial ends.
          </p>
        {:else if sub.reason === 'trial_expired'}
          <p>Your free trial has expired. Subscribe to Pro to regain access.</p>
        {:else if sub.reason === 'subscribed'}
          <p>
            You're on the <strong>Pro</strong> plan.
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
          <p>Your subscription has been canceled. Subscribe to Pro to regain access.</p>
        {:else if sub.reason === 'no_subscription'}
          <p>No subscription found. Subscribe to Pro to get started.</p>
        {:else}
          <p>Your subscription is inactive. Subscribe to Pro to regain access.</p>
        {/if}
      </div>
    </Card.CardContent>
  </Card.Card>

  <Card.Card>
    <Card.CardHeader>
      <Card.CardTitle>Usage</Card.CardTitle>
    </Card.CardHeader>
    <Card.CardContent>
      <div class="space-y-3">
        <div class="flex items-center justify-between text-sm">
          <span>Team Members</span>
          <span class="font-medium">{usage.members} / {usage.maxMembers}</span>
        </div>
        <div class="h-2 rounded-full bg-secondary">
          <div
            class="h-2 rounded-full bg-primary transition-all"
            style="width: {Math.min(100, (usage.members / usage.maxMembers) * 100)}%"
          ></div>
        </div>
        {#if usage.pendingInvites > 0}
          <p class="text-xs text-muted-foreground">
            +{usage.pendingInvites} pending invitation{usage.pendingInvites === 1 ? '' : 's'}
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

  <Card.Card>
    <Card.CardHeader>
      <Card.CardTitle>Actions</Card.CardTitle>
    </Card.CardHeader>
    <Card.CardContent>
      <div class="flex gap-3">
        {#if sub.hasStripeSubscription && sub.active}
          <Button onclick={handlePortal} disabled={loading}>
            {loading ? 'Loading...' : 'Manage Billing'}
          </Button>
        {:else}
          <Button onclick={handleCheckout} disabled={loading}>
            {loading ? 'Loading...' : 'Subscribe to Pro'}
          </Button>
        {/if}
      </div>
    </Card.CardContent>
  </Card.Card>
</div>
