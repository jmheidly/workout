<script>
  import { onMount } from 'svelte'
  import { startAuthentication } from '@simplewebauthn/browser'
  import * as Card from '$lib/components/ui/card/index.js'
  import { Button } from '$lib/components/ui/button/index.js'

  let state = $state('loading') // 'loading' | 'error' | 'expired'
  let errorMessage = $state('')

  async function authenticate() {
    state = 'loading'
    errorMessage = ''

    try {
      const optionsRes = await fetch('/api/mfa/webauthn/options', {
        method: 'POST',
      })

      if (optionsRes.status === 401) {
        state = 'expired'
        return
      }

      if (!optionsRes.ok) {
        const data = await optionsRes.json()
        state = 'error'
        errorMessage = data.error || 'Failed to get authentication options'
        return
      }

      const options = await optionsRes.json()
      const assertion = await startAuthentication({ optionsJSON: options })

      const verifyRes = await fetch('/api/mfa/webauthn/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assertion),
      })

      const result = await verifyRes.json()

      if (verifyRes.status === 429) {
        state = 'error'
        errorMessage = 'Too many attempts. Please log in again.'
        return
      }

      if (result.ok) {
        window.location.href = result.next
        return
      }

      state = 'error'
      errorMessage = result.error || 'Verification failed'
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        state = 'error'
        errorMessage = 'Authentication was cancelled or timed out.'
      } else {
        state = 'error'
        errorMessage = 'An unexpected error occurred. Please try again.'
      }
    }
  }

  onMount(() => {
    authenticate()
  })
</script>

<div class="flex min-h-screen items-center justify-center p-4">
  <Card.Card class="w-full max-w-md">
    <Card.CardHeader class="text-center">
      <Card.CardTitle>Two-Factor Authentication</Card.CardTitle>
      <Card.CardDescription>
        Verify your identity to continue
      </Card.CardDescription>
    </Card.CardHeader>
    <Card.CardContent class="space-y-4">
      {#if state === 'loading'}
        <div class="flex flex-col items-center gap-3 py-6">
          <div
            class="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
          ></div>
          <p class="text-sm text-muted-foreground">
            Waiting for security key or biometric...
          </p>
        </div>
      {:else if state === 'expired'}
        <div class="space-y-4 text-center">
          <p class="text-sm text-muted-foreground">
            Your authentication session has expired. Please log in again.
          </p>
          <Button href="/login" class="w-full">Back to Login</Button>
        </div>
      {:else if state === 'error'}
        <div class="space-y-4">
          <div
            class="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive"
          >
            {errorMessage}
          </div>
          <div class="flex gap-2">
            <Button onclick={authenticate} class="flex-1">Try Again</Button>
            <Button href="/login" variant="outline" class="flex-1">
              Back to Login
            </Button>
          </div>
        </div>
      {/if}
    </Card.CardContent>
  </Card.Card>
</div>
