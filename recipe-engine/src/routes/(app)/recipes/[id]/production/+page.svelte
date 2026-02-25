<script>
  import { formatGrams } from '$lib/utils.js'
  import { calcWaterTemp } from '$lib/water-temp.js'
  import {
    FERMENTATION_DEFAULTS,
    getEffectiveFermentationDuration,
    getEffectiveDdt,
    formatDuration,
  } from '$lib/preferment-defaults.js'
  import { MIX_TYPES, effectiveFriction, calcMixDurations } from '$lib/mixing.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
  } from '$lib/components/ui/card/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'

  let { data } = $props()

  // ── Environment Inputs ─────────────────────────────────

  let roomTemp = $state(22)
  let flourTemp = $state(20)

  // Compute default friction from mixer profile if available
  const mixerProfile = data.mixerProfile
  const mixType = data.recipe.mix_type || 'Improved Mix'
  const computedFriction = mixerProfile
    ? effectiveFriction(mixerProfile.friction_factor, mixType)
    : null

  let frictionFactor = $state(computedFriction ?? 12)

  // Default: tomorrow 6 AM
  function defaultMixTime() {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(6, 0, 0, 0)
    return d.toISOString().slice(0, 16)
  }

  let targetMixTime = $state(defaultMixTime())

  // ── Mixing Timer ─────────────────────────────────────────

  let mixingDurations = $derived.by(() => {
    if (!mixerProfile) return null
    return calcMixDurations(mixerProfile, mixType)
  })

  // ── Enabled Preferments ────────────────────────────────

  let enabledPfs = $derived(
    (data.recipe.ingredients || []).filter(
      (i) => i.category === 'PREFERMENT' && i.preferment_settings?.enabled
    )
  )

  // ── Per-PF Derived Calculations ────────────────────────

  let pfCards = $derived.by(() => {
    const mixDate = new Date(targetMixTime)
    const now = new Date()

    return enabledPfs.map((pf) => {
      const settings = pf.preferment_settings || { type: 'CUSTOM' }
      const pfDdt = getEffectiveDdt(settings, data.recipe.ddt)
      const ddtInherited = settings.ddt == null
      const fermentMin = getEffectiveFermentationDuration(settings)

      // 2-factor water temp (PFs are hand-mixed, no friction)
      const waterTemp = (pfDdt * 2) - flourTemp - roomTemp
      let waterWarning = null
      if (waterTemp < 1) waterWarning = 'Use ice water. Target unachievable with liquid water alone.'
      else if (waterTemp > 43) waterWarning = 'Water too hot — will kill yeast above 43°C.'

      // Timeline
      const readyBy = new Date(mixDate)
      const startTime = new Date(mixDate.getTime() - fermentMin * 60 * 1000)
      const startInPast = startTime < now

      // Breakdown from calculated data
      const calcPf = data.calculated?.preferments?.find((p) => p.id === pf.id)
      const breakdown = calcPf?.breakdown || {}

      return {
        id: pf.id,
        name: pf.name,
        type: settings.type,
        ddt: pfDdt,
        ddtInherited,
        waterTemp,
        waterWarning,
        fermentMin,
        startTime,
        readyBy,
        startInPast,
        breakdown,
      }
    })
  })

  // ── Final Dough Derived Calculations ───────────────────

  let finalDough = $derived.by(() => {
    const recipeDdt = data.recipe.ddt
    const hasAutolyse = !!data.recipe.autolyse
    const autolyseDur = data.recipe.autolyse_duration_min || 20

    const result = calcWaterTemp({
      ddt: recipeDdt,
      flour_temp: flourTemp,
      room_temp: roomTemp,
      friction_factor: frictionFactor,
      has_autolyse: hasAutolyse,
      autolyse_duration_min: autolyseDur,
    })

    return {
      ddt: recipeDdt,
      waterTemp: result.water_temp,
      method: result.method,
      warning: result.warning,
      hasAutolyse,
      autolyseDur,
    }
  })

  // ── Helpers ────────────────────────────────────────────

  function formatTime(date) {
    return date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function formatMin(min) {
    if (min < 1) return `${(min * 60).toFixed(0)}s`
    return `${min.toFixed(1)} min`
  }
</script>

<div class="sticky top-14 z-10 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
  <div class="flex items-center gap-3">
    <Button variant="ghost" size="sm" href="/recipes/{data.recipe.id}" class="gap-1.5 text-muted-foreground">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
      Recipe
    </Button>
    <h1 class="text-lg font-semibold">{data.recipe.name} — Production</h1>
    {#if mixerProfile}
      <Badge variant="secondary" class="font-normal">{mixerProfile.name}</Badge>
      <Badge variant="outline" class="font-normal">{mixType}</Badge>
    {/if}
  </div>
</div>

<div class="space-y-6">

  <!-- ── Environment Card ──────────────────────────────── -->

  <Card>
    <CardHeader class="pb-4">
      <CardTitle class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>
        Environment
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div class="flex flex-wrap items-start gap-4">
        <div class="w-28">
          <label for="room-temp" class="mb-1.5 block h-4 text-xs font-medium text-muted-foreground">Room Temp (&deg;C)</label>
          <input
            id="room-temp"
            type="number"
            step="0.5"
            bind:value={roomTemp}
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
          />
        </div>
        <div class="w-28">
          <label for="flour-temp" class="mb-1.5 block h-4 text-xs font-medium text-muted-foreground">Flour Temp (&deg;C)</label>
          <input
            id="flour-temp"
            type="number"
            step="0.5"
            bind:value={flourTemp}
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
          />
        </div>
        <div class="w-28">
          <label for="friction" class="mb-1.5 block h-4 text-xs font-medium text-muted-foreground">Friction (&deg;C)</label>
          <input
            id="friction"
            type="number"
            step="0.5"
            bind:value={frictionFactor}
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
          />
          {#if computedFriction != null}
            <span class="mt-1 block text-[10px] text-muted-foreground">
              Computed: {computedFriction.toFixed(1)}&deg;C ({mixerProfile.name})
            </span>
          {:else}
            <span class="mt-1 block text-[10px] text-muted-foreground">Manual — no mixer assigned</span>
          {/if}
        </div>
        <div class="w-52">
          <label for="mix-time" class="mb-1.5 block h-4 text-xs font-medium text-muted-foreground">Target Mix Time</label>
          <input
            id="mix-time"
            type="datetime-local"
            bind:value={targetMixTime}
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
          />
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- ── Per-Preferment Cards ──────────────────────────── -->

  {#each pfCards as pf (pf.id)}
    <Card class="border-indigo-200">
      <CardHeader class="pb-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <CardTitle>{pf.name}</CardTitle>
            <Badge variant="secondary" class="bg-indigo-50 text-indigo-700 font-normal">{pf.type}</Badge>
            <span class="text-xs text-muted-foreground tabular-nums">
              DDT {pf.ddt}&deg;C{pf.ddtInherited ? ' (recipe)' : ''}
            </span>
          </div>
          <div class="flex items-center gap-3">
            <Badge variant="secondary" class="font-normal tabular-nums">
              Ferment {formatDuration(pf.fermentMin)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- Water Temp -->
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>
            <span class="text-sm font-medium">Water Temp</span>
            <span class="text-lg font-bold tabular-nums">{pf.waterTemp.toFixed(1)}&deg;C</span>
            <span class="text-[10px] text-muted-foreground">2-factor (hand-mix)</span>
          </div>
          {#if pf.waterWarning}
            <Badge variant="secondary" class="border-amber-300 bg-amber-50 text-amber-700 font-normal">
              {pf.waterWarning}
            </Badge>
          {/if}
        </div>

        <!-- Timeline -->
        <div class="rounded-lg border border-border bg-muted/30 p-3">
          <div class="flex flex-wrap items-center gap-6 text-sm">
            <div>
              <span class="text-xs font-medium text-muted-foreground">Start</span>
              <div class="font-medium tabular-nums {pf.startInPast ? 'text-amber-700' : ''}">
                {formatTime(pf.startTime)}
              </div>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            <div>
              <span class="text-xs font-medium text-muted-foreground">Ready By</span>
              <div class="font-medium tabular-nums">{formatTime(pf.readyBy)}</div>
            </div>
            <Badge variant="secondary" class="font-normal tabular-nums">{formatDuration(pf.fermentMin)}</Badge>
          </div>
          {#if pf.startInPast}
            <div class="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              Start time is in the past — adjust target mix time or reduce fermentation duration.
            </div>
          {/if}
        </div>

        <!-- PF Ingredient Breakdown -->
        {#if Object.keys(pf.breakdown).length > 0}
          <div>
            <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ingredients</h4>
            <div class="space-y-1">
              {#each Object.entries(pf.breakdown) as [name, qty]}
                <div class="flex items-center justify-between rounded-md bg-indigo-50/50 px-3 py-1.5 text-sm">
                  <span class="font-medium">{name}</span>
                  <span class="tabular-nums text-muted-foreground">{formatGrams(qty)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </CardContent>
    </Card>
  {/each}

  <!-- ── Final Dough Card ──────────────────────────────── -->

  <Card class="border-emerald-200">
    <CardHeader class="pb-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <CardTitle class="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-600"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Final Dough
        </CardTitle>
        <Badge variant="secondary" class="bg-emerald-50 text-emerald-700 font-normal tabular-nums">
          DDT {finalDough.ddt}&deg;C
        </Badge>
      </div>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>
          <span class="text-sm font-medium">Water Temp</span>
          <span class="text-lg font-bold tabular-nums">{finalDough.waterTemp.toFixed(1)}&deg;C</span>
          <Badge variant="secondary" class="font-normal text-[10px]">{finalDough.method}</Badge>
        </div>
        {#if finalDough.warning}
          <Badge variant="secondary" class="border-amber-300 bg-amber-50 text-amber-700 font-normal">
            {finalDough.warning}
          </Badge>
        {/if}
      </div>
      {#if finalDough.hasAutolyse}
        <div class="text-xs text-muted-foreground">
          Autolyse {finalDough.autolyseDur} min — water temp adjusted for flour temperature drift during rest.
        </div>
      {/if}

      <!-- Mixing Timer -->
      {#if mixingDurations}
        <div class="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
          <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-700">Mixing Timer</h4>
          <div class="flex flex-wrap items-center gap-6 text-sm">
            <div>
              <span class="text-xs font-medium text-muted-foreground">1st Speed</span>
              <div class="font-medium tabular-nums">
                {formatMin(mixingDurations.first_speed_min)}
                <span class="text-xs text-muted-foreground">({mixerProfile.first_speed_rpm} RPM)</span>
              </div>
            </div>
            {#if MIX_TYPES[mixType]?.has_second}
              <div>
                <span class="text-xs font-medium text-muted-foreground">2nd Speed</span>
                <div class="font-medium tabular-nums">
                  {formatMin(mixingDurations.second_speed_min)}
                  <span class="text-xs text-muted-foreground">({mixerProfile.second_speed_rpm} RPM)</span>
                </div>
              </div>
            {:else}
              <div>
                <span class="text-xs font-medium text-muted-foreground">2nd Speed</span>
                <div class="text-sm text-muted-foreground">N/A (1st speed only)</div>
              </div>
            {/if}
            <div>
              <span class="text-xs font-medium text-muted-foreground">Total</span>
              <div class="font-bold tabular-nums">
                {formatMin(mixingDurations.first_speed_min + mixingDurations.second_speed_min)}
              </div>
            </div>
          </div>
        </div>
      {/if}

      <div class="rounded-lg border border-border bg-muted/30 p-3">
        <div class="flex flex-wrap items-center gap-6 text-sm">
          <div>
            <span class="text-xs font-medium text-muted-foreground">Mix Time</span>
            <div class="font-medium tabular-nums">{formatTime(new Date(targetMixTime))}</div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</div>
