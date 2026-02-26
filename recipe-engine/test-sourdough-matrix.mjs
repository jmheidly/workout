/**
 * Standalone test script for the sourdough decision matrix.
 * Run: node test-sourdough-matrix.mjs
 */

import { MIXING_PHASES, classifyAllIngredients } from './src/lib/mixing-phases.js'

const PASS = '\x1b[32m✓\x1b[0m'
const FAIL = '\x1b[31m✗\x1b[0m'
let passed = 0
let failed = 0

function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ${PASS} ${label}`)
    passed++
  } else {
    console.log(`  ${FAIL} ${label} — expected ${expected}, got ${actual}`)
    failed++
  }
}

function phaseName(phase) {
  return Object.entries(MIXING_PHASES).find(([, v]) => v === phase)?.[0] ?? `unknown(${phase})`
}

/** Helper: build a minimal ingredient set with a levain */
function makeLevainRecipe({
  flourQty = 1000,
  waterQty = 650,
  levainQty = 200,
  levainFlourBp = 100,
  levainWaterBp = 100,
  flourName = 'Bread flour',
  extraFlours = [],
}) {
  const flourId = 'flour'
  const waterId = 'water'
  const levainId = 'levain'
  const saltId = 'salt'

  const ingredients = [
    {
      id: flourId,
      name: flourName,
      category: 'FLOUR',
      base_qty: flourQty,
      preferment_bakers_pcts: { [levainId]: levainFlourBp },
    },
    ...extraFlours.map((f, i) => ({
      id: `flour${i + 2}`,
      name: f.name,
      category: 'FLOUR',
      base_qty: f.qty,
      preferment_bakers_pcts: {},
    })),
    {
      id: waterId,
      name: 'Water',
      category: 'LIQUID',
      base_qty: waterQty,
      preferment_bakers_pcts: { [levainId]: levainWaterBp },
    },
    {
      id: levainId,
      name: 'Liquid Levain',
      category: 'PREFERMENT',
      base_qty: levainQty,
      preferment_settings: { enabled: 1, type: 'LEVAIN' },
      preferment_bakers_pcts: {},
    },
    {
      id: saltId,
      name: 'Salt',
      category: 'SEASONING',
      base_qty: 20,
      preferment_bakers_pcts: {},
    },
  ]

  return ingredients
}

// ─── Rule 0: No BP data → keep AUTOLYSE ─────────────────────────────
console.log('\nRule 0: No BP data')
{
  const ings = [
    { id: 'f', name: 'Bread flour', category: 'FLOUR', base_qty: 1000, preferment_bakers_pcts: {} },
    { id: 'w', name: 'Water', category: 'LIQUID', base_qty: 650, preferment_bakers_pcts: {} },
    {
      id: 'lev',
      name: 'Levain',
      category: 'PREFERMENT',
      base_qty: 200,
      preferment_settings: { enabled: 1, type: 'LEVAIN' },
      preferment_bakers_pcts: {},
    },
  ]
  const { phases } = classifyAllIngredients(ings)
  assert('Levain stays AUTOLYSE (no BP data)', phaseName(phases.get('lev')), 'AUTOLYSE')
}

// ─── Rule 1: Stiff levain (< 65% hydration) → INCORPORATION ────────
console.log('\nRule 1: Stiff levain (< 65% hydration)')
{
  // Levain with 60% hydration: flour BP=100, water BP=60
  const ings = makeLevainRecipe({
    levainQty: 160,
    levainFlourBp: 100,
    levainWaterBp: 60,
  })
  const { phases } = classifyAllIngredients(ings)
  assert('Stiff levain → INCORPORATION', phaseName(phases.get('levain')), 'INCORPORATION')
}

// ─── Rule 2: Whole wheat > 40% → INCORPORATION ─────────────────────
console.log('\nRule 2: Whole wheat > 40% of total flour')
{
  // 500g bread flour + 600g WW = 1100g total, WW = 55%
  const ings = makeLevainRecipe({
    flourQty: 500,
    flourName: 'Bread flour',
    extraFlours: [{ name: 'Whole wheat flour', qty: 600 }],
    levainQty: 200,
    levainFlourBp: 100,
    levainWaterBp: 100,
  })
  const { phases } = classifyAllIngredients(ings)
  assert('High WW → INCORPORATION', phaseName(phases.get('levain')), 'INCORPORATION')
}

// ─── Rule 3: High inoculation (>= 25%) → AUTOLYSE (fermentolyse) ───
console.log('\nRule 3: High inoculation (>= 25%)')
{
  // Levain 700g, BP total=200 → flour=350g, water=350g
  // TFQ flour = 1000 + 350 = 1350, inoculationPct = 350/1350 = 25.9%
  const ings = makeLevainRecipe({
    levainQty: 700,
    levainFlourBp: 100,
    levainWaterBp: 100,
  })
  const { phases } = classifyAllIngredients(ings)
  assert('High inoculation → AUTOLYSE', phaseName(phases.get('levain')), 'AUTOLYSE')
}

// ─── Rule 4: Low inoculation + low water → INCORPORATION ───────────
console.log('\nRule 4: Low inoculation (< 15%) AND low water ratio (< 20%)')
{
  // Small levain: 100g, BP total=200, flour=50, water=50
  // inoculation = 50/1000 = 5%, waterRatio = 50/(650+50) = 7%
  const ings = makeLevainRecipe({
    levainQty: 100,
    levainFlourBp: 100,
    levainWaterBp: 100,
  })
  const { phases } = classifyAllIngredients(ings)
  assert('Low inoculation + low water → INCORPORATION', phaseName(phases.get('levain')), 'INCORPORATION')
}

// ─── Rule 5: Gray zone + high hydration → AUTOLYSE ─────────────────
console.log('\nRule 5: Gray zone (15-25% inoculation) + high hydration (>= 75%)')
{
  // Levain 400g → flour=200, water=200. inoculation=200/1000=20%
  // Total water = 750 + 200 = 950, total flour = 1000, hydration = 95%
  const ings = makeLevainRecipe({
    waterQty: 750,
    levainQty: 400,
    levainFlourBp: 100,
    levainWaterBp: 100,
  })
  const { phases } = classifyAllIngredients(ings)
  assert('Gray zone + high hydration → AUTOLYSE', phaseName(phases.get('levain')), 'AUTOLYSE')
}

// ─── Rule 6: Gray zone + low hydration → INCORPORATION ─────────────
console.log('\nRule 6: Gray zone (15-25% inoculation) + low hydration (< 75%)')
{
  // Levain 400g → flour=200, water=200. inoculation=200/1000=20%
  // Total water = 500 + 200 = 700, total flour = 1000, hydration = 70%
  const ings = makeLevainRecipe({
    waterQty: 500,
    levainQty: 400,
    levainFlourBp: 100,
    levainWaterBp: 100,
  })
  const { phases } = classifyAllIngredients(ings)
  assert('Gray zone + low hydration → INCORPORATION', phaseName(phases.get('levain')), 'INCORPORATION')
}

// ─── Poolish: water threshold still works ───────────────────────────
console.log('\nPoolish: water threshold (unchanged)')
{
  // Small poolish: 80g, BP total=200, flour=100, water=100 → water=40g
  // Total water = 650 + 40 = 690, ratio = 40/690 = 5.8% < 15%
  const ings = [
    { id: 'f', name: 'Bread flour', category: 'FLOUR', base_qty: 1000, preferment_bakers_pcts: { pool: 100 } },
    { id: 'w', name: 'Water', category: 'LIQUID', base_qty: 650, preferment_bakers_pcts: { pool: 100 } },
    {
      id: 'pool',
      name: 'Poolish',
      category: 'PREFERMENT',
      base_qty: 80,
      preferment_settings: { enabled: 1, type: 'POOLISH' },
      preferment_bakers_pcts: {},
    },
  ]
  const { phases } = classifyAllIngredients(ings)
  assert('Small poolish → INCORPORATION', phaseName(phases.get('pool')), 'INCORPORATION')
}
{
  // Large poolish: 500g, BP total=200 → water=250g
  // Total water = 650 + 250 = 900, ratio = 250/900 = 27.8% > 15%
  const ings = [
    { id: 'f', name: 'Bread flour', category: 'FLOUR', base_qty: 1000, preferment_bakers_pcts: { pool: 100 } },
    { id: 'w', name: 'Water', category: 'LIQUID', base_qty: 650, preferment_bakers_pcts: { pool: 100 } },
    {
      id: 'pool',
      name: 'Poolish',
      category: 'PREFERMENT',
      base_qty: 500,
      preferment_settings: { enabled: 1, type: 'POOLISH' },
      preferment_bakers_pcts: {},
    },
  ]
  const { phases } = classifyAllIngredients(ings)
  assert('Large poolish → AUTOLYSE', phaseName(phases.get('pool')), 'AUTOLYSE')
}

// ─── Rye warning ────────────────────────────────────────────────────
console.log('\nRye autolyse warning')
{
  // 400g rye + 600g bread = 40% rye
  const ings = [
    { id: 'f1', name: 'Bread flour', category: 'FLOUR', base_qty: 600, preferment_bakers_pcts: {} },
    { id: 'f2', name: 'Rye flour', category: 'FLOUR', base_qty: 400, preferment_bakers_pcts: {} },
    { id: 'w', name: 'Water', category: 'LIQUID', base_qty: 700, preferment_bakers_pcts: {} },
    {
      id: 'lev',
      name: 'Levain',
      category: 'PREFERMENT',
      base_qty: 200,
      preferment_settings: { enabled: 1, type: 'LEVAIN' },
      preferment_bakers_pcts: {},
    },
  ]
  const { warnings } = classifyAllIngredients(ings)
  assert('Rye > 30% generates warning', warnings.length, 1)
  assert('Warning type is rye_autolyse', warnings[0]?.type, 'rye_autolyse')
}
{
  // 200g rye + 800g bread = 20% rye — no warning
  const ings = [
    { id: 'f1', name: 'Bread flour', category: 'FLOUR', base_qty: 800, preferment_bakers_pcts: {} },
    { id: 'f2', name: 'Rye flour', category: 'FLOUR', base_qty: 200, preferment_bakers_pcts: {} },
    { id: 'w', name: 'Water', category: 'LIQUID', base_qty: 700, preferment_bakers_pcts: {} },
    {
      id: 'lev',
      name: 'Levain',
      category: 'PREFERMENT',
      base_qty: 200,
      preferment_settings: { enabled: 1, type: 'LEVAIN' },
      preferment_bakers_pcts: {},
    },
  ]
  const { warnings } = classifyAllIngredients(ings)
  assert('Rye <= 30% no warning', warnings.length, 0)
}

// ─── Return value shape ─────────────────────────────────────────────
console.log('\nReturn value shape')
{
  const ings = [
    { id: 'f', name: 'Flour', category: 'FLOUR', base_qty: 1000, preferment_bakers_pcts: {} },
    { id: 'w', name: 'Water', category: 'LIQUID', base_qty: 650, preferment_bakers_pcts: {} },
  ]
  const result = classifyAllIngredients(ings)
  assert('Has phases property', result.phases instanceof Map, true)
  assert('Has warnings array', Array.isArray(result.warnings), true)
}

// ─── Summary ────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
