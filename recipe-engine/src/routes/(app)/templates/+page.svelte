<script>
  import { enhance } from '$app/forms'
  import { toast } from 'svelte-sonner'
  import { Button } from '$lib/components/ui/button/index.js'
  import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    CardFooter,
  } from '$lib/components/ui/card/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'

  let { data } = $props()
  let deletingId = $state(null)
  let confirmDeleteId = $state(null)
  let search = $state('')

  const TYPE_COLORS = {
    preferment: 'bg-indigo-50 text-indigo-700',
    intermediate_dough: 'bg-violet-50 text-violet-700',
    filling: 'bg-orange-50 text-orange-700',
    glaze: 'bg-amber-50 text-amber-700',
    garnish: 'bg-emerald-50 text-emerald-700',
    other: 'bg-slate-50 text-slate-700',
  }

  const TYPE_LABELS = {
    preferment: 'Preferment',
    intermediate_dough: 'Intermediate Dough',
    filling: 'Filling',
    glaze: 'Glaze',
    garnish: 'Garnish',
    other: 'Other',
  }

  let displayTemplates = $derived.by(() => {
    let t = data.templates
    if (search.trim())
      t = t.filter((x) =>
        x.name.toLowerCase().includes(search.toLowerCase())
      )
    return t
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
</script>

{#snippet deleteOverlay(template)}
  {#if data.canEdit && confirmDeleteId === template.id}
    <div
      class="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/95 backdrop-blur-sm"
    >
      <div class="text-center">
        <p class="mb-1 text-sm font-medium">Delete this template?</p>
        <p class="mb-2 text-xs text-muted-foreground">
          "{template.name}" will be unlinked from all recipes. Local copies are preserved.
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
              deletingId = template.id
              return async ({ result, update }) => {
                deletingId = null
                confirmDeleteId = null
                if (result.type === 'success') {
                  toast.success(`"${template.name}" deleted`)
                }
                await update()
              }
            }}
          >
            <input type="hidden" name="id" value={template.id} />
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={deletingId === template.id}
            >
              {deletingId === template.id ? 'Deleting...' : 'Delete'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  {/if}
{/snippet}

<!-- Toolbar -->
<div class="mb-8">
  {#if data.templates.length > 0}
    <div class="flex flex-wrap items-center gap-3">
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
          placeholder="Search templates..."
          class="w-full rounded-md border border-input bg-background py-2 pl-10 pr-4 text-sm outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
        />
      </div>

      {#if data.canEdit}
        <Button href="/templates/new" size="sm">
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
          ><path d="M5 12h14" /><path d="M12 5v14" /></svg>
          New Template
        </Button>
      {/if}
    </div>
  {/if}
</div>

<!-- Empty State -->
{#if data.templates.length === 0}
  <Card class="border-dashed">
    <CardContent class="flex flex-col items-center justify-center py-16">
      <div class="mb-4 rounded-full bg-muted p-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
          <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
          <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
          <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
        </svg>
      </div>
      <h3 class="mb-1 text-lg font-semibold">No templates yet</h3>
      <p class="mb-6 max-w-sm text-center text-sm text-muted-foreground">
        {#if data.canEdit}
          Create reusable formula templates that can be linked across multiple recipes. Define once, use everywhere.
        {:else}
          This bakery doesn't have any templates yet.
        {/if}
      </p>
      {#if data.canEdit}
        <Button href="/templates/new">Create your first template</Button>
      {/if}
    </CardContent>
  </Card>

<!-- Filter empty -->
{:else if displayTemplates.length === 0}
  <Card class="border-dashed">
    <CardContent class="flex flex-col items-center justify-center py-12">
      <p class="mb-3 text-sm text-muted-foreground">
        No templates match "{search}".
      </p>
      <Button variant="ghost" size="sm" onclick={() => (search = '')}>
        Clear search
      </Button>
    </CardContent>
  </Card>

<!-- Template grid -->
{:else}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each displayTemplates as template (template.id)}
      {@const usedIn = (template.pf_usage_count || 0) + (template.companion_usage_count || 0)}
      <Card class="group relative transition-all hover:shadow-md hover:border-foreground/20">
        {@render deleteOverlay(template)}

        <CardHeader class="pb-3">
          <div class="flex items-start justify-between">
            <CardTitle class="line-clamp-1">{template.name}</CardTitle>
            {#if data.canEdit}
              <button
                type="button"
                onclick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  confirmDeleteId = template.id
                }}
                class="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                aria-label="Delete template"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            {/if}
          </div>
          <div class="flex flex-wrap gap-1.5">
            <Badge variant="secondary" class="{TYPE_COLORS[template.template_type] || TYPE_COLORS.other} font-normal">
              {TYPE_LABELS[template.template_type] || template.template_type}
            </Badge>
            {#if usedIn > 0}
              <Badge variant="secondary" class="font-normal">
                Used in {usedIn} recipe{usedIn !== 1 ? 's' : ''}
              </Badge>
            {/if}
          </div>
        </CardHeader>

        <CardContent class="pb-3">
          <div class="text-sm text-muted-foreground">
            <p class="truncate">
              Formula: <a href="/recipes/{template.recipe_id}" class="font-medium text-foreground hover:underline">{template.recipe_name}</a>
            </p>
            <p class="mt-1 text-xs">Version {template.recipe_version}</p>
          </div>
        </CardContent>

        <CardFooter class="border-t border-border pt-3 text-xs text-muted-foreground">
          <div class="flex w-full items-center justify-between">
            <span>Updated {formatDate(template.recipe_updated_at || template.updated_at)}</span>
            <a
              href="/recipes/{template.recipe_id}"
              class="text-xs font-medium text-primary hover:underline"
            >
              Edit formula
            </a>
          </div>
        </CardFooter>
      </Card>
    {/each}
  </div>
{/if}
