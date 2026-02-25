<script>
  import { enhance } from '$app/forms'
  import { toast } from 'svelte-sonner'
  import { Button } from '$lib/components/ui/button/index.js'
  import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
  } from '$lib/components/ui/card/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Separator } from '$lib/components/ui/separator/index.js'

  let { data } = $props()
  let deletingId = $state(null)
  let confirmDeleteId = $state(null)
  let search = $state('')

  let filteredRecipes = $derived(
    search.trim()
      ? data.recipes.filter((r) =>
          r.name.toLowerCase().includes(search.toLowerCase())
        )
      : data.recipes
  )

  function formatDate(dateStr) {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now - d
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
</script>

<!-- Page Header -->
<div class="mb-8">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">Recipes</h1>
      <p class="mt-1 text-muted-foreground">
        {data.recipes.length === 0
          ? 'Create your first recipe to get started.'
          : `${data.recipes.length} recipe${data.recipes.length === 1 ? '' : 's'} in your collection.`}
      </p>
    </div>
    <Button href="/recipes/new">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
      New Recipe
    </Button>
  </div>

  {#if data.recipes.length > 3}
    <div class="relative mt-4">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      >
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="text"
        bind:value={search}
        placeholder="Search recipes..."
        class="w-full rounded-md border border-input bg-background py-2 pl-10 pr-4 text-sm outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
      />
    </div>
  {/if}
</div>

<!-- Empty State -->
{#if data.recipes.length === 0}
  <Card class="border-dashed">
    <CardContent class="flex flex-col items-center justify-center py-16">
      <div class="mb-4 rounded-full bg-muted p-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
          <circle cx="12" cy="13" r="3"/>
        </svg>
      </div>
      <h3 class="mb-1 text-lg font-semibold">No recipes yet</h3>
      <p class="mb-6 max-w-sm text-center text-sm text-muted-foreground">
        Start building your recipe collection. Add ingredients, configure
        pre-ferments, and calculate production quantities.
      </p>
      <Button href="/recipes/new">Create your first recipe</Button>
    </CardContent>
  </Card>

<!-- No Search Results -->
{:else if filteredRecipes.length === 0}
  <Card class="border-dashed">
    <CardContent class="flex flex-col items-center justify-center py-12">
      <p class="text-sm text-muted-foreground">
        No recipes match "{search}".
      </p>
    </CardContent>
  </Card>

<!-- Recipe Grid -->
{:else}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each filteredRecipes as recipe (recipe.id)}
      <Card
        class="group relative transition-all hover:shadow-md hover:border-foreground/20"
      >
        <!-- Delete overlay -->
        {#if confirmDeleteId === recipe.id}
          <div
            class="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/95 backdrop-blur-sm"
          >
            <div class="text-center">
              <p class="mb-1 text-sm font-medium">Delete this recipe?</p>
              <p class="mb-4 text-xs text-muted-foreground">
                "{recipe.name}" will be permanently removed.
              </p>
              <div class="flex justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => (confirmDeleteId = null)}
                >
                  Cancel
                </Button>
                <form
                  method="POST"
                  action="?/delete"
                  use:enhance={() => {
                    deletingId = recipe.id
                    return async ({ result, update }) => {
                      deletingId = null
                      confirmDeleteId = null
                      if (result.type === 'success') {
                        toast.success(`"${recipe.name}" deleted`)
                      }
                      await update()
                    }
                  }}
                >
                  <input type="hidden" name="id" value={recipe.id} />
                  <Button
                    type="submit"
                    variant="destructive"
                    size="sm"
                    disabled={deletingId === recipe.id}
                  >
                    {deletingId === recipe.id ? 'Deleting...' : 'Delete'}
                  </Button>
                </form>
              </div>
            </div>
          </div>
        {/if}

        <a href="/recipes/{recipe.id}" class="block">
          <CardHeader class="pb-3">
            <div class="flex items-start justify-between">
              <CardTitle class="line-clamp-1">{recipe.name}</CardTitle>
              <button
                type="button"
                onclick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  confirmDeleteId = recipe.id
                }}
                class="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                aria-label="Delete recipe"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
              </button>
            </div>

            <!-- Badges -->
            <div class="flex flex-wrap gap-1.5">
              {#if recipe.hydration != null}
                <Badge variant="secondary" class="font-normal">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>
                  {(recipe.hydration * 100).toFixed(0)}%
                </Badge>
              {/if}
              {#if recipe.pf_count > 0}
                <Badge variant="secondary" class="bg-indigo-50 text-indigo-700 font-normal">
                  {recipe.pf_count} PF
                </Badge>
              {/if}
              {#if recipe.autolyse}
                <Badge variant="secondary" class="bg-teal-50 text-teal-700 font-normal">
                  Autolyse
                </Badge>
              {/if}
            </div>
          </CardHeader>

          <CardContent class="pb-3">
            <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <span class="text-xs text-muted-foreground">Yield</span>
                <p class="font-medium">{recipe.yield_per_piece}g/pc</p>
              </div>
              <div>
                <span class="text-xs text-muted-foreground">DDT</span>
                <p class="font-medium">{recipe.ddt}&deg;C</p>
              </div>
              <div>
                <span class="text-xs text-muted-foreground">Ingredients</span>
                <p class="font-medium">{recipe.ingredient_count}</p>
              </div>
              {#if recipe.num_pieces != null}
                <div>
                  <span class="text-xs text-muted-foreground">Pieces</span>
                  <p class="font-medium">{recipe.num_pieces.toFixed(1)}</p>
                </div>
              {/if}
            </div>

            {#if recipe.total_weight != null}
              <Separator class="my-3" />
              <div class="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Total: <span class="font-medium text-foreground">
                    {recipe.total_weight >= 1000
                      ? (recipe.total_weight / 1000).toFixed(1) + 'kg'
                      : recipe.total_weight.toFixed(0) + 'g'}
                  </span>
                </span>
                {#if recipe.pf_flour_pct > 0}
                  <span>
                    PF Flour: <span class="font-medium text-foreground">
                      {(recipe.pf_flour_pct * 100).toFixed(0)}%
                    </span>
                  </span>
                {/if}
              </div>
            {/if}
          </CardContent>

          <CardFooter class="border-t border-border pt-3 text-xs text-muted-foreground">
            <div class="flex w-full items-center justify-between">
              <span>Updated {formatDate(recipe.updated_at)}</span>
              {#if recipe.step_count > 0}
                <span>{recipe.step_count} steps</span>
              {/if}
            </div>
          </CardFooter>
        </a>
      </Card>
    {/each}
  </div>
{/if}
