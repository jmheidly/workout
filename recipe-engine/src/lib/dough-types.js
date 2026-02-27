/**
 * §15 — Dough Type constants.
 *
 * Central module for dough type classification, defaults, and constraints.
 * Shared between client (UI selectors, defaults application) and server (DB, engine).
 */

export const DOUGH_TYPES = {
  LEAN: 'LEAN',
  ENRICHED: 'ENRICHED',
  RICH: 'RICH',
  LAMINATED_YEASTED: 'LAMINATED_YEASTED',
  LAMINATED: 'LAMINATED',
  SOURDOUGH: 'SOURDOUGH',
  PIZZA: 'PIZZA',
  FLATBREAD: 'FLATBREAD',
  SHORTCRUST: 'SHORTCRUST',
  SWEET_PASTRY: 'SWEET_PASTRY',
  CHOUX: 'CHOUX',
  COOKIE: 'COOKIE',
  PASTA: 'PASTA',
}

export const DOUGH_TYPE_NAMES = Object.keys(DOUGH_TYPES)

export const DOUGH_TYPE_LABELS = {
  LEAN: 'Lean',
  ENRICHED: 'Enriched',
  RICH: 'Rich',
  LAMINATED_YEASTED: 'Laminated (Yeasted)',
  LAMINATED: 'Laminated (Puff)',
  SOURDOUGH: 'Sourdough',
  PIZZA: 'Pizza',
  FLATBREAD: 'Flatbread',
  SHORTCRUST: 'Shortcrust',
  SWEET_PASTRY: 'Sweet Pastry',
  CHOUX: 'Choux',
  COOKIE: 'Cookie',
  PASTA: 'Pasta',
}

export const DOUGH_TYPE_GROUPS = {
  Bread: [
    'LEAN',
    'ENRICHED',
    'RICH',
    'LAMINATED_YEASTED',
    'LAMINATED',
    'SOURDOUGH',
    'PIZZA',
    'FLATBREAD',
  ],
  Pastry: ['SHORTCRUST', 'SWEET_PASTRY', 'CHOUX', 'COOKIE', 'PASTA'],
}

/**
 * Default recipe parameters applied when baker selects a dough type.
 * Values are suggestion-only — baker can override any field.
 */
export const DOUGH_TYPE_DEFAULTS = {
  LEAN: {
    ddt: 24,
    autolyse: true,
    autolyse_duration_min: 20,
    mix_type: 'Short Mix',
    process_loss_pct: 0.03,
    bake_loss_pct: 0.12,
  },
  ENRICHED: {
    ddt: 24,
    autolyse: false,
    autolyse_duration_min: 20,
    mix_type: 'Improved Mix',
    process_loss_pct: 0.02,
    bake_loss_pct: 0.1,
  },
  RICH: {
    ddt: 22,
    autolyse: false,
    autolyse_duration_min: 20,
    mix_type: 'Intensive Mix',
    process_loss_pct: 0.02,
    bake_loss_pct: 0.08,
  },
  LAMINATED_YEASTED: {
    ddt: 22,
    autolyse: false,
    autolyse_duration_min: 20,
    mix_type: 'Short Mix',
    process_loss_pct: 0.05,
    bake_loss_pct: 0.1,
  },
  LAMINATED: {
    ddt: 20,
    autolyse: false,
    autolyse_duration_min: 20,
    mix_type: 'Short Mix',
    process_loss_pct: 0.05,
    bake_loss_pct: 0.1,
  },
  SOURDOUGH: {
    ddt: 24,
    autolyse: true,
    autolyse_duration_min: 30,
    mix_type: 'Short Mix',
    process_loss_pct: 0.03,
    bake_loss_pct: 0.14,
  },
  PIZZA: {
    ddt: 24,
    autolyse: false,
    autolyse_duration_min: 20,
    mix_type: 'Intensive Mix',
    process_loss_pct: 0.02,
    bake_loss_pct: 0.08,
  },
  FLATBREAD: {
    ddt: 24,
    autolyse: false,
    autolyse_duration_min: 20,
    mix_type: 'Improved Mix',
    process_loss_pct: 0.02,
    bake_loss_pct: 0.08,
  },
  SHORTCRUST: {
    ddt: 18,
    autolyse: false,
    autolyse_duration_min: 20,
    mix_type: 'Short Mix',
    process_loss_pct: 0.03,
    bake_loss_pct: 0.05,
  },
  SWEET_PASTRY: {
    ddt: 18,
    autolyse: false,
    autolyse_duration_min: 20,
    mix_type: 'Short Mix',
    process_loss_pct: 0.03,
    bake_loss_pct: 0.05,
  },
  CHOUX: {
    ddt: null,
    autolyse: false,
    autolyse_duration_min: 20,
    mix_type: 'Short Mix',
    process_loss_pct: 0.05,
    bake_loss_pct: 0.15,
  },
  COOKIE: {
    ddt: 20,
    autolyse: false,
    autolyse_duration_min: 20,
    mix_type: 'Short Mix',
    process_loss_pct: 0.02,
    bake_loss_pct: 0.03,
  },
  PASTA: {
    ddt: 22,
    autolyse: false,
    autolyse_duration_min: 20,
    mix_type: 'Improved Mix',
    process_loss_pct: 0.02,
    bake_loss_pct: 0,
  },
}

/**
 * Soft constraints: which mix types make sense per dough type.
 * Omitted keys = all mix types allowed.
 */
export const DOUGH_TYPE_MIX_CONSTRAINTS = {
  LAMINATED_YEASTED: ['Short Mix', 'Short Improved'],
  LAMINATED: ['Short Mix', 'Short Improved'],
  SHORTCRUST: ['Short Mix'],
  SWEET_PASTRY: ['Short Mix'],
  COOKIE: ['Short Mix'],
}

/**
 * Infer dough type from ingredient composition.
 * Returns { type: string, confidence: 'high'|'medium' } or null.
 *
 * Only returns a suggestion when the ingredient profile is a strong signal.
 * Many dough types (laminated, choux, pizza, flatbread, etc.) can't be
 * distinguished by ingredients alone — those require the baker to choose.
 */
export function inferDoughType(ingredients) {
  if (!ingredients || ingredients.length === 0) return null

  const totalFlour = ingredients
    .filter((i) => i.category === 'FLOUR')
    .reduce((sum, i) => sum + (i.base_qty || 0), 0)

  if (totalFlour === 0) return null

  const fatTotal = ingredients
    .filter((i) => i.category === 'ENRICHMENT')
    .reduce((sum, i) => sum + (i.base_qty || 0), 0)
  const sugarTotal = ingredients
    .filter((i) => i.category === 'SWEETENER')
    .reduce((sum, i) => sum + (i.base_qty || 0), 0)

  const fatBP = fatTotal / totalFlour
  const sugarBP = sugarTotal / totalFlour

  const leavening = ingredients.filter((i) => i.category === 'LEAVENING')
  const hasYeast = leavening.some((i) => /yeast/i.test(i.name))
  const hasChemical = leavening.some((i) =>
    /baking\s*(powder|soda)|bicarb/i.test(i.name),
  )

  const hasLevain = ingredients.some(
    (i) =>
      i.category === 'PREFERMENT' &&
      i.preferment_settings?.type === 'LEVAIN' &&
      i.preferment_settings?.enabled,
  )

  const semolinaFlour = ingredients
    .filter(
      (i) => i.category === 'FLOUR' && /semolina|durum/i.test(i.name),
    )
    .reduce((sum, i) => sum + (i.base_qty || 0), 0)
  const semolinaPct = semolinaFlour / totalFlour

  // Priority-ordered rules
  if (hasLevain) return { type: 'SOURDOUGH', confidence: 'high' }
  if (semolinaPct > 0.5 && !hasYeast && !hasLevain)
    return { type: 'PASTA', confidence: 'high' }
  if (hasChemical && sugarBP > 0.12 && fatBP > 0.1)
    return { type: 'COOKIE', confidence: 'medium' }
  if (fatBP > 0.12 && hasYeast) return { type: 'RICH', confidence: 'medium' }
  if (fatBP >= 0.05 && hasYeast)
    return { type: 'ENRICHED', confidence: 'medium' }
  if (fatBP < 0.02 && hasYeast && sugarBP < 0.05)
    return { type: 'LEAN', confidence: 'medium' }

  return null
}
