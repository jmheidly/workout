<script>
  import { enhance } from '$app/forms'
  import * as Card from '$lib/components/ui/card/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Field, FieldGroup, FieldLabel } from '$lib/components/ui/field/index.js'
  import { Button } from '$lib/components/ui/button/index.js'

  let { data, form } = $props()
  let loading = $state(false)
  let settingsLoading = $state(false)
  let deleteConfirm = $state(false)
</script>

<div class="mx-auto max-w-2xl space-y-6">
  <h1 class="text-2xl font-bold">Bakery Settings</h1>

  <Card.Card>
    <Card.CardHeader>
      <Card.CardTitle>General</Card.CardTitle>
      <Card.CardDescription>Update your bakery's name and slug</Card.CardDescription>
    </Card.CardHeader>
    <Card.CardContent>
      {#if form?.error}
        <div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {form.error}
        </div>
      {/if}
      {#if form?.success}
        <div class="mb-4 rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          Settings updated.
        </div>
      {/if}

      <form
        method="POST"
        action="?/update"
        use:enhance={() => {
          loading = true
          return async ({ update }) => {
            loading = false
            await update({ reset: false })
          }
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel for="bakery-name">Bakery Name</FieldLabel>
            <Input id="bakery-name" name="name" value={data.bakeryDetails.name} required />
          </Field>
          <Field>
            <FieldLabel for="bakery-slug">Slug</FieldLabel>
            <Input id="bakery-slug" name="slug" value={data.bakeryDetails.slug} required />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </FieldGroup>
      </form>
    </Card.CardContent>
  </Card.Card>

  <Card.Card>
    <Card.CardHeader>
      <Card.CardTitle>Members</Card.CardTitle>
      <Card.CardDescription>Manage team members and invitations</Card.CardDescription>
    </Card.CardHeader>
    <Card.CardContent>
      <Button href="/bakeries/settings/members" variant="outline">Manage Members</Button>
    </Card.CardContent>
  </Card.Card>

  <Card.Card>
    <Card.CardHeader>
      <Card.CardTitle>Production Settings</Card.CardTitle>
      <Card.CardDescription>Configure production tracking defaults</Card.CardDescription>
    </Card.CardHeader>
    <Card.CardContent>
      {#if form?.settingsError}
        <div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {form.settingsError}
        </div>
      {/if}
      {#if form?.settingsSuccess}
        <div class="mb-4 rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          Production settings updated.
        </div>
      {/if}

      <form
        method="POST"
        action="?/updateSettings"
        use:enhance={() => {
          settingsLoading = true
          return async ({ update }) => {
            settingsLoading = false
            await update({ reset: false })
          }
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel for="rolling-window">Rolling Average Window</FieldLabel>
            <Input
              id="rolling-window"
              name="rolling_average_window"
              type="number"
              min="1"
              max="100"
              value={data.bakerySettings?.rolling_average_window || 10}
            />
            <p class="mt-1 text-xs text-muted-foreground">
              Number of recent sessions used to compute rolling loss averages (1-100).
            </p>
          </Field>
          <Button type="submit" disabled={settingsLoading}>
            {settingsLoading ? 'Saving...' : 'Save Settings'}
          </Button>
        </FieldGroup>
      </form>
    </Card.CardContent>
  </Card.Card>

  {#if data.bakery.role === 'owner'}
    <Card.Card class="border-destructive/50">
      <Card.CardHeader>
        <Card.CardTitle class="text-destructive">Danger Zone</Card.CardTitle>
        <Card.CardDescription>Permanently delete this bakery and all its data</Card.CardDescription>
      </Card.CardHeader>
      <Card.CardContent>
        {#if !deleteConfirm}
          <Button variant="destructive" onclick={() => (deleteConfirm = true)}>
            Delete Bakery
          </Button>
        {:else}
          <p class="mb-4 text-sm text-destructive">
            This will permanently delete the bakery, all recipes, mixers, and ingredient data. This cannot be undone.
          </p>
          <div class="flex gap-2">
            <form method="POST" action="?/delete" use:enhance>
              <Button type="submit" variant="destructive">Yes, delete permanently</Button>
            </form>
            <Button variant="outline" onclick={() => (deleteConfirm = false)}>Cancel</Button>
          </div>
        {/if}
      </Card.CardContent>
    </Card.Card>
  {/if}
</div>
