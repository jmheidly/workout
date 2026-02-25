<script>
  import { enhance } from '$app/forms'
  import { toast } from 'svelte-sonner'
  import {
    MIX_TYPES,
    MIX_TYPE_NAMES,
    MIXER_TYPES,
    MIXER_TYPE_DEFAULTS,
    calcMixDurations,
    effectiveFriction,
  } from '$lib/mixing.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
  } from '$lib/components/ui/card/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import {
    SelectRoot,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from '$lib/components/ui/select/index.js'

  // Calibration mix types (Short Mix uses Improved's calibration, not its own)
  const CAL_MIX_TYPES = ['Improved Mix', 'Intensive Mix', 'Short Improved']

  let { data } = $props()

  // ── State ──────────────────────────────────────────────

  let editing = $state(null) // mixer profile id or 'new'
  let formData = $state(makeBlank())

  function makeBlank() {
    const defaults = MIXER_TYPE_DEFAULTS['SPIRAL']
    return {
      name: '',
      type: 'SPIRAL',
      friction_factor: defaults.friction,
      first_speed_rpm: defaults.first_speed_rpm,
      second_speed_rpm: defaults.second_speed_rpm,
      calibrations: CAL_MIX_TYPES.map((mt) => ({
        mix_type: mt,
        first_speed_rounds: defaults.cal[mt] || 0,
      })),
    }
  }

  function startCreate() {
    editing = 'new'
    formData = makeBlank()
  }

  function startEdit(profile) {
    editing = profile.id
    formData = {
      name: profile.name,
      type: profile.type,
      friction_factor: profile.friction_factor,
      first_speed_rpm: profile.first_speed_rpm,
      second_speed_rpm: profile.second_speed_rpm,
      calibrations: CAL_MIX_TYPES.map((mt) => {
        const existing = profile.calibrations.find((c) => c.mix_type === mt)
        return {
          mix_type: mt,
          first_speed_rounds: existing?.first_speed_rounds || 0,
        }
      }),
    }
  }

  function cancelEdit() {
    editing = null
  }

  function onTypeChange(newType) {
    formData.type = newType
    const defaults = MIXER_TYPE_DEFAULTS[newType]
    if (defaults) {
      formData.friction_factor = defaults.friction
      formData.first_speed_rpm = defaults.first_speed_rpm
      formData.second_speed_rpm = defaults.second_speed_rpm
      formData.calibrations = CAL_MIX_TYPES.map((mt) => ({
        mix_type: mt,
        first_speed_rounds: defaults.cal[mt] || 0,
      }))
    }
  }

  let confirmDelete = $state(null)
</script>

<div class="sticky top-14 z-10 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
  <div class="flex items-center gap-3">
    <h1 class="text-lg font-semibold">Mixer Profiles</h1>
    <div class="flex-1"></div>
    {#if editing !== 'new'}
      <Button variant="outline" size="sm" onclick={startCreate}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        New Mixer
      </Button>
    {/if}
  </div>
</div>

<div class="space-y-4">

  <!-- ── Create / Edit Form ──────────────────────────── -->

  {#if editing}
    <Card class="border-primary/30">
      <CardHeader class="pb-4">
        <CardTitle>{editing === 'new' ? 'New Mixer Profile' : `Edit: ${formData.name}`}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          method="POST"
          action={editing === 'new' ? '?/create' : '?/update'}
          use:enhance={() => {
            return async ({ result, update }) => {
              if (result.type === 'success') {
                toast.success(editing === 'new' ? 'Mixer created' : 'Mixer updated')
                editing = null
              } else {
                toast.error('Failed to save mixer')
              }
              await update({ reset: false })
            }
          }}
        >
          {#if editing !== 'new'}
            <input type="hidden" name="id" value={editing} />
          {/if}
          <input type="hidden" name="data" value={JSON.stringify(formData)} />

          <div class="space-y-4">
            <!-- Name + Type -->
            <div class="flex flex-wrap items-start gap-4">
              <div class="min-w-48 flex-1">
                <label for="mixer-name" class="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
                <input
                  id="mixer-name"
                  type="text"
                  bind:value={formData.name}
                  placeholder="e.g. Caplain Spiral"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
                />
              </div>
              <div class="w-40">
                <span class="mb-1.5 block text-xs font-medium text-muted-foreground">Type</span>
                <SelectRoot
                  type="single"
                  value={formData.type}
                  onValueChange={(v) => onTypeChange(v)}
                  items={MIXER_TYPES.map((t) => ({ value: t, label: t }))}
                >
                  <SelectTrigger>
                    <span>{formData.type}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {#each MIXER_TYPES as t}
                      <SelectItem value={t} label={t} />
                    {/each}
                  </SelectContent>
                </SelectRoot>
              </div>
            </div>

            <!-- Friction + RPMs -->
            <div class="flex flex-wrap items-start gap-4">
              <div class="w-32">
                <label for="friction" class="mb-1.5 block text-xs font-medium text-muted-foreground">Friction Factor (&deg;C)</label>
                <input
                  id="friction"
                  type="number"
                  step="0.5"
                  min="0"
                  bind:value={formData.friction_factor}
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
                />
              </div>
              <div class="w-32">
                <label for="rpm1" class="mb-1.5 block text-xs font-medium text-muted-foreground">1st Speed RPM</label>
                <input
                  id="rpm1"
                  type="number"
                  step="1"
                  min="0"
                  bind:value={formData.first_speed_rpm}
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
                />
              </div>
              <div class="w-32">
                <label for="rpm2" class="mb-1.5 block text-xs font-medium text-muted-foreground">2nd Speed RPM</label>
                <input
                  id="rpm2"
                  type="number"
                  step="1"
                  min="0"
                  bind:value={formData.second_speed_rpm}
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
                />
              </div>
            </div>

            <!-- Calibrations -->
            {#if formData.type !== 'HAND'}
              <div>
                <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Calibrations (1st speed rounds)
                </h4>
                <div class="flex flex-wrap items-start gap-4">
                  {#each formData.calibrations as cal, idx}
                    <div class="w-40">
                      <label class="mb-1.5 block text-xs font-medium text-muted-foreground">{cal.mix_type}</label>
                      <input
                        type="number"
                        step="5"
                        min="0"
                        bind:value={formData.calibrations[idx].first_speed_rounds}
                        class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
                      />
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Actions -->
            <div class="flex items-center gap-2 pt-2">
              <Button type="submit" size="sm">
                {editing === 'new' ? 'Create' : 'Save'}
              </Button>
              <Button variant="ghost" size="sm" onclick={cancelEdit}>Cancel</Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  {/if}

  <!-- ── Existing Profiles ───────────────────────────── -->

  {#if data.mixerProfiles.length === 0 && !editing}
    <Card>
      <CardContent class="py-12 text-center text-muted-foreground">
        <p>No mixer profiles yet.</p>
        <p class="mt-1 text-sm">Create one to enable computed friction and mixing timers in your recipes.</p>
      </CardContent>
    </Card>
  {/if}

  {#each data.mixerProfiles as profile (profile.id)}
    {@const isEditing = editing === profile.id}
    {#if !isEditing}
      <Card>
        <CardHeader class="pb-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <CardTitle class="text-base">{profile.name}</CardTitle>
              <Badge variant="secondary" class="font-normal">{profile.type}</Badge>
            </div>
            <div class="flex items-center gap-1">
              <Button variant="ghost" size="sm" onclick={() => startEdit(profile)}>Edit</Button>
              {#if confirmDelete === profile.id}
                <form
                  method="POST"
                  action="?/delete"
                  use:enhance={() => {
                    return async ({ result, update }) => {
                      if (result.type === 'success') {
                        toast.success('Mixer deleted')
                        confirmDelete = null
                      }
                      await update({ reset: false })
                    }
                  }}
                >
                  <input type="hidden" name="id" value={profile.id} />
                  <Button type="submit" variant="destructive" size="sm">Confirm</Button>
                </form>
                <Button variant="ghost" size="sm" onclick={() => (confirmDelete = null)}>Cancel</Button>
              {:else}
                <Button variant="ghost" size="sm" class="text-destructive" onclick={() => (confirmDelete = profile.id)}>Delete</Button>
              {/if}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div class="flex flex-wrap gap-4 text-sm">
            <div>
              <span class="text-xs text-muted-foreground">Friction</span>
              <div class="font-medium tabular-nums">{profile.friction_factor}&deg;C</div>
            </div>
            <div>
              <span class="text-xs text-muted-foreground">1st RPM</span>
              <div class="font-medium tabular-nums">{profile.first_speed_rpm}</div>
            </div>
            <div>
              <span class="text-xs text-muted-foreground">2nd RPM</span>
              <div class="font-medium tabular-nums">{profile.second_speed_rpm}</div>
            </div>
          </div>

          {#if profile.calibrations.length > 0}
            <div class="mt-3 flex flex-wrap gap-2">
              {#each profile.calibrations as cal}
                <Badge variant="outline" class="font-normal tabular-nums">
                  {cal.mix_type}: {cal.first_speed_rounds} rounds
                </Badge>
              {/each}
            </div>
          {/if}

          <!-- Computed durations preview -->
          {#if profile.type !== 'HAND'}
            <div class="mt-3 rounded-lg border border-border bg-muted/30 p-3">
              <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Computed Durations</h4>
              <div class="flex flex-wrap gap-4 text-xs">
                {#each MIX_TYPE_NAMES as mt}
                  {@const dur = calcMixDurations(profile, mt)}
                  {@const ef = effectiveFriction(profile.friction_factor, mt)}
                  <div class="rounded-md bg-background px-2.5 py-1.5">
                    <div class="font-medium">{mt}</div>
                    <div class="tabular-nums text-muted-foreground">
                      {#if mt === 'Short Mix'}
                        1st: {dur.first_speed_min.toFixed(1)}m
                      {:else}
                        1st: {dur.first_speed_min.toFixed(1)}m, 2nd: {dur.second_speed_min.toFixed(1)}m
                      {/if}
                      <span class="ml-1">({(dur.first_speed_min + dur.second_speed_min).toFixed(1)}m total)</span>
                    </div>
                    <div class="tabular-nums text-muted-foreground">Friction: {ef.toFixed(1)}&deg;C</div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </CardContent>
      </Card>
    {/if}
  {/each}
</div>
