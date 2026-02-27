<script>
  import { enhance } from '$app/forms'
  import * as Card from '$lib/components/ui/card/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Field, FieldGroup, FieldLabel } from '$lib/components/ui/field/index.js'
  import { Button } from '$lib/components/ui/button/index.js'

  let { data, form } = $props()
  let profileLoading = $state(false)
  let passwordLoading = $state(false)
  let deleteConfirm = $state(false)
</script>

<div class="mx-auto max-w-2xl space-y-6">
  <h1 class="text-2xl font-bold">Account Settings</h1>

  <!-- Profile Card -->
  <Card.Card>
    <Card.CardHeader>
      <Card.CardTitle>Profile</Card.CardTitle>
      <Card.CardDescription>Update your display name</Card.CardDescription>
    </Card.CardHeader>
    <Card.CardContent>
      {#if form?.profileError}
        <div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {form.profileError}
        </div>
      {/if}
      {#if form?.profileSuccess}
        <div class="mb-4 rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          Profile updated.
        </div>
      {/if}

      <form
        method="POST"
        action="?/updateProfile"
        use:enhance={() => {
          profileLoading = true
          return async ({ update }) => {
            profileLoading = false
            await update({ reset: false })
          }
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel for="profile-name">Name</FieldLabel>
            <Input id="profile-name" name="name" value={data.profile.name} required />
          </Field>
          <Field>
            <FieldLabel for="profile-email">Email</FieldLabel>
            <Input id="profile-email" value={data.profile.email} disabled />
            <p class="text-xs text-muted-foreground">Email cannot be changed at this time.</p>
          </Field>
          <Button type="submit" disabled={profileLoading}>
            {profileLoading ? 'Saving...' : 'Save Profile'}
          </Button>
        </FieldGroup>
      </form>
    </Card.CardContent>
  </Card.Card>

  <!-- Password Card -->
  <Card.Card>
    <Card.CardHeader>
      <Card.CardTitle>Password</Card.CardTitle>
      <Card.CardDescription>
        {#if data.profile.hasPassword}
          Change your password
        {:else}
          Set a password to also log in with email
        {/if}
      </Card.CardDescription>
    </Card.CardHeader>
    <Card.CardContent>
      {#if form?.passwordError}
        <div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {form.passwordError}
        </div>
      {/if}
      {#if form?.passwordSuccess}
        <div class="mb-4 rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          Password updated.
        </div>
      {/if}

      <form
        method="POST"
        action="?/changePassword"
        use:enhance={() => {
          passwordLoading = true
          return async ({ update }) => {
            passwordLoading = false
            await update({ reset: true })
          }
        }}
      >
        <FieldGroup>
          {#if data.profile.hasPassword}
            <Field>
              <FieldLabel for="current-password">Current Password</FieldLabel>
              <Input id="current-password" name="currentPassword" type="password" required />
            </Field>
          {/if}
          <Field>
            <FieldLabel for="new-password">New Password</FieldLabel>
            <Input id="new-password" name="newPassword" type="password" required minlength="6" />
          </Field>
          <Field>
            <FieldLabel for="confirm-password">Confirm Password</FieldLabel>
            <Input id="confirm-password" name="confirmPassword" type="password" required minlength="6" />
          </Field>
          <Button type="submit" disabled={passwordLoading}>
            {passwordLoading ? 'Saving...' : data.profile.hasPassword ? 'Change Password' : 'Set Password'}
          </Button>
        </FieldGroup>
      </form>
    </Card.CardContent>
  </Card.Card>

  <!-- Export Data Card -->
  <Card.Card>
    <Card.CardHeader>
      <Card.CardTitle>Export Data</Card.CardTitle>
      <Card.CardDescription>Download all your bakery's recipes, mixers, and ingredients as JSON</Card.CardDescription>
    </Card.CardHeader>
    <Card.CardContent>
      <Button href="/settings/export" variant="outline" download>
        Export Bakery Data
      </Button>
    </Card.CardContent>
  </Card.Card>

  <!-- Danger Zone -->
  <Card.Card class="border-destructive/50">
    <Card.CardHeader>
      <Card.CardTitle class="text-destructive">Danger Zone</Card.CardTitle>
      <Card.CardDescription>Permanently delete your account</Card.CardDescription>
    </Card.CardHeader>
    <Card.CardContent>
      {#if !deleteConfirm}
        <Button variant="destructive" onclick={() => (deleteConfirm = true)}>
          Delete Account
        </Button>
      {:else}
        <p class="mb-4 text-sm text-destructive">
          This will permanently delete your account and remove you from all bakeries. Bakeries where you are the sole owner will also be deleted. This cannot be undone.
        </p>
        <div class="flex gap-2">
          <form method="POST" action="?/deleteAccount" use:enhance>
            <Button type="submit" variant="destructive">Yes, delete my account</Button>
          </form>
          <Button variant="outline" onclick={() => (deleteConfirm = false)}>Cancel</Button>
        </div>
      {/if}
    </Card.CardContent>
  </Card.Card>
</div>
