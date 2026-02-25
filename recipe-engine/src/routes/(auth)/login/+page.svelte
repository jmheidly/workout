<script>
  import { enhance } from '$app/forms'

  let { form } = $props()
  let loading = $state(false)
</script>

<div class="flex min-h-[70vh] items-center justify-center">
  <div class="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
    <h1 class="mb-6 text-center text-2xl font-bold">Sign in</h1>

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
      <div class="mb-4">
        <label for="email" class="mb-1.5 block text-sm font-medium">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          value={form?.email ?? ''}
          required
          class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          placeholder="you@example.com"
        />
      </div>

      <div class="mb-6">
        <label for="password" class="mb-1.5 block text-sm font-medium">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        class="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? 'Signing in...' : 'Sign in'}
      </button>
    </form>

    <p class="mt-4 text-center text-sm text-muted-foreground">
      Don't have an account?
      <a href="/signup" class="font-medium text-foreground underline">Sign up</a>
    </p>
  </div>
</div>
