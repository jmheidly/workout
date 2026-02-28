<script>
  import { formatGrams, formatPct } from '$lib/utils.js'
  import { calcWaterTemp } from '$lib/water-temp.js'
  import {
    FERMENTATION_DEFAULTS,
    getEffectiveFermentationDuration,
    getEffectiveDdt,
    formatDuration,
  } from '$lib/preferment-defaults.js'
  import { MIX_TYPES, effectiveFriction, calcMixDurations } from '$lib/mixing.js'
  import { computeTimeline } from '$lib/timeline.js'
  import { enhance } from '$app/forms'
  import { toast } from 'svelte-sonner'
  import { Button } from '$lib/components/ui/button/index.js'
  import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
  } from '$lib/components/ui/card/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import MixerPicker from '$lib/components/mixer-picker.svelte'
  import TimelineChart from '$lib/components/timeline-chart.svelte'

  let { data, form } = $props()

  // ── Batch Scaling (view-layer only) ────────────────────

  let scaleMode = $state('pieces') // 'pieces' | 'dough' | 'flour'
  let scaleTarget = $state(null) // null = use recipe default

  let defaultTarget = $derived.by(() => {
    const t = data.calculated?.totals
    if (!t) return 0
    if (scaleMode === 'pieces') return Math.round(t.num_pieces)
    if (scaleMode === 'dough') return Math.round(t.total_weight)
    if (scaleMode === 'flour') return Math.round(t.total_flour)
    return 0
  })

  let activeTarget = $derived(scaleTarget ?? defaultTarget)

  let scaleFactor = $derived.by(() => {
    const t = data.calculated?.totals
    if (!t || !activeTarget) return 1
    if (scaleMode === 'pieces')
      return t.num_pieces > 0 ? activeTarget / t.num_pieces : 1
    if (scaleMode === 'dough')
      return t.total_weight > 0 ? activeTarget / t.total_weight : 1
    if (scaleMode === 'flour')
      return t.total_flour > 0 ? activeTarget / t.total_flour : 1
    return 1
  })

  // Reset target when mode changes
  let prevMode = $state('pieces')
  $effect(() => {
    if (scaleMode !== prevMode) {
      scaleTarget = null
      prevMode = scaleMode
    }
  })

  let piecesDisabled = $derived(
    !data.recipe.yield_per_piece || data.recipe.yield_per_piece === 0
  )
  let flourDisabled = $derived(
    !data.calculated?.totals?.total_flour ||
      data.calculated.totals.total_flour === 0
  )

  // If pieces disabled and currently on pieces, switch to dough
  $effect(() => {
    if (piecesDisabled && scaleMode === 'pieces') {
      scaleMode = 'dough'
    }
  })

  // ── Mixer Selection (session-only, not saved to recipe) ──

  let mixerProfileId = $state('')
  let mixType = $derived(data.recipe.mix_type || 'Improved Mix')

  let selectedMixer = $derived(
    mixerProfileId
      ? (data.mixerProfiles || []).find((m) => m.id === mixerProfileId) || null
      : null
  )

  let computedFriction = $derived(
    selectedMixer ? effectiveFriction(selectedMixer.friction_factor, mixType) : null
  )

  // ── Environment Inputs ─────────────────────────────────

  let roomTemp = $state(22)
  let flourTemp = $state(20)
  let frictionFactor = $state(12)

  // Sync friction when mixer selection changes
  $effect(() => {
    if (computedFriction != null) {
      frictionFactor = computedFriction
    }
  })

  // Default: tomorrow 6 AM
  function defaultMixTime() {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(6, 0, 0, 0)
    return d.toISOString().slice(0, 16)
  }

  let targetMixTime = $state(defaultMixTime())
  let scheduleMode = $state('forward') // 'forward' | 'reverse'

  // ── Timeline ────────────────────────────────────────────────

  let timeline = $derived.by(() => {
    const anchor = new Date(targetMixTime)
    if (isNaN(anchor.getTime())) return null
    return computeTimeline({
      recipe: data.recipe,
      calculated: data.calculated,
      anchorTime: anchor,
      mode: scheduleMode,
      mixType: data.recipe.mix_type || 'Improved Mix',
      companions: data.companionDetails || [],
    })
  })

  // ── Mixing Timer ─────────────────────────────────────────

  let mixingDurations = $derived.by(() => {
    if (!selectedMixer) return null
    return calcMixDurations(selectedMixer, mixType)
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

      // Timeline — use timeline-derived times when available
      const pfTrack = timeline?.tracks.find((t) => t.id === `pf-${pf.id}`)
      let startTime, readyBy
      if (pfTrack && pfTrack.blocks.length > 0) {
        startTime = pfTrack.blocks[0].startTime
        readyBy = pfTrack.blocks[pfTrack.blocks.length - 1].endTime
      } else {
        readyBy = new Date(mixDate)
        startTime = new Date(mixDate.getTime() - fermentMin * 60 * 1000)
      }
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

  // ── Process Steps (main vs PF) ───────────────────────

  let mainSteps = $derived(
    (data.recipe.process_steps || []).filter((s) => !s.preferment_ingredient_id)
  )

  let pfSteps = $derived(
    (data.recipe.process_steps || []).filter((s) => s.preferment_ingredient_id)
  )

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

  // ── Batch Log State ──────────────────────────────────────

  let showBatchForm = $state(false)
  let batchDate = $state(new Date().toISOString().slice(0, 10))
  let doughWeightOff = $state(null)
  let piecesLoaded = $state(null)
  let finishedPieceWeight = $state(null)
  let batchNotes = $state('')
  let batchSubmitting = $state(false)

  let plannedTotalWeight = $derived(
    (data.calculated?.totals?.total_weight || 0) * scaleFactor
  )
  let plannedPieces = $derived(
    Math.round((data.calculated?.totals?.num_pieces || 0) * scaleFactor)
  )
  let plannedPieceWeight = $derived(data.recipe.yield_per_piece || 0)

  let previewProcessLoss = $derived.by(() => {
    if (doughWeightOff == null || !plannedTotalWeight) return null
    return 1 - doughWeightOff / plannedTotalWeight
  })

  let previewBakeLoss = $derived.by(() => {
    if (
      doughWeightOff == null ||
      piecesLoaded == null ||
      piecesLoaded <= 0 ||
      finishedPieceWeight == null
    )
      return null
    const preBake = doughWeightOff / piecesLoaded
    if (preBake <= 0) return null
    return 1 - finishedPieceWeight / preBake
  })

  let batchFormData = $derived(
    JSON.stringify({
      session_date: batchDate,
      planned_total_weight: plannedTotalWeight,
      planned_pieces: plannedPieces,
      planned_piece_weight: plannedPieceWeight,
      scale_factor: scaleFactor,
      dough_weight_off_mixer: doughWeightOff,
      pieces_loaded: piecesLoaded,
      finished_piece_weight: finishedPieceWeight,
      notes: batchNotes || null,
    })
  )

  function resetBatchForm() {
    showBatchForm = false
    batchDate = new Date().toISOString().slice(0, 10)
    doughWeightOff = null
    piecesLoaded = null
    finishedPieceWeight = null
    batchNotes = ''
  }

  // ── Drift Detection ────────────────────────────────────

  const DRIFT_THRESHOLD = 0.02

  let processLossDrift = $derived.by(() => {
    const avg = data.rollingAverages?.avg_process_loss_pct
    if (avg == null) return null
    const recipe = data.recipe.process_loss_pct || 0
    const diff = avg - recipe
    return Math.abs(diff) >= DRIFT_THRESHOLD ? diff : null
  })

  let bakeLossDrift = $derived.by(() => {
    const avg = data.rollingAverages?.avg_bake_loss_pct
    if (avg == null) return null
    const recipe = data.recipe.bake_loss_pct || 0
    const diff = avg - recipe
    return Math.abs(diff) >= DRIFT_THRESHOLD ? diff : null
  })
</script>

<div class="sticky top-14 z-10 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
  <div class="flex items-center gap-3">
    <Button variant="ghost" size="sm" href="/recipes/{data.recipe.id}" class="gap-1.5 text-muted-foreground">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
      Recipe
    </Button>
    <h1 class="text-lg font-semibold">{data.recipe.name} — Production</h1>
    {#if selectedMixer}
      <Badge variant="secondary" class="font-normal">{selectedMixer.name}</Badge>
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
        <div class="w-48">
          <label class="mb-1.5 block h-4 text-xs font-medium text-muted-foreground">Mixer</label>
          <MixerPicker mixerProfiles={data.mixerProfiles || []} bind:value={mixerProfileId} onCreateNew={() => {}} />
        </div>
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
              Computed: {computedFriction.toFixed(1)}&deg;C ({selectedMixer.name})
            </span>
          {:else}
            <span class="mt-1 block text-[10px] text-muted-foreground">Manual — no mixer assigned</span>
          {/if}
        </div>
        <div class="w-52">
          <label for="mix-time" class="mb-1.5 block h-4 text-xs font-medium text-muted-foreground">
            {scheduleMode === 'forward' ? 'Target Mix Time' : 'Target Finish Time'}
          </label>
          <input
            id="mix-time"
            type="datetime-local"
            bind:value={targetMixTime}
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
          />
        </div>
        <div>
          <label class="mb-1.5 block h-4 text-xs font-medium text-muted-foreground">Schedule</label>
          <div class="flex rounded-md border border-input">
            <button
              type="button"
              class="px-3 py-2 text-xs rounded-l-md transition-colors {scheduleMode === 'forward'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'}"
              onclick={() => { scheduleMode = 'forward' }}
            >
              Forward
            </button>
            <button
              type="button"
              class="px-3 py-2 text-xs rounded-r-md transition-colors {scheduleMode === 'reverse'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'}"
              onclick={() => { scheduleMode = 'reverse' }}
            >
              Reverse
            </button>
          </div>
        </div>
      </div>
      <!-- Batch Scaling -->
      {#if data.calculated}
        <div class="mt-4 border-t border-border pt-4">
          <div class="flex flex-wrap items-center gap-4">
            <div>
              <label class="mb-1.5 block h-4 text-xs font-medium text-muted-foreground">Scale By</label>
              <div class="flex rounded-md border border-input">
                <button
                  type="button"
                  disabled={piecesDisabled}
                  class="px-3 py-2 text-xs rounded-l-md transition-colors {scaleMode === 'pieces'
                    ? 'bg-primary text-primary-foreground'
                    : piecesDisabled
                      ? 'text-muted-foreground/40 cursor-not-allowed'
                      : 'hover:bg-muted'}"
                  onclick={() => { scaleMode = 'pieces' }}
                >
                  Pieces
                </button>
                <button
                  type="button"
                  class="px-3 py-2 text-xs border-x border-input transition-colors {scaleMode === 'dough'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'}"
                  onclick={() => { scaleMode = 'dough' }}
                >
                  Total Dough
                </button>
                <button
                  type="button"
                  disabled={flourDisabled}
                  class="px-3 py-2 text-xs rounded-r-md transition-colors {scaleMode === 'flour'
                    ? 'bg-primary text-primary-foreground'
                    : flourDisabled
                      ? 'text-muted-foreground/40 cursor-not-allowed'
                      : 'hover:bg-muted'}"
                  onclick={() => { scaleMode = 'flour' }}
                >
                  Total Flour
                </button>
              </div>
            </div>
            <div class="w-32">
              <label for="scale-target" class="mb-1.5 block h-4 text-xs font-medium text-muted-foreground">
                Target ({scaleMode === 'pieces' ? 'pcs' : 'g'})
              </label>
              <input
                id="scale-target"
                type="number"
                min="0"
                step={scaleMode === 'pieces' ? 1 : 10}
                value={activeTarget}
                oninput={(e) => { scaleTarget = Number(e.target.value) || 0 }}
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
              />
            </div>
            <div>
              <label class="mb-1.5 block h-4 text-xs font-medium text-muted-foreground">Scale</label>
              <Badge
                variant="secondary"
                class="text-sm tabular-nums {Math.abs(scaleFactor - 1) > 0.005 ? 'border-amber-300 bg-amber-50 text-amber-700' : ''}"
              >
                {scaleFactor.toFixed(2)}x
              </Badge>
            </div>
          </div>
          <p class="mt-2 text-xs text-muted-foreground tabular-nums">
            {#if scaleMode === 'pieces' && data.calculated.totals.num_pieces > 0}
              Recipe: {Math.round(data.calculated.totals.num_pieces)} pcs &times; {formatGrams(data.recipe.yield_per_piece || 0)}
            {:else if scaleMode === 'dough'}
              Recipe: {formatGrams(data.calculated.totals.total_weight)} dough
            {:else if scaleMode === 'flour'}
              Recipe: {formatGrams(data.calculated.totals.total_flour)} flour
            {/if}
          </p>
        </div>
      {/if}

      {#if timeline}
        <div class="mt-3 flex flex-wrap items-center gap-3">
          {#if scheduleMode === 'reverse' && timeline.computedMixTime}
            <Badge variant="secondary" class="bg-emerald-50 text-emerald-700 font-normal tabular-nums">
              Computed Mix: {formatTime(timeline.computedMixTime)}
            </Badge>
          {/if}
          {#if scheduleMode === 'forward' && timeline.computedFinishTime}
            <Badge variant="secondary" class="bg-violet-50 text-violet-700 font-normal tabular-nums">
              Est. Finish: {formatTime(timeline.computedFinishTime)}
            </Badge>
          {/if}
          {#if timeline.dagHasCycle}
            <Badge variant="secondary" class="border-red-300 bg-red-50 text-red-700 font-normal">
              Circular PF dependency detected
            </Badge>
          {/if}
        </div>
      {/if}
    </CardContent>
  </Card>

  <!-- ── Production Timeline ─────────────────────────────── -->

  {#if timeline && timeline.tracks.length > 0}
    <Card>
      <CardHeader class="pb-4">
        <div class="flex items-center justify-between">
          <CardTitle class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            Production Timeline
          </CardTitle>
          <Badge variant="secondary" class="font-normal tabular-nums">
            {formatDuration(Math.round(timeline.totalDurationMin))}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <TimelineChart {timeline} />
      </CardContent>
    </Card>
  {/if}

  <!-- ── Production Quantities Card ────────────────────── -->

  {#if data.calculated && data.calculated.ingredients.length > 0}
    {@const calc = data.calculated}
    {@const scaledPieces = Math.round(calc.totals.num_pieces * scaleFactor)}
    <Card>
      <CardHeader class="pb-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <CardTitle class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            Production Quantities
          </CardTitle>
          {#if Math.abs(scaleFactor - 1) > 0.005}
            <Badge variant="secondary" class="border-amber-300 bg-amber-50 text-amber-700 font-normal tabular-nums">
              {scaleFactor.toFixed(2)}x scale
            </Badge>
          {/if}
        </div>
      </CardHeader>
      <CardContent class="space-y-6">
        <!-- Main Ingredient Table -->
        <div class="overflow-x-auto rounded-lg border border-border">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                <th class="px-3 py-2 font-medium">Ingredient</th>
                <th class="px-3 py-2 font-medium text-right">Per Item</th>
                <th class="px-3 py-2 font-medium text-right">
                  Batch ({scaledPieces} pcs)
                </th>
              </tr>
            </thead>
            <tbody>
              {#each calc.ingredients as ing}
                <tr class="border-b border-border last:border-b-0">
                  <td class="px-3 py-1.5">
                    <span class="font-medium">{ing.name}</span>
                    <Badge variant="secondary" class="ml-1.5 text-[9px] font-normal">{ing.category}</Badge>
                  </td>
                  <td class="px-3 py-1.5 text-right tabular-nums">{formatGrams(ing.per_item_weight)}</td>
                  <td class="px-3 py-1.5 text-right tabular-nums">{formatGrams(ing.batch_qty * scaleFactor)}</td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr class="border-t border-border bg-muted/30 font-medium">
                <td class="px-3 py-1.5">Total</td>
                <td class="px-3 py-1.5 text-right tabular-nums">
                  {formatGrams(calc.totals.raw_yield_per_piece || 0)}
                </td>
                <td class="px-3 py-1.5 text-right tabular-nums">
                  {formatGrams(calc.totals.total_weight * scaleFactor)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- PF Breakdowns (inline) -->
        {#each (calc.preferments || []).filter((p) => p.enabled && Object.keys(p.breakdown).length > 0) as pf (pf.id)}
          <div>
            <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-indigo-700">
              {pf.name}
              <Badge variant="secondary" class="ml-1 bg-indigo-50 text-indigo-700 text-[9px] font-normal">{pf.type}</Badge>
            </h4>
            <div class="space-y-1">
              {#each Object.entries(pf.breakdown) as [name, qty]}
                <div class="flex items-center justify-between rounded-md bg-indigo-50/50 px-3 py-1.5 text-sm">
                  <span class="font-medium">{name}</span>
                  <span class="tabular-nums text-muted-foreground">{formatGrams(qty * scaleFactor)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}

        <!-- Autolyse Split (inline) -->
        {#if calc.autolyse}
          {@const auto = calc.autolyse}
          <div>
            <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-teal-700">Autolyse Split</h4>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <span class="mb-1 block text-[10px] font-medium text-teal-600">Autolyse Mix</span>
                <div class="space-y-1">
                  {#each auto.autolyse_ingredients as ing}
                    <div class="flex items-center justify-between rounded-md bg-teal-50/50 px-3 py-1.5 text-sm">
                      <span class="font-medium">{ing.name}</span>
                      <span class="tabular-nums text-muted-foreground">{formatGrams(ing.qty * scaleFactor)}</span>
                    </div>
                  {/each}
                </div>
              </div>
              <div>
                <span class="mb-1 block text-[10px] font-medium text-muted-foreground">Final Mix (after rest)</span>
                <div class="space-y-1">
                  {#each auto.final_mix_ingredients as ing}
                    <div class="flex items-center justify-between rounded-md bg-muted/30 px-3 py-1.5 text-sm">
                      <span class="font-medium">{ing.name}</span>
                      <span class="tabular-nums text-muted-foreground">{formatGrams(ing.qty * scaleFactor)}</span>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        {/if}
      </CardContent>
    </Card>
  {/if}

  <!-- ── Rolling Averages + Drift Alerts Card ────────── -->

  {#if data.batchSessions && data.batchSessions.length > 0}
    {@const ra = data.rollingAverages}
    <Card>
      <CardHeader class="pb-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <CardTitle class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
            Rolling Averages
          </CardTitle>
          <Badge variant="secondary" class="font-normal">
            Last {data.rollingWindow} sessions
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <!-- Process Loss -->
          <div class="rounded-lg border border-border p-3">
            <div class="mb-1 text-xs font-medium text-muted-foreground">Process Loss</div>
            {#if ra.avg_process_loss_pct != null}
              <div class="text-lg font-bold tabular-nums">
                {formatPct(ra.avg_process_loss_pct)}
              </div>
              <div class="text-xs text-muted-foreground tabular-nums">
                Recipe: {formatPct(data.recipe.process_loss_pct || 0)}
                <span class="ml-1 text-muted-foreground/60">({ra.process_session_count} sessions)</span>
              </div>
              {#if processLossDrift != null}
                <Badge
                  variant="secondary"
                  class="mt-1.5 font-normal text-[10px] {processLossDrift > 0 ? 'border-red-300 bg-red-50 text-red-700' : 'border-blue-300 bg-blue-50 text-blue-700'}"
                >
                  {processLossDrift > 0 ? '+' : ''}{(processLossDrift * 100).toFixed(1)}pp drift
                </Badge>
              {/if}
            {:else}
              <div class="text-sm text-muted-foreground">No data yet</div>
            {/if}
          </div>
          <!-- Bake Loss -->
          <div class="rounded-lg border border-border p-3">
            <div class="mb-1 text-xs font-medium text-muted-foreground">Bake Loss</div>
            {#if ra.avg_bake_loss_pct != null}
              <div class="text-lg font-bold tabular-nums">
                {formatPct(ra.avg_bake_loss_pct)}
              </div>
              <div class="text-xs text-muted-foreground tabular-nums">
                Recipe: {formatPct(data.recipe.bake_loss_pct || 0)}
                <span class="ml-1 text-muted-foreground/60">({ra.bake_session_count} sessions)</span>
              </div>
              {#if bakeLossDrift != null}
                <Badge
                  variant="secondary"
                  class="mt-1.5 font-normal text-[10px] {bakeLossDrift > 0 ? 'border-red-300 bg-red-50 text-red-700' : 'border-blue-300 bg-blue-50 text-blue-700'}"
                >
                  {bakeLossDrift > 0 ? '+' : ''}{(bakeLossDrift * 100).toFixed(1)}pp drift
                </Badge>
              {/if}
            {:else}
              <div class="text-sm text-muted-foreground">No data yet</div>
            {/if}
          </div>
        </div>
      </CardContent>
    </Card>
  {/if}

  <!-- ── Batch Log Card ──────────────────────────────────── -->

  <Card>
    <CardHeader class="pb-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <CardTitle class="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Batch Log
        </CardTitle>
        {#if data.batchSessions && data.batchSessions.length > 0}
          <Badge variant="secondary" class="font-normal">
            {data.batchSessions.length} session{data.batchSessions.length !== 1 ? 's' : ''}
          </Badge>
        {/if}
      </div>
    </CardHeader>
    <CardContent class="space-y-4">
      {#if data.canEdit}
        {#if !showBatchForm}
          <Button variant="outline" size="sm" onclick={() => (showBatchForm = true)}>
            Log Production Run
          </Button>
        {:else}
          <form
            method="POST"
            action="?/createSession"
            use:enhance={() => {
              batchSubmitting = true
              return async ({ result, update }) => {
                batchSubmitting = false
                if (result.type === 'success') {
                  toast.success('Batch session logged')
                  resetBatchForm()
                  await update({ reset: false })
                } else if (result.type === 'failure') {
                  toast.error(result.data?.error || 'Failed to log session')
                } else {
                  await update()
                }
              }
            }}
          >
            <input type="hidden" name="data" value={batchFormData} />
            <div class="space-y-4 rounded-lg border border-border p-4">
              <!-- Planned values (read-only) -->
              <div class="flex flex-wrap gap-4">
                <div>
                  <span class="mb-1 block text-[10px] font-medium text-muted-foreground">Planned Dough</span>
                  <span class="text-sm font-medium tabular-nums">{formatGrams(plannedTotalWeight)}</span>
                </div>
                <div>
                  <span class="mb-1 block text-[10px] font-medium text-muted-foreground">Planned Pcs</span>
                  <span class="text-sm font-medium tabular-nums">{plannedPieces}</span>
                </div>
                <div>
                  <span class="mb-1 block text-[10px] font-medium text-muted-foreground">Target Piece Wt</span>
                  <span class="text-sm font-medium tabular-nums">{formatGrams(plannedPieceWeight)}</span>
                </div>
                <div>
                  <span class="mb-1 block text-[10px] font-medium text-muted-foreground">Scale</span>
                  <Badge variant="secondary" class="text-sm tabular-nums">{scaleFactor.toFixed(2)}x</Badge>
                </div>
              </div>

              <!-- Date + Measured values -->
              <div class="flex flex-wrap gap-4">
                <div class="w-36">
                  <label for="batch-date" class="mb-1.5 block text-xs font-medium text-muted-foreground">Date</label>
                  <input
                    id="batch-date"
                    type="date"
                    bind:value={batchDate}
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
                  />
                </div>
                <div class="w-40">
                  <label for="dough-off" class="mb-1.5 block text-xs font-medium text-muted-foreground">Dough Wt Off Mixer (g)</label>
                  <input
                    id="dough-off"
                    type="number"
                    min="0"
                    step="1"
                    bind:value={doughWeightOff}
                    placeholder="e.g. 9800"
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
                  />
                  {#if previewProcessLoss != null}
                    <span class="mt-1 block text-[10px] tabular-nums {Math.abs(previewProcessLoss) > 0.05 ? 'text-amber-600' : 'text-muted-foreground'}">
                      Process loss: {(previewProcessLoss * 100).toFixed(1)}%
                    </span>
                  {/if}
                </div>
                <div class="w-32">
                  <label for="pcs-loaded" class="mb-1.5 block text-xs font-medium text-muted-foreground">Pieces Loaded</label>
                  <input
                    id="pcs-loaded"
                    type="number"
                    min="0"
                    step="1"
                    bind:value={piecesLoaded}
                    placeholder="e.g. 48"
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
                  />
                </div>
                <div class="w-40">
                  <label for="finished-wt" class="mb-1.5 block text-xs font-medium text-muted-foreground">Finished Piece Wt (g)</label>
                  <input
                    id="finished-wt"
                    type="number"
                    min="0"
                    step="0.1"
                    bind:value={finishedPieceWeight}
                    placeholder="e.g. 185"
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
                  />
                  {#if previewBakeLoss != null}
                    <span class="mt-1 block text-[10px] tabular-nums {Math.abs(previewBakeLoss) > 0.15 ? 'text-amber-600' : 'text-muted-foreground'}">
                      Bake loss: {(previewBakeLoss * 100).toFixed(1)}%
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Notes -->
              <div>
                <label for="batch-notes" class="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
                <textarea
                  id="batch-notes"
                  bind:value={batchNotes}
                  rows="2"
                  placeholder="Optional notes about this batch..."
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1"
                ></textarea>
              </div>

              <!-- Actions -->
              <div class="flex gap-2">
                <Button type="submit" size="sm" disabled={batchSubmitting}>
                  {batchSubmitting ? 'Saving...' : 'Save Session'}
                </Button>
                <Button type="button" variant="outline" size="sm" onclick={() => resetBatchForm()}>
                  Cancel
                </Button>
              </div>
            </div>
          </form>
        {/if}
      {/if}

      <!-- Session History Table -->
      {#if data.batchSessions && data.batchSessions.length > 0}
        <div class="overflow-x-auto rounded-lg border border-border">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                <th class="px-3 py-2 font-medium">Date</th>
                <th class="px-3 py-2 font-medium text-right">Dough Off</th>
                <th class="px-3 py-2 font-medium text-right">Pcs Loaded</th>
                <th class="px-3 py-2 font-medium text-right">Finished Wt</th>
                <th class="px-3 py-2 font-medium text-right">Proc Loss</th>
                <th class="px-3 py-2 font-medium text-right">Bake Loss</th>
                <th class="px-3 py-2 font-medium text-right">Scale</th>
                {#if data.canEdit}
                  <th class="px-3 py-2 font-medium"></th>
                {/if}
              </tr>
            </thead>
            <tbody>
              {#each data.batchSessions as session}
                <tr class="border-b border-border last:border-b-0">
                  <td class="px-3 py-1.5">
                    <div class="font-medium">{session.session_date}</div>
                    <div class="text-[10px] text-muted-foreground">{session.created_by_name || session.created_by_email}</div>
                  </td>
                  <td class="px-3 py-1.5 text-right tabular-nums">
                    {session.dough_weight_off_mixer != null ? formatGrams(session.dough_weight_off_mixer) : '—'}
                  </td>
                  <td class="px-3 py-1.5 text-right tabular-nums">
                    {session.pieces_loaded != null ? session.pieces_loaded : '—'}
                  </td>
                  <td class="px-3 py-1.5 text-right tabular-nums">
                    {session.finished_piece_weight != null ? formatGrams(session.finished_piece_weight) : '—'}
                  </td>
                  <td class="px-3 py-1.5 text-right tabular-nums">
                    {session.actual_process_loss_pct != null ? formatPct(session.actual_process_loss_pct) : '—'}
                  </td>
                  <td class="px-3 py-1.5 text-right tabular-nums">
                    {session.actual_bake_loss_pct != null ? formatPct(session.actual_bake_loss_pct) : '—'}
                  </td>
                  <td class="px-3 py-1.5 text-right tabular-nums">
                    {session.scale_factor.toFixed(2)}x
                  </td>
                  {#if data.canEdit}
                    <td class="px-3 py-1.5 text-right">
                      <form
                        method="POST"
                        action="?/deleteSession"
                        use:enhance={() => {
                          return async ({ result, update }) => {
                            if (result.type === 'success') {
                              toast.success('Session deleted')
                              await update({ reset: false })
                            } else {
                              await update()
                            }
                          }
                        }}
                      >
                        <input type="hidden" name="id" value={session.id} />
                        <button
                          type="submit"
                          class="text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete session"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </form>
                    </td>
                  {/if}
                </tr>
                {#if session.notes}
                  <tr class="border-b border-border last:border-b-0">
                    <td colspan={data.canEdit ? 8 : 7} class="px-3 py-1 text-xs text-muted-foreground italic">
                      {session.notes}
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="py-4 text-center text-sm text-muted-foreground">No batch sessions logged yet.</p>
      {/if}
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
                  <span class="tabular-nums text-muted-foreground">{formatGrams(qty * scaleFactor)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </CardContent>
    </Card>
  {/each}

  <!-- ── Autolyse Split Card ────────────────────────────── -->

  {#if data.calculated?.autolyse}
    {@const auto = data.calculated.autolyse}
    <Card class="border-teal-200">
      <CardHeader class="pb-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <CardTitle class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-teal-600"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>
            Autolyse Split
          </CardTitle>
          <Badge variant="secondary" class="bg-teal-50 text-teal-700 font-normal tabular-nums">
            {auto.autolyse_duration_min} min rest
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <!-- Autolyse Mix -->
          <div>
            <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-teal-700">Autolyse Mix</h4>
            <div class="space-y-1">
              {#each auto.autolyse_ingredients as ing}
                <div class="flex items-center justify-between rounded-md bg-teal-50/50 px-3 py-1.5 text-sm">
                  <span class="font-medium">{ing.name}</span>
                  <span class="tabular-nums text-muted-foreground">{formatGrams(ing.qty * scaleFactor)}</span>
                </div>
              {/each}
              {#if auto.autolyse_ingredients.length === 0}
                <p class="text-sm text-muted-foreground">No ingredients</p>
              {/if}
            </div>
          </div>
          <!-- Final Mix (after rest) -->
          <div>
            <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Final Mix (after rest)</h4>
            <div class="space-y-1">
              {#each auto.final_mix_ingredients as ing}
                <div class="flex items-center justify-between rounded-md bg-muted/30 px-3 py-1.5 text-sm">
                  <span class="font-medium">{ing.name}</span>
                  <span class="tabular-nums text-muted-foreground">{formatGrams(ing.qty * scaleFactor)}</span>
                </div>
              {/each}
              {#if auto.final_mix_ingredients.length === 0}
                <p class="text-sm text-muted-foreground">No ingredients</p>
              {/if}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  {/if}

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
                <span class="text-xs text-muted-foreground">({selectedMixer.first_speed_rpm} RPM)</span>
              </div>
            </div>
            {#if MIX_TYPES[mixType]?.has_second}
              <div>
                <span class="text-xs font-medium text-muted-foreground">2nd Speed</span>
                <div class="font-medium tabular-nums">
                  {formatMin(mixingDurations.second_speed_min)}
                  <span class="text-xs text-muted-foreground">({selectedMixer.second_speed_rpm} RPM)</span>
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

  <!-- ── PF Build Steps Card ────────────────────────────── -->

  {#if pfSteps.length > 0}
    <Card class="border-indigo-200">
      <CardHeader class="pb-4">
        <CardTitle class="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-indigo-600"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/></svg>
          Pre-ferment Build Steps
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        {#each enabledPfs as pf (pf.id)}
          {@const stepsForPf = pfSteps.filter((s) => s.preferment_ingredient_id === pf.id)}
          {#if stepsForPf.length > 0}
            <div>
              <div class="mb-2 flex items-center gap-2">
                <span class="text-sm font-semibold">{pf.name}</span>
                <Badge variant="secondary" class="bg-indigo-50 text-indigo-700 text-[10px] font-normal">{pf.preferment_settings?.type || 'CUSTOM'}</Badge>
              </div>
              <div class="space-y-2">
                {#each stepsForPf as step, i}
                  <div class="flex items-start gap-3 rounded-lg border border-indigo-100 bg-indigo-50/30 px-4 py-3">
                    <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold tabular-nums text-indigo-700">{i + 1}</span>
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" class="text-[10px] font-normal border-indigo-200">{step.stage.replace(/_/g, ' ')}</Badge>
                        <span class="text-sm font-medium">{step.title}</span>
                        {#if step.duration_min}
                          <Badge variant="secondary" class="font-normal tabular-nums text-[10px]">{step.duration_min} min</Badge>
                        {/if}
                        {#if step.temperature}
                          <Badge variant="secondary" class="font-normal tabular-nums text-[10px]">{step.temperature}&deg;C</Badge>
                        {/if}
                      </div>
                      {#if step.description}
                        <p class="mt-1 text-sm text-muted-foreground">{step.description}</p>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      </CardContent>
    </Card>
  {/if}

  <!-- ── Process Steps Card ────────────────────────────── -->

  <Card>
    <CardHeader class="pb-4">
      <CardTitle class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/></svg>
        Process Steps
      </CardTitle>
    </CardHeader>
    <CardContent>
      {#if mainSteps.length > 0}
        <div class="space-y-2">
          {#each mainSteps as step, i}
            <div class="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
              <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">{i + 1}</span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" class="text-[10px] font-normal">{step.stage}</Badge>
                  <span class="text-sm font-medium">{step.title}</span>
                  {#if step.duration_min}
                    <Badge variant="secondary" class="font-normal tabular-nums text-[10px]">{step.duration_min} min</Badge>
                  {/if}
                  {#if step.temperature}
                    <Badge variant="secondary" class="font-normal tabular-nums text-[10px]">{step.temperature}&deg;C</Badge>
                  {/if}
                  {#if step.mixer_speed}
                    <Badge variant="secondary" class="font-normal text-[10px]">{step.mixer_speed}</Badge>
                  {/if}
                </div>
                {#if step.description}
                  <p class="mt-1 text-sm text-muted-foreground">{step.description}</p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="flex flex-col items-center gap-2 py-6 text-center">
          <p class="text-sm text-muted-foreground">No process steps defined.</p>
          <Button variant="link" size="sm" href="/recipes/{data.recipe.id}" class="text-xs">
            Add them in the recipe builder
          </Button>
        </div>
      {/if}
    </CardContent>
  </Card>

  <!-- ── Accompanied Recipes ─────────────────────────────── -->

  {#if data.companionDetails && data.companionDetails.length > 0}
    <Card>
      <CardHeader class="pb-4">
        <CardTitle class="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M3 16v5h5"/><path d="M21 16v5h-5"/></svg>
          Accompanied Recipes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-6">
          {#each data.companionDetails as comp}
            {@const scaledCompQty = (comp.qty || 0) * scaleFactor}
            {@const compProcessLoss = comp.calculated?.totals?.process_loss_pct || 0}
            {@const compBakeLoss = comp.calculated?.totals?.bake_loss_pct || 0}
            {@const compLossDenom = (1 - compProcessLoss) * (1 - compBakeLoss)}
            {@const compRawQty = scaledCompQty && compLossDenom > 0 ? scaledCompQty / compLossDenom : scaledCompQty}
            {@const compScale = compRawQty && comp.calculated?.totals?.total_weight ? compRawQty / comp.calculated.totals.total_weight : 1}
            <div>
              <div class="mb-3 flex items-center gap-2">
                <a href="/recipes/{comp.companion_recipe_id}" class="text-sm font-semibold hover:underline">{comp.companion_name}</a>
                <Badge variant="secondary" class="text-[10px] font-normal">{comp.role}</Badge>
                <span class="text-xs font-medium tabular-nums text-muted-foreground">{formatGrams(scaledCompQty)}</span>
                {#if compProcessLoss > 0 || compBakeLoss > 0}
                  <span class="text-[10px] tabular-nums text-muted-foreground">
                    (raw: {formatGrams(compRawQty)}{compProcessLoss > 0 ? `, ${(compProcessLoss * 100).toFixed(0)}% proc` : ''}{compBakeLoss > 0 ? `, ${(compBakeLoss * 100).toFixed(0)}% bake` : ''})
                  </span>
                {/if}
                {#if comp.notes}
                  <span class="text-xs text-muted-foreground">{comp.notes}</span>
                {/if}
              </div>

              {#if comp.calculated}
                <div class="overflow-x-auto rounded-lg border border-border">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                        <th class="px-3 py-2 font-medium">Ingredient</th>
                        <th class="px-3 py-2 font-medium text-right">BP %</th>
                        <th class="px-3 py-2 font-medium text-right">Qty (g)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each comp.calculated.ingredients as ing}
                        <tr class="border-b border-border last:border-b-0">
                          <td class="px-3 py-1.5">
                            <span class="font-medium">{ing.name}</span>
                            <Badge variant="secondary" class="ml-1.5 text-[9px] font-normal">{ing.category}</Badge>
                          </td>
                          <td class="px-3 py-1.5 text-right tabular-nums">{(ing.overall_bakers_pct * 100).toFixed(1)}%</td>
                          <td class="px-3 py-1.5 text-right tabular-nums">{formatGrams(ing.base_qty * compScale)}</td>
                        </tr>
                      {/each}
                    </tbody>
                    <tfoot>
                      <tr class="border-t border-border bg-muted/30 font-medium">
                        <td class="px-3 py-1.5">Total</td>
                        <td class="px-3 py-1.5 text-right tabular-nums">
                          {(comp.calculated.ingredients.reduce((s, i) => s + (i.overall_bakers_pct || 0), 0) * 100).toFixed(1)}%
                        </td>
                        <td class="px-3 py-1.5 text-right tabular-nums">
                          {formatGrams(compRawQty || comp.calculated.totals.total_weight)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              {:else}
                <p class="text-sm text-muted-foreground">Unable to calculate companion recipe.</p>
              {/if}
            </div>
          {/each}
        </div>
      </CardContent>
    </Card>
  {/if}
</div>
