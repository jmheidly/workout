/**
 * Production Timeline & Fermentation Schedule (§9)
 *
 * Pure computation engine — takes recipe + environment, returns a Timeline
 * data structure for rendering by timeline-chart.svelte.
 */

import {
  getEffectiveFermentationDuration,
  formatDuration,
} from './preferment-defaults.js'
import {
  PROCESS_STAGES,
  MIX_TYPE_PROCESS,
  suggestProcessSteps,
  suggestPfProcessSteps,
} from './process-steps.js'

// ── Stage Duration Defaults (minutes) ────────────────────────────────

const STAGE_DURATION_DEFAULTS = {
  PF_MIX: 5,
  PF_FEED: 240,
  PF_FERMENT: 480,
  AUTOLYSE: 20,
  FERMENTOLYSE: 30,
  MIXING: 10,
  FOLD: 45,
  DIVIDE: 5,
  PRESHAPE: 5,
  REST: 20,
  SHAPE: 10,
  PROOF: 75,
  RETARD: 720,
  BAKE: 22,
  COOL: 60,
  FINISH: 10,
}

// ── Stage Color Map ──────────────────────────────────────────────────

export const STAGE_COLORS = {
  PF_MIX: 'bg-indigo-200',
  PF_FEED: 'bg-indigo-100',
  PF_FERMENT: 'bg-indigo-300',
  PREFERMENT_BUILD: 'bg-indigo-200',
  AUTOLYSE: 'bg-teal-200',
  FERMENTOLYSE: 'bg-teal-200',
  MIXING: 'bg-emerald-300',
  FOLD: 'bg-amber-200',
  DIVIDE: 'bg-slate-200',
  PRESHAPE: 'bg-slate-200',
  SHAPE: 'bg-slate-200',
  REST: 'bg-gray-100',
  PROOF: 'bg-orange-200',
  RETARD: 'bg-blue-200',
  BAKE: 'bg-red-300',
  COOL: 'bg-sky-100',
  FINISH: 'bg-violet-200',
}

// ── Companion "needed by" stage mapping ──────────────────────────────

const COMPANION_NEEDED_BY = {
  filling: 'SHAPE',
  glaze: 'BAKE',
  topping: 'BAKE',
  sauce: 'BAKE',
  garnish: 'FINISH',
  other: 'FINISH',
}

// ── Step Duration Resolution ─────────────────────────────────────────

/**
 * Resolve effective duration for a step.
 * Priority: explicit → PF ferment default → mix-type process values → stage defaults.
 */
function getStepDuration(step, context = {}) {
  if (step.duration_min != null && step.duration_min > 0) return step.duration_min

  // PF_FERMENT: use preferment settings
  if (step.stage === 'PF_FERMENT' && context.pfSettings) {
    return getEffectiveFermentationDuration(context.pfSettings)
  }

  // Mix-type process values for bulk/fold/proof/rest
  const proc = context.mixType
    ? MIX_TYPE_PROCESS[context.mixType] || MIX_TYPE_PROCESS['Improved Mix']
    : null

  if (proc) {
    if (step.stage === 'FOLD') return proc.fold_interval_min || 45
    if (step.stage === 'PROOF') return proc.proof_min || 75
    if (step.stage === 'REST') return proc.bench_rest_min || 20
  }

  return STAGE_DURATION_DEFAULTS[step.stage] || 10
}

// ── PF DAG Resolution (Kahn's algorithm) ─────────────────────────────

/**
 * Resolve preferment dependency order.
 * If PF_B has `preferment_bakers_pcts[PF_A.id] > 0`, then PF_A is a sub-ingredient
 * of PF_B → PF_A must be built first.
 *
 * @param {Array} pfIngredients - preferment ingredients with preferment_bakers_pcts
 * @returns {{ order: string[], layers: string[][], hasCycle: boolean }}
 */
export function resolvePrefermentDAG(pfIngredients) {
  const pfIds = new Set(pfIngredients.map((pf) => pf.id))
  const inDegree = new Map()
  const dependents = new Map() // parent → children that depend on it

  for (const pf of pfIngredients) {
    inDegree.set(pf.id, 0)
    dependents.set(pf.id, [])
  }

  // Build edges: if pf.preferment_bakers_pcts[targetId] > 0, pf contributes to targetId.
  // So pf must be built first → targetId depends on pf.
  // Skip self-references (starters that are part of their own build).
  for (const pf of pfIngredients) {
    const bps = pf.preferment_bakers_pcts || {}
    for (const [targetId, bp] of Object.entries(bps)) {
      if (targetId === pf.id) continue // skip self-reference
      if (pfIds.has(targetId) && bp > 0) {
        // targetId depends on pf (pf must be built first)
        inDegree.set(targetId, (inDegree.get(targetId) || 0) + 1)
        dependents.get(pf.id).push(targetId)
      }
    }
  }

  // Kahn's algorithm
  const layers = []
  const order = []
  let queue = pfIngredients
    .filter((pf) => inDegree.get(pf.id) === 0)
    .map((pf) => pf.id)

  while (queue.length > 0) {
    layers.push([...queue])
    order.push(...queue)
    const nextQueue = []
    for (const id of queue) {
      for (const dep of dependents.get(id) || []) {
        inDegree.set(dep, inDegree.get(dep) - 1)
        if (inDegree.get(dep) === 0) nextQueue.push(dep)
      }
    }
    queue = nextQueue
  }

  const hasCycle = order.length < pfIngredients.length

  return { order, layers, hasCycle }
}

// ── Track & Block Builders ───────────────────────────────────────────

let blockIdCounter = 0

function makeBlock(step, startTime, endTime, extra = {}) {
  const durationMin = (endTime - startTime) / 60000
  return {
    id: `block-${++blockIdCounter}`,
    label: step.title || step.stage,
    stage: step.stage,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    durationMin,
    temperature: step.temperature || null,
    description: step.description || '',
    color: STAGE_COLORS[step.stage] || 'bg-gray-200',
    suggested: extra.suggested || false,
    ...extra,
  }
}

/**
 * Build blocks for a sequence of steps, walking backward from an anchor time.
 * Last step ends at anchorMs; earlier steps precede it.
 */
function buildBlocksBackward(steps, anchorMs, context = {}) {
  const blocks = []
  let cursor = anchorMs

  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    const dur = getStepDuration(step, context)
    const endMs = cursor
    const startMs = endMs - dur * 60000
    blocks.unshift(makeBlock(step, startMs, endMs, { suggested: context.suggested }))
    cursor = startMs
  }

  return blocks
}

/**
 * Build blocks for a sequence of steps, walking forward from an anchor time.
 */
function buildBlocksForward(steps, anchorMs, context = {}) {
  const blocks = []
  let cursor = anchorMs

  for (const step of steps) {
    const dur = getStepDuration(step, context)
    const startMs = cursor
    const endMs = startMs + dur * 60000
    blocks.push(makeBlock(step, startMs, endMs, { suggested: context.suggested }))
    cursor = endMs
  }

  return blocks
}

// ── Main Entry Point ─────────────────────────────────────────────────

/**
 * Compute a full production timeline.
 *
 * @param {object} opts
 * @param {object} opts.recipe - full recipe object
 * @param {object|null} opts.calculated - calculated recipe data
 * @param {Date} opts.anchorTime - target mix time (forward) or finish time (reverse)
 * @param {'forward'|'reverse'} opts.mode
 * @param {string} opts.mixType
 * @param {Array} [opts.companions] - companion detail objects
 * @returns {Timeline}
 */
export function computeTimeline({
  recipe,
  calculated,
  anchorTime,
  mode = 'forward',
  mixType = 'Improved Mix',
  companions = [],
}) {
  blockIdCounter = 0
  const anchorMs = anchorTime.getTime()
  const tracks = []
  const milestones = []

  // ── Gather process steps (saved or synthetic) ──────────────────
  const savedMainSteps = (recipe.process_steps || []).filter(
    (s) => !s.preferment_ingredient_id
  )
  const savedPfSteps = (recipe.process_steps || []).filter(
    (s) => s.preferment_ingredient_id
  )

  const mainSteps = savedMainSteps.length > 0
    ? savedMainSteps
    : suggestProcessSteps({
        ingredients: recipe.ingredients || [],
        hasAutolyse: !!recipe.autolyse,
        autolyseDurationMin: recipe.autolyse_duration_min || 20,
        mixType,
        ddt: recipe.ddt || 24,
        autolyseOverrides: recipe.autolyse_overrides || {},
        doughType: recipe.dough_type || null,
      })

  const mainIsSynthetic = savedMainSteps.length === 0

  // ── Enabled preferments ────────────────────────────────────────
  const enabledPfs = (recipe.ingredients || []).filter(
    (i) => i.category === 'PREFERMENT' && i.preferment_settings?.enabled
  )

  // ── Resolve PF DAG ─────────────────────────────────────────────
  const dag = resolvePrefermentDAG(enabledPfs)

  // ── Compute mix time ───────────────────────────────────────────
  let mixTimeMs
  let computedFinishTime = null
  let computedMixTime = null

  if (mode === 'forward') {
    mixTimeMs = anchorMs
    // Walk main steps forward to find finish
    const mainBlocks = buildBlocksForward(mainSteps, mixTimeMs, {
      mixType,
      suggested: mainIsSynthetic,
    })
    computedFinishTime = mainBlocks.length > 0
      ? new Date(Math.max(...mainBlocks.map((b) => b.endTime.getTime())))
      : new Date(mixTimeMs)
  } else {
    // Reverse: anchor is finish time. Walk main steps backward.
    const mainBlocks = buildBlocksBackward(mainSteps, anchorMs, {
      mixType,
      suggested: mainIsSynthetic,
    })
    mixTimeMs = mainBlocks.length > 0
      ? mainBlocks[0].startTime.getTime()
      : anchorMs
    computedMixTime = new Date(mixTimeMs)
    computedFinishTime = new Date(anchorMs)
  }

  // ── Build Main Dough Track ─────────────────────────────────────
  const mainBlocks = mode === 'forward'
    ? buildBlocksForward(mainSteps, mixTimeMs, { mixType, suggested: mainIsSynthetic })
    : buildBlocksBackward(mainSteps, anchorMs, { mixType, suggested: mainIsSynthetic })

  if (mainBlocks.length > 0) {
    tracks.push({
      id: 'main',
      label: 'Main Dough',
      type: 'main',
      blocks: mainBlocks,
    })
  }

  // Add mix milestone
  milestones.push({ label: 'Mix', time: new Date(mixTimeMs), type: 'mix' })

  // Find oven-in and done milestones from main blocks
  const bakeBlock = mainBlocks.find((b) => b.stage === 'BAKE')
  if (bakeBlock) {
    milestones.push({ label: 'Oven In', time: bakeBlock.startTime, type: 'oven' })
  }
  if (mainBlocks.length > 0) {
    milestones.push({
      label: 'Done',
      time: mainBlocks[mainBlocks.length - 1].endTime,
      type: 'done',
    })
  }

  // ── Build PF Tracks ────────────────────────────────────────────
  // PF tracks are built backward from mixTimeMs.
  // For DAG deps: if PF_B depends on PF_A, PF_A's readyBy = PF_B's first step start.

  // First pass: compute each PF's steps and total duration
  const pfStepMap = new Map()
  for (const pf of enabledPfs) {
    const savedForPf = savedPfSteps.filter(
      (s) => s.preferment_ingredient_id === pf.id
    )
    const pfType = pf.preferment_settings?.type || 'CUSTOM'
    const steps = savedForPf.length > 0
      ? savedForPf
      : suggestPfProcessSteps(pfType, pf.name, pf.id)

    pfStepMap.set(pf.id, {
      steps,
      isSynthetic: savedForPf.length === 0,
      settings: pf.preferment_settings || { type: 'CUSTOM' },
    })
  }

  // Second pass: schedule PFs backward from their "ready by" time
  // Start from the deepest DAG layer (no dependents) and work outward
  const pfReadyBy = new Map()

  // Initialize: all PFs without dependents are ready by mixTimeMs
  for (const pf of enabledPfs) {
    pfReadyBy.set(pf.id, mixTimeMs)
  }

  // Process layers in reverse (deepest first → they depend on earlier layers)
  // Actually we process in order: layer 0 PFs are dependencies, schedule them
  // after we know when their dependents need them
  // Layer N PFs depend on layer N-1. So layer N's start determines layer N-1's readyBy.

  // Process in reverse layer order to resolve dependencies
  for (let li = dag.layers.length - 1; li >= 0; li--) {
    for (const pfId of dag.layers[li]) {
      const pf = enabledPfs.find((p) => p.id === pfId)
      if (!pf) continue

      const { steps, isSynthetic, settings } = pfStepMap.get(pfId)
      const readyByMs = pfReadyBy.get(pfId)

      const blocks = buildBlocksBackward(steps, readyByMs, {
        mixType,
        pfSettings: settings,
        suggested: isSynthetic,
      })

      if (blocks.length > 0) {
        tracks.push({
          id: `pf-${pfId}`,
          label: pf.name,
          type: 'preferment',
          blocks,
        })

        // Update dependencies: PFs that this PF depends on must be ready
        // by this PF's first step start
        const bps = pf.preferment_bakers_pcts || {}
        const firstStart = blocks[0].startTime.getTime()
        for (const [depId, bp] of Object.entries(bps)) {
          if (bp > 0 && enabledPfs.some((p) => p.id === depId)) {
            const currentReadyBy = pfReadyBy.get(depId)
            if (firstStart < currentReadyBy) {
              pfReadyBy.set(depId, firstStart)
            }
          }
        }
      }
    }
  }

  // ── Build Companion Tracks ─────────────────────────────────────
  if (companions && companions.length > 0) {
    for (const comp of companions) {
      const neededByStage = COMPANION_NEEDED_BY[comp.role] || 'FINISH'
      // Find the main block for this stage
      const targetBlock = mainBlocks.find((b) => b.stage === neededByStage)
      const neededByMs = targetBlock
        ? targetBlock.startTime.getTime()
        : (mainBlocks.length > 0
            ? mainBlocks[mainBlocks.length - 1].endTime.getTime()
            : mixTimeMs)

      // Use companion's own process steps, or generate synthetic ones
      const compSteps = comp.recipe?.process_steps?.length > 0
        ? comp.recipe.process_steps.filter((s) => !s.preferment_ingredient_id)
        : suggestProcessSteps({
            ingredients: comp.recipe?.ingredients || [],
            hasAutolyse: false,
            mixType: comp.recipe?.mix_type || 'Improved Mix',
            ddt: comp.recipe?.ddt || 24,
            doughType: comp.recipe?.dough_type || null,
          })

      const compIsSynthetic = !(comp.recipe?.process_steps?.length > 0)

      const blocks = buildBlocksBackward(compSteps, neededByMs, {
        mixType: comp.recipe?.mix_type || 'Improved Mix',
        suggested: compIsSynthetic,
      })

      if (blocks.length > 0) {
        tracks.push({
          id: `comp-${comp.companion_recipe_id}`,
          label: comp.companion_name || 'Companion',
          type: 'companion',
          blocks,
        })
      }
    }
  }

  // ── Compute span ───────────────────────────────────────────────
  const allBlocks = tracks.flatMap((t) => t.blocks)
  const earliestStart = allBlocks.length > 0
    ? new Date(Math.min(...allBlocks.map((b) => b.startTime.getTime())))
    : new Date(mixTimeMs)
  const latestEnd = allBlocks.length > 0
    ? new Date(Math.max(...allBlocks.map((b) => b.endTime.getTime())))
    : new Date(mixTimeMs)

  return {
    tracks,
    earliestStart,
    latestEnd,
    anchorTime: new Date(anchorMs),
    mixTime: new Date(mixTimeMs),
    mode,
    milestones,
    computedMixTime,
    computedFinishTime,
    totalDurationMin: (latestEnd - earliestStart) / 60000,
    dagHasCycle: dag.hasCycle,
  }
}
