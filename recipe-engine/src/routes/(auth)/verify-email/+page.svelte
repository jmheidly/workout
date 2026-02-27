<script>
  import { enhance } from '$app/forms'
  import * as Card from '$lib/components/ui/card/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Field, FieldGroup, FieldLabel } from '$lib/components/ui/field/index.js'
  import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
  } from '$lib/components/ui/input-otp/index.js'

  let { data, form } = $props()
  let loading = $state(false)
  let otpValue = $state('')
  let codeSent = $state(form?.codeSent ?? false)
</script>

<div class="flex flex-col gap-6">
  <Card.Card>
    <Card.CardHeader class="text-center">
      <Card.CardTitle class="text-xl">Verify your email</Card.CardTitle>
      <Card.CardDescription>
        We need to verify <strong>{data.user.email}</strong> before you can continue.
      </Card.CardDescription>
    </Card.CardHeader>
    <Card.CardContent>
      <div class="grid gap-6">
        {#if form?.error}
          <div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {form.error}
          </div>
        {/if}

        {#if !codeSent}
          <form
            method="POST"
            action="?/sendCode"
            use:enhance={() => {
              loading = true
              return async ({ result, update }) => {
                loading = false
                if (result.type === 'success' && result.data?.codeSent) {
                  codeSent = true
                } else {
                  await update()
                }
              }
            }}
          >
            <FieldGroup>
              <p class="text-sm text-muted-foreground">
                Click the button below to send a 6-digit verification code to your email.
              </p>
              <Button type="submit" class="w-full" disabled={loading}>
                {loading ? 'Sending...' : 'Send Verification Code'}
              </Button>
            </FieldGroup>
          </form>
        {:else}
          <form
            method="POST"
            action="?/verifyCode"
            use:enhance={() => {
              loading = true
              return async ({ update }) => {
                loading = false
                await update()
              }
            }}
          >
            <input type="hidden" name="code" value={otpValue} />
            <FieldGroup>
              <Field>
                <FieldLabel>Enter the 6-digit code sent to {data.user.email}</FieldLabel>
                <div class="flex justify-center py-2">
                  <InputOTP maxlength={6} bind:value={otpValue}>
                    {#snippet children({ cells })}
                      <InputOTPGroup>
                        {#each cells as cell}
                          <InputOTPSlot {cell} />
                        {/each}
                      </InputOTPGroup>
                    {/snippet}
                  </InputOTP>
                </div>
              </Field>
              <Button type="submit" class="w-full" disabled={loading || otpValue.length < 6}>
                {loading ? 'Verifying...' : 'Verify'}
              </Button>
            </FieldGroup>
          </form>
          <form
            method="POST"
            action="?/sendCode"
            use:enhance={() => {
              loading = true
              return async ({ result, update }) => {
                loading = false
                if (result.type === 'success' && result.data?.codeSent) {
                  otpValue = ''
                } else {
                  await update()
                }
              }
            }}
          >
            <button
              type="submit"
              class="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Didn&apos;t get a code? Resend
            </button>
          </form>
        {/if}

        <div class="text-center text-sm text-muted-foreground">
          <a href="/logout" class="underline underline-offset-4">Sign out</a>
        </div>
      </div>
    </Card.CardContent>
  </Card.Card>
</div>
