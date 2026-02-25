<script>
  import { enhance } from '$app/forms'

  let { form } = $props()
  let loading = $state(false)
</script>

<div class="mx-auto max-w-md">
  <h1 class="mb-6 text-2xl font-bold">New Recipe</h1>

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
      <label for="name" class="mb-1.5 block text-sm font-medium">Recipe name</label>
      <input
        id="name"
        name="name"
        type="text"
        value={form?.name ?? ''}
        required
        class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
        placeholder="e.g. French Baguette"
      />
    </div>

    <div class="mb-4">
      <label for="yield_per_piece" class="mb-1.5 block text-sm font-medium">
        Yield per piece (g)
      </label>
      <input
        id="yield_per_piece"
        name="yield_per_piece"
        type="number"
        step="any"
        min="0"
        value={form?.yield_per_piece ?? 350}
        class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
      />
    </div>

    <div class="mb-6">
      <label for="ddt" class="mb-1.5 block text-sm font-medium">
        DDT (Desired Dough Temperature, C)
      </label>
      <input
        id="ddt"
        name="ddt"
        type="number"
        step="any"
        min="0"
        value={form?.ddt ?? 24}
        class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
      />
    </div>

    <div class="flex gap-3">
      <a
        href="/recipes"
        class="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
      >
        Cancel
      </a>
      <button
        type="submit"
        disabled={loading}
        class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? 'Creating...' : 'Create Recipe'}
      </button>
    </div>
  </form>
</div>
