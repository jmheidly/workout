/**
 * Process Steps helpers (§10)
 * Shared module — used client-side for stage constants and step suggestions.
 */

import { MIXING_PHASES, classifyAllIngredients, groupByPhase } from './mixing-phases.js'
import { MIX_TYPES } from './mixing.js'

export const PROCESS_STAGES = [
  'PREFERMENT_BUILD',
  'AUTOLYSE',
  'FERMENTOLYSE',
  'MIXING',
  'FOLD',
  'DIVIDE',
  'PRESHAPE',
  'REST',
  'SHAPE',
  'PROOF',
  'RETARD',
  'BAKE',
  'COOL',
  'FINISH',
]

/**
 * Mix type → post-mixing process parameters (§7.2.1).
 * Sourced from Suas Ch. 3 mix type characteristics table.
 */
export const MIX_TYPE_PROCESS = {
  'Short Mix': {
    bulk_min: 210,
    folds: 3,
    fold_interval_min: 45,
    bench_rest_min: 20,
    proof_min: 50,
  },
  'Improved Mix': {
    bulk_min: 90,
    folds: 1,
    fold_interval_min: 45,
    bench_rest_min: 20,
    proof_min: 75,
  },
  'Intensive Mix': {
    bulk_min: 20,
    folds: 0,
    fold_interval_min: 0,
    bench_rest_min: 15,
    proof_min: 105,
  },
  'Short Improved': {
    bulk_min: 60,
    folds: 1,
    fold_interval_min: 30,
    bench_rest_min: 20,
    proof_min: 60,
  },
}

/**
 * Generate a complete process from mixing through final proof.
 *
 * Analyzes mix type, DDT, enrichment level, and ingredient composition to
 * produce scientifically-grounded steps with duration, temperature, and
 * mixer speed populated where derivable.
 *
 * @param {object} opts
 * @param {Array<{ id: string, name: string, category: string, base_qty: number, preferment_settings?: object }>} opts.ingredients
 * @param {boolean} opts.hasAutolyse
 * @param {number} [opts.autolyseDurationMin=20]
 * @param {string} [opts.mixType='Improved Mix']
 * @param {number} [opts.ddt=24]
 * @param {Object.<string, 'autolyse'|'final'>} [opts.autolyseOverrides={}] - baker's drag overrides
 * @returns {Array<{ stage: string, title: string, description: string, duration_min: number|null, temperature: number|null, mixer_speed: string|null }>}
 */
export function suggestProcessSteps({
  ingredients,
  hasAutolyse,
  autolyseDurationMin = 20,
  mixType = 'Improved Mix',
  ddt = 24,
  autolyseOverrides = {},
}) {
  const { phases: phaseMap } = classifyAllIngredients(ingredients)

  // Apply baker's autolyse overrides on top of classification
  if (hasAutolyse) {
    for (const [id, target] of Object.entries(autolyseOverrides)) {
      if (phaseMap.get(id) == null) continue // skip unclassified
      if (target === 'autolyse') phaseMap.set(id, MIXING_PHASES.AUTOLYSE)
      else if (target === 'final') {
        // Move to INCORPORATION unless already in FAT_ADDITION or MIXIN
        const cur = phaseMap.get(id)
        if (cur === MIXING_PHASES.AUTOLYSE) phaseMap.set(id, MIXING_PHASES.INCORPORATION)
      }
    }
  }

  const groups = groupByPhase(ingredients, phaseMap)

  const autolyseIngs = groups[MIXING_PHASES.AUTOLYSE] || []
  const incorpIngs = groups[MIXING_PHASES.INCORPORATION] || []
  const fatIngs = groups[MIXING_PHASES.FAT_ADDITION] || []
  const mixinIngs = groups[MIXING_PHASES.MIXIN] || []

  const hasFatPhase = fatIngs.length > 0
  const hasMixinPhase = mixinIngs.length > 0
  const hasSecond = MIX_TYPES[mixType]?.has_second ?? true
  const proc = MIX_TYPE_PROCESS[mixType] || MIX_TYPE_PROCESS['Improved Mix']

  // Enrichment detection: fat phase ingredients present
  const isEnriched = hasFatPhase
  const proofTemp = isEnriched ? 27 : 25

  // Mixer speed helpers
  const speed1 = '1st'
  const speed1to2 = '1st \u2192 2nd'
  const incorpSpeed = hasSecond ? speed1to2 : speed1
  const fatSpeed = hasSecond ? speed1to2 : speed1

  const developmentTail = hasFatPhase
    ? 'then 2nd speed to begin gluten development.'
    : 'then 2nd speed to desired development.'
  const developmentTailShort = 'continue on 1st speed to desired development.'

  const steps = []

  // ── Mixing Steps ─────────────────────────────────────────

  if (hasAutolyse) {
    const isFermentolyse = autolyseIngs.some((i) => i.category === 'PREFERMENT')
    const stage = isFermentolyse ? 'FERMENTOLYSE' : 'AUTOLYSE'
    const mixTitle = isFermentolyse ? 'Fermentolyse Mix' : 'Autolyse Mix'
    const restTitle = isFermentolyse ? 'Fermentolyse Rest' : 'Autolyse Rest'
    const restDescription = isFermentolyse
      ? 'Cover and rest. Fermentation begins during rest \u2014 enzymatic activity and early acid development occur simultaneously.'
      : 'Cover and rest.'

    const autolyseNames = nameList(autolyseIngs)

    steps.push({
      stage,
      title: mixTitle,
      description: `Combine ${autolyseNames} on 1st speed until just incorporated.`,
      duration_min: null,
      temperature: null,
      mixer_speed: speed1,
    })

    steps.push({
      stage,
      title: restTitle,
      description: restDescription,
      duration_min: autolyseDurationMin,
      temperature: null,
      mixer_speed: null,
    })

    const incorpNames = nameList(incorpIngs)
    steps.push({
      stage: 'MIXING',
      title: 'Final Mix \u2014 Incorporation',
      description: `Add ${incorpNames}. Mix on 1st speed until incorporated, ${hasSecond ? developmentTail : developmentTailShort}`,
      duration_min: null,
      temperature: null,
      mixer_speed: incorpSpeed,
    })
  } else {
    const allInitialIngs = [...autolyseIngs, ...incorpIngs]
    const initialNames = nameList(allInitialIngs)

    steps.push({
      stage: 'MIXING',
      title: 'Initial Mix',
      description: `Combine ${initialNames} on 1st speed until incorporated, ${hasSecond ? developmentTail : developmentTailShort}`,
      duration_min: null,
      temperature: null,
      mixer_speed: incorpSpeed,
    })
  }

  // Development step — only when fat phase exists AND mixer has 2nd speed
  if (hasFatPhase && hasSecond) {
    steps.push({
      stage: 'MIXING',
      title: 'Development',
      description:
        'Continue mixing on 2nd speed to moderate gluten development before adding enrichments.',
      duration_min: null,
      temperature: null,
      mixer_speed: '2nd',
    })
  }

  // Fat & Sugar Addition
  if (hasFatPhase) {
    const fatNames = nameList(fatIngs)
    steps.push({
      stage: 'MIXING',
      title: 'Fat & Sugar Addition',
      description: `Add ${fatNames} in stages on 1st speed. ${hasSecond ? 'Return to 2nd speed after each addition and mix until smooth.' : 'Mix on 1st speed after each addition until smooth.'}`,
      duration_min: null,
      temperature: null,
      mixer_speed: fatSpeed,
    })
  }

  // Mix-ins
  if (hasMixinPhase) {
    const mixinNames = nameList(mixinIngs)
    steps.push({
      stage: 'MIXING',
      title: 'Fold in Mix-ins',
      description: `Fold in ${mixinNames} on 1st speed until just distributed. Do not overmix \u2014 2nd speed will damage inclusions.`,
      duration_min: null,
      temperature: null,
      mixer_speed: speed1,
    })
  }

  // ── Post-Mixing Steps ────────────────────────────────────

  // Folds — each segment of bulk fermentation is a FOLD step
  const totalFolds = proc.folds + 1 // N fold actions + 1 final rest = N+1 steps
  const remainder = proc.bulk_min - proc.folds * proc.fold_interval_min
  const lastPhaseMin = remainder > 0 ? remainder : proc.fold_interval_min
  const enrichedNote = isEnriched
    ? ' Monitor volume rather than strict timing.'
    : ''

  for (let i = 1; i <= totalFolds; i++) {
    const isLast = i === totalFolds
    const hasFoldAction = !isLast && proc.folds > 0
    const desc = hasFoldAction
      ? `Ferment at ${ddt}\u00B0C. Stretch and fold at end of phase.${enrichedNote}`
      : `Ferment at ${ddt}\u00B0C until approximately doubled.${enrichedNote}`
    steps.push({
      stage: 'FOLD',
      title: `Fold ${i}`,
      description: desc,
      duration_min: isLast ? lastPhaseMin : proc.fold_interval_min,
      temperature: ddt,
      mixer_speed: null,
    })
  }

  // Preshape
  steps.push({
    stage: 'PRESHAPE',
    title: 'Preshape',
    description: 'Divide and preshape into loose rounds.',
    duration_min: null,
    temperature: null,
    mixer_speed: null,
  })

  // Bench Rest
  steps.push({
    stage: 'REST',
    title: 'Bench Rest',
    description: 'Rest on bench, seam side down. Gluten relaxes for final shaping.',
    duration_min: proc.bench_rest_min,
    temperature: null,
    mixer_speed: null,
  })

  // Shape
  steps.push({
    stage: 'SHAPE',
    title: 'Final Shape',
    description: 'Shape to desired form. Maintain surface tension.',
    duration_min: null,
    temperature: null,
    mixer_speed: null,
  })

  // Retard
  const retardDesc = isEnriched
    ? 'Cold retard at 3\u00B0C. Fat slows staling \u2014 enriched doughs tolerate longer retards. Pull and temper 1\u20132 h before baking.'
    : 'Cold retard at 3\u00B0C. Develops flavor complexity and strengthens crust color. Pull and temper 1\u20132 h before baking.'
  steps.push({
    stage: 'RETARD',
    title: 'Retard',
    description: retardDesc,
    duration_min: 720,
    temperature: 3,
    mixer_speed: null,
  })

  // Final Proof
  const proofDesc = isEnriched
    ? `Proof at ${proofTemp}\u00B0C. Enriched dough needs warmth for yeast activity \u2014 monitor volume over strict timing.`
    : `Proof at ${proofTemp}\u00B0C until ready. Poke test: indent springs back slowly.`
  steps.push({
    stage: 'PROOF',
    title: 'Final Proof',
    description: proofDesc,
    duration_min: proc.proof_min,
    temperature: proofTemp,
    mixer_speed: null,
  })

  // Bake
  const bakeTemp = isEnriched ? 175 : 240
  const bakeDuration = isEnriched ? 30 : 22
  const bakeDesc = isEnriched
    ? `Bake at ${bakeTemp}\u00B0C for ${bakeDuration} min without steam. Watch for even color \u2014 sugar and fat promote browning.`
    : `Bake at ${bakeTemp}\u00B0C for ${bakeDuration} min with steam. Vent steam after 12 min for crust development.`
  steps.push({
    stage: 'BAKE',
    title: 'Bake',
    description: bakeDesc,
    duration_min: bakeDuration,
    temperature: bakeTemp,
    mixer_speed: null,
  })

  return steps
}

/** Join ingredient names into a comma-separated list. */
function nameList(ings) {
  return ings.map((i) => i.name).join(', ') || 'ingredients'
}
