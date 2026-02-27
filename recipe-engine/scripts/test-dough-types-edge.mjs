/**
 * Edge case tests for dough type system.
 * Run: node scripts/test-dough-types-edge.mjs
 */

import assert from 'node:assert/strict'

const { suggestProcessSteps } = await import('../src/lib/process-steps.js')
const { diffVersions, summarizeChanges } = await import('../src/lib/version-diff.js')
const {
  DOUGH_TYPES,
  DOUGH_TYPE_DEFAULTS,
  DOUGH_TYPE_LABELS,
  DOUGH_TYPE_MIX_CONSTRAINTS,
  inferDoughType,
} = await import('../src/lib/dough-types.js')

const LEAN_INGS = [
  { id: 'f1', name: 'Bread flour', category: 'FLOUR', base_qty: 1000 },
  { id: 'l1', name: 'Water', category: 'LIQUID', base_qty: 700 },
  { id: 's1', name: 'Salt', category: 'SEASONING', base_qty: 20 },
  { id: 'y1', name: 'Yeast', category: 'LEAVENING', base_qty: 3 },
]

console.log('\n═══ Edge Case Tests ═══\n')

// ── E1. Unknown dough type string → fallback to bread generator ──────────
{
  const steps = suggestProcessSteps({
    ingredients: LEAN_INGS,
    hasAutolyse: false,
    mixType: 'Improved Mix',
    ddt: 24,
    doughType: 'NONEXISTENT_TYPE',
  })
  assert.ok(steps.length > 0, 'Unknown type should still generate steps')
  assert.ok(steps.some((s) => s.stage === 'FOLD'), 'Falls back to bread generator')
  console.log('  ✓ E1: Unknown dough type → bread generator fallback')
}

// ── E2. Empty string dough type → same as null ───────────────────────────
{
  const stepsNull = suggestProcessSteps({
    ingredients: LEAN_INGS,
    hasAutolyse: false,
    mixType: 'Improved Mix',
    ddt: 24,
    doughType: null,
  })
  const stepsEmpty = suggestProcessSteps({
    ingredients: LEAN_INGS,
    hasAutolyse: false,
    mixType: 'Improved Mix',
    ddt: 24,
    doughType: '',
  })
  // Empty string is falsy, so should behave like null
  assert.equal(stepsNull.length, stepsEmpty.length, 'Empty string should behave like null')
  console.log('  ✓ E2: Empty string doughType → same as null')
}

// ── E3. LAMINATED_YEASTED with autolyse=true passed (should be ignored) ──
{
  const steps = suggestProcessSteps({
    ingredients: LEAN_INGS,
    hasAutolyse: true, // baker mistakenly enabled it
    autolyseDurationMin: 20,
    mixType: 'Short Mix',
    ddt: 22,
    doughType: 'LAMINATED_YEASTED',
  })
  // Specialized template should be generated, ignoring the autolyse flag
  assert.ok(!steps.some((s) => s.stage === 'AUTOLYSE'), 'Laminated should skip autolyse even if hasAutolyse=true')
  assert.ok(steps.some((s) => s.title.includes('Butter Block')), 'Still generates lamination steps')
  console.log('  ✓ E3: LAMINATED_YEASTED ignores hasAutolyse=true')
}

// ── E4. CHOUX with no ingredients → graceful handling ────────────────────
{
  const steps = suggestProcessSteps({
    ingredients: [],
    hasAutolyse: false,
    mixType: 'Short Mix',
    ddt: 24,
    doughType: 'CHOUX',
  })
  assert.ok(steps.length > 0, 'CHOUX with empty ingredients should still generate template')
  assert.ok(steps.some((s) => s.title === 'Cook Panade'))
  // nameList should return 'ingredients' when empty
  assert.ok(steps[0].description.includes('ingredients') || steps[0].description.length > 0)
  console.log('  ✓ E4: CHOUX with empty ingredients → graceful fallback')
}

// ── E5. Pizza fold count matches override (2 folds → 3 fold phases) ──────
{
  const steps = suggestProcessSteps({
    ingredients: LEAN_INGS,
    hasAutolyse: false,
    mixType: 'Short Mix', // normally has 3 folds, but PIZZA overrides to 2
    ddt: 24,
    doughType: 'PIZZA',
  })
  const foldSteps = steps.filter((s) => s.stage === 'FOLD')
  assert.equal(foldSteps.length, 3, 'PIZZA: 2 folds + 1 final rest = 3 fold phases')
  // Total bulk should be 120 min
  const totalBulk = foldSteps.reduce((sum, s) => sum + (s.duration_min || 0), 0)
  assert.equal(totalBulk, 120, 'PIZZA bulk total should be 120 min')
  console.log('  ✓ E5: PIZZA fold override: 2 folds, 120 min bulk')
}

// ── E6. Flatbread fold count matches override ────────────────────────────
{
  const steps = suggestProcessSteps({
    ingredients: LEAN_INGS,
    hasAutolyse: false,
    mixType: 'Improved Mix', // normally 1 fold, but FLATBREAD overrides
    ddt: 24,
    doughType: 'FLATBREAD',
  })
  const foldSteps = steps.filter((s) => s.stage === 'FOLD')
  assert.equal(foldSteps.length, 2, 'FLATBREAD: 1 fold + 1 final rest = 2 fold phases')
  const totalBulk = foldSteps.reduce((sum, s) => sum + (s.duration_min || 0), 0)
  assert.equal(totalBulk, 60, 'FLATBREAD bulk total should be 60 min')
  console.log('  ✓ E6: FLATBREAD fold override: 1 fold, 60 min bulk')
}

// ── E7. Version diff: dough_type same value → no change ──────────────────
{
  const base = {
    name: 'Test', yield_per_piece: 350, ddt: 24, dough_type: 'LEAN',
    autolyse: 1, autolyse_duration_min: 20, process_loss_pct: 0.03,
    bake_loss_pct: 0.12, mix_type: 'Short Mix', mixer_profile_id: null,
    ingredients: [], process_steps: [],
  }
  const changes = diffVersions(base, { ...base })
  assert.equal(changes.length, 0, 'Same dough_type should not generate changes')
  console.log('  ✓ E7: Same dough_type → no diff')
}

// ── E8. Version diff: LEAN → ENRICHED ────────────────────────────────────
{
  const base = {
    name: 'Test', yield_per_piece: 350, ddt: 24, dough_type: 'LEAN',
    autolyse: 1, autolyse_duration_min: 20, process_loss_pct: 0.03,
    bake_loss_pct: 0.12, mix_type: 'Short Mix', mixer_profile_id: null,
    ingredients: [], process_steps: [],
  }
  const modified = { ...base, dough_type: 'ENRICHED', ddt: 24, mix_type: 'Improved Mix', autolyse: 0 }
  const changes = diffVersions(base, modified)
  const dtChange = changes.find((c) => c.field === 'dough_type')
  assert.ok(dtChange)
  assert.equal(dtChange.old, 'LEAN')
  assert.equal(dtChange.new, 'ENRICHED')
  const summary = summarizeChanges(changes)
  assert.ok(summary.includes('Dough type'))
  assert.ok(summary.includes('Enriched'))
  console.log(`  ✓ E8: LEAN → ENRICHED diff: "${summary}"`)
}

// ── E9. Mix constraints: check all constrained types ─────────────────────
{
  for (const [type, allowed] of Object.entries(DOUGH_TYPE_MIX_CONSTRAINTS)) {
    // Current mix type IS in allowed list → no warning expected
    const currentMix = allowed[0]
    // just verify data integrity
    assert.ok(Array.isArray(allowed), `${type} constraints should be array`)
    assert.ok(allowed.length > 0, `${type} should have at least one allowed mix type`)
  }
  console.log('  ✓ E9: All mix constraints have valid allowed lists')
}

// ── E10. Default values: CHOUX DDT is null ───────────────────────────────
{
  assert.equal(DOUGH_TYPE_DEFAULTS.CHOUX.ddt, null, 'CHOUX DDT should be null')
  // When applied to a recipe, DDT should remain unchanged (or cleared)
  console.log('  ✓ E10: CHOUX DDT default is null (N/A)')
}

// ── E11. PASTA bake_loss_pct is 0 (no baking) ───────────────────────────
{
  assert.equal(DOUGH_TYPE_DEFAULTS.PASTA.bake_loss_pct, 0, 'PASTA bake loss should be 0')
  const steps = suggestProcessSteps({
    ingredients: LEAN_INGS,
    hasAutolyse: false,
    mixType: 'Improved Mix',
    ddt: 22,
    doughType: 'PASTA',
  })
  assert.ok(!steps.some((s) => s.stage === 'BAKE'), 'PASTA should have no BAKE stage')
  assert.ok(steps.some((s) => s.title === 'Dry or Cook'), 'PASTA ends with cook/dry')
  console.log('  ✓ E11: PASTA has 0% bake loss and no BAKE stage')
}

// ── E12. Steps all have string stage values from PROCESS_STAGES ──────────
{
  const { PROCESS_STAGES } = await import('../src/lib/process-steps.js')
  const stageSet = new Set(PROCESS_STAGES)

  const allTypes = [null, ...Object.keys(DOUGH_TYPES)]
  for (const dt of allTypes) {
    const steps = suggestProcessSteps({
      ingredients: LEAN_INGS,
      hasAutolyse: false,
      mixType: 'Short Mix',
      ddt: 24,
      doughType: dt,
    })
    for (const step of steps) {
      assert.ok(
        stageSet.has(step.stage),
        `Invalid stage "${step.stage}" in ${dt || 'null'} step "${step.title}"`
      )
    }
  }
  console.log('  ✓ E12: All generated stages are valid PROCESS_STAGES')
}

// ── E13. Labels are human-readable (no underscores, proper case) ─────────
{
  for (const [key, label] of Object.entries(DOUGH_TYPE_LABELS)) {
    assert.ok(!label.includes('_'), `Label "${label}" for ${key} should not contain underscores`)
    assert.ok(label.length > 2, `Label "${label}" for ${key} too short`)
    assert.ok(label[0] === label[0].toUpperCase(), `Label "${label}" should start uppercase`)
  }
  console.log('  ✓ E13: All labels are human-readable')
}

// ── E14. DOUGH_TYPE_DEFAULTS mix_type values are valid ───────────────────
{
  const validMixTypes = ['Short Mix', 'Improved Mix', 'Intensive Mix', 'Short Improved']
  for (const [type, defaults] of Object.entries(DOUGH_TYPE_DEFAULTS)) {
    assert.ok(
      validMixTypes.includes(defaults.mix_type),
      `${type} default mix_type "${defaults.mix_type}" is not a valid mix type`
    )
  }
  console.log('  ✓ E14: All default mix_types are valid')
}

// ── E15. Loss percentages are reasonable ─────────────────────────────────
{
  for (const [type, defaults] of Object.entries(DOUGH_TYPE_DEFAULTS)) {
    assert.ok(defaults.process_loss_pct >= 0 && defaults.process_loss_pct <= 0.1,
      `${type} process_loss_pct ${defaults.process_loss_pct} out of range`)
    assert.ok(defaults.bake_loss_pct >= 0 && defaults.bake_loss_pct <= 0.2,
      `${type} bake_loss_pct ${defaults.bake_loss_pct} out of range`)
  }
  console.log('  ✓ E15: All loss percentages in reasonable range')
}

// ── Inference Tests ────────────────────────────────────────────────────────

console.log('\n═══ Inference Tests ═══\n')

// ── I1. Levain PF → SOURDOUGH (high) ──────────────────────────────────────
{
  const ings = [
    { id: 'f1', name: 'Bread flour', category: 'FLOUR', base_qty: 1000 },
    { id: 'l1', name: 'Water', category: 'LIQUID', base_qty: 700 },
    { id: 's1', name: 'Salt', category: 'SEASONING', base_qty: 20 },
    { id: 'p1', name: 'Levain', category: 'PREFERMENT', base_qty: 200, preferment_settings: { type: 'LEVAIN', enabled: 1 } },
  ]
  const result = inferDoughType(ings)
  assert.ok(result)
  assert.equal(result.type, 'SOURDOUGH')
  assert.equal(result.confidence, 'high')
  console.log('  ✓ I1: Levain PF → SOURDOUGH (high)')
}

// ── I2. Semolina flour + no yeast → PASTA (high) ─────────────────────────
{
  const ings = [
    { id: 'f1', name: 'Semolina flour', category: 'FLOUR', base_qty: 800 },
    { id: 'f2', name: 'AP flour', category: 'FLOUR', base_qty: 200 },
    { id: 'l1', name: 'Water', category: 'LIQUID', base_qty: 400 },
    { id: 's1', name: 'Salt', category: 'SEASONING', base_qty: 15 },
  ]
  const result = inferDoughType(ings)
  assert.ok(result)
  assert.equal(result.type, 'PASTA')
  assert.equal(result.confidence, 'high')
  console.log('  ✓ I2: Semolina flour dominant → PASTA (high)')
}

// ── I3. Chemical leavening + sugar + fat → COOKIE (medium) ───────────────
{
  const ings = [
    { id: 'f1', name: 'AP flour', category: 'FLOUR', base_qty: 1000 },
    { id: 'e1', name: 'Butter', category: 'ENRICHMENT', base_qty: 150 },
    { id: 'sw1', name: 'Sugar', category: 'SWEETENER', base_qty: 200 },
    { id: 'lv1', name: 'Baking soda', category: 'LEAVENING', base_qty: 5 },
  ]
  const result = inferDoughType(ings)
  assert.ok(result)
  assert.equal(result.type, 'COOKIE')
  assert.equal(result.confidence, 'medium')
  console.log('  ✓ I3: Chemical leavening + sugar + fat → COOKIE (medium)')
}

// ── I4. High butter + yeast → RICH (medium) ──────────────────────────────
{
  const ings = [
    { id: 'f1', name: 'Bread flour', category: 'FLOUR', base_qty: 1000 },
    { id: 'e1', name: 'Butter', category: 'ENRICHMENT', base_qty: 200 },
    { id: 'l1', name: 'Milk', category: 'LIQUID', base_qty: 400 },
    { id: 'y1', name: 'Instant yeast', category: 'LEAVENING', base_qty: 10 },
  ]
  const result = inferDoughType(ings)
  assert.ok(result)
  assert.equal(result.type, 'RICH')
  assert.equal(result.confidence, 'medium')
  console.log('  ✓ I4: High butter + yeast → RICH (medium)')
}

// ── I4b. Boundary: 12% fat + yeast → ENRICHED (at boundary, not RICH) ────
{
  const ings = [
    { id: 'f1', name: 'Bread flour', category: 'FLOUR', base_qty: 1000 },
    { id: 'e1', name: 'Butter', category: 'ENRICHMENT', base_qty: 120 },
    { id: 'l1', name: 'Milk', category: 'LIQUID', base_qty: 400 },
    { id: 'y1', name: 'Yeast', category: 'LEAVENING', base_qty: 8 },
  ]
  const result = inferDoughType(ings)
  assert.ok(result)
  assert.equal(result.type, 'ENRICHED', '12% exactly should be ENRICHED, not RICH')
  console.log('  ✓ I4b: 12% fat boundary → ENRICHED (not yet RICH)')
}

// ── I4c. Just over boundary: 13% fat + yeast → RICH ─────────────────────
{
  const ings = [
    { id: 'f1', name: 'Bread flour', category: 'FLOUR', base_qty: 1000 },
    { id: 'e1', name: 'Butter', category: 'ENRICHMENT', base_qty: 130 },
    { id: 'l1', name: 'Milk', category: 'LIQUID', base_qty: 400 },
    { id: 'y1', name: 'Yeast', category: 'LEAVENING', base_qty: 8 },
  ]
  const result = inferDoughType(ings)
  assert.ok(result)
  assert.equal(result.type, 'RICH', '13% should cross into RICH')
  console.log('  ✓ I4c: 13% fat → RICH (crosses boundary)')
}

// ── I5. Moderate butter + yeast → ENRICHED (medium) ──────────────────────
{
  const ings = [
    { id: 'f1', name: 'Bread flour', category: 'FLOUR', base_qty: 1000 },
    { id: 'e1', name: 'Butter', category: 'ENRICHMENT', base_qty: 80 },
    { id: 'l1', name: 'Milk', category: 'LIQUID', base_qty: 500 },
    { id: 'y1', name: 'Yeast', category: 'LEAVENING', base_qty: 8 },
  ]
  const result = inferDoughType(ings)
  assert.ok(result)
  assert.equal(result.type, 'ENRICHED')
  assert.equal(result.confidence, 'medium')
  console.log('  ✓ I5: Moderate butter + yeast → ENRICHED (medium)')
}

// ── I6. Flour + water + salt + yeast → LEAN (medium) ─────────────────────
{
  const result = inferDoughType(LEAN_INGS)
  assert.ok(result)
  assert.equal(result.type, 'LEAN')
  assert.equal(result.confidence, 'medium')
  console.log('  ✓ I6: Flour + water + salt + yeast → LEAN (medium)')
}

// ── I7. Empty ingredients → null ──────────────────────────────────────────
{
  assert.equal(inferDoughType([]), null)
  assert.equal(inferDoughType(null), null)
  assert.equal(inferDoughType(undefined), null)
  console.log('  ✓ I7: Empty/null/undefined ingredients → null')
}

// ── I8. No flour → null ──────────────────────────────────────────────────
{
  const ings = [
    { id: 'l1', name: 'Water', category: 'LIQUID', base_qty: 700 },
    { id: 's1', name: 'Salt', category: 'SEASONING', base_qty: 20 },
  ]
  assert.equal(inferDoughType(ings), null)
  console.log('  ✓ I8: No flour → null')
}

// ── I9. Ambiguous (flour + butter, no leavening) → null ──────────────────
{
  const ings = [
    { id: 'f1', name: 'AP flour', category: 'FLOUR', base_qty: 1000 },
    { id: 'e1', name: 'Butter', category: 'ENRICHMENT', base_qty: 500 },
    { id: 'l1', name: 'Water', category: 'LIQUID', base_qty: 200 },
  ]
  assert.equal(inferDoughType(ings), null)
  console.log('  ✓ I9: Flour + butter, no leavening → null (ambiguous)')
}

console.log('\n═══════════════════════════════════')
console.log('  All edge case tests passed!')
console.log('═══════════════════════════════════\n')
