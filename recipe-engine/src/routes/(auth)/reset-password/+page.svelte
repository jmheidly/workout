<script>
  import { enhance } from '$app/forms'
  import * as Card from '$lib/components/ui/card/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Field, FieldGroup, FieldLabel } from '$lib/components/ui/field/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { InputOTP, InputOTPGroup, InputOTPSlot } from '$lib/components/ui/input-otp/index.js'

  let { form } = $props()
  let loading = $state(false)
  let otpValue = $state('')
  /** @type {HTMLInputElement|null} */
  let passwordEl = $state(null)
</script>

<div class="flex flex-col gap-6">
  <Card.Card>
    <Card.CardHeader class="text-center">
      <Card.CardTitle class="text-xl">Reset Password</Card.CardTitle>
      <Card.CardDescription>Enter the 6-digit code from your administrator</Card.CardDescription>
    </Card.CardHeader>
    <Card.CardContent>
      {#if form?.error}
        <div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {form.error}
        </div>
      {/if}

      <form
        method="POST"
        use:enhance={() => {
          loading = true
          return async ({ update }) => {
            loading = false
            await update()
          }
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel>Reset Code</FieldLabel>
            <div class="flex justify-center">
              <InputOTP
                maxlength={6}
                bind:value={otpValue}
                onComplete={() => passwordEl?.focus()}
              >
                {#snippet children({ cells })}
                  <InputOTPGroup>
                    {#each cells as cell}
                      <InputOTPSlot {cell} />
                    {/each}
                  </InputOTPGroup>
                {/snippet}
              </InputOTP>
            </div>
            <input type="hidden" name="otp" value={otpValue} />
          </Field>
          <Field>
            <FieldLabel for="password">New Password</FieldLabel>
            <input
              id="password"
              name="password"
              type="password"
              required
              minlength="6"
              bind:this={passwordEl}
              class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </Field>
          <Field>
            <FieldLabel for="confirmPassword">Confirm Password</FieldLabel>
            <Input id="confirmPassword" name="confirmPassword" type="password" required minlength="6" />
          </Field>
          <Button type="submit" class="w-full" disabled={loading || otpValue.length < 6}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </Button>
        </FieldGroup>
      </form>

      <div class="mt-4 text-center text-sm">
        Have a reset link instead?
        <a href="/login" class="underline underline-offset-4">Back to Login</a>
      </div>
    </Card.CardContent>
  </Card.Card>
</div>
