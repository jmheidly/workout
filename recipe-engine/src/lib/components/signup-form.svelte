<script>
  import { page } from '$app/stores'
  import { enhance } from '$app/forms'
  import * as Card from '$lib/components/ui/card/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Field, FieldGroup, FieldLabel } from '$lib/components/ui/field/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as ButtonGroup from '$lib/components/ui/button-group/index.js'

  let { form } = $props()
  let loading = $state(false)
  let passwordless = $state(false)

  const id = $props.id()
  let invite = $derived($page.url.searchParams.get('invite'))
  let googleHref = $derived(invite ? `/login/google?invite=${invite}` : '/login/google')
  let loginHref = $derived(invite ? `/login?invite=${invite}` : '/login')
</script>

<div class="flex flex-col gap-6">
  <Card.Card>
    <Card.CardHeader class="text-center">
      <Card.CardTitle class="text-xl">Create an account</Card.CardTitle>
      <Card.CardDescription>Sign up with your Google account or email</Card.CardDescription>
    </Card.CardHeader>
    <Card.CardContent>
      <div class="grid gap-6">
        <Button variant="outline" class="w-full" href={googleHref}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4">
            <path
              d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
              fill="currentColor"
            />
          </svg>
          Sign up with Google
        </Button>

        <div class="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
          <span class="relative z-10 bg-card px-2 text-muted-foreground">Or continue with</span>
        </div>

        {#if form?.error}
          <div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {form.error}
          </div>
        {/if}

        <ButtonGroup.Root class="w-full">
          <Button
            variant={!passwordless ? 'secondary' : 'ghost'}
            class="flex-1"
            onclick={() => { passwordless = false }}
          >
            Password
          </Button>
          <Button
            variant={passwordless ? 'secondary' : 'ghost'}
            class="flex-1"
            onclick={() => { passwordless = true }}
          >
            Passwordless
          </Button>
        </ButtonGroup.Root>

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
          <input type="hidden" name="passwordless" value={passwordless ? '1' : ''} />
          <FieldGroup>
            <Field>
              <FieldLabel for="{id}-name">Full Name</FieldLabel>
              <Input
                id="{id}-name"
                name="name"
                type="text"
                value={form?.name ?? ''}
                required
                placeholder="John Doe"
              />
            </Field>
            <Field>
              <FieldLabel for="{id}-email">Email</FieldLabel>
              <Input
                id="{id}-email"
                name="email"
                type="email"
                value={form?.email ?? ''}
                required
                placeholder="you@example.com"
              />
            </Field>
            {#if !passwordless}
              <Field>
                <FieldLabel for="{id}-password">Password</FieldLabel>
                <Input
                  id="{id}-password"
                  name="password"
                  type="password"
                  required
                  minlength="6"
                />
              </Field>
              <Field>
                <FieldLabel for="{id}-confirm-password">Confirm Password</FieldLabel>
                <Input
                  id="{id}-confirm-password"
                  name="confirmPassword"
                  type="password"
                  required
                  minlength="6"
                />
              </Field>
            {/if}
            <Button type="submit" class="w-full" disabled={loading}>
              {loading ? 'Creating account...' : passwordless ? 'Sign up with email code' : 'Create account'}
            </Button>
          </FieldGroup>
        </form>

        <div class="text-center text-sm">
          Already have an account?
          <a href={loginHref} class="underline underline-offset-4">Sign in</a>
        </div>

        <div class="text-center text-xs text-muted-foreground">
          <a href="/terms" class="underline underline-offset-4">Terms of Service</a>
          <span class="mx-1">&middot;</span>
          <a href="/privacy" class="underline underline-offset-4">Privacy Policy</a>
        </div>
      </div>
    </Card.CardContent>
  </Card.Card>
</div>
