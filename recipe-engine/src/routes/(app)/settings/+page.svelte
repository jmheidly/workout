<script>
  import { enhance } from '$app/forms'
  import { invalidateAll } from '$app/navigation'
  import { startRegistration } from '@simplewebauthn/browser'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Field, FieldGroup, FieldLabel } from '$lib/components/ui/field/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Separator } from '$lib/components/ui/separator/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'

  let { data, form } = $props()
  let profileLoading = $state(false)
  let passwordLoading = $state(false)
  let deleteConfirm = $state(false)
  let mfaLoading = $state(false)
  let mfaError = $state('')
  let mfaMessage = $state('')
  let removingKeyId = $state(null)

  async function addSecurityKey() {
    mfaLoading = true
    mfaError = ''
    mfaMessage = ''

    try {
      const optionsRes = await fetch('/api/mfa/webauthn/enroll/options', {
        method: 'POST',
      })
      if (!optionsRes.ok) {
        const err = await optionsRes.json()
        mfaError = err.error || 'Failed to get registration options'
        return
      }

      const { challengeId, options } = await optionsRes.json()
      const registrationResponse = await startRegistration({ optionsJSON: options })

      const verifyRes = await fetch('/api/mfa/webauthn/enroll/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, registrationResponse }),
      })

      if (!verifyRes.ok) {
        const err = await verifyRes.json()
        mfaError = err.error || 'Registration failed'
        return
      }

      mfaMessage = 'Security key added successfully.'
      await invalidateAll()
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        mfaError = 'Registration was cancelled.'
      } else {
        mfaError = 'An unexpected error occurred.'
      }
    } finally {
      mfaLoading = false
    }
  }

  async function removeKey(keyId) {
    removingKeyId = keyId
    mfaError = ''
    mfaMessage = ''

    try {
      const res = await fetch(`/api/mfa/webauthn/credentials/${keyId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        mfaError = err.error || 'Failed to remove key'
        return
      }
      mfaMessage = 'Security key removed.'
      await invalidateAll()
    } catch {
      mfaError = 'Failed to remove key.'
    } finally {
      removingKeyId = null
    }
  }

  function formatDate(ms) {
    if (!ms) return 'Never'
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }
</script>

<div class="mx-auto max-w-3xl space-y-8">
  <!-- Page Header -->
  <div>
    <h1 class="text-2xl font-bold tracking-tight">Settings</h1>
    <p class="text-muted-foreground">Manage your account settings and security preferences.</p>
  </div>

  <Separator />

  <!-- Profile Section -->
  <section class="grid gap-8 md:grid-cols-[220px_1fr]">
    <div>
      <h2 class="text-sm font-medium">Profile</h2>
      <p class="text-xs text-muted-foreground">This is how others see you in your bakery.</p>
    </div>

    <div class="space-y-4">
      {#if form?.profileError}
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {form.profileError}
        </div>
      {/if}
      {#if form?.profileSuccess}
        <div class="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
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
            <FieldLabel for="profile-name">Display name</FieldLabel>
            <Input id="profile-name" name="name" value={data.profile.name} required />
            <p class="text-xs text-muted-foreground">Visible to other bakery members.</p>
          </Field>
          <Field>
            <FieldLabel for="profile-email">Email</FieldLabel>
            <Input id="profile-email" value={data.profile.email} disabled />
            <p class="text-xs text-muted-foreground">Used for login. Cannot be changed.</p>
          </Field>
          <div>
            <Button type="submit" disabled={profileLoading}>
              {profileLoading ? 'Saving...' : 'Update profile'}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </div>
  </section>

  <Separator />

  <!-- Password Section -->
  <section class="grid gap-8 md:grid-cols-[220px_1fr]">
    <div>
      <h2 class="text-sm font-medium">Password</h2>
      <p class="text-xs text-muted-foreground">
        {#if data.profile.hasPassword}
          Update your password.
        {:else}
          Set a password for email login.
        {/if}
      </p>
    </div>

    <div class="space-y-4">
      {#if form?.passwordError}
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {form.passwordError}
        </div>
      {/if}
      {#if form?.passwordSuccess}
        <div class="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
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
              <FieldLabel for="current-password">Current password</FieldLabel>
              <Input id="current-password" name="currentPassword" type="password" required />
            </Field>
          {/if}
          <Field>
            <FieldLabel for="new-password">New password</FieldLabel>
            <Input id="new-password" name="newPassword" type="password" required minlength="6" />
          </Field>
          <Field>
            <FieldLabel for="confirm-password">Confirm password</FieldLabel>
            <Input id="confirm-password" name="confirmPassword" type="password" required minlength="6" />
          </Field>
          <div>
            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading ? 'Saving...' : data.profile.hasPassword ? 'Update password' : 'Set password'}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </div>
  </section>

  <Separator />

  <!-- Two-Factor Authentication Section -->
  <section class="grid gap-8 md:grid-cols-[220px_1fr]">
    <div>
      <h2 class="text-sm font-medium">Two-factor authentication</h2>
      <p class="text-xs text-muted-foreground">Hardware key or biometric verification on login.</p>
      {#if data.mfaEnabled}
        <Badge class="mt-2">Enabled</Badge>
      {:else}
        <Badge variant="outline" class="mt-2">Disabled</Badge>
      {/if}
    </div>

    <div class="space-y-4">
      {#if mfaError}
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {mfaError}
        </div>
      {/if}
      {#if mfaMessage}
        <div class="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          {mfaMessage}
        </div>
      {/if}
      {#if form?.mfaError}
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {form.mfaError}
        </div>
      {/if}
      {#if form?.mfaSuccess}
        <div class="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          {form.mfaSuccess}
        </div>
      {/if}

      {#if data.mfaKeys.length > 0}
        <div class="rounded-lg border">
          {#each data.mfaKeys as key, i (key.id)}
            {#if i > 0}
              <Separator />
            {/if}
            <div class="flex items-center justify-between px-4 py-3">
              <div class="flex items-center gap-3">
                <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>
                </div>
                <div>
                  <p class="text-sm font-medium">Security Key</p>
                  <p class="text-xs text-muted-foreground">
                    Added {formatDate(key.createdAt)} &middot; Last used {formatDate(key.lastUsedAt)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={removingKeyId === key.id}
                onclick={() => removeKey(key.id)}
              >
                {removingKeyId === key.id ? 'Removing...' : 'Remove'}
              </Button>
            </div>
          {/each}
        </div>
      {:else}
        <div class="rounded-lg border border-dashed px-4 py-8 text-center">
          <div class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>
          </div>
          <p class="text-sm font-medium">No security keys</p>
          <p class="text-xs text-muted-foreground">Add a security key to enable two-factor authentication.</p>
        </div>
      {/if}

      <div class="flex gap-3">
        <Button onclick={addSecurityKey} disabled={mfaLoading} variant="outline">
          {mfaLoading ? 'Registering...' : 'Add security key'}
        </Button>
        {#if data.mfaKeys.length > 0}
          <form
            method="POST"
            action="?/toggleMfa"
            use:enhance={() => {
              return async ({ update }) => {
                await update({ reset: false })
              }
            }}
          >
            <Button type="submit" variant={data.mfaEnabled ? 'ghost' : 'default'}>
              {data.mfaEnabled ? 'Disable 2FA' : 'Enable 2FA'}
            </Button>
          </form>
        {/if}
      </div>
    </div>
  </section>

  <Separator />

  <!-- Export Data Section -->
  <section class="grid gap-8 md:grid-cols-[220px_1fr]">
    <div>
      <h2 class="text-sm font-medium">Export data</h2>
      <p class="text-xs text-muted-foreground">Download your bakery data as JSON.</p>
    </div>
    <div>
      <Button href="/settings/export" variant="outline" download>
        Export bakery data
      </Button>
    </div>
  </section>

  <Separator />

  <!-- Danger Zone -->
  <section class="grid gap-8 pb-8 md:grid-cols-[220px_1fr]">
    <div>
      <h2 class="text-sm font-medium text-destructive">Danger zone</h2>
      <p class="text-xs text-muted-foreground">Irreversible actions.</p>
    </div>

    <div class="rounded-lg border border-destructive/30 px-4 py-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">Delete account</p>
          <p class="text-xs text-muted-foreground">Permanently remove your account and all data.</p>
        </div>
        {#if !deleteConfirm}
          <Button variant="destructive" size="sm" onclick={() => (deleteConfirm = true)}>
            Delete account
          </Button>
        {/if}
      </div>
      {#if deleteConfirm}
        <div class="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <p class="mb-3 text-sm text-destructive">
            This will permanently delete your account and remove you from all bakeries. Bakeries where you are the sole owner will also be deleted. This cannot be undone.
          </p>
          <div class="flex gap-2">
            <form method="POST" action="?/deleteAccount" use:enhance>
              <Button type="submit" variant="destructive" size="sm">Yes, delete my account</Button>
            </form>
            <Button variant="outline" size="sm" onclick={() => (deleteConfirm = false)}>Cancel</Button>
          </div>
        </div>
      {/if}
    </div>
  </section>
</div>
