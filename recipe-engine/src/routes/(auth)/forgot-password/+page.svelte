<script>
  import { enhance } from '$app/forms'
  import * as Card from '$lib/components/ui/card/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Field, FieldGroup, FieldLabel } from '$lib/components/ui/field/index.js'
  import { Button } from '$lib/components/ui/button/index.js'

  let { form } = $props()
  let loading = $state(false)

  const id = $props.id()
</script>

<div class="flex flex-col gap-6">
  <Card.Card>
    <Card.CardHeader class="text-center">
      <Card.CardTitle class="text-xl">Forgot Password</Card.CardTitle>
      <Card.CardDescription>Enter your email to receive a password reset link.</Card.CardDescription>
    </Card.CardHeader>
    <Card.CardContent>
      {#if form?.submitted}
        <div class="mb-4 rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          If an account with that email exists, we've sent a reset link. Check your inbox.
        </div>
        <div class="flex flex-col gap-2">
          <Button href="/reset-password" variant="outline" class="w-full">I have a reset code</Button>
          <Button href="/login" variant="outline" class="w-full">Back to Login</Button>
        </div>
      {:else}
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
              <FieldLabel for="{id}-email">Email</FieldLabel>
              <Input
                id="{id}-email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
              />
            </Field>
            <Button type="submit" class="w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </FieldGroup>
        </form>
        <div class="mt-4 flex flex-col gap-2">
          <Button href="/reset-password" variant="outline" class="w-full">I have a reset code</Button>
          <Button href="/login" variant="outline" class="w-full">Back to Login</Button>
        </div>
      {/if}
    </Card.CardContent>
  </Card.Card>
</div>
