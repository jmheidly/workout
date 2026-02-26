<script>
  import { enhance } from '$app/forms'
  import * as Card from '$lib/components/ui/card/index.js'
  import { Button } from '$lib/components/ui/button/index.js'

  let { data } = $props()
  let loading = $state(false)
</script>

<div class="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
  <div class="w-full max-w-sm">
    <Card.Card>
      <Card.CardHeader class="text-center">
        {#if data.status === 'pending'}
          <Card.CardTitle class="text-xl">You're Invited</Card.CardTitle>
          <Card.CardDescription>Join {data.bakeryName}</Card.CardDescription>
        {:else if data.status === 'expired'}
          <Card.CardTitle class="text-xl">Invitation Expired</Card.CardTitle>
        {:else if data.status === 'accepted'}
          <Card.CardTitle class="text-xl">Already Accepted</Card.CardTitle>
        {:else if data.status === 'already_member'}
          <Card.CardTitle class="text-xl">Already a Member</Card.CardTitle>
        {/if}
      </Card.CardHeader>
      <Card.CardContent>
        {#if data.status === 'pending'}
          <div class="space-y-4 text-center">
            <p class="text-sm text-muted-foreground">
              You've been invited to join <strong>{data.bakeryName}</strong> as a <strong>{data.role}</strong>.
            </p>
            <form
              method="POST"
              action="?/accept"
              use:enhance={() => {
                loading = true
                return async ({ update }) => {
                  loading = false
                  await update()
                }
              }}
            >
              <Button type="submit" class="w-full" disabled={loading}>
                {loading ? 'Joining...' : 'Accept Invitation'}
              </Button>
            </form>
          </div>
        {:else if data.status === 'expired'}
          <p class="text-center text-sm text-muted-foreground">
            This invitation has expired. Please ask the bakery admin to send a new one.
          </p>
        {:else if data.status === 'accepted'}
          <p class="text-center text-sm text-muted-foreground">
            This invitation has already been accepted.
          </p>
          <div class="mt-4 text-center">
            <Button href="/recipes">Go to Recipes</Button>
          </div>
        {:else if data.status === 'already_member'}
          <p class="text-center text-sm text-muted-foreground">
            You're already a member of {data.bakeryName}.
          </p>
          <div class="mt-4 text-center">
            <Button href="/recipes">Go to Recipes</Button>
          </div>
        {/if}
      </Card.CardContent>
    </Card.Card>
  </div>
</div>
