<script>
  import { enhance } from '$app/forms'
  import { toast } from 'svelte-sonner'
  import { Button } from '$lib/components/ui/button/index.js'
  import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
  } from '$lib/components/ui/card/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import {
    SelectRoot,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from '$lib/components/ui/select/index.js'

  const CATEGORIES = [
    'FLOUR',
    'LIQUID',
    'ENRICHMENT',
    'LEAVENING',
    'SEASONING',
    'SWEETENER',
    'FLAVORING',
    'MIXIN',
  ]

  const CATEGORY_LABELS = {
    FLOUR: 'Flour',
    LIQUID: 'Liquid',
    ENRICHMENT: 'Enrichment',
    LEAVENING: 'Leavening',
    SEASONING: 'Seasoning',
    SWEETENER: 'Sweetener',
    FLAVORING: 'Flavoring',
    MIXIN: 'Mix-in',
  }

  let { data } = $props()

  // ── State ──────────────────────────────────────────────
  let editing = $state(null) // ingredient id or 'new'
  let formName = $state('')
  let formCategory = $state('FLOUR')
  let search = $state('')
  let confirmDelete = $state(null)

  function startCreate() {
    editing = 'new'
    formName = ''
    formCategory = 'FLOUR'
  }

  function startEdit(ingredient) {
    editing = ingredient.id
    formName = ingredient.name
    formCategory = ingredient.category
  }

  function cancelEdit() {
    editing = null
  }

  // ── Derived ────────────────────────────────────────────
  let filtered = $derived(
    search.trim()
      ? data.ingredients.filter((i) =>
          i.name.toLowerCase().includes(search.trim().toLowerCase())
        )
      : data.ingredients
  )

  let grouped = $derived(
    CATEGORIES
      .map((cat) => ({
        category: cat,
        label: CATEGORY_LABELS[cat],
        items: filtered.filter((i) => i.category === cat),
      }))
      .filter((g) => g.items.length > 0)
  )
</script>

<!-- ── Header ──────────────────────────────────────────── -->
<div class="sticky top-14 z-10 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
  <div class="flex items-center gap-3">
    <h1 class="text-lg font-semibold">Ingredient Library</h1>
    <Badge variant="secondary">{data.ingredients.length}</Badge>
    <div class="flex-1"></div>
    {#if editing !== 'new'}
      <Button variant="outline" size="sm" onclick={startCreate}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        Add Ingredient
      </Button>
    {/if}
  </div>
</div>

<div class="space-y-4">

  <!-- ── Search ──────────────────────────────────────────── -->
  {#if data.ingredients.length > 5}
    <div>
      <input
        type="text"
        placeholder="Search ingredients…"
        bind:value={search}
        class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-offset-1"
      />
    </div>
  {/if}

  <!-- ── Inline Create / Edit Form ───────────────────────── -->
  {#if editing}
    <Card class="border-primary/30">
      <CardHeader class="pb-4">
        <CardTitle>{editing === 'new' ? 'New Ingredient' : `Edit: ${formName}`}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          method="POST"
          action={editing === 'new' ? '?/create' : '?/update'}
          use:enhance={() => {
            return async ({ result, update }) => {
              if (result.type === 'success') {
                toast.success(editing === 'new' ? 'Ingredient added' : 'Ingredient updated')
                editing = null
              } else if (result.type === 'failure') {
                toast.error(result.data?.error || 'Failed to save')
              }
              await update({ reset: false })
            }
          }}
        >
          {#if editing !== 'new'}
            <input type="hidden" name="id" value={editing} />
          {/if}

          <div class="space-y-4">
            <div class="flex flex-wrap items-start gap-4">
              <!-- Name -->
              <div class="min-w-48 flex-1">
                <label for="ing-name" class="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
                <input
                  id="ing-name"
                  type="text"
                  name="name"
                  bind:value={formName}
                  placeholder="e.g. Bread Flour"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
                />
              </div>
              <!-- Category -->
              <div class="w-44">
                <span class="mb-1.5 block text-xs font-medium text-muted-foreground">Category</span>
                <input type="hidden" name="category" value={formCategory} />
                <SelectRoot
                  type="single"
                  value={formCategory}
                  onValueChange={(v) => (formCategory = v)}
                  items={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
                >
                  <SelectTrigger>
                    <span>{CATEGORY_LABELS[formCategory]}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {#each CATEGORIES as cat}
                      <SelectItem value={cat} label={CATEGORY_LABELS[cat]} />
                    {/each}
                  </SelectContent>
                </SelectRoot>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 pt-2">
              <Button type="submit" size="sm">
                {editing === 'new' ? 'Add' : 'Save'}
              </Button>
              <Button variant="ghost" size="sm" onclick={cancelEdit}>Cancel</Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  {/if}

  <!-- ── Empty state ─────────────────────────────────────── -->
  {#if data.ingredients.length === 0 && !editing}
    <Card>
      <CardContent class="py-12 text-center text-muted-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mx-auto mb-3 opacity-40"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        <p class="font-medium">No ingredients yet</p>
        <p class="mt-1 text-sm">Ingredients are auto-captured when you save a recipe, or you can add them manually.</p>
        <div class="mt-4">
          <Button variant="outline" size="sm" onclick={startCreate}>Add Ingredient</Button>
        </div>
      </CardContent>
    </Card>
  {/if}

  <!-- ── No search results ───────────────────────────────── -->
  {#if data.ingredients.length > 0 && filtered.length === 0}
    <Card>
      <CardContent class="py-8 text-center text-muted-foreground">
        <p class="text-sm">No ingredients matching "{search}"</p>
      </CardContent>
    </Card>
  {/if}

  <!-- ── Grouped list ────────────────────────────────────── -->
  {#each grouped as group (group.category)}
    <Card>
      <CardHeader class="pb-2">
        <div class="flex items-center gap-2">
          <CardTitle class="text-sm">{group.label}</CardTitle>
          <Badge variant="secondary" class="font-normal">{group.items.length}</Badge>
        </div>
      </CardHeader>
      <CardContent class="pb-3">
        <div class="divide-y divide-border">
          {#each group.items as ingredient (ingredient.id)}
            {@const isEditing = editing === ingredient.id}
            {#if !isEditing}
              <div class="flex items-center justify-between gap-2 py-2">
                <span class="text-sm">{ingredient.name}</span>
                <div class="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onclick={() => startEdit(ingredient)}>Edit</Button>
                  {#if confirmDelete === ingredient.id}
                    <form
                      method="POST"
                      action="?/delete"
                      use:enhance={() => {
                        return async ({ result, update }) => {
                          if (result.type === 'success') {
                            toast.success('Ingredient deleted')
                            confirmDelete = null
                          }
                          await update({ reset: false })
                        }
                      }}
                    >
                      <input type="hidden" name="id" value={ingredient.id} />
                      <Button type="submit" variant="destructive" size="sm">Confirm</Button>
                    </form>
                    <Button variant="ghost" size="sm" onclick={() => (confirmDelete = null)}>Cancel</Button>
                  {:else}
                    <Button variant="ghost" size="sm" class="text-destructive" onclick={() => (confirmDelete = ingredient.id)}>Delete</Button>
                  {/if}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </CardContent>
    </Card>
  {/each}
</div>
