/**
 * Rigorous test script for dough type integration (§15).
 * Run: node scripts/test-dough-types.mjs
 */

import assert from 'node:assert/strict'

// ── 1. Constants module ─────────────────────────────────────────────────────

console.log('\n═══ 1. Constants Module ═══\n')

const {
  DOUGH_TYPES,
  DOUGH_TYPE_NAMES,
  DOUGH_TYPE_LABELS,
  DOUGH_TYPE_GROUPS,
  DOUGH_TYPE_DEFAULTS,
  DOUGH_TYPE_MIX_CONSTRAINTS,
} = await import('../src/lib/dough-types.js')

// 1.1 All 13 types exist
assert.equal(DOUGH_TYPE_NAMES.length, 13, 'Should have exactly 13 dough types')
console.log('  ✓ 13 dough types defined')

// 1.2 Every type has a label
for (const type of DOUGH_TYPE_NAMES) {
  assert.ok(DOUGH_TYPE_LABELS[type], `Missing label for ${type}`)
}
console.log('  ✓ All types have labels')

// 1.3 Every type has defaults
for (const type of DOUGH_TYPE_NAMES) {
  const d = DOUGH_TYPE_DEFAULTS[type]
  assert.ok(d, `Missing defaults for ${type}`)
  assert.ok('ddt' in d, `Missing ddt in defaults for ${type}`)
  assert.ok('autolyse' in d, `Missing autolyse in defaults for ${type}`)
  assert.ok('mix_type' in d, `Missing mix_type in defaults for ${type}`)
  assert.ok('process_loss_pct' in d, `Missing process_loss_pct in defaults for ${type}`)
  assert.ok('bake_loss_pct' in d, `Missing bake_loss_pct in defaults for ${type}`)
}
console.log('  ✓ All types have complete defaults')

// 1.4 Groups cover all types
const groupedTypes = Object.values(DOUGH_TYPE_GROUPS).flat()
assert.equal(groupedTypes.length, 13, 'Groups should cover all 13 types')
for (const type of DOUGH_TYPE_NAMES) {
  assert.ok(groupedTypes.includes(type), `${type} missing from groups`)
}
console.log('  ✓ Groups cover all types')

// 1.5 Bread group has 8, Pastry has 5
assert.equal(DOUGH_TYPE_GROUPS.Bread.length, 8, 'Bread group should have 8 types')
assert.equal(DOUGH_TYPE_GROUPS.Pastry.length, 5, 'Pastry group should have 5 types')
console.log('  ✓ Bread: 8, Pastry: 5')

// 1.6 Specific defaults match spec
assert.equal(DOUGH_TYPE_DEFAULTS.LEAN.ddt, 24)
assert.equal(DOUGH_TYPE_DEFAULTS.LEAN.autolyse, true)
assert.equal(DOUGH_TYPE_DEFAULTS.LEAN.mix_type, 'Short Mix')
assert.equal(DOUGH_TYPE_DEFAULTS.RICH.ddt, 22)
assert.equal(DOUGH_TYPE_DEFAULTS.RICH.mix_type, 'Intensive Mix')
assert.equal(DOUGH_TYPE_DEFAULTS.CHOUX.ddt, null)
assert.equal(DOUGH_TYPE_DEFAULTS.SOURDOUGH.autolyse_duration_min, 30)
assert.equal(DOUGH_TYPE_DEFAULTS.PASTA.bake_loss_pct, 0)
assert.equal(DOUGH_TYPE_DEFAULTS.LAMINATED.ddt, 20)
console.log('  ✓ Specific defaults match spec')

// 1.7 Mix constraints
assert.deepEqual(DOUGH_TYPE_MIX_CONSTRAINTS.LAMINATED_YEASTED, ['Short Mix', 'Short Improved'])
assert.deepEqual(DOUGH_TYPE_MIX_CONSTRAINTS.SHORTCRUST, ['Short Mix'])
assert.equal(DOUGH_TYPE_MIX_CONSTRAINTS.LEAN, undefined, 'LEAN should have no constraints')
console.log('  ✓ Mix constraints correct')

// ── 2. Process Steps ────────────────────────────────────────────────────────

console.log('\n═══ 2. Process Step Generation ═══\n')

const { suggestProcessSteps, MIX_TYPE_PROCESS } = await import('../src/lib/process-steps.js')

const SAMPLE_INGREDIENTS = [
  { id: 'f1', name: 'Bread flour', category: 'FLOUR', base_qty: 1000 },
  { id: 'l1', name: 'Water', category: 'LIQUID', base_qty: 700 },
  { id: 's1', name: 'Salt', category: 'SEASONING', base_qty: 20 },
  { id: 'y1', name: 'Yeast', category: 'LEAVENING', base_qty: 3 },
]

const ENRICHED_INGREDIENTS = [
  ...SAMPLE_INGREDIENTS,
  { id: 'e1', name: 'Butter', category: 'ENRICHMENT', base_qty: 200 },
  { id: 'e2', name: 'Sugar', category: 'SWEETENER', base_qty: 100 },
]

// 2.1 Null dough type — should produce standard bread steps (backward compat)
{
  const steps = suggestProcessSteps({
    ingredients: SAMPLE_INGREDIENTS,
    hasAutolyse: false,
    mixType: 'Improved Mix',
    ddt: 24,
    doughType: null,
  })
  assert.ok(steps.length > 0, 'Should generate steps with null doughType')
  assert.ok(
    steps.some((s) => s.stage === 'MIXING'),
    'Should have MIXING stage'
  )
  assert.ok(
    steps.some((s) => s.stage === 'FOLD'),
    'Should have FOLD stage'
  )
  assert.ok(
    steps.some((s) => s.stage === 'BAKE'),
    'Should have BAKE stage'
  )
  console.log(`  ✓ null doughType → standard bread steps (${steps.length} steps)`)
}

// 2.2 LEAN — should use bread generator, same as null with Short Mix
{
  const steps = suggestProcessSteps({
    ingredients: SAMPLE_INGREDIENTS,
    hasAutolyse: true,
    autolyseDurationMin: 20,
    mixType: 'Short Mix',
    ddt: 24,
    doughType: 'LEAN',
  })
  assert.ok(
    steps.some((s) => s.stage === 'AUTOLYSE'),
    'LEAN with autolyse should have AUTOLYSE stage'
  )
  assert.ok(
    steps.some((s) => s.stage === 'FOLD'),
    'LEAN should have FOLD stage'
  )
  assert.ok(
    steps.some((s) => s.stage === 'RETARD'),
    'LEAN should have RETARD stage'
  )
  console.log(`  ✓ LEAN → bread generator with autolyse (${steps.length} steps)`)
}

// 2.3 SOURDOUGH — bread generator path
{
  const sdIngredients = [
    ...SAMPLE_INGREDIENTS,
    { id: 'pf1', name: 'Levain', category: 'PREFERMENT', base_qty: 200, preferment_settings: { type: 'LEVAIN', enabled: true } },
  ]
  const steps = suggestProcessSteps({
    ingredients: sdIngredients,
    hasAutolyse: true,
    autolyseDurationMin: 30,
    mixType: 'Short Mix',
    ddt: 24,
    doughType: 'SOURDOUGH',
  })
  assert.ok(steps.length > 0, 'SOURDOUGH should generate steps')
  assert.ok(
    steps.some((s) => s.stage === 'AUTOLYSE' || s.stage === 'FERMENTOLYSE'),
    'SOURDOUGH should have autolyse or fermentolyse'
  )
  console.log(`  ✓ SOURDOUGH → bread generator (${steps.length} steps)`)
}

// 2.4 ENRICHED — bread generator, detects fat phase
{
  const steps = suggestProcessSteps({
    ingredients: ENRICHED_INGREDIENTS,
    hasAutolyse: false,
    mixType: 'Improved Mix',
    ddt: 24,
    doughType: 'ENRICHED',
  })
  assert.ok(
    steps.some((s) => s.title === 'Fat & Sugar Addition'),
    'ENRICHED should have fat addition step'
  )
  // Bake temp should be lower for enriched
  const bakeStep = steps.find((s) => s.stage === 'BAKE')
  assert.ok(bakeStep, 'Should have bake step')
  assert.equal(bakeStep.temperature, 175, 'Enriched bake temp should be 175°C')
  console.log(`  ✓ ENRICHED → bread generator with fat phase (${steps.length} steps)`)
}

// 2.5 PIZZA — bread generator with overrides, special shaping
{
  const steps = suggestProcessSteps({
    ingredients: SAMPLE_INGREDIENTS,
    hasAutolyse: false,
    mixType: 'Intensive Mix',
    ddt: 24,
    doughType: 'PIZZA',
  })
  assert.ok(
    steps.some((s) => s.title === 'Ball'),
    'PIZZA should have Ball step instead of Preshape'
  )
  assert.ok(
    steps.some((s) => s.title === 'Stretch'),
    'PIZZA should have Stretch step'
  )
  assert.ok(
    !steps.some((s) => s.stage === 'RETARD'),
    'PIZZA should skip RETARD'
  )
  const bakeStep = steps.find((s) => s.stage === 'BAKE')
  assert.ok(bakeStep.temperature >= 260, 'PIZZA bake temp should be ≥260°C')
  // Check fold count — PIZZA override has folds: 2
  const foldSteps = steps.filter((s) => s.stage === 'FOLD')
  assert.equal(foldSteps.length, 3, 'PIZZA should have 3 fold phases (2 folds + 1 final)')
  console.log(`  ✓ PIZZA → bread generator + ball/stretch/high-temp bake (${steps.length} steps)`)
}

// 2.6 FLATBREAD — bread generator with overrides, roll/stretch
{
  const steps = suggestProcessSteps({
    ingredients: SAMPLE_INGREDIENTS,
    hasAutolyse: false,
    mixType: 'Improved Mix',
    ddt: 24,
    doughType: 'FLATBREAD',
  })
  assert.ok(
    steps.some((s) => s.title === 'Roll / Stretch'),
    'FLATBREAD should have Roll / Stretch step'
  )
  assert.ok(
    !steps.some((s) => s.stage === 'RETARD'),
    'FLATBREAD should skip RETARD'
  )
  console.log(`  ✓ FLATBREAD → bread generator + roll/stretch (${steps.length} steps)`)
}

// 2.7 LAMINATED_YEASTED — specialized template
{
  const steps = suggestProcessSteps({
    ingredients: SAMPLE_INGREDIENTS,
    hasAutolyse: false,
    mixType: 'Short Mix',
    ddt: 22,
    doughType: 'LAMINATED_YEASTED',
  })
  assert.ok(steps.length >= 10, 'LAMINATED_YEASTED should have many steps')
  assert.ok(
    steps.some((s) => s.title.includes('D\u00E9trempe')),
    'Should have détrempe step'
  )
  assert.ok(
    steps.some((s) => s.title.includes('Butter Block')),
    'Should have butter block step'
  )
  assert.ok(
    steps.some((s) => s.title.includes('Letter Fold')),
    'Should have letter fold steps'
  )
  assert.ok(
    !steps.some((s) => s.stage === 'AUTOLYSE'),
    'Laminated should never have autolyse'
  )
  assert.ok(
    !steps.some((s) => s.stage === 'FOLD' && s.title.startsWith('Fold ')),
    'Laminated should not have bulk ferment folds'
  )
  const proofStep = steps.find((s) => s.stage === 'PROOF')
  assert.equal(proofStep.temperature, 27, 'Proof at 27°C')
  assert.equal(proofStep.duration_min, 90, 'Proof 90 min')
  const bakeStep = steps.find((s) => s.stage === 'BAKE')
  assert.equal(bakeStep.temperature, 190, 'Bake at 190°C')
  console.log(`  ✓ LAMINATED_YEASTED → specialized template (${steps.length} steps)`)
}

// 2.8 LAMINATED (Puff) — specialized template
{
  const steps = suggestProcessSteps({
    ingredients: SAMPLE_INGREDIENTS,
    hasAutolyse: false,
    mixType: 'Short Mix',
    ddt: 20,
    doughType: 'LAMINATED',
  })
  assert.ok(steps.length >= 8, 'LAMINATED should have many steps')
  assert.ok(
    steps.some((s) => s.title.includes('Single Fold')),
    'Should have single fold steps'
  )
  assert.ok(
    !steps.some((s) => s.stage === 'PROOF'),
    'Puff pastry should not have proof (no yeast)'
  )
  const bakeStep = steps.find((s) => s.stage === 'BAKE')
  assert.equal(bakeStep.temperature, 200, 'Bake at 200°C')
  console.log(`  ✓ LAMINATED (Puff) → specialized template (${steps.length} steps)`)
}

// 2.9 CHOUX — specialized template
{
  const chouxIngredients = [
    { id: 'f1', name: 'Flour', category: 'FLOUR', base_qty: 150 },
    { id: 'l1', name: 'Water', category: 'LIQUID', base_qty: 250 },
    { id: 'e1', name: 'Butter', category: 'ENRICHMENT', base_qty: 110 },
    { id: 'e2', name: 'Eggs', category: 'ENRICHMENT', base_qty: 200 },
    { id: 's1', name: 'Salt', category: 'SEASONING', base_qty: 3 },
  ]
  const steps = suggestProcessSteps({
    ingredients: chouxIngredients,
    hasAutolyse: false,
    mixType: 'Short Mix',
    ddt: 24,
    doughType: 'CHOUX',
  })
  assert.ok(
    steps.some((s) => s.title === 'Cook Panade'),
    'CHOUX should have Cook Panade step'
  )
  assert.ok(
    steps.some((s) => s.title === 'Add Eggs'),
    'CHOUX should have Add Eggs step'
  )
  assert.ok(
    steps.some((s) => s.title === 'Pipe'),
    'CHOUX should have Pipe step'
  )
  assert.ok(
    steps.some((s) => s.title === 'Fill'),
    'CHOUX should have Fill step'
  )
  assert.ok(
    !steps.some((s) => s.stage === 'FOLD'),
    'CHOUX should have no bulk fermentation'
  )
  // Two bake phases
  const bakeSteps = steps.filter((s) => s.stage === 'BAKE')
  assert.equal(bakeSteps.length, 2, 'CHOUX should have 2 bake phases')
  assert.equal(bakeSteps[0].temperature, 200, 'First bake at 200°C')
  assert.equal(bakeSteps[1].temperature, 175, 'Second bake at 175°C')
  console.log(`  ✓ CHOUX → panade/eggs/pipe/bake (${steps.length} steps)`)
}

// 2.10 COOKIE — specialized template
{
  const cookieIngredients = [
    { id: 'f1', name: 'AP Flour', category: 'FLOUR', base_qty: 300 },
    { id: 'e1', name: 'Butter', category: 'ENRICHMENT', base_qty: 225 },
    { id: 'sw1', name: 'Brown Sugar', category: 'SWEETENER', base_qty: 200 },
    { id: 'e2', name: 'Eggs', category: 'ENRICHMENT', base_qty: 100 },
    { id: 'lv1', name: 'Baking Soda', category: 'LEAVENING', base_qty: 5 },
    { id: 's1', name: 'Salt', category: 'SEASONING', base_qty: 5 },
    { id: 'm1', name: 'Chocolate Chips', category: 'MIXIN', base_qty: 300 },
  ]
  const steps = suggestProcessSteps({
    ingredients: cookieIngredients,
    hasAutolyse: false,
    mixType: 'Short Mix',
    ddt: 20,
    doughType: 'COOKIE',
  })
  assert.ok(
    steps.some((s) => s.title === 'Cream Butter & Sugar'),
    'COOKIE should have creaming step'
  )
  assert.ok(
    steps.some((s) => s.title === 'Add Eggs'),
    'COOKIE should have egg step'
  )
  assert.ok(
    steps.some((s) => s.title === 'Add Dry Ingredients'),
    'COOKIE should have dry ingredients step'
  )
  assert.ok(
    steps.some((s) => s.title === 'Fold in Mix-ins'),
    'COOKIE with mixins should have fold-in step'
  )
  assert.ok(
    steps.some((s) => s.title === 'Portion'),
    'COOKIE should have portion step'
  )
  const bakeStep = steps.find((s) => s.stage === 'BAKE')
  assert.equal(bakeStep.temperature, 175, 'Cookie bake at 175°C')
  console.log(`  ✓ COOKIE → cream/eggs/dry/mixins/portion/bake (${steps.length} steps)`)
}

// 2.11 COOKIE without mixins
{
  const plainCookieIngredients = [
    { id: 'f1', name: 'AP Flour', category: 'FLOUR', base_qty: 300 },
    { id: 'e1', name: 'Butter', category: 'ENRICHMENT', base_qty: 225 },
    { id: 'sw1', name: 'Sugar', category: 'SWEETENER', base_qty: 200 },
    { id: 'e2', name: 'Eggs', category: 'ENRICHMENT', base_qty: 100 },
    { id: 'lv1', name: 'Baking Soda', category: 'LEAVENING', base_qty: 5 },
    { id: 's1', name: 'Salt', category: 'SEASONING', base_qty: 5 },
  ]
  const steps = suggestProcessSteps({
    ingredients: plainCookieIngredients,
    hasAutolyse: false,
    mixType: 'Short Mix',
    ddt: 20,
    doughType: 'COOKIE',
  })
  assert.ok(
    !steps.some((s) => s.title === 'Fold in Mix-ins'),
    'COOKIE without mixins should skip fold-in step'
  )
  console.log(`  ✓ COOKIE without mixins → no fold-in step (${steps.length} steps)`)
}

// 2.12 SHORTCRUST — specialized template
{
  const steps = suggestProcessSteps({
    ingredients: [
      { id: 'f1', name: 'AP Flour', category: 'FLOUR', base_qty: 250 },
      { id: 'e1', name: 'Butter', category: 'ENRICHMENT', base_qty: 175 },
      { id: 'l1', name: 'Cold Water', category: 'LIQUID', base_qty: 50 },
      { id: 's1', name: 'Salt', category: 'SEASONING', base_qty: 3 },
    ],
    hasAutolyse: false,
    mixType: 'Short Mix',
    ddt: 18,
    doughType: 'SHORTCRUST',
  })
  assert.ok(
    steps.some((s) => s.title === 'Sablage'),
    'SHORTCRUST should have Sablage step'
  )
  assert.ok(
    steps.some((s) => s.title === 'Fraisage'),
    'SHORTCRUST should have Fraisage step'
  )
  assert.ok(
    steps.some((s) => s.title === 'Blind Bake'),
    'SHORTCRUST should have Blind Bake step'
  )
  const bakeStep = steps.find((s) => s.title === 'Blind Bake')
  assert.equal(bakeStep.temperature, 180, 'Blind bake at 180°C')
  console.log(`  ✓ SHORTCRUST → sablage/fraisage/chill/roll/blind bake (${steps.length} steps)`)
}

// 2.13 SWEET_PASTRY — specialized template
{
  const steps = suggestProcessSteps({
    ingredients: [
      { id: 'f1', name: 'AP Flour', category: 'FLOUR', base_qty: 300 },
      { id: 'e1', name: 'Butter', category: 'ENRICHMENT', base_qty: 200 },
      { id: 'sw1', name: 'Powdered Sugar', category: 'SWEETENER', base_qty: 100 },
      { id: 'e2', name: 'Egg', category: 'ENRICHMENT', base_qty: 50 },
    ],
    hasAutolyse: false,
    mixType: 'Short Mix',
    ddt: 18,
    doughType: 'SWEET_PASTRY',
  })
  assert.ok(
    steps.some((s) => s.title === 'Cream Butter & Sugar'),
    'SWEET_PASTRY should have creaming step'
  )
  assert.ok(
    steps.some((s) => s.title === 'Add Flour'),
    'SWEET_PASTRY should have flour step'
  )
  const bakeStep = steps.find((s) => s.stage === 'BAKE')
  assert.equal(bakeStep.temperature, 170, 'Sweet pastry bake at 170°C')
  console.log(`  ✓ SWEET_PASTRY → cream/egg/flour/chill/bake (${steps.length} steps)`)
}

// 2.14 PASTA — specialized template
{
  const steps = suggestProcessSteps({
    ingredients: [
      { id: 'f1', name: 'Semolina', category: 'FLOUR', base_qty: 400 },
      { id: 'l1', name: 'Water', category: 'LIQUID', base_qty: 180 },
      { id: 'e1', name: 'Eggs', category: 'ENRICHMENT', base_qty: 100 },
      { id: 's1', name: 'Salt', category: 'SEASONING', base_qty: 5 },
    ],
    hasAutolyse: false,
    mixType: 'Improved Mix',
    ddt: 22,
    doughType: 'PASTA',
  })
  assert.ok(
    steps.some((s) => s.title === 'Roll'),
    'PASTA should have Roll step'
  )
  assert.ok(
    steps.some((s) => s.title === 'Cut'),
    'PASTA should have Cut step'
  )
  assert.ok(
    steps.some((s) => s.title === 'Dry or Cook'),
    'PASTA should have Dry or Cook step'
  )
  assert.ok(
    !steps.some((s) => s.stage === 'BAKE'),
    'PASTA should have no bake step'
  )
  console.log(`  ✓ PASTA → mix/knead/rest/roll/cut/cook (${steps.length} steps)`)
}

// 2.15 RICH — should use bread generator (not specialized)
{
  const steps = suggestProcessSteps({
    ingredients: ENRICHED_INGREDIENTS,
    hasAutolyse: false,
    mixType: 'Intensive Mix',
    ddt: 22,
    doughType: 'RICH',
  })
  assert.ok(
    steps.some((s) => s.stage === 'FOLD'),
    'RICH should use bread generator with FOLD stage'
  )
  assert.ok(
    steps.some((s) => s.title === 'Fat & Sugar Addition'),
    'RICH should detect fat phase'
  )
  console.log(`  ✓ RICH → bread generator with fat phase (${steps.length} steps)`)
}

// 2.16 All steps have required fields
{
  const allTypes = [null, 'LEAN', 'ENRICHED', 'RICH', 'LAMINATED_YEASTED', 'LAMINATED',
    'SOURDOUGH', 'PIZZA', 'FLATBREAD', 'SHORTCRUST', 'SWEET_PASTRY', 'CHOUX', 'COOKIE', 'PASTA']

  for (const dt of allTypes) {
    const steps = suggestProcessSteps({
      ingredients: SAMPLE_INGREDIENTS,
      hasAutolyse: false,
      mixType: 'Short Mix',
      ddt: 24,
      doughType: dt,
    })
    for (const [i, step] of steps.entries()) {
      assert.ok(step.stage, `Step ${i} in ${dt || 'null'} missing stage`)
      assert.ok(step.title, `Step ${i} in ${dt || 'null'} missing title`)
      assert.ok(step.description, `Step ${i} in ${dt || 'null'} missing description`)
      assert.ok('duration_min' in step, `Step ${i} in ${dt || 'null'} missing duration_min`)
      assert.ok('temperature' in step, `Step ${i} in ${dt || 'null'} missing temperature`)
      assert.ok('mixer_speed' in step, `Step ${i} in ${dt || 'null'} missing mixer_speed`)
    }
  }
  console.log('  ✓ All steps for all 14 dough type variants have required fields')
}

// ── 3. Version Diff ─────────────────────────────────────────────────────────

console.log('\n═══ 3. Version Diff ═══\n')

const { diffVersions, summarizeChanges } = await import('../src/lib/version-diff.js')

// 3.1 dough_type change detected
{
  const snapshotA = {
    name: 'Test', yield_per_piece: 350, ddt: 24, dough_type: null,
    autolyse: 0, autolyse_duration_min: 20, process_loss_pct: 0.03,
    bake_loss_pct: 0.12, mix_type: 'Short Mix', mixer_profile_id: null,
    ingredients: [], process_steps: [],
  }
  const snapshotB = { ...snapshotA, dough_type: 'SOURDOUGH' }

  const changes = diffVersions(snapshotA, snapshotB)
  assert.equal(changes.length, 1, 'Should detect 1 change')
  assert.equal(changes[0].type, 'param_changed')
  assert.equal(changes[0].field, 'dough_type')
  assert.equal(changes[0].old, null)
  assert.equal(changes[0].new, 'SOURDOUGH')
  console.log('  ✓ dough_type null → SOURDOUGH detected')
}

// 3.2 dough_type change in summary
{
  const changes = [{ type: 'param_changed', field: 'dough_type', old: 'LEAN', new: 'SOURDOUGH' }]
  const summary = summarizeChanges(changes)
  assert.ok(summary.includes('Dough type'), 'Summary should mention Dough type')
  assert.ok(summary.includes('Sourdough'), 'Summary should use human label')
  console.log(`  ✓ Summary: "${summary}"`)
}

// 3.3 dough_type null → null = no change
{
  const snapshotA = {
    name: 'Test', yield_per_piece: 350, ddt: 24, dough_type: null,
    autolyse: 0, autolyse_duration_min: 20, process_loss_pct: 0,
    bake_loss_pct: 0, mix_type: 'Improved Mix', mixer_profile_id: null,
    ingredients: [], process_steps: [],
  }
  const snapshotB = { ...snapshotA }

  const changes = diffVersions(snapshotA, snapshotB)
  assert.equal(changes.length, 0, 'No changes when dough_type stays null')
  console.log('  ✓ null → null = no change')
}

// 3.4 Missing dough_type in old snapshot (backward compat)
{
  const snapshotA = {
    name: 'Test', yield_per_piece: 350, ddt: 24,
    // no dough_type field at all
    autolyse: 0, autolyse_duration_min: 20, process_loss_pct: 0,
    bake_loss_pct: 0, mix_type: 'Improved Mix', mixer_profile_id: null,
    ingredients: [], process_steps: [],
  }
  const snapshotB = { ...snapshotA, dough_type: 'LEAN' }

  const changes = diffVersions(snapshotA, snapshotB)
  const dtChange = changes.find((c) => c.field === 'dough_type')
  assert.ok(dtChange, 'Should detect dough_type change from missing to LEAN')
  assert.equal(dtChange.old, null, 'Old value normalized to null')
  assert.equal(dtChange.new, 'LEAN')
  console.log('  ✓ Missing dough_type in old snapshot → null (backward compat)')
}

// ── 4. Database ─────────────────────────────────────────────────────────────

console.log('\n═══ 4. Database ═══\n')

import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, '../data/recipe-engine.db')

const db = new Database(DB_PATH, { readonly: true })

// 4.1 Column exists
{
  const columns = db.prepare("PRAGMA table_info('recipes')").all()
  const doughTypeCol = columns.find((c) => c.name === 'dough_type')
  assert.ok(doughTypeCol, 'dough_type column should exist in recipes table')
  assert.equal(doughTypeCol.type, 'TEXT', 'dough_type should be TEXT')
  assert.equal(doughTypeCol.notnull, 0, 'dough_type should be nullable')
  console.log('  ✓ recipes.dough_type column exists (TEXT, nullable)')
}

// 4.2 Check existing data
{
  const recipes = db.prepare('SELECT id, name, dough_type FROM recipes').all()
  console.log(`  ✓ ${recipes.length} recipes in DB`)
  for (const r of recipes) {
    console.log(`    ${r.name}: dough_type=${r.dough_type || 'null'}`)
  }
}

db.close()

// ── Done ────────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════')
console.log('  All tests passed!')
console.log('═══════════════════════════════════\n')
