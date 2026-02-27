/**
 * Mixing Phase Classification Engine (§10.2)
 * Shared module — determines which mixing phase each ingredient belongs to.
 *
 * Phase order: AUTOLYSE → INCORPORATION → FAT_ADDITION → MIXIN
 * Development is an implicit transition between INCORPORATION and FAT_ADDITION,
 * not a phase ingredients are classified into.
 */

export const MIXING_PHASES = {
  AUTOLYSE: 0, // flour + water + liquid PFs — mixed briefly, then rest
  INCORPORATION: 1, // salt, yeast, stiff PFs, eggs, oils, low-fat, low-sugar, dry powders
  FAT_ADDITION: 2, // high-fat enrichments (>4% BP), high-sugar sweeteners (>12% BP)
  MIXIN: 3, // nuts, fruit, chocolate — after development, 1st speed only
}

// Name heuristics — override category/BP classification
const EGG_PATTERN = /\beggs?\b|\begg\s*yolks?\b|\begg\s*whites?\b/i
const LIQUID_FAT_PATTERN = /\boil\b/i

const LIQUID_PF_TYPES = new Set(['POOLISH', 'LEVAIN'])

// Poolish water contribution threshold (fraction of total formula water):
//   < 15%   — minor hydration effect, should not be in autolyse
//   15–25%  — gray zone, default to AUTOLYSE (baker can override via drag)
//   > 25%   — structurally important, belongs in autolyse
const POOLISH_WATER_THRESHOLD = 0.15

// Flour composition heuristics for sourdough decision matrix
const RYE_PATTERN = /\brye\b/i
const WHOLE_WHEAT_PATTERN = /\bwhole\s*wheat\b|\bWW\b|\bwheatmeal\b/i

/**
 * Classify a single ingredient into its mixing phase.
 *
 * @param {{ name: string, category: string, base_qty: number, preferment_settings?: { enabled?: number|boolean, type?: string } }} ingredient
 * @param {number} totalFlourQty - total flour weight for BP thresholds
 * @returns {number|null} phase constant or null (skip)
 */
export function classifyMixingPhase(ingredient, totalFlourQty) {
  const { name, category, base_qty } = ingredient

  // 1. Skip zero-qty
  if (!base_qty) return null

  // 2. Skip disabled preferments
  if (category === 'PREFERMENT') {
    const settings = ingredient.preferment_settings
    if (settings?.enabled !== 1 && settings?.enabled !== true) return null
  }

  // 3. FLOUR → AUTOLYSE
  if (category === 'FLOUR') return MIXING_PHASES.AUTOLYSE

  // 4. LIQUID → AUTOLYSE
  if (category === 'LIQUID') return MIXING_PHASES.AUTOLYSE

  // 5. Liquid preferments → AUTOLYSE
  if (category === 'PREFERMENT') {
    const pfType = ingredient.preferment_settings?.type
    if (LIQUID_PF_TYPES.has(pfType)) return MIXING_PHASES.AUTOLYSE
  }

  // 6. MIXIN → MIXIN
  if (category === 'MIXIN') return MIXING_PHASES.MIXIN

  // 7. Eggs → INCORPORATION (regardless of category/BP)
  if (EGG_PATTERN.test(name)) return MIXING_PHASES.INCORPORATION

  // 8. Liquid fats (oil) → INCORPORATION (regardless of category/BP)
  if (LIQUID_FAT_PATTERN.test(name)) return MIXING_PHASES.INCORPORATION

  // 9. Stiff preferments → INCORPORATION
  if (category === 'PREFERMENT') return MIXING_PHASES.INCORPORATION

  // 10. LEAVENING → INCORPORATION
  if (category === 'LEAVENING') return MIXING_PHASES.INCORPORATION

  // 11. SEASONING → INCORPORATION
  if (category === 'SEASONING') return MIXING_PHASES.INCORPORATION

  // 12. FLAVORING → INCORPORATION
  if (category === 'FLAVORING') return MIXING_PHASES.INCORPORATION

  // 12b. CONDITIONER → INCORPORATION
  if (category === 'CONDITIONER') return MIXING_PHASES.INCORPORATION

  // 13. ENRICHMENT: BP ≤ 4% → INCORPORATION, else → FAT_ADDITION
  if (category === 'ENRICHMENT') {
    const bp = totalFlourQty > 0 ? base_qty / totalFlourQty : 0
    return bp <= 0.04 ? MIXING_PHASES.INCORPORATION : MIXING_PHASES.FAT_ADDITION
  }

  // 14. SWEETENER: BP ≤ 12% → INCORPORATION, else → FAT_ADDITION
  if (category === 'SWEETENER') {
    const bp = totalFlourQty > 0 ? base_qty / totalFlourQty : 0
    return bp <= 0.12 ? MIXING_PHASES.INCORPORATION : MIXING_PHASES.FAT_ADDITION
  }

  // 15. Fallback → INCORPORATION
  return MIXING_PHASES.INCORPORATION
}

/**
 * Classify all ingredients in a recipe.
 *
 * After initial classification, liquid PFs placed in AUTOLYSE are refined:
 * - POOLISH: water contribution threshold (< 15% → INCORPORATION)
 * - LEVAIN: sourdough decision matrix based on hydration, inoculation, flour composition
 *
 * All ratio metrics use TFQ-based totals (K + PF contributions) per §8.4.
 *
 * @param {Array<{ id: string, name: string, category: string, base_qty: number, preferment_settings?: object, preferment_bakers_pcts?: object }>} ingredients
 * @returns {{ phases: Map<string, number>, warnings: Array<{ type: string, message: string }> }}
 */
export function classifyAllIngredients(ingredients) {
  // K-based flour total — used for initial per-ingredient BP thresholds (enrichment/sweetener)
  const kFlourQty = ingredients
    .filter((i) => i.category === 'FLOUR')
    .reduce((sum, i) => sum + (i.base_qty || 0), 0)

  // Enabled PFs for TFQ computation
  const enabledPFs = ingredients.filter((i) => {
    if (i.category !== 'PREFERMENT') return false
    const s = i.preferment_settings
    return (s?.enabled === 1 || s?.enabled === true) && (i.base_qty || 0) > 0
  })

  // TFQ-based flour totals (K + flour inside all PFs) — per §8.4 metrics
  const flourIngredients = ingredients.filter((i) => i.category === 'FLOUR')
  let totalFlourTfq = 0
  let ryeQty = 0
  let wholeWheatQty = 0
  for (const f of flourIngredients) {
    let fTfq = f.base_qty || 0
    for (const pf of enabledPFs) {
      fTfq += ingredientQtyInPf(f, pf, ingredients)
    }
    totalFlourTfq += fTfq
    if (RYE_PATTERN.test(f.name)) ryeQty += fTfq
    if (WHOLE_WHEAT_PATTERN.test(f.name)) wholeWheatQty += fTfq
  }

  // TFQ-based total water (K water + water from ALL enabled PFs)
  const kWater = ingredients
    .filter((i) => i.category === 'LIQUID')
    .reduce((sum, i) => sum + (i.base_qty || 0), 0)
  let pfWaterTotal = 0
  for (const pf of enabledPFs) {
    const water = pfWaterQty(pf, ingredients)
    if (water !== null) pfWaterTotal += water
  }
  const totalFormulaWater = kWater + pfWaterTotal

  // Initial per-ingredient classification
  const map = new Map()
  for (const ing of ingredients) {
    const phase = classifyMixingPhase(ing, kFlourQty)
    if (phase !== null) map.set(ing.id, phase)
  }

  const warnings = []

  // Post-pass: refine liquid PF classification in AUTOLYSE
  const liquidPFs = ingredients.filter(
    (i) =>
      i.category === 'PREFERMENT' && map.get(i.id) === MIXING_PHASES.AUTOLYSE
  )

  if (liquidPFs.length > 0) {
    const totalHydration =
      totalFlourTfq > 0 ? totalFormulaWater / totalFlourTfq : 0
    const ryePct = totalFlourTfq > 0 ? ryeQty / totalFlourTfq : 0
    const wholeWheatPct = totalFlourTfq > 0 ? wholeWheatQty / totalFlourTfq : 0

    for (const pf of liquidPFs) {
      const pfType = pf.preferment_settings?.type

      if (pfType === 'POOLISH') {
        // Poolish: existing water-ratio threshold
        if (totalFormulaWater > 0) {
          const water = pfWaterQty(pf, ingredients)
          if (
            water !== null &&
            water / totalFormulaWater < POOLISH_WATER_THRESHOLD
          ) {
            map.set(pf.id, MIXING_PHASES.INCORPORATION)
          }
        }
      } else if (pfType === 'LEVAIN') {
        // Sourdough decision matrix — uses TFQ-based totals
        const metrics = pfMetrics(
          pf,
          ingredients,
          totalFlourTfq,
          totalFormulaWater
        )

        // Rule 0: No BP data — keep AUTOLYSE default
        if (!metrics) continue

        // Rule 1: Stiff levain (< 65% hydration) → INCORPORATION
        if (metrics.hydration !== null && metrics.hydration < 0.65) {
          map.set(pf.id, MIXING_PHASES.INCORPORATION)
          continue
        }

        // Rule 2: Whole wheat > 40% → INCORPORATION
        if (wholeWheatPct > 0.4) {
          map.set(pf.id, MIXING_PHASES.INCORPORATION)
          continue
        }

        // Rule 3: High inoculation (>= 25%) → AUTOLYSE (fermentolyse)
        if (metrics.inoculationPct >= 0.25) continue

        // Rule 4: Low inoculation (< 15%) AND low water ratio (< 20%) → INCORPORATION
        if (metrics.inoculationPct < 0.15 && metrics.waterRatio < 0.2) {
          map.set(pf.id, MIXING_PHASES.INCORPORATION)
          continue
        }

        // Rules 5/6: Gray zone (15–25% inoculation)
        if (totalHydration >= 0.75) {
          // Rule 5: High hydration → AUTOLYSE (fermentolyse)
          continue
        } else {
          // Rule 6: Low hydration → INCORPORATION
          map.set(pf.id, MIXING_PHASES.INCORPORATION)
          continue
        }
      }
      // Other liquid PF types: keep AUTOLYSE default from initial pass
    }

    // Rye autolyse warning
    if (ryePct > 0.3) {
      const hasAutolysePhase = [...map.values()].some(
        (p) => p === MIXING_PHASES.AUTOLYSE
      )
      if (hasAutolysePhase) {
        warnings.push({
          type: 'rye_autolyse',
          message:
            'Rye flour is >30% of total flour. Autolyse is typically not beneficial for high-rye doughs \u2014 rye lacks the gluten proteins that autolyse develops. Consider disabling autolyse.',
        })
      }
    }
  }

  return { phases: map, warnings }
}

/**
 * Compute grams of a specific ingredient inside a preferment.
 * Uses the same proportional split as calcPrefermentBreakdown in engine.js.
 * Returns 0 if ingredient has no BP entry for this PF.
 */
function ingredientQtyInPf(ingredient, pfIngredient, allIngredients) {
  const bp = ingredient.preferment_bakers_pcts?.[pfIngredient.id]
  if (!bp || bp <= 0) return 0
  if (!pfIngredient.base_qty) return 0

  let totalPfBp = 0
  for (const ing of allIngredients) {
    const ingBp = ing.preferment_bakers_pcts?.[pfIngredient.id]
    if (ingBp != null && ingBp > 0) totalPfBp += ingBp
  }

  if (totalPfBp === 0) return 0
  return (pfIngredient.base_qty / totalPfBp) * bp
}

/**
 * Compute grams of water inside a preferment using preferment_bakers_pcts.
 * Returns null if bakers pct data isn't available (skip the threshold check).
 */
function pfWaterQty(pfIngredient, allIngredients) {
  if (!pfIngredient.base_qty) return null

  let totalPfBp = 0
  let waterBp = 0

  for (const ing of allIngredients) {
    const bp = ing.preferment_bakers_pcts?.[pfIngredient.id]
    if (bp != null && bp > 0) {
      totalPfBp += bp
      if (ing.category === 'LIQUID') waterBp += bp
    }
  }

  if (totalPfBp === 0) return null
  return (pfIngredient.base_qty / totalPfBp) * waterBp
}

/**
 * Compute grams of flour inside a preferment using preferment_bakers_pcts.
 * Returns null if bakers pct data isn't available.
 */
function pfFlourQty(pfIngredient, allIngredients) {
  if (!pfIngredient.base_qty) return null

  let totalPfBp = 0
  let flourBp = 0

  for (const ing of allIngredients) {
    const bp = ing.preferment_bakers_pcts?.[pfIngredient.id]
    if (bp != null && bp > 0) {
      totalPfBp += bp
      if (ing.category === 'FLOUR') flourBp += bp
    }
  }

  if (totalPfBp === 0) return null
  return (pfIngredient.base_qty / totalPfBp) * flourBp
}

/**
 * Compute sourdough decision metrics for a preferment.
 * Returns null if no BP data is available.
 */
function pfMetrics(
  pfIngredient,
  allIngredients,
  totalFlourQty,
  totalFormulaWater
) {
  const flourQty = pfFlourQty(pfIngredient, allIngredients)
  const waterQty = pfWaterQty(pfIngredient, allIngredients)

  if (flourQty === null && waterQty === null) return null

  return {
    flourQty: flourQty || 0,
    waterQty: waterQty || 0,
    hydration: flourQty > 0 ? (waterQty || 0) / flourQty : null,
    inoculationPct: totalFlourQty > 0 ? (flourQty || 0) / totalFlourQty : 0,
    waterRatio: totalFormulaWater > 0 ? (waterQty || 0) / totalFormulaWater : 0,
  }
}

/**
 * Group ingredients by their mixing phase.
 *
 * @param {Array<{ id: string, name: string }>} ingredients
 * @param {Map<string, number>} phaseMap - from classifyAllIngredients
 * @returns {{ [phase: number]: Array<{ id: string, name: string }> }}
 */
export function groupByPhase(ingredients, phaseMap) {
  const groups = {}
  for (const ing of ingredients) {
    const phase = phaseMap.get(ing.id)
    if (phase == null) continue
    if (!groups[phase]) groups[phase] = []
    groups[phase].push(ing)
  }
  return groups
}
