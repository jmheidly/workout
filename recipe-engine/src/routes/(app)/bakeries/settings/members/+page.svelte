<script>
  import { enhance } from '$app/forms'
  import { page } from '$app/stores'
  import * as Card from '$lib/components/ui/card/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Field, FieldGroup, FieldLabel } from '$lib/components/ui/field/index.js'
  import { Button } from '$lib/components/ui/button/index.js'

  let { data, form } = $props()

  let inviteEmail = $state('')
  let inviteRole = $state('member')
  let loading = $state(false)

  const roleColors = {
    owner: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    member: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    viewer: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  }

  let inviteLink = $derived.by(() => {
    if (form?.inviteToken) {
      return `${$page.url.origin}/invite/${form.inviteToken}`
    }
    return null
  })

  function copyLink() {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink)
    }
  }
</script>

<div class="mx-auto max-w-2xl space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold">Members</h1>
    <Button href="/bakeries/settings" variant="outline" size="sm">Back to Settings</Button>
  </div>

  <Card.Card>
    <Card.CardHeader>
      <Card.CardTitle>Invite a Member</Card.CardTitle>
      <Card.CardDescription>Send an invitation link via email</Card.CardDescription>
    </Card.CardHeader>
    <Card.CardContent>
      {#if form?.error}
        <div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {form.error}
        </div>
      {/if}

      {#if inviteLink}
        <div class="mb-4 rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          <p class="mb-2">Invitation created! Share this link:</p>
          <div class="flex gap-2">
            <input
              type="text"
              readonly
              value={inviteLink}
              class="flex-1 rounded border bg-background px-2 py-1 text-xs"
            />
            <Button size="sm" variant="outline" onclick={copyLink}>Copy</Button>
          </div>
        </div>
      {/if}

      <form
        method="POST"
        action="?/invite"
        use:enhance={() => {
          loading = true
          return async ({ update }) => {
            loading = false
            await update()
          }
        }}
      >
        <div class="flex gap-2">
          <div class="flex-1">
            <Input
              name="email"
              type="email"
              placeholder="email@example.com"
              bind:value={inviteEmail}
              required
            />
          </div>
          <select
            name="role"
            bind:value={inviteRole}
            class="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit" disabled={loading}>
            {loading ? 'Inviting...' : 'Invite'}
          </Button>
        </div>
      </form>
    </Card.CardContent>
  </Card.Card>

  <Card.Card>
    <Card.CardHeader>
      <Card.CardTitle>Current Members</Card.CardTitle>
    </Card.CardHeader>
    <Card.CardContent>
      <div class="space-y-3">
        {#each data.members as member}
          <div class="flex items-center justify-between rounded-lg border p-3">
            <div class="flex items-center gap-3">
              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                {(member.name || member.email || '?')[0].toUpperCase()}
              </div>
              <div>
                {#if member.name}
                  <div class="text-sm font-medium">{member.name}</div>
                {/if}
                <div class="text-sm text-muted-foreground">{member.email}</div>
              </div>
              <span class="rounded-full px-2 py-0.5 text-xs font-medium {roleColors[member.role]}">
                {member.role}
              </span>
            </div>

            {#if member.user_id !== data.user.id}
              <div class="flex gap-1">
                {#if data.bakery.role === 'owner'}
                  <form method="POST" action="?/changeRole" use:enhance>
                    <input type="hidden" name="user_id" value={member.user_id} />
                    <select
                      name="role"
                      onchange={(e) => e.target.form.submit()}
                      class="rounded border bg-background px-2 py-1 text-xs"
                    >
                      <option value="viewer" selected={member.role === 'viewer'}>Viewer</option>
                      <option value="member" selected={member.role === 'member'}>Member</option>
                      <option value="admin" selected={member.role === 'admin'}>Admin</option>
                      <option value="owner" selected={member.role === 'owner'}>Owner</option>
                    </select>
                  </form>
                {/if}
                <form method="POST" action="?/removeMember" use:enhance>
                  <input type="hidden" name="user_id" value={member.user_id} />
                  <Button type="submit" variant="ghost" size="sm" class="h-7 text-destructive hover:text-destructive">
                    Remove
                  </Button>
                </form>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </Card.CardContent>
  </Card.Card>

  {#if data.invitations.length > 0}
    <Card.Card>
      <Card.CardHeader>
        <Card.CardTitle>Pending Invitations</Card.CardTitle>
      </Card.CardHeader>
      <Card.CardContent>
        <div class="space-y-3">
          {#each data.invitations as invitation}
            <div class="rounded-lg border p-3">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm">{invitation.email}</div>
                  <div class="text-xs text-muted-foreground">
                    Role: {invitation.role} &middot; Expires: {new Date(invitation.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <form method="POST" action="?/cancelInvite" use:enhance>
                  <input type="hidden" name="id" value={invitation.id} />
                  <Button type="submit" variant="ghost" size="sm" class="text-destructive">
                    Cancel
                  </Button>
                </form>
              </div>
              <div class="mt-2 flex gap-2">
                <input
                  type="text"
                  readonly
                  value="{$page.url.origin}/invite/{invitation.token}"
                  class="flex-1 rounded border bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onclick={() => navigator.clipboard.writeText(`${$page.url.origin}/invite/${invitation.token}`)}
                >
                  Copy
                </Button>
              </div>
            </div>
          {/each}
        </div>
      </Card.CardContent>
    </Card.Card>
  {/if}
</div>
