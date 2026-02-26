<script>
  import { enhance } from '$app/forms'
  import * as Card from '$lib/components/ui/card/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Field, FieldGroup, FieldLabel } from '$lib/components/ui/field/index.js'
  import { Button } from '$lib/components/ui/button/index.js'

  let { form } = $props()
  let loading = $state(false)
  let name = $state(form?.name ?? '')
  let slug = $state(form?.slug ?? '')
  let slugEdited = $state(false)

  function generateSlug(value) {
    return value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  }

  function onNameInput(e) {
    name = e.target.value
    if (!slugEdited) {
      slug = generateSlug(name)
    }
  }

  function onSlugInput(e) {
    slug = e.target.value
    slugEdited = true
  }
</script>

<div class="flex flex-col gap-6">
  <Card.Card>
    <Card.CardHeader class="text-center">
      <Card.CardTitle class="text-xl">Create a Bakery</Card.CardTitle>
      <Card.CardDescription>Set up your bakery workspace</Card.CardDescription>
    </Card.CardHeader>
    <Card.CardContent>
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
        <FieldGroup>
          <Field>
            <FieldLabel for="bakery-name">Bakery Name</FieldLabel>
            <Input
              id="bakery-name"
              name="name"
              type="text"
              value={name}
              oninput={onNameInput}
              required
              placeholder="My Bakery"
            />
          </Field>
          <Field>
            <FieldLabel for="bakery-slug">Slug</FieldLabel>
            <Input
              id="bakery-slug"
              name="slug"
              type="text"
              value={slug}
              oninput={onSlugInput}
              required
              placeholder="my-bakery"
            />
            <p class="text-xs text-muted-foreground">URL-friendly identifier. Auto-generated from name.</p>
          </Field>
          <Button type="submit" class="w-full" disabled={loading}>
            {loading ? 'Creating...' : 'Create Bakery'}
          </Button>
        </FieldGroup>
      </form>

      <div class="mt-4 text-center text-sm">
        <a href="/bakeries" class="underline underline-offset-4">Back to bakery list</a>
      </div>
    </Card.CardContent>
  </Card.Card>
</div>
