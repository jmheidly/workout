/**
 * Process Steps helpers (§10)
 * Shared module — used client-side for stage constants and step suggestions.
 */

import { MIXING_PHASES, classifyAllIngredients, groupByPhase } from './mixing-phases.js'

export const PROCESS_STAGES = [
  'PREFERMENT_BUILD',
  'AUTOLYSE',
  'FERMENTOLYSE',
  'MIXING',
  'BULK_FERMENT',
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
 * Generate multi-phase mixing steps based on ingredient classification.
 *
 * @param {object} opts
 * @param {Array<{ id: string, name: string, category: string, base_qty: number, preferment_settings?: object }>} opts.ingredients
 * @param {boolean} opts.hasAutolyse
 * @param {number} [opts.autolyseDurationMin=20]
 * @returns {Array<{ stage: string, title: string, description: string, duration_min: number|null }>}
 */
export function suggestMixingSteps({ ingredients, hasAutolyse, autolyseDurationMin = 20 }) {
  const { phases: phaseMap } = classifyAllIngredients(ingredients)
  const groups = groupByPhase(ingredients, phaseMap)

  const autolyseIngs = groups[MIXING_PHASES.AUTOLYSE] || []
  const incorpIngs = groups[MIXING_PHASES.INCORPORATION] || []
  const fatIngs = groups[MIXING_PHASES.FAT_ADDITION] || []
  const mixinIngs = groups[MIXING_PHASES.MIXIN] || []

  const hasFatPhase = fatIngs.length > 0
  const hasMixinPhase = mixinIngs.length > 0
  const developmentTail = hasFatPhase
    ? 'then 2nd speed to begin gluten development.'
    : 'then 2nd speed to desired development.'

  const steps = []

  if (hasAutolyse) {
    // Detect fermentolyse: a preferment is in the autolyse group
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
    })

    steps.push({
      stage,
      title: restTitle,
      description: restDescription,
      duration_min: autolyseDurationMin,
    })

    const incorpNames = nameList(incorpIngs)
    steps.push({
      stage: 'MIXING',
      title: 'Final Mix \u2014 Incorporation',
      description: `Add ${incorpNames}. Mix on 1st speed until incorporated, ${developmentTail}`,
      duration_min: null,
    })
  } else {
    // No autolyse: merge autolyse + incorporation phases into one initial mix
    const allInitialIngs = [...autolyseIngs, ...incorpIngs]
    const initialNames = nameList(allInitialIngs)

    steps.push({
      stage: 'MIXING',
      title: 'Initial Mix',
      description: `Combine ${initialNames} on 1st speed until incorporated, ${developmentTail}`,
      duration_min: null,
    })
  }

  // Development step — only when fat phase exists
  if (hasFatPhase) {
    steps.push({
      stage: 'MIXING',
      title: 'Development',
      description:
        'Continue mixing on 2nd speed to moderate gluten development before adding enrichments.',
      duration_min: null,
    })
  }

  // Fat & Sugar Addition
  if (hasFatPhase) {
    const fatNames = nameList(fatIngs)
    steps.push({
      stage: 'MIXING',
      title: 'Fat & Sugar Addition',
      description: `Add ${fatNames} in stages on 1st speed. Return to 2nd speed after each addition and mix until smooth.`,
      duration_min: null,
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
    })
  }

  return steps
}

/** Join ingredient names into a comma-separated list. */
function nameList(ings) {
  return ings.map((i) => i.name).join(', ') || 'ingredients'
}
