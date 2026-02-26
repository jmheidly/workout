<script>
  import { page } from '$app/stores'
  import { enhance } from '$app/forms'
  import * as Card from '$lib/components/ui/card/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Field, FieldGroup, FieldLabel } from '$lib/components/ui/field/index.js'
  import { Button } from '$lib/components/ui/button/index.js'

  let { form } = $props()
  let loading = $state(false)

  const id = $props.id()
  let invite = $derived($page.url.searchParams.get('invite'))
  let googleHref = $derived(invite ? `/login/google?invite=${invite}` : '/login/google')
  let signupHref = $derived(invite ? `/signup?invite=${invite}` : '/signup')
</script>

<div class="flex flex-col gap-6">
  <Card.Card>
    <Card.CardHeader class="text-center">
      <Card.CardTitle class="text-xl">Welcome back</Card.CardTitle>
      <Card.CardDescription>Login with your Google account or email</Card.CardDescription>
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
          Login with Google
        </Button>

        <div class="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
          <span class="relative z-10 bg-card px-2 text-muted-foreground">Or continue with</span>
        </div>

        {#if form?.error}
          <div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
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
            <Field>
              <div class="flex items-center">
                <FieldLabel for="{id}-password">Password</FieldLabel>
                <a href="/login" class="ml-auto text-sm underline-offset-4 hover:underline">
                  Forgot your password?
                </a>
              </div>
              <Input id="{id}-password" name="password" type="password" required />
            </Field>
            <Button type="submit" class="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Login'}
            </Button>
          </FieldGroup>
        </form>

        <div class="text-center text-sm">
          Don&apos;t have an account?
          <a href={signupHref} class="underline underline-offset-4">Sign up</a>
        </div>
      </div>
    </Card.CardContent>
  </Card.Card>
</div>
