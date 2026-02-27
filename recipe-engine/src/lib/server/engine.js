import { safeDivide } from '$lib/utils.js'
import { MIXING_PHASES, classifyAllIngredients } from '$lib/mixing-phases.js'

/**
 * @typedef {Object} Ingredient
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {number} base_qty - K column (grams)
 * @property {number} sort_order
 * @property {Object.<string, number|null>} preferment_bakers_pcts
 * @property {Object|null} preferment_settings
 */

/**
 * @typedef {Object} Recipe
 * @property {string} id
 * @property {string} name
 * @property {number} yield_per_piece
 * @property {number} ddt
 * @property {number} [process_loss_pct]
 * @property {number} [bake_loss_pct]
 * @property {number} [autolyse]
 * @property {number} [autolyse_duration_min]
 * @property {Ingredient[]} ingredients
 */

/**
 * Main entry point: calculate all derived values for a recipe.
 * Pure function — no side effects, no DB access.
 *
 * @param {Recipe} recipe
 * @returns {object}
 */
export function calculateRecipe(recipe) {
  const ingredients = recipe.ingredients || []
  const baseCat = recipe.base_ingredient_category || 'FLOUR'
  const prefermentIngredients = ingredients.filter(
    (i) => i.category === 'PREFERMENT'
  )
  const nonPfIngredients = ingredients.filter(
    (i) => i.category !== 'PREFERMENT'
  )
  const baseIngredients = ingredients.filter((i) => i.category === baseCat)
  const baseQty = baseIngredients.reduce((sum, i) => sum + i.base_qty, 0)

  // §5.5: Resolve pre-ferment calculation order (topological sort)
  const pfOrder = resolvePrefermentOrder(prefermentIngredients)

  // Build preferment map for quick lookup
  const pfMap = Object.fromEntries(
    prefermentIngredients.map((pf) => [pf.id, pf])
  )

  // Calculate pre-ferment breakdowns in dependency order
  // pfBreakdowns[pf_id] = { ingredientId: qty }
  const pfBreakdowns = {}
  for (const pfId of pfOrder) {
    const pf = pfMap[pfId]
    pfBreakdowns[pfId] = calcPrefermentBreakdown(
      pf,
      ingredients,
      pfMap,
      pfBreakdowns,
      baseQty
    )
  }

  // §4.7: Total formula quantities (for non-PF ingredients)
  const totalFormulaQtys = {}
  for (const ing of ingredients) {
    totalFormulaQtys[ing.id] = calcTotalFormulaQty(
      ing,
      pfBreakdowns,
      prefermentIngredients
    )
  }

  // §4.6v2: Final dough quantities (computed from pre-decomposition TFQ)
  const finalDoughQtys = {}
  for (const ing of ingredients) {
    finalDoughQtys[ing.id] = calcFinalDoughQty(
      ing,
      totalFormulaQtys[ing.id],
      pfBreakdowns,
      prefermentIngredients
    )
  }

  // Self-reference decomposition: distribute PF self-qty proportionally
  // into TFQ for accurate analytical values (hydration, % of total flour)
  for (const pf of prefermentIngredients) {
    const selfQty = pfBreakdowns[pf.id]?.[pf.id] || 0
    if (selfQty <= 0) continue

    let nonSelfBPTotal = 0
    const contributors = []
    for (const ing of ingredients) {
      if (ing.id === pf.id || ing.category === 'PREFERMENT') continue
      const bp = ing.preferment_bakers_pcts?.[pf.id]
      if (bp != null && bp > 0) {
        contributors.push({ id: ing.id, bp })
        nonSelfBPTotal += bp
      }
    }
    if (nonSelfBPTotal <= 0) continue

    for (const c of contributors) {
      totalFormulaQtys[c.id] += selfQty * (c.bp / nonSelfBPTotal)
    }
  }

  // Total formula base for §4.8
  const totalFormulaBase = baseIngredients.reduce(
    (sum, i) => sum + totalFormulaQtys[i.id],
    0
  )

  // Final dough base total for §4.9
  const finalDoughBase = baseIngredients.reduce(
    (sum, i) => sum + finalDoughQtys[i.id],
    0
  )

  // Total final dough weight (G_total)
  const totalFinalDoughWeight = ingredients.reduce(
    (sum, i) => sum + finalDoughQtys[i.id],
    0
  )

  // Total recipe weight (sum of all K values)
  const totalRecipeWeight = ingredients.reduce((sum, i) => sum + i.base_qty, 0)

  // §11: Loss & Waste — compute raw yield per piece
  const processLossPct = recipe.process_loss_pct || 0
  const bakeLossPct = recipe.bake_loss_pct || 0
  const rawYieldPerPiece = calcAdjustedYield(
    recipe.yield_per_piece,
    processLossPct,
    bakeLossPct
  )
  const scaleFactor = safeDivide(rawYieldPerPiece, recipe.yield_per_piece, 1)

  // num_pieces §4.11 — use raw yield when loss factors are set
  const numPieces = safeDivide(totalRecipeWeight, rawYieldPerPiece)

  // Build per-ingredient calculated values
  const calculatedIngredients = ingredients.map((ing) => {
    // §4.2: Overall Baker's % (TFQ-based — matches spreadsheet Column C)
    const overallBakersPct = safeDivide(
      totalFormulaQtys[ing.id],
      totalFormulaBase
    )

    // §4.9: Final dough Baker's %
    let finalDoughBakersPct
    if (ing.category === baseCat) {
      finalDoughBakersPct = safeDivide(ing.base_qty, baseQty)
    } else {
      finalDoughBakersPct = safeDivide(ing.base_qty, finalDoughBase)
    }

    // §4.10: Per-item weight (uses raw yield to account for loss)
    const perItemWeight = safeDivide(
      finalDoughQtys[ing.id] * rawYieldPerPiece,
      totalFinalDoughWeight
    )

    // §4.11: Batch quantity
    const batchQty = perItemWeight * numPieces

    // Pre-ferment quantities per PF
    const prefermentQtys = {}
    for (const pf of prefermentIngredients) {
      prefermentQtys[pf.id] = pfBreakdowns[pf.id]?.[ing.id] || 0
    }

    return {
      id: ing.id,
      name: ing.name,
      category: ing.category,
      base_qty: ing.base_qty,
      sort_order: ing.sort_order,
      overall_bakers_pct: overallBakersPct,
      total_formula_qty: totalFormulaQtys[ing.id],
      final_dough_bakers_pct: finalDoughBakersPct,
      final_dough_qty: finalDoughQtys[ing.id],
      per_item_weight: perItemWeight,
      batch_qty: batchQty,
      preferment_qtys: prefermentQtys,
    }
  })

  // Build preferment summaries
  const preferments = prefermentIngredients.map((pf) => {
    const settings = pf.preferment_settings || { enabled: 1, type: 'CUSTOM' }
    const enabled = settings.enabled === 1 || settings.enabled === true
    const ratio = enabled ? safeDivide(pf.base_qty, baseQty) : 0
    const breakdown = pfBreakdowns[pf.id] || {}

    // Total baker's pct for this PF
    const totalBakersPct = ingredients.reduce((sum, ing) => {
      const bp = ing.preferment_bakers_pcts?.[pf.id]
      return sum + (bp != null ? bp : 0)
    }, 0)

    // Named breakdown
    const namedBreakdown = {}
    for (const [ingId, qty] of Object.entries(breakdown)) {
      const ing = ingredients.find((i) => i.id === ingId)
      if (ing) namedBreakdown[ing.name] = qty
    }

    // §4.13: Pre-fermented base %
    let prefermentedFlourPct = 0
    if (enabled && totalFormulaBase > 0) {
      const pfBase = Object.entries(breakdown).reduce((sum, [ingId, qty]) => {
        const ing = ingredients.find((i) => i.id === ingId)
        return ing && ing.category === baseCat ? sum + qty : sum
      }, 0)
      prefermentedFlourPct = safeDivide(pfBase, totalFormulaBase)
    }

    return {
      id: pf.id,
      name: pf.name,
      type: settings.type,
      enabled,
      ratio,
      total_bakers_pct: totalBakersPct,
      breakdown: namedBreakdown,
      prefermented_flour_pct: prefermentedFlourPct,
    }
  })

  // §4.14: Hydration
  const totalWater = ingredients
    .filter((i) => i.category === 'LIQUID')
    .reduce((sum, i) => sum + totalFormulaQtys[i.id], 0)
  const hydration = safeDivide(totalWater, totalFormulaBase)

  // §4.13: Total pre-fermented flour %
  const totalPrefermentedFlourPct = preferments.reduce(
    (sum, pf) => sum + pf.prefermented_flour_pct,
    0
  )

  // §8: Autolyse split
  let autolyse = null
  if (recipe.autolyse) {
    autolyse = calcAutolyseSplit(
      ingredients,
      finalDoughQtys,
      recipe.autolyse_duration_min || 20,
      recipe.autolyse_overrides || {}
    )
  }

  return {
    ingredients: calculatedIngredients,
    preferments,
    autolyse,
    totals: {
      hydration,
      total_weight: totalRecipeWeight,
      total_flour: baseQty,
      total_formula_flour: totalFormulaBase,
      total_final_dough_weight: totalFinalDoughWeight,
      num_pieces: numPieces,
      total_prefermented_flour_pct: totalPrefermentedFlourPct,
      raw_yield_per_piece: rawYieldPerPiece,
      scale_factor: scaleFactor,
      process_loss_pct: processLossPct,
      bake_loss_pct: bakeLossPct,
    },
  }
}

// ─── Pre-ferment Internal Quantities (§4.4) ─────────────────────────────────

/**
 * Calculate the breakdown of a single pre-ferment.
 * Returns { [ingredientId]: quantity } for all ingredients in this PF.
 *
 * @param {Ingredient} pf - the pre-ferment ingredient
 * @param {Ingredient[]} allIngredients
 * @param {Object} pfMap - id -> preferment ingredient
 * @param {Object} pfBreakdowns - already-calculated breakdowns
 * @param {number} baseFlourQty
 * @returns {Object.<string, number>}
 */
function calcPrefermentBreakdown(
  pf,
  allIngredients,
  pfMap,
  pfBreakdowns,
  baseFlourQty
) {
  const settings = pf.preferment_settings || { enabled: 1 }
  const enabled = settings.enabled === 1 || settings.enabled === true

  if (!enabled || pf.base_qty === 0) return {}

  // Sum of all Baker's % within this PF
  const pfTotalBp = allIngredients.reduce((sum, ing) => {
    const bp = ing.preferment_bakers_pcts?.[pf.id]
    return sum + (bp != null ? bp : 0)
  }, 0)

  if (pfTotalBp === 0) return {}

  const breakdown = {}
  for (const ing of allIngredients) {
    const bp = ing.preferment_bakers_pcts?.[pf.id]
    if (bp != null && bp > 0) {
      breakdown[ing.id] = (pf.base_qty / pfTotalBp) * bp
    }
  }

  return breakdown
}

// ─── Total Formula Quantity (§4.7) ───────────────────────────────────────────

/**
 * @param {Ingredient} ingredient
 * @param {Object} pfBreakdowns
 * @param {Ingredient[]} prefermentIngredients
 * @returns {number}
 */
function calcTotalFormulaQty(ingredient, pfBreakdowns, prefermentIngredients) {
  // PREFERMENT-category ingredients: C[i] = 0
  if (ingredient.category === 'PREFERMENT') return 0

  let total = ingredient.base_qty

  // Add contributions from all PF breakdowns
  for (const pf of prefermentIngredients) {
    const breakdown = pfBreakdowns[pf.id] || {}
    total += breakdown[ingredient.id] || 0
  }

  return total
}

// ─── Final Dough Quantity (§4.6v2) ───────────────────────────────────────────

/**
 * @param {Ingredient} ingredient
 * @param {number} totalFormulaQty
 * @param {Object} pfBreakdowns
 * @param {Ingredient[]} prefermentIngredients
 * @returns {number}
 */
function calcFinalDoughQty(
  ingredient,
  totalFormulaQty,
  pfBreakdowns,
  prefermentIngredients
) {
  // PREFERMENT rows: their final dough qty IS their base_qty
  if (ingredient.category === 'PREFERMENT') return ingredient.base_qty

  // Subtract what's already in each pre-ferment
  let inPreferments = 0
  for (const pf of prefermentIngredients) {
    const settings = pf.preferment_settings || { enabled: 1 }
    const enabled = settings.enabled === 1 || settings.enabled === true
    if (enabled) {
      const breakdown = pfBreakdowns[pf.id] || {}
      inPreferments += breakdown[ingredient.id] || 0
    }
  }

  return Math.max(0, totalFormulaQty - inPreferments)
}

// ─── DAG Validation / Topological Sort (§5.5) ───────────────────────────────

/**
 * Topological sort of pre-ferments using Kahn's algorithm.
 * Returns array of ingredient IDs in calculation order.
 *
 * @param {Ingredient[]} pfIngredients
 * @returns {string[]}
 * @throws {Error} if circular dependency detected
 */
function resolvePrefermentOrder(pfIngredients) {
  if (pfIngredients.length === 0) return []

  // All PFs are independent — return in original order
  return pfIngredients.map((pf) => pf.id)
}

// ─── Loss & Waste (§11) ──────────────────────────────────────────────────────

/**
 * Calculate raw yield per piece accounting for process and bake loss.
 *
 * @param {number} desired - desired finished weight per piece
 * @param {number} processLoss - process loss as decimal (0.03 = 3%)
 * @param {number} bakeLoss - bake loss as decimal (0.12 = 12%)
 * @returns {number}
 */
function calcAdjustedYield(desired, processLoss, bakeLoss) {
  const denom = (1 - processLoss) * (1 - bakeLoss)
  if (denom <= 0) return desired
  return desired / denom
}

// ─── Autolyse Split (§8) ─────────────────────────────────────────────────────

/**
 * Split final dough ingredients into autolyse and final-mix groups.
 * Defaults: FLOUR + LIQUID → autolyse; liquid PFs (Poolish, Levain) → autolyse;
 * stiff PFs (Biga, PFD, Sponge) → final mix; everything else → final mix.
 * Overrides allow bakers to drag any ingredient between lists.
 *
 * @param {Ingredient[]} ingredients
 * @param {Object.<string, number>} finalDoughQtys
 * @param {number} durationMin
 * @param {Object.<string, 'autolyse'|'final'>} [overrides={}]
 * @returns {{ autolyse_ingredients: Array<{id: string, name: string, qty: number}>, final_mix_ingredients: Array<{id: string, name: string, qty: number}>, autolyse_duration_min: number }}
 */
function calcAutolyseSplit(
  ingredients,
  finalDoughQtys,
  durationMin,
  overrides = {}
) {
  const { phases: phaseMap } = classifyAllIngredients(ingredients)
  const autolyseIngredients = []
  const finalMixIngredients = []

  for (const ing of ingredients) {
    const fdq = finalDoughQtys[ing.id]
    if (!fdq || fdq <= 0) continue

    // Skip ingredients not classified (disabled PFs, zero-qty)
    const phase = phaseMap.get(ing.id)
    if (phase == null) continue

    const item = { id: ing.id, name: ing.name, qty: fdq }

    if (overrides[ing.id] === 'autolyse') {
      autolyseIngredients.push(item)
    } else if (overrides[ing.id] === 'final') {
      finalMixIngredients.push(item)
    } else if (phase === MIXING_PHASES.AUTOLYSE) {
      autolyseIngredients.push(item)
    } else {
      finalMixIngredients.push(item)
    }
  }

  return {
    autolyse_ingredients: autolyseIngredients,
    final_mix_ingredients: finalMixIngredients,
    autolyse_duration_min: durationMin,
  }
}
