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
  import * as ButtonGroup from '$lib/components/ui/button-group/index.js'
  import { DOUGH_TYPE_LABELS, DOUGH_TYPE_GROUPS } from '$lib/dough-types.js'
  import { useSortable, reorder } from '$lib/use-sortable.svelte.js'

  const DEFAULT_GROUP_ORDER = ['Bread', 'Pastry', 'Component', 'Uncategorized']

  let { data } = $props()
  let deletingId = $state(null)
  let confirmDeleteId = $state(null)
  let search = $state('')
  let viewMode = $state('byType')
  let savingOrder = $state(false)

  // Category order — synced from server, allow local reordering
  let categoryOrder = $state([...DEFAULT_GROUP_ORDER])
  $effect(() => {
    categoryOrder = data.categoryOrder || [...DEFAULT_GROUP_ORDER]
  })

  let displayRecipes = $derived.by(() => {
    let r = data.recipes
    if (search.trim())
      r = r.filter((x) =>
        x.name.toLowerCase().includes(search.toLowerCase())
      )
    return r
  })

  let recipesByType = $derived.by(() => {
    const groups = {}
    for (const [group, types] of Object.entries(DOUGH_TYPE_GROUPS)) {
      const withRecipes = types
        .map((t) => ({
          type: t,
          label: DOUGH_TYPE_LABELS[t],
          recipes: displayRecipes.filter((r) => r.dough_type === t),
        }))
        .filter((t) => t.recipes.length > 0)
      if (withRecipes.length > 0) groups[group] = withRecipes
    }
    const uncategorized = displayRecipes.filter((r) => !r.dough_type)
    if (uncategorized.length > 0)
      groups['Uncategorized'] = [
        { type: null, label: 'Uncategorized', recipes: uncategorized },
      ]
    return groups
  })

  // Ordered group keys: use categoryOrder, then append any new groups not in the saved order
  let orderedGroupKeys = $derived.by(() => {
    const present = Object.keys(recipesByType)
    const ordered = categoryOrder.filter((g) => present.includes(g))
    for (const g of present) {
      if (!ordered.includes(g)) ordered.push(g)
    }
    return ordered
  })

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

  function clearFilters() {
    search = ''
  }

  // Drag-and-drop category reordering
  let categoryContainer = $state(null)

  useSortable(() => categoryContainer, {
    animation: 200,
    handle: '.category-drag-handle',
    ghostClass: 'opacity-30',
    onEnd(evt) {
      // Reorder the visible keys, then rebuild the full categoryOrder
      const reordered = reorder(orderedGroupKeys, evt)
      // Preserve any hidden groups in their original position at the end
      const hidden = categoryOrder.filter((g) => !reordered.includes(g))
      categoryOrder = [...reordered, ...hidden]
    },
  })

</script>

<!-- Snippets -->

{#snippet deleteOverlay(recipe)}
  {#if data.canEdit && confirmDeleteId === recipe.id}
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
{/snippet}

{#snippet recipeBadges(recipe, showDoughType = true)}
  <div class="flex flex-wrap gap-1.5">
    {#if showDoughType && recipe.dough_type}
      <Badge
        variant="secondary"
        class="bg-emerald-50 text-emerald-700 font-normal"
      >
        {DOUGH_TYPE_LABELS[recipe.dough_type] || recipe.dough_type}
      </Badge>
    {/if}
    {#if recipe.hydration != null}
      <Badge variant="secondary" class="font-normal">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="mr-1"
          ><path
            d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"
          /></svg
        >
        {(recipe.hydration * 100).toFixed(0)}%
      </Badge>
    {/if}
    {#if recipe.pf_count > 0}
      <Badge
        variant="secondary"
        class="bg-indigo-50 text-indigo-700 font-normal"
      >
        {recipe.pf_count} PF
      </Badge>
    {/if}
    {#if recipe.autolyse}
      <Badge
        variant="secondary"
        class="bg-teal-50 text-teal-700 font-normal"
      >
        Autolyse
      </Badge>
    {/if}
    {#if recipe.companion_count > 0}
      <Badge
        variant="secondary"
        class="bg-orange-50 text-orange-700 font-normal"
      >
        {recipe.companion_count} companion{recipe.companion_count > 1
          ? 's'
          : ''}
      </Badge>
    {/if}
    {#if recipe.is_template}
      <Badge
        variant="secondary"
        class="bg-blue-50 text-blue-700 font-normal"
      >
        Template
      </Badge>
    {/if}
  </div>
{/snippet}

{#snippet deleteButton(recipe)}
  {#if data.canEdit}
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
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M3 6h18" /><path
          d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
        /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </svg>
    </button>
  {/if}
{/snippet}

{#snippet recipeCard(recipe, showDoughType = true)}
  <Card
    class="group relative transition-all hover:shadow-md hover:border-foreground/20"
  >
    {@render deleteOverlay(recipe)}

    <a href="/recipes/{recipe.id}" class="block">
      <CardHeader class="pb-3">
        <div class="flex items-start justify-between">
          <CardTitle class="line-clamp-1">{recipe.name}</CardTitle>
          {@render deleteButton(recipe)}
        </div>

        {@render recipeBadges(recipe, showDoughType)}
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
          <div
            class="flex items-center justify-between text-xs text-muted-foreground"
          >
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

      <CardFooter
        class="border-t border-border pt-3 text-xs text-muted-foreground"
      >
        <div class="flex w-full items-center justify-between">
          <span>Updated {formatDate(recipe.updated_at)}</span>
          {#if recipe.step_count > 0}
            <span>{recipe.step_count} steps</span>
          {/if}
        </div>
      </CardFooter>
    </a>
  </Card>
{/snippet}

<!-- Toolbar -->
<div class="mb-8">
  {#if data.recipes.length > 0}
    <div class="flex flex-wrap items-center gap-3">
      <!-- Search -->
      <div class="relative flex-1 min-w-[200px]">
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

      <!-- View toggle -->
      <ButtonGroup.Root>
        <Button
          variant={viewMode === 'byType' ? 'secondary' : 'ghost'}
          size="sm"
          onclick={() => (viewMode = 'byType')}
          aria-label="Group by type"
        >
          <!-- Layers icon -->
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
          >
            <path
              d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"
            />
            <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
            <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
          </svg>
        </Button>
        <Button
          variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
          size="sm"
          onclick={() => (viewMode = 'grid')}
          aria-label="Grid view"
        >
          <!-- Grid icon -->
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
          >
            <rect width="7" height="7" x="3" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="14" rx="1" />
            <rect width="7" height="7" x="3" y="14" rx="1" />
          </svg>
        </Button>
        <Button
          variant={viewMode === 'list' ? 'secondary' : 'ghost'}
          size="sm"
          onclick={() => (viewMode = 'list')}
          aria-label="List view"
        >
          <!-- List icon -->
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
          >
            <line x1="8" x2="21" y1="6" y2="6" />
            <line x1="8" x2="21" y1="12" y2="12" />
            <line x1="8" x2="21" y1="18" y2="18" />
            <line x1="3" x2="3.01" y1="6" y2="6" />
            <line x1="3" x2="3.01" y1="12" y2="12" />
            <line x1="3" x2="3.01" y1="18" y2="18" />
          </svg>
        </Button>
      </ButtonGroup.Root>

      {#if data.canEdit}
        <Button href="/recipes/new" size="sm">
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
            ><path d="M5 12h14" /><path d="M12 5v14" /></svg
          >
          New Recipe
        </Button>
      {/if}
    </div>
  {/if}
</div>

<!-- Empty State: no recipes at all -->
{#if data.recipes.length === 0}
  <Card class="border-dashed">
    <CardContent class="flex flex-col items-center justify-center py-16">
      <div class="mb-4 rounded-full bg-muted p-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-muted-foreground"
        >
          <path
            d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
          />
          <circle cx="12" cy="13" r="3" />
        </svg>
      </div>
      <h3 class="mb-1 text-lg font-semibold">No recipes yet</h3>
      <p class="mb-6 max-w-sm text-center text-sm text-muted-foreground">
        {#if data.canEdit}
          Start building your recipe collection. Add ingredients, configure
          pre-ferments, and calculate production quantities.
        {:else}
          This bakery doesn't have any recipes yet.
        {/if}
      </p>
      {#if data.canEdit}
        <Button href="/recipes/new">Create your first recipe</Button>
      {/if}
    </CardContent>
  </Card>

<!-- Empty State: filters returned nothing -->
{:else if displayRecipes.length === 0}
  <Card class="border-dashed">
    <CardContent class="flex flex-col items-center justify-center py-12">
      <p class="mb-3 text-sm text-muted-foreground">
        No recipes match "{search}".
      </p>
      <Button variant="ghost" size="sm" onclick={clearFilters}>
        Clear filters
      </Button>
    </CardContent>
  </Card>

<!-- By Type View (default) -->
{:else if viewMode === 'byType'}
  <div bind:this={categoryContainer}>
    {#each orderedGroupKeys as group (group)}
      {@const typeEntries = recipesByType[group]}
      <div class="mb-8">
        <div class="mb-4 flex items-center gap-1">
          {#if data.canEdit && orderedGroupKeys.length > 1}
            <div
              class="category-drag-handle mr-1 flex cursor-grab items-center text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
            </div>
          {/if}
          <h2 class="text-lg font-semibold tracking-tight">{group}</h2>
          <span class="ml-1 text-xs text-muted-foreground">
            ({typeEntries.reduce((s, t) => s + t.recipes.length, 0)})
          </span>
        </div>

        {#each typeEntries as { type, label, recipes }}
          <div class="mb-6">
            <div class="mb-3 flex items-center gap-2">
              <Badge
                variant="secondary"
                class="bg-emerald-50 text-emerald-700 font-normal"
              >
                {label}
              </Badge>
              <span class="text-xs text-muted-foreground">
                {recipes.length} recipe{recipes.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {#each recipes as recipe (recipe.id)}
                {@render recipeCard(recipe, false)}
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/each}
  </div>

  <!-- Save category order -->
  {#if data.canEdit}
    {@const orderChanged =
      JSON.stringify(categoryOrder) !==
      JSON.stringify(data.categoryOrder || DEFAULT_GROUP_ORDER)}
    {#if orderChanged}
      <div
        class="fixed bottom-6 left-1/2 z-20 -translate-x-1/2"
      >
        <form
          method="POST"
          action="?/reorderCategories"
          use:enhance={() => {
            savingOrder = true
            return async ({ result, update }) => {
              savingOrder = false
              if (result.type === 'success') {
                toast.success('Category order saved')
              }
              await update()
            }
          }}
        >
          <input
            type="hidden"
            name="order"
            value={JSON.stringify(categoryOrder)}
          />
          <Button type="submit" size="sm" disabled={savingOrder}>
            {savingOrder ? 'Saving...' : 'Save category order'}
          </Button>
        </form>
      </div>
    {/if}
  {/if}

<!-- Grid View -->
{:else if viewMode === 'grid'}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each displayRecipes as recipe (recipe.id)}
      {@render recipeCard(recipe)}
    {/each}
  </div>

<!-- List View -->
{:else if viewMode === 'list'}
  <Card>
    <!-- Column headers -->
    <div
      class="flex items-center gap-4 border-b px-4 py-2 text-xs font-medium text-muted-foreground"
    >
      <span class="flex-1">Name</span>
      <span class="hidden w-28 sm:block">Type</span>
      <span class="w-16 text-right">Hydration</span>
      <span class="w-20 text-right">Yield</span>
      <span class="hidden w-12 text-right sm:block">Ingr.</span>
      <span class="hidden w-20 text-right md:block">Updated</span>
      {#if data.canEdit}
        <span class="w-8"></span>
      {/if}
    </div>

    {#each displayRecipes as recipe, i (recipe.id)}
      <div class="group relative">
        {@render deleteOverlay(recipe)}
        <a
          href="/recipes/{recipe.id}"
          class="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50 {i < displayRecipes.length - 1 ? 'border-b' : ''}"
        >
          <!-- Name -->
          <span class="flex-1 truncate text-sm font-medium">
            {recipe.name}
          </span>

          <!-- Type badge -->
          <span class="hidden w-28 sm:block">
            {#if recipe.dough_type}
              <Badge
                variant="secondary"
                class="bg-emerald-50 text-emerald-700 font-normal text-xs"
              >
                {DOUGH_TYPE_LABELS[recipe.dough_type] || recipe.dough_type}
              </Badge>
            {:else}
              <span class="text-xs text-muted-foreground">&mdash;</span>
            {/if}
          </span>

          <!-- Hydration -->
          <span class="w-16 text-right text-sm tabular-nums">
            {#if recipe.hydration != null}
              {(recipe.hydration * 100).toFixed(0)}%
            {:else}
              <span class="text-muted-foreground">&mdash;</span>
            {/if}
          </span>

          <!-- Yield -->
          <span class="w-20 text-right text-sm tabular-nums">
            {recipe.yield_per_piece}g/pc
          </span>

          <!-- Ingredients -->
          <span
            class="hidden w-12 text-right text-sm tabular-nums sm:block"
          >
            {recipe.ingredient_count}
          </span>

          <!-- Updated -->
          <span
            class="hidden w-20 text-right text-xs text-muted-foreground md:block"
          >
            {formatDate(recipe.updated_at)}
          </span>

          <!-- Delete -->
          {#if data.canEdit}
            <span class="w-8 text-right">
              <button
                type="button"
                onclick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  confirmDeleteId = recipe.id
                }}
                class="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                aria-label="Delete recipe"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M3 6h18" /><path
                    d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
                  /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            </span>
          {/if}
        </a>
      </div>
    {/each}
  </Card>
{/if}
