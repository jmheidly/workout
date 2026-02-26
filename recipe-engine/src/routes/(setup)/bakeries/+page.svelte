<script>
  import { enhance } from '$app/forms'
  import * as Card from '$lib/components/ui/card/index.js'
  import { Button } from '$lib/components/ui/button/index.js'

  let { data } = $props()
</script>

<div class="flex flex-col gap-6">
  <Card.Card>
    <Card.CardHeader class="text-center">
      <Card.CardTitle class="text-xl">Select a Bakery</Card.CardTitle>
      <Card.CardDescription>Choose which bakery to work in</Card.CardDescription>
    </Card.CardHeader>
    <Card.CardContent>
      <div class="grid gap-3">
        {#if data.bakeries.length === 0}
          <p class="text-center text-sm text-muted-foreground">
            You don't belong to any bakeries yet.
          </p>
        {:else}
          {#each data.bakeries as bakery}
            <form method="POST" action="?/switch" use:enhance>
              <input type="hidden" name="bakery_id" value={bakery.id} />
              <button
                type="submit"
                class="flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors hover:bg-accent"
              >
                <div>
                  <div class="font-medium">{bakery.name}</div>
                  <div class="text-sm text-muted-foreground">{bakery.role}</div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            </form>
          {/each}
        {/if}
      </div>

      <div class="mt-6">
        <Button href="/bakeries/new" class="w-full">Create New Bakery</Button>
      </div>
    </Card.CardContent>
  </Card.Card>
</div>
