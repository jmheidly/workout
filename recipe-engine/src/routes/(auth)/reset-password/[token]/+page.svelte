<script>
  import { enhance } from '$app/forms'
  import * as Card from '$lib/components/ui/card/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Field, FieldGroup, FieldLabel } from '$lib/components/ui/field/index.js'
  import { Button } from '$lib/components/ui/button/index.js'

  let { data, form } = $props()
  let loading = $state(false)
</script>

<div class="flex flex-col gap-6">
  <Card.Card>
    <Card.CardHeader class="text-center">
      <Card.CardTitle class="text-xl">Reset Password</Card.CardTitle>
      {#if data.status === 'valid'}
        <Card.CardDescription>Enter your new password below</Card.CardDescription>
      {/if}
    </Card.CardHeader>
    <Card.CardContent>
      {#if data.status === 'invalid'}
        <div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          This reset link is invalid. Please ask your bakery administrator for a new one.
        </div>
        <div class="mt-4 text-center">
          <Button href="/login" variant="outline">Back to Login</Button>
        </div>
      {:else if data.status === 'used'}
        <div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          This reset link has already been used. Please ask your bakery administrator for a new one.
        </div>
        <div class="mt-4 text-center">
          <Button href="/login" variant="outline">Back to Login</Button>
        </div>
      {:else if data.status === 'expired'}
        <div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          This reset link has expired. Please ask your bakery administrator for a new one.
        </div>
        <div class="mt-4 text-center">
          <Button href="/login" variant="outline">Back to Login</Button>
        </div>
      {:else}
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
              <FieldLabel for="password">New Password</FieldLabel>
              <Input id="password" name="password" type="password" required minlength="6" />
            </Field>
            <Field>
              <FieldLabel for="confirmPassword">Confirm Password</FieldLabel>
              <Input id="confirmPassword" name="confirmPassword" type="password" required minlength="6" />
            </Field>
            <Button type="submit" class="w-full" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </Button>
          </FieldGroup>
        </form>
      {/if}
    </Card.CardContent>
  </Card.Card>
</div>
