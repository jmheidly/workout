<script>
  import '../app.css'
  import { Toaster } from 'svelte-sonner'

  let { data, children } = $props()
</script>

<svelte:head>
  <title>Recipe Engine</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
  <header class="sticky top-0 z-20 border-b border-border bg-background">
    <div class="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
      <a href="/recipes" class="text-lg font-semibold">Recipe Engine</a>
      {#if data.user}
        <div class="flex items-center gap-4">
          <span class="text-sm text-muted-foreground">{data.user.email}</span>
          <form method="POST" action="/logout">
            <button
              type="submit"
              class="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
            >
              Logout
            </button>
          </form>
        </div>
      {/if}
    </div>
  </header>

  <main class="mx-auto max-w-5xl px-4 py-6">
    {@render children()}
  </main>
</div>

<Toaster />
