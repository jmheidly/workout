<script>
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { diffVersions, summarizeChanges } from '$lib/version-diff.js'
  import { formatPct, formatGrams } from '$lib/utils.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
  } from '$lib/components/ui/card/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Separator } from '$lib/components/ui/separator/index.js'

  let { data } = $props()

  const CATEGORY_COLORS = {
    FLOUR: 'bg-amber-100 text-amber-800',
    LIQUID: 'bg-blue-100 text-blue-800',
    ENRICHMENT: 'bg-yellow-100 text-yellow-800',
    LEAVENING: 'bg-green-100 text-green-800',
    SEASONING: 'bg-red-100 text-red-800',
    SWEETENER: 'bg-pink-100 text-pink-800',
    FLAVORING: 'bg-purple-100 text-purple-800',
    MIXIN: 'bg-orange-100 text-orange-800',
    PREFERMENT: 'bg-indigo-100 text-indigo-800',
  }

  // Build diffs between adjacent versions for the timeline
  let versionDiffs = $derived.by(() => {
    const versions = data.versions
    if (versions.length < 2) return {}

    const diffs = {}
    // versions are sorted DESC, so [0] is newest
    for (let i = 0; i < versions.length - 1; i++) {
      const newer = versions[i]
      const older = versions[i + 1]

      // We only have snapshots when viewing — for the timeline, compute on the server
      // Instead, we'll use the server-loaded compare data if available
      diffs[newer.version_number] = null // placeholder
    }
    return diffs
  })

  // Compare mode state
  let compareA = $state(null)
  let compareB = $state(null)

  function toggleCompare(versionNumber) {
    if (compareA === versionNumber) {
      compareA = null
    } else if (compareB === versionNumber) {
      compareB = null
    } else if (compareA === null) {
      compareA = versionNumber
    } else if (compareB === null) {
      compareB = versionNumber
      // Navigate to comparison
      const [a, b] = [Math.min(compareA, versionNumber), Math.max(compareA, versionNumber)]
      goto(`?compare=${a},${b}`)
    } else {
      // Replace the older selection
      compareA = compareB
      compareB = versionNumber
      const [a, b] = [Math.min(compareA, versionNumber), Math.max(compareA, versionNumber)]
      goto(`?compare=${a},${b}`)
    }
  }

  function clearCompare() {
    compareA = null
    compareB = null
    goto($page.url.pathname)
  }

  // Parse compare data if present
  let compareChanges = $derived.by(() => {
    if (!data.compareData) return null
    return diffVersions(data.compareData.a.snapshot, data.compareData.b.snapshot)
  })

  function formatDate(isoStr) {
    if (!isoStr) return ''
    const d = new Date(isoStr)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  function creatorLabel(v) {
    return v.creator_name || v.creator_email?.split('@')[0] || 'Unknown'
  }

  function formatChangeValue(field, val) {
    if (val === null || val === undefined) return '—'
    if (field === 'process_loss_pct' || field === 'bake_loss_pct') {
      return `${((val || 0) * 100).toFixed(1)}%`
    }
    if (field === 'ddt') return `${val}°C`
    if (field === 'yield_per_piece') return `${val}g`
    if (field === 'autolyse') return val ? 'Yes' : 'No'
    return String(val)
  }

  function formatFieldName(field) {
    if (field === 'base_qty') return 'qty'
    if (field.startsWith('preferment_pct_')) return 'PF%'
    return field
  }

  function formatIngValue(field, val) {
    if (val === null || val === undefined) return '—'
    if (field === 'base_qty') return `${val}g`
    if (field === 'category') return val
    if (field.startsWith('preferment_pct_')) return `${((val || 0) * 100).toFixed(1)}%`
    return String(val)
  }
</script>

<!-- Header -->
<div class="sticky top-0 z-10 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
  <div class="flex items-center gap-3">
    <h1 class="text-lg font-semibold">Version History</h1>
    <Badge variant="secondary">v{data.recipe.version}</Badge>
    <span class="text-sm text-muted-foreground">{data.recipe.name}</span>
    <div class="flex-1"></div>
    {#if data.compareData}
      <Button variant="outline" size="sm" onclick={clearCompare}>Clear Comparison</Button>
    {/if}
    <Button variant="outline" size="sm" href="/recipes/{data.recipe.id}">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
      Back to Recipe
    </Button>
  </div>
</div>

{#if data.compareData}
  <!-- ── Side-by-Side Comparison ─────────────────────────── -->
  {@const cmp = data.compareData}
  {@const changes = compareChanges}

  <div class="space-y-6">
    <!-- Change summary -->
    <Card>
      <CardHeader class="pb-3">
        <CardTitle class="text-sm">
          Changes: v{cmp.a.meta.version_number} → v{cmp.b.meta.version_number}
          {#if changes && changes.length > 0}
            <Badge variant="secondary" class="ml-2">{changes.length} change{changes.length !== 1 ? 's' : ''}</Badge>
          {/if}
        </CardTitle>
      </CardHeader>
      {#if changes && changes.length > 0}
        <CardContent class="pt-0">
          <div class="space-y-1.5">
            {#each changes as change}
              <div class="flex items-center gap-2 text-sm">
                {#if change.type === 'param_changed'}
                  <Badge variant="outline" class="text-xs">Recipe</Badge>
                  <span class="text-muted-foreground">{change.field}:</span>
                  <span class="line-through text-red-600">{formatChangeValue(change.field, change.old)}</span>
                  <span>→</span>
                  <span class="text-green-600">{formatChangeValue(change.field, change.new)}</span>
                {:else if change.type === 'ingredient_added'}
                  <Badge class="text-xs bg-green-100 text-green-800">Added</Badge>
                  <span>{change.name}</span>
                  <span class="text-muted-foreground">({change.base_qty}g)</span>
                {:else if change.type === 'ingredient_removed'}
                  <Badge class="text-xs bg-red-100 text-red-800">Removed</Badge>
                  <span class="line-through">{change.name}</span>
                  <span class="text-muted-foreground">({change.base_qty}g)</span>
                {:else if change.type === 'ingredient_renamed'}
                  <Badge class="text-xs bg-yellow-100 text-yellow-800">Renamed</Badge>
                  <span class="line-through">{change.old_name}</span>
                  <span>→</span>
                  <span>{change.new_name}</span>
                {:else if change.type === 'ingredient_modified'}
                  <Badge variant="outline" class="text-xs">{change.name}</Badge>
                  <span class="text-muted-foreground">{formatFieldName(change.field)}:</span>
                  <span class="line-through text-red-600">{formatIngValue(change.field, change.old)}</span>
                  <span>→</span>
                  <span class="text-green-600">{formatIngValue(change.field, change.new)}</span>
                {:else if change.type === 'step_added'}
                  <Badge class="text-xs bg-green-100 text-green-800">Step added</Badge>
                  <span>{change.name}</span>
                {:else if change.type === 'step_removed'}
                  <Badge class="text-xs bg-red-100 text-red-800">Step removed</Badge>
                  <span class="line-through">{change.name}</span>
                {:else if change.type === 'step_modified'}
                  <Badge variant="outline" class="text-xs">Step</Badge>
                  <span>{change.name}</span>
                  <span class="text-muted-foreground">{change.field}:</span>
                  <span class="line-through text-red-600">{change.old}</span>
                  <span>→</span>
                  <span class="text-green-600">{change.new}</span>
                {/if}
              </div>
            {/each}
          </div>
        </CardContent>
      {:else}
        <CardContent class="pt-0">
          <p class="text-sm text-muted-foreground">No differences found.</p>
        </CardContent>
      {/if}
    </Card>

    <!-- Side-by-side ingredient tables -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {#each [{ side: cmp.a, label: `v${cmp.a.meta.version_number}` }, { side: cmp.b, label: `v${cmp.b.meta.version_number}${cmp.b.meta.isCurrent ? ' (current)' : ''}` }] as { side, label }}
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm">{label} — {side.snapshot.name}</CardTitle>
            {#if side.meta.created_at}
              <p class="text-xs text-muted-foreground">{formatDate(side.meta.created_at)}</p>
            {/if}
          </CardHeader>
          <CardContent>
            <!-- Recipe params -->
            <div class="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span class="text-muted-foreground">Yield/piece</span>
              <span>{side.snapshot.yield_per_piece}g</span>
              <span class="text-muted-foreground">DDT</span>
              <span>{side.snapshot.ddt}°C</span>
              <span class="text-muted-foreground">Mix type</span>
              <span>{side.snapshot.mix_type}</span>
              {#if side.snapshot.process_loss_pct}
                <span class="text-muted-foreground">Process loss</span>
                <span>{(side.snapshot.process_loss_pct * 100).toFixed(1)}%</span>
              {/if}
              {#if side.snapshot.bake_loss_pct}
                <span class="text-muted-foreground">Bake loss</span>
                <span>{(side.snapshot.bake_loss_pct * 100).toFixed(1)}%</span>
              {/if}
            </div>

            <Separator class="my-2" />

            <!-- Ingredients -->
            <div class="space-y-1">
              <p class="text-xs font-medium text-muted-foreground">Ingredients</p>
              {#each side.snapshot.ingredients || [] as ing}
                {@const isChanged = changes?.some(
                  (c) =>
                    (c.ingredient_id === ing.id &&
                      (c.type === 'ingredient_modified' || c.type === 'ingredient_renamed')) ||
                    (c.type === 'ingredient_added' && c.ingredient_id === ing.id)
                )}
                {@const isRemoved = side === cmp.a && changes?.some(
                  (c) => c.type === 'ingredient_removed' && c.ingredient_id === ing.id
                )}
                <div
                  class="flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-sm {isChanged
                    ? 'bg-yellow-50'
                    : ''} {isRemoved ? 'bg-red-50 line-through' : ''}"
                >
                  <div class="flex items-center gap-2">
                    <span class="inline-block h-2 w-2 rounded-full {CATEGORY_COLORS[ing.category]?.split(' ')[0] || 'bg-gray-200'}"></span>
                    <span>{ing.name}</span>
                  </div>
                  <span class="tabular-nums text-muted-foreground">{ing.base_qty}g</span>
                </div>
              {/each}
            </div>
          </CardContent>
        </Card>
      {/each}
    </div>
  </div>
{:else}
  <!-- ── Version Timeline ─────────────────────────────────── -->
  <div class="space-y-4">
    {#if data.versions.length === 0}
      <Card>
        <CardContent class="py-12 text-center text-muted-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mx-auto mb-3 opacity-40"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
          <p class="font-medium">No version history yet</p>
          <p class="mt-1 text-sm">Version history is created automatically each time you save the recipe.</p>
        </CardContent>
      </Card>
    {:else}
      <!-- Current version (lives in recipes table) -->
      <Card class="border-primary/30">
        <CardContent class="py-4">
          <div class="flex items-start gap-4">
            <div class="flex flex-col items-center">
              <div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                v{data.recipe.version}
              </div>
              {#if data.versions.length > 0}
                <div class="mt-1 h-4 w-px bg-border"></div>
              {/if}
            </div>
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium">Current version</span>
                <Badge variant="secondary" class="text-xs">Latest</Badge>
              </div>
              <p class="mt-0.5 text-xs text-muted-foreground">
                Last saved {formatDate(data.recipe.updated_at)}
              </p>
            </div>
            <div class="flex items-center gap-1">
              <Button
                variant={compareA === data.recipe.version || compareB === data.recipe.version ? 'default' : 'outline'}
                size="sm"
                onclick={() => toggleCompare(data.recipe.version)}
              >
                {#if compareA === data.recipe.version || compareB === data.recipe.version}
                  Selected
                {:else}
                  Compare
                {/if}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Historical versions -->
      {#each data.versions as version, i (version.id)}
        {@const isOldest = i === data.versions.length - 1}
        <Card>
          <CardContent class="py-4">
            <div class="flex items-start gap-4">
              <div class="flex flex-col items-center">
                <div class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-border bg-background text-xs font-medium">
                  v{version.version_number}
                </div>
                {#if !isOldest}
                  <div class="mt-1 h-4 w-px bg-border"></div>
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium">Version {version.version_number}</span>
                  <span class="text-xs text-muted-foreground">
                    by {creatorLabel(version)}
                  </span>
                </div>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {formatDate(version.created_at)}
                </p>
                {#if version.change_notes}
                  <p class="mt-1 text-sm italic text-muted-foreground">
                    "{version.change_notes}"
                  </p>
                {/if}
              </div>
              <div class="flex items-center gap-1">
                <Button
                  variant={compareA === version.version_number || compareB === version.version_number ? 'default' : 'outline'}
                  size="sm"
                  onclick={() => toggleCompare(version.version_number)}
                >
                  {#if compareA === version.version_number || compareB === version.version_number}
                    Selected
                  {:else}
                    Compare
                  {/if}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      {/each}

      {#if compareA !== null && compareB === null}
        <div class="rounded-lg border border-dashed border-primary/50 bg-primary/5 px-4 py-3 text-center text-sm text-primary">
          Select a second version to compare
        </div>
      {/if}
    {/if}
  </div>
{/if}
