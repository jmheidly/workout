<script>
  import { STAGE_COLORS } from '$lib/timeline.js'
  import { formatDuration } from '$lib/preferment-defaults.js'
  import { Badge } from '$lib/components/ui/badge/index.js'

  let { timeline } = $props()

  // ── Zoom ───────────────────────────────────────────────
  const ZOOM_OPTIONS = [
    { label: '12h', hours: 12 },
    { label: '24h', hours: 24 },
    { label: '48h', hours: 48 },
    { label: 'All', hours: 0 },
  ]

  let zoomIndex = $state(3) // default "All"

  // Auto-select zoom based on timeline duration
  $effect(() => {
    if (!timeline) return
    const hours = timeline.totalDurationMin / 60
    if (hours <= 12) zoomIndex = 0
    else if (hours <= 24) zoomIndex = 1
    else if (hours <= 48) zoomIndex = 2
    else zoomIndex = 3
  })

  let visibleSpan = $derived.by(() => {
    if (!timeline || !timeline.tracks.length) return { startMs: 0, endMs: 1 }

    const zoom = ZOOM_OPTIONS[zoomIndex]
    if (zoom.hours === 0) {
      // "All" — show full range with 30min padding
      const pad = 30 * 60000
      return {
        startMs: timeline.earliestStart.getTime() - pad,
        endMs: timeline.latestEnd.getTime() + pad,
      }
    }

    // Center on mix time
    const centerMs = timeline.mixTime.getTime()
    const halfSpan = (zoom.hours / 2) * 3600000
    return {
      startMs: centerMs - halfSpan,
      endMs: centerMs + halfSpan,
    }
  })

  let spanMs = $derived(visibleSpan.endMs - visibleSpan.startMs)

  // ── Position helpers ───────────────────────────────────
  function pct(timeMs) {
    return ((timeMs - visibleSpan.startMs) / spanMs) * 100
  }

  function blockStyle(block) {
    const left = pct(block.startTime.getTime())
    const right = pct(block.endTime.getTime())
    const width = right - left
    return `left: ${left}%; width: ${Math.max(width, 0.3)}%;`
  }

  // ── Time axis ticks ────────────────────────────────────
  let axisTicks = $derived.by(() => {
    if (spanMs <= 0) return []

    const hours = spanMs / 3600000
    // Choose tick interval
    let intervalHours
    if (hours <= 6) intervalHours = 0.5
    else if (hours <= 14) intervalHours = 1
    else if (hours <= 30) intervalHours = 2
    else if (hours <= 60) intervalHours = 4
    else intervalHours = 6

    const intervalMs = intervalHours * 3600000
    const start = Math.ceil(visibleSpan.startMs / intervalMs) * intervalMs
    const ticks = []

    for (let t = start; t <= visibleSpan.endMs; t += intervalMs) {
      const d = new Date(t)
      const h = d.getHours()
      const m = d.getMinutes()
      const label = m === 0 ? `${h}:00` : `${h}:${String(m).padStart(2, '0')}`

      // Show day label at midnight or first tick
      const dayLabel = h === 0 && m === 0
        ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
        : null

      ticks.push({ timeMs: t, label, dayLabel, pct: pct(t) })
    }
    return ticks
  })

  // ── "Now" line ─────────────────────────────────────────
  let nowMs = $state(Date.now())

  // Update every minute
  $effect(() => {
    const interval = setInterval(() => { nowMs = Date.now() }, 60000)
    return () => clearInterval(interval)
  })

  let nowPct = $derived(pct(nowMs))
  let showNow = $derived(nowMs >= visibleSpan.startMs && nowMs <= visibleSpan.endMs)

  // ── Tooltip ────────────────────────────────────────────
  let tooltip = $state(null)

  function showTooltip(block, event) {
    const rect = event.currentTarget.getBoundingClientRect()
    tooltip = {
      block,
      x: rect.left + rect.width / 2,
      y: rect.top,
    }
  }

  function hideTooltip() {
    tooltip = null
  }

  function formatTimeShort(date) {
    return date.toLocaleString(undefined, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // ── Track ordering: preferments first, main, then companions ──
  let sortedTracks = $derived.by(() => {
    if (!timeline) return []
    const order = { preferment: 0, main: 1, companion: 2 }
    return [...timeline.tracks].sort(
      (a, b) => (order[a.type] ?? 1) - (order[b.type] ?? 1)
    )
  })
</script>

{#if timeline && timeline.tracks.length > 0}
  <!-- Zoom controls -->
  <div class="mb-3 flex items-center gap-2">
    <span class="text-xs font-medium text-muted-foreground">Zoom:</span>
    <div class="flex rounded-md border border-input">
      {#each ZOOM_OPTIONS as opt, i}
        <button
          type="button"
          class="px-2.5 py-1 text-xs transition-colors {zoomIndex === i
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-muted'} {i === 0 ? 'rounded-l-md' : ''} {i === ZOOM_OPTIONS.length - 1 ? 'rounded-r-md' : ''}"
          onclick={() => { zoomIndex = i }}
        >
          {opt.label}
        </button>
      {/each}
    </div>
    <Badge variant="secondary" class="ml-auto font-normal tabular-nums text-xs">
      {formatDuration(Math.round(timeline.totalDurationMin))} total
    </Badge>
  </div>

  <!-- Chart container -->
  <div class="overflow-x-auto rounded-lg border border-border">
    <!-- Time axis -->
    <div class="relative h-8 border-b border-border bg-muted/30">
      {#each axisTicks as tick}
        <div
          class="absolute top-0 h-full border-l border-border/40"
          style="left: {tick.pct}%"
        >
          <span class="absolute left-1 top-0.5 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
            {#if tick.dayLabel}
              <span class="font-medium">{tick.dayLabel}</span>
            {:else}
              {tick.label}
            {/if}
          </span>
        </div>
      {/each}

      <!-- Milestones on axis -->
      {#each timeline.milestones as ms}
        {@const msPct = pct(ms.time.getTime())}
        {#if msPct >= 0 && msPct <= 100}
          <div
            class="absolute top-0 h-full border-l-2 {ms.type === 'mix'
              ? 'border-emerald-500'
              : ms.type === 'oven'
                ? 'border-red-400'
                : 'border-violet-400'}"
            style="left: {msPct}%"
          >
            <span
              class="absolute -top-0 left-1 whitespace-nowrap rounded px-1 text-[9px] font-semibold {ms.type === 'mix'
                ? 'bg-emerald-100 text-emerald-700'
                : ms.type === 'oven'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-violet-100 text-violet-700'}"
            >
              {ms.label}
            </span>
          </div>
        {/if}
      {/each}

      <!-- "Now" line on axis -->
      {#if showNow}
        <div
          class="absolute top-0 z-10 h-full border-l-2 border-dashed border-red-500"
          style="left: {nowPct}%"
        >
          <span class="absolute -top-0 left-1 whitespace-nowrap rounded bg-red-100 px-1 text-[9px] font-semibold text-red-700">
            Now
          </span>
        </div>
      {/if}
    </div>

    <!-- Track rows -->
    {#each sortedTracks as track (track.id)}
      <div class="group flex min-h-[2.5rem] border-b border-border/50 last:border-b-0">
        <!-- Label (desktop: side column, mobile: above) -->
        <div class="hidden w-28 shrink-0 items-center border-r border-border/50 bg-muted/20 px-2 sm:flex">
          <span
            class="truncate text-xs font-medium {track.type === 'preferment'
              ? 'text-indigo-700'
              : track.type === 'companion'
                ? 'text-amber-700'
                : 'text-foreground'}"
            title={track.label}
          >
            {track.label}
          </span>
        </div>

        <!-- Block area -->
        <div class="relative min-h-[2.5rem] flex-1">
          <!-- Mobile label -->
          <div class="absolute left-1 top-0.5 z-10 sm:hidden">
            <span class="rounded bg-background/80 px-1 text-[9px] font-medium text-muted-foreground">
              {track.label}
            </span>
          </div>

          <!-- Grid lines (from ticks) -->
          {#each axisTicks as tick}
            <div
              class="absolute top-0 h-full border-l border-border/20"
              style="left: {tick.pct}%"
            ></div>
          {/each}

          <!-- "Now" line in row -->
          {#if showNow}
            <div
              class="absolute top-0 z-10 h-full border-l-2 border-dashed border-red-500/30"
              style="left: {nowPct}%"
            ></div>
          {/if}

          <!-- Blocks -->
          {#each track.blocks as block (block.id)}
            {@const isPast = block.endTime.getTime() < nowMs}
            <button
              type="button"
              class="absolute top-1 bottom-1 flex cursor-default items-center overflow-hidden rounded px-1.5 text-[10px] font-medium leading-tight transition-opacity
                {block.color}
                {block.suggested ? 'border border-dashed border-current/30' : ''}
                {isPast ? 'opacity-60' : ''}
                {track.type === 'companion' ? 'border border-dashed border-amber-400/50' : ''}
                hover:opacity-90 hover:ring-2 hover:ring-primary/30"
              style={blockStyle(block)}
              onmouseenter={(e) => showTooltip(block, e)}
              onmouseleave={hideTooltip}
              onfocus={(e) => showTooltip(block, e)}
              onblur={hideTooltip}
            >
              <span class="truncate">{block.label}</span>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <!-- Tooltip -->
  {#if tooltip}
    <div
      class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
      style="left: {tooltip.x}px; top: {tooltip.y - 8}px"
    >
      <div class="font-semibold">{tooltip.block.label}</div>
      <div class="mt-1 space-y-0.5 tabular-nums text-muted-foreground">
        <div>Start: {formatTimeShort(tooltip.block.startTime)}</div>
        <div>End: {formatTimeShort(tooltip.block.endTime)}</div>
        <div>Duration: {formatDuration(Math.round(tooltip.block.durationMin))}</div>
        {#if tooltip.block.temperature}
          <div>Temp: {tooltip.block.temperature}&deg;C</div>
        {/if}
      </div>
      {#if tooltip.block.description}
        <div class="mt-1.5 max-w-xs border-t border-border pt-1.5 text-muted-foreground">
          {tooltip.block.description.slice(0, 120)}{tooltip.block.description.length > 120 ? '...' : ''}
        </div>
      {/if}
      {#if tooltip.block.suggested}
        <div class="mt-1 text-amber-600">Suggested (no saved steps)</div>
      {/if}
    </div>
  {/if}
{:else}
  <div class="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-40"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
    No timeline data to display.
  </div>
{/if}
