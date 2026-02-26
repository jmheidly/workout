/**
 * §12.6 — Diff two recipe version snapshots.
 *
 * Key rule: match ingredients by their stable UUID, not by name.
 * This correctly detects renames as a distinct change type.
 *
 * Can compare any two versions — not just adjacent ones.
 *
 * @param {object} snapshotA - older version (parsed JSON)
 * @param {object} snapshotB - newer version (parsed JSON)
 * @returns {Array<object>} list of change objects
 */
export function diffVersions(snapshotA, snapshotB) {
  const changes = []

  // ── Recipe-level param changes ─────────────────────────────
  const RECIPE_FIELDS = [
    'name',
    'yield_per_piece',
    'ddt',
    'autolyse',
    'autolyse_duration_min',
    'process_loss_pct',
    'bake_loss_pct',
    'mix_type',
    'mixer_profile_id',
  ]

  for (const field of RECIPE_FIELDS) {
    const oldVal = snapshotA[field] ?? null
    const newVal = snapshotB[field] ?? null
    if (oldVal !== newVal) {
      changes.push({ type: 'param_changed', field, old: oldVal, new: newVal })
    }
  }

  // ── Ingredient changes (UUID-matched) ──────────────────────
  const aIngs = snapshotA.ingredients || []
  const bIngs = snapshotB.ingredients || []
  const aById = Object.fromEntries(aIngs.map((i) => [i.id, i]))
  const bById = Object.fromEntries(bIngs.map((i) => [i.id, i]))
  const aIds = new Set(aIngs.map((i) => i.id))
  const bIds = new Set(bIngs.map((i) => i.id))

  // Added
  for (const id of bIds) {
    if (!aIds.has(id)) {
      const ing = bById[id]
      changes.push({
        type: 'ingredient_added',
        ingredient_id: id,
        name: ing.name,
        category: ing.category,
        base_qty: ing.base_qty,
      })
    }
  }

  // Removed
  for (const id of aIds) {
    if (!bIds.has(id)) {
      const ing = aById[id]
      changes.push({
        type: 'ingredient_removed',
        ingredient_id: id,
        name: ing.name,
        category: ing.category,
        base_qty: ing.base_qty,
      })
    }
  }

  // Modified (present in both)
  for (const id of aIds) {
    if (!bIds.has(id)) continue
    const a = aById[id]
    const b = bById[id]

    // Rename
    if (a.name !== b.name) {
      changes.push({
        type: 'ingredient_renamed',
        ingredient_id: id,
        old_name: a.name,
        new_name: b.name,
      })
    }

    // Field changes
    for (const field of ['base_qty', 'category', 'sort_order']) {
      const oldVal = a[field] ?? null
      const newVal = b[field] ?? null
      if (oldVal !== newVal) {
        changes.push({
          type: 'ingredient_modified',
          ingredient_id: id,
          name: b.name,
          field,
          old: oldVal,
          new: newVal,
        })
      }
    }

    // Preferment baker's % changes
    const aPf = a.preferment_bakers_pcts || {}
    const bPf = b.preferment_bakers_pcts || {}
    const allPfIds = new Set([...Object.keys(aPf), ...Object.keys(bPf)])
    for (const pfId of allPfIds) {
      const oldVal = aPf[pfId] ?? null
      const newVal = bPf[pfId] ?? null
      if (oldVal !== newVal) {
        changes.push({
          type: 'ingredient_modified',
          ingredient_id: id,
          name: b.name,
          field: `preferment_pct_${pfId}`,
          old: oldVal,
          new: newVal,
        })
      }
    }
  }

  // ── Process step changes (UUID-matched) ────────────────────
  const aSteps = snapshotA.process_steps || []
  const bSteps = snapshotB.process_steps || []
  const aStepById = Object.fromEntries(aSteps.map((s) => [s.id, s]))
  const bStepById = Object.fromEntries(bSteps.map((s) => [s.id, s]))
  const aStepIds = new Set(aSteps.map((s) => s.id))
  const bStepIds = new Set(bSteps.map((s) => s.id))

  for (const id of bStepIds) {
    if (!aStepIds.has(id)) {
      changes.push({ type: 'step_added', step_id: id, name: bStepById[id].title })
    }
  }

  for (const id of aStepIds) {
    if (!bStepIds.has(id)) {
      changes.push({ type: 'step_removed', step_id: id, name: aStepById[id].title })
    }
  }

  for (const id of aStepIds) {
    if (!bStepIds.has(id)) continue
    const a = aStepById[id]
    const b = bStepById[id]
    for (const field of ['title', 'stage', 'duration_min', 'temperature', 'sort_order']) {
      const oldVal = a[field] ?? null
      const newVal = b[field] ?? null
      if (oldVal !== newVal) {
        changes.push({
          type: 'step_modified',
          step_id: id,
          name: b.title,
          field,
          old: oldVal,
          new: newVal,
        })
      }
    }
  }

  return changes
}

/**
 * Generate a human-readable summary line from a list of changes.
 * Used in the version history timeline.
 *
 * @param {Array<object>} changes - output from diffVersions
 * @returns {string}
 */
export function summarizeChanges(changes) {
  if (!changes.length) return 'No changes'

  const parts = []

  // Group by type
  const paramChanges = changes.filter((c) => c.type === 'param_changed')
  const added = changes.filter((c) => c.type === 'ingredient_added')
  const removed = changes.filter((c) => c.type === 'ingredient_removed')
  const renamed = changes.filter((c) => c.type === 'ingredient_renamed')
  const modified = changes.filter((c) => c.type === 'ingredient_modified')
  const stepsAdded = changes.filter((c) => c.type === 'step_added')
  const stepsRemoved = changes.filter((c) => c.type === 'step_removed')
  const stepsModified = changes.filter((c) => c.type === 'step_modified')

  // Recipe-level changes
  for (const c of paramChanges) {
    if (c.field === 'name') {
      parts.push(`Renamed "${c.old}" → "${c.new}"`)
    } else if (c.field === 'ddt') {
      parts.push(`DDT ${c.old}°C → ${c.new}°C`)
    } else if (c.field === 'yield_per_piece') {
      parts.push(`Yield ${c.old}g → ${c.new}g`)
    } else if (c.field === 'process_loss_pct') {
      parts.push(`Process loss ${fmtPct(c.old)} → ${fmtPct(c.new)}`)
    } else if (c.field === 'bake_loss_pct') {
      parts.push(`Bake loss ${fmtPct(c.old)} → ${fmtPct(c.new)}`)
    } else if (c.field === 'mix_type') {
      parts.push(`Mix type → ${c.new}`)
    } else if (c.field === 'autolyse') {
      parts.push(c.new ? 'Enabled autolyse' : 'Disabled autolyse')
    }
  }

  // Ingredient changes
  if (added.length) {
    parts.push(`Added ${added.map((c) => c.name).join(', ')}`)
  }
  if (removed.length) {
    parts.push(`Removed ${removed.map((c) => c.name).join(', ')}`)
  }
  if (renamed.length) {
    parts.push(renamed.map((c) => `Renamed ${c.old_name} → ${c.new_name}`).join(', '))
  }

  // Quantity changes (most common for bakeries)
  const qtyChanges = modified.filter((c) => c.field === 'base_qty')
  if (qtyChanges.length) {
    parts.push(qtyChanges.map((c) => `${c.name}: ${c.old}g → ${c.new}g`).join(', '))
  }

  // Step changes
  if (stepsAdded.length) {
    parts.push(`Added step${stepsAdded.length > 1 ? 's' : ''}: ${stepsAdded.map((c) => c.name).join(', ')}`)
  }
  if (stepsRemoved.length) {
    parts.push(`Removed step${stepsRemoved.length > 1 ? 's' : ''}: ${stepsRemoved.map((c) => c.name).join(', ')}`)
  }
  if (stepsModified.length) {
    const uniqueSteps = [...new Set(stepsModified.map((c) => c.name))]
    parts.push(`Updated step${uniqueSteps.length > 1 ? 's' : ''}: ${uniqueSteps.join(', ')}`)
  }

  if (!parts.length) {
    // Only PF% or sort_order changes
    const pfChanges = modified.filter((c) => c.field.startsWith('preferment_pct_'))
    if (pfChanges.length) {
      parts.push(`Updated pre-ferment percentages`)
    }
    const sortChanges = modified.filter((c) => c.field === 'sort_order')
    if (sortChanges.length) {
      parts.push(`Reordered ingredients`)
    }
  }

  return parts.join('; ') || 'Minor changes'
}

function fmtPct(v) {
  return `${((v || 0) * 100).toFixed(1)}%`
}
