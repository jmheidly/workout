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

  let { data, form: formResult } = $props()
  let mode = $state('create')
  let submitting = $state(false)

  const TEMPLATE_TYPES = [
    { value: 'preferment', label: 'Preferment' },
    { value: 'intermediate_dough', label: 'Intermediate Dough' },
    { value: 'filling', label: 'Filling' },
    { value: 'glaze', label: 'Glaze' },
    { value: 'garnish', label: 'Garnish' },
    { value: 'other', label: 'Other' },
  ]
</script>

<div class="mx-auto max-w-xl">
  <!-- Mode toggle -->
  <div class="mb-6 flex gap-2">
    <Button
      variant={mode === 'create' ? 'secondary' : 'ghost'}
      size="sm"
      onclick={() => (mode = 'create')}
    >
      Create new
    </Button>
    <Button
      variant={mode === 'promote' ? 'secondary' : 'ghost'}
      size="sm"
      onclick={() => (mode = 'promote')}
    >
      Promote existing recipe
    </Button>
  </div>

  {#if formResult?.error}
    <div class="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {formResult.error}
    </div>
  {/if}

  {#if mode === 'create'}
    <Card>
      <CardHeader>
        <CardTitle>New Template</CardTitle>
        <CardDescription>
          Create a new formula template. A backing recipe will be created that you can edit in the recipe builder.
        </CardDescription>
      </CardHeader>
      <form
        method="POST"
        action="?/create"
        use:enhance={() => {
          submitting = true
          return async ({ result, update }) => {
            submitting = false
            if (result.type === 'failure') {
              await update()
            }
          }
        }}
      >
        <CardContent class="space-y-4">
          <div>
            <label for="name" class="mb-1.5 block text-sm font-medium">Name</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="e.g. Italian Levain, Pastry Cream"
              value={formResult?.name || ''}
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
            />
          </div>
          <div>
            <label for="template_type" class="mb-1.5 block text-sm font-medium">Type</label>
            <select
              id="template_type"
              name="template_type"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            >
              {#each TEMPLATE_TYPES as t}
                <option value={t.value} selected={formResult?.template_type === t.value}>{t.label}</option>
              {/each}
            </select>
          </div>
        </CardContent>
        <CardFooter class="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" href="/templates">Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create & Edit Formula'}
          </Button>
        </CardFooter>
      </form>
    </Card>

  {:else}
    <Card>
      <CardHeader>
        <CardTitle>Promote Existing Recipe</CardTitle>
        <CardDescription>
          Turn an existing recipe into a reusable template. The recipe stays as-is and becomes the template's backing formula.
        </CardDescription>
      </CardHeader>
      <form
        method="POST"
        action="?/promote"
        use:enhance={() => {
          submitting = true
          return async ({ result, update }) => {
            submitting = false
            if (result.type === 'failure') {
              await update()
            } else if (result.type === 'success') {
              toast.success('Recipe promoted to template')
            }
          }
        }}
      >
        <CardContent class="space-y-4">
          <div>
            <label for="recipe_id" class="mb-1.5 block text-sm font-medium">Recipe</label>
            <select
              id="recipe_id"
              name="recipe_id"
              required
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            >
              <option value="">Select a recipe...</option>
              {#each data.recipes as r}
                <option value={r.id}>{r.name}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="promote_type" class="mb-1.5 block text-sm font-medium">Template Type</label>
            <select
              id="promote_type"
              name="template_type"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            >
              {#each TEMPLATE_TYPES as t}
                <option value={t.value} selected={formResult?.template_type === t.value}>{t.label}</option>
              {/each}
            </select>
          </div>
        </CardContent>
        <CardFooter class="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" href="/templates">Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Promoting...' : 'Promote to Template'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  {/if}
</div>
