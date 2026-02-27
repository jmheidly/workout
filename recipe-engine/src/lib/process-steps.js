/**
 * Process Steps helpers (§10, §15.3)
 * Shared module — used client-side for stage constants and step suggestions.
 */

import {
  MIXING_PHASES,
  classifyAllIngredients,
  groupByPhase,
} from './mixing-phases.js'
import { MIX_TYPES } from './mixing.js'

export const PROCESS_STAGES = [
  'PREFERMENT_BUILD',
  'PF_MIX',
  'PF_FEED',
  'PF_FERMENT',
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
 * Dough type → post-mixing process overrides.
 * When present, these replace MIX_TYPE_PROCESS values for the bread generator.
 */
const DOUGH_TYPE_MIX_PROCESS = {
  PIZZA: {
    bulk_min: 120,
    folds: 2,
    fold_interval_min: 30,
    bench_rest_min: 10,
    proof_min: 30,
  },
  FLATBREAD: {
    bulk_min: 60,
    folds: 1,
    fold_interval_min: 30,
    bench_rest_min: 15,
    proof_min: 45,
  },
}

/**
 * Dough types that use specialized template generators instead of the bread generator.
 */
const SPECIALIZED_TYPES = new Set([
  'LAMINATED_YEASTED',
  'LAMINATED',
  'CHOUX',
  'COOKIE',
  'SHORTCRUST',
  'SWEET_PASTRY',
  'PASTA',
  'TOPPING',
  'GLAZE',
  'FILLING',
  'SAUCE',
])

/**
 * Generate a complete process from mixing through bake.
 *
 * Analyzes mix type, DDT, enrichment level, dough type, and ingredient
 * composition to produce scientifically-grounded steps.
 *
 * @param {object} opts
 * @param {Array<{ id: string, name: string, category: string, base_qty: number, preferment_settings?: object }>} opts.ingredients
 * @param {boolean} opts.hasAutolyse
 * @param {number} [opts.autolyseDurationMin=20]
 * @param {string} [opts.mixType='Improved Mix']
 * @param {number} [opts.ddt=24]
 * @param {Object.<string, 'autolyse'|'final'>} [opts.autolyseOverrides={}] - baker's drag overrides
 * @param {string|null} [opts.doughType=null] - dough type key (§15)
 * @returns {Array<{ stage: string, title: string, description: string, duration_min: number|null, temperature: number|null, mixer_speed: string|null }>}
 */
export function suggestProcessSteps({
  ingredients,
  hasAutolyse,
  autolyseDurationMin = 20,
  mixType = 'Improved Mix',
  ddt = 24,
  autolyseOverrides = {},
  doughType = null,
}) {
  // Dispatch to specialized templates when applicable
  if (doughType && SPECIALIZED_TYPES.has(doughType)) {
    return generateSpecializedSteps(doughType, { ingredients, ddt })
  }

  const { phases: phaseMap } = classifyAllIngredients(ingredients)

  // Apply baker's autolyse overrides on top of classification
  if (hasAutolyse) {
    for (const [id, target] of Object.entries(autolyseOverrides)) {
      if (phaseMap.get(id) == null) continue // skip unclassified
      if (target === 'autolyse') phaseMap.set(id, MIXING_PHASES.AUTOLYSE)
      else if (target === 'final') {
        // Move to INCORPORATION unless already in FAT_ADDITION or MIXIN
        const cur = phaseMap.get(id)
        if (cur === MIXING_PHASES.AUTOLYSE)
          phaseMap.set(id, MIXING_PHASES.INCORPORATION)
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

  // Use dough type overrides if available, otherwise fall back to mix type
  const proc =
    (doughType && DOUGH_TYPE_MIX_PROCESS[doughType]) ||
    MIX_TYPE_PROCESS[mixType] ||
    MIX_TYPE_PROCESS['Improved Mix']

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
      description: `Add ${incorpNames}. Mix on 1st speed until incorporated, ${
        hasSecond ? developmentTail : developmentTailShort
      }`,
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
      description: `Combine ${initialNames} on 1st speed until incorporated, ${
        hasSecond ? developmentTail : developmentTailShort
      }`,
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
      description: `Add ${fatNames} in stages on 1st speed. ${
        hasSecond
          ? 'Return to 2nd speed after each addition and mix until smooth.'
          : 'Mix on 1st speed after each addition until smooth.'
      }`,
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

  // Pizza: ball + stretch instead of preshape/shape
  if (doughType === 'PIZZA') {
    steps.push(
      {
        stage: 'PRESHAPE',
        title: 'Ball',
        description:
          'Divide and ball. Tuck edges under to build surface tension.',
        duration_min: null,
        temperature: null,
        mixer_speed: null,
      },
      {
        stage: 'REST',
        title: 'Ball Proof',
        description: `Proof at ${proofTemp}\u00B0C. Balls should be puffy and relaxed.`,
        duration_min: proc.proof_min,
        temperature: proofTemp,
        mixer_speed: null,
      },
      {
        stage: 'SHAPE',
        title: 'Stretch',
        description:
          'Stretch by hand from center outward. Do not use a rolling pin \u2014 preserves gas structure.',
        duration_min: null,
        temperature: null,
        mixer_speed: null,
      },
      {
        stage: 'BAKE',
        title: 'Bake',
        description:
          'Bake at 260\u2013480\u00B0C for 2\u20135 min. Neapolitan: 480\u00B0C/90s. Home oven: 260\u00B0C on stone/steel, 5 min.',
        duration_min: 5,
        temperature: 260,
        mixer_speed: null,
      }
    )
    return steps
  }

  // Flatbread: shorter flow, roll/stretch step, very hot bake
  if (doughType === 'FLATBREAD') {
    steps.push(
      {
        stage: 'PRESHAPE',
        title: 'Divide',
        description: 'Divide into portions and round loosely.',
        duration_min: null,
        temperature: null,
        mixer_speed: null,
      },
      {
        stage: 'REST',
        title: 'Bench Rest',
        description:
          'Rest on bench, covered. Gluten relaxes for rolling/stretching.',
        duration_min: proc.bench_rest_min,
        temperature: null,
        mixer_speed: null,
      },
      {
        stage: 'SHAPE',
        title: 'Roll / Stretch',
        description:
          'Roll or stretch to desired thickness. Pita: 5mm even for pocket. Focaccia: dimple in oiled pan.',
        duration_min: null,
        temperature: null,
        mixer_speed: null,
      },
      {
        stage: 'PROOF',
        title: 'Final Proof',
        description: `Proof at ${proofTemp}\u00B0C until puffy.`,
        duration_min: proc.proof_min,
        temperature: proofTemp,
        mixer_speed: null,
      },
      {
        stage: 'BAKE',
        title: 'Bake',
        description:
          'Bake at high heat. Pita: 260\u2013480\u00B0C for 2\u20133 min until puffed. Naan: tandoor or cast iron. Focaccia: 220\u00B0C, 20\u201325 min.',
        duration_min: 10,
        temperature: 260,
        mixer_speed: null,
      }
    )
    return steps
  }

  // ── Standard bread post-mix flow ──────────────────────────

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
    description:
      'Rest on bench, seam side down. Gluten relaxes for final shaping.',
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

  // Retard (Suas Ch. 4 — retarding-proofing technique)
  // 3–4°C for 12–48 h after shaping, then warm proof before baking.
  // At 4°C yeast and bacteria become dormant — fermentation nearly stops.
  const retardDesc = isEnriched
    ? 'Retard at 4\u00B0C for 12\u201348 h. Enriched doughs tolerate longer retards \u2014 fat insulates gluten. Temper at room temp before proofing.'
    : 'Retard at 4\u00B0C for 12\u201348 h. Develops flavor complexity, strengthens crust color. Temper at room temp before proofing.'
  steps.push({
    stage: 'RETARD',
    title: 'Retard',
    description: retardDesc,
    duration_min: 720,
    temperature: 4,
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

// ── Specialized Template Generators ─────────────────────────────────

/**
 * Dispatch to a dough-type-specific template.
 * These types don't follow the standard bread mixing → bulk → shape → proof → bake flow.
 */
function generateSpecializedSteps(doughType, { ingredients, ddt }) {
  const generators = {
    LAMINATED_YEASTED: generateLaminatedYeasted,
    LAMINATED: generateLaminatedPuff,
    CHOUX: generateChoux,
    COOKIE: generateCookie,
    SHORTCRUST: generateShortcrust,
    SWEET_PASTRY: generateSweetPastry,
    PASTA: generatePasta,
    TOPPING: generateTopping,
    GLAZE: generateGlaze,
    FILLING: generateFilling,
    SAUCE: generateSauce,
  }
  const gen = generators[doughType]
  return gen ? gen({ ingredients, ddt }) : []
}

function generateLaminatedYeasted({ ingredients, ddt }) {
  const allNames = nameList(
    ingredients.filter((i) => i.category !== 'PREFERMENT')
  )
  return [
    {
      stage: 'MIXING',
      title: 'Mix D\u00E9trempe',
      description: `Combine ${allNames} on 1st speed until smooth. Do not overdevelop \u2014 lamination provides structure.`,
      duration_min: null,
      temperature: null,
      mixer_speed: '1st',
    },
    {
      stage: 'FOLD',
      title: 'Bulk Rest',
      description: `Rest d\u00E9trempe at ${ddt}\u00B0C. Gluten relaxes for sheeting.`,
      duration_min: 60,
      temperature: ddt,
      mixer_speed: null,
    },
    {
      stage: 'SHAPE',
      title: 'Enclose Butter Block',
      description:
        'Sheet d\u00E9trempe, place beurrage in center, fold to enclose. Seal edges completely.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'SHAPE',
      title: 'Letter Fold 1',
      description:
        'Roll out to 3\u00D7 length, fold in thirds (letter fold). Keep butter and dough at same consistency.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'RETARD',
      title: 'Retard 1',
      description: 'Wrap and refrigerate. Butter firms, gluten relaxes.',
      duration_min: 30,
      temperature: 4,
      mixer_speed: null,
    },
    {
      stage: 'SHAPE',
      title: 'Letter Fold 2',
      description: 'Roll out and perform second letter fold.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'RETARD',
      title: 'Retard 2',
      description: 'Wrap and refrigerate.',
      duration_min: 30,
      temperature: 4,
      mixer_speed: null,
    },
    {
      stage: 'SHAPE',
      title: 'Letter Fold 3',
      description: 'Roll out and perform third letter fold. Total: 27 layers.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'RETARD',
      title: 'Final Retard',
      description:
        'Wrap and refrigerate for at least 2 hours, preferably overnight.',
      duration_min: 120,
      temperature: 4,
      mixer_speed: null,
    },
    {
      stage: 'SHAPE',
      title: 'Sheet & Cut',
      description:
        'Roll to 4mm thickness. Cut triangles (croissant) or squares (danish).',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'PROOF',
      title: 'Proof',
      description:
        'Proof at 27\u00B0C, 75% humidity for 90 min. Layers should be visibly separated and jiggly.',
      duration_min: 90,
      temperature: 27,
      mixer_speed: null,
    },
    {
      stage: 'BAKE',
      title: 'Egg Wash & Bake',
      description:
        'Egg wash. Bake at 190\u00B0C for 15\u201318 min until deep golden. Do not open oven in first 10 min.',
      duration_min: 17,
      temperature: 190,
      mixer_speed: null,
    },
  ]
}

function generateLaminatedPuff({ ingredients }) {
  const allNames = nameList(ingredients)
  return [
    {
      stage: 'MIXING',
      title: 'Mix D\u00E9trempe',
      description: `Combine ${allNames} on 1st speed until just cohesive. Do not develop gluten.`,
      duration_min: null,
      temperature: null,
      mixer_speed: '1st',
    },
    {
      stage: 'REST',
      title: 'Rest',
      description:
        'Wrap and rest at room temperature. Gluten relaxes for sheeting.',
      duration_min: 60,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'SHAPE',
      title: 'Enclose Butter Block',
      description:
        'Sheet d\u00E9trempe, place butter block in center, fold to enclose. Seal edges.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'SHAPE',
      title: 'Single Fold 1',
      description: 'Roll out and perform single (book) fold.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'RETARD',
      title: 'Retard',
      description: 'Wrap and refrigerate between turns.',
      duration_min: 30,
      temperature: 4,
      mixer_speed: null,
    },
    {
      stage: 'SHAPE',
      title: 'Single Fold 2',
      description: 'Roll out and perform second single fold.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'RETARD',
      title: 'Retard',
      description: 'Wrap and refrigerate.',
      duration_min: 30,
      temperature: 4,
      mixer_speed: null,
    },
    {
      stage: 'SHAPE',
      title: 'Single Folds 3\u20136',
      description:
        'Continue folding and retarding. 6 single folds total = 729 layers. Retard 30 min between each pair.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'REST',
      title: 'Final Rest',
      description: 'Rest in refrigerator before cutting and shaping.',
      duration_min: 60,
      temperature: 4,
      mixer_speed: null,
    },
    {
      stage: 'SHAPE',
      title: 'Cut & Shape',
      description: 'Roll to desired thickness. Cut to shape. Dock if needed.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'BAKE',
      title: 'Bake',
      description:
        'Bake at 200\u00B0C for 20 min. Steam leavened \u2014 rises dramatically in the first 10 min.',
      duration_min: 20,
      temperature: 200,
      mixer_speed: null,
    },
  ]
}

function generateChoux({ ingredients }) {
  const allNames = nameList(ingredients)
  return [
    {
      stage: 'MIXING',
      title: 'Cook Panade',
      description:
        'Bring water and butter to a rolling boil in a saucepan. Add flour all at once, stir vigorously until dough pulls from sides and a film forms on the bottom of the pan.',
      duration_min: 5,
      temperature: 100,
      mixer_speed: null,
    },
    {
      stage: 'REST',
      title: 'Cool Panade',
      description:
        'Transfer panade to mixer bowl. Cool for 10 min \u2014 must be below 60\u00B0C before adding eggs or they will cook.',
      duration_min: 10,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'MIXING',
      title: 'Add Eggs',
      description:
        'Add eggs in 3\u20134 additions on 1st speed (paddle attachment). After each addition, mix until fully absorbed before adding more. Final consistency: thick, glossy, falls in a V-shape from the paddle.',
      duration_min: null,
      temperature: null,
      mixer_speed: '1st',
    },
    {
      stage: 'SHAPE',
      title: 'Pipe',
      description:
        'Transfer to piping bag. Pipe to desired shapes on parchment-lined sheet. Smooth tops with a wet finger.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'BAKE',
      title: 'Bake \u2014 High',
      description:
        'Bake at 200\u00B0C for 15 min. Steam inside puffs creates the rise. Do not open oven.',
      duration_min: 15,
      temperature: 200,
      mixer_speed: null,
    },
    {
      stage: 'BAKE',
      title: 'Bake \u2014 Low',
      description:
        'Reduce to 175\u00B0C, bake 20 min more. Structure sets. Pierce base with a skewer to release steam.',
      duration_min: 20,
      temperature: 175,
      mixer_speed: null,
    },
    {
      stage: 'COOL',
      title: 'Cool & Dry',
      description:
        'Turn off oven, prop door open, leave puffs inside 10 min to dry. Cool completely on rack before filling.',
      duration_min: 10,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'FINISH',
      title: 'Fill',
      description:
        'Fill with pastry cream, whipped cream, or desired filling. Pipe through base or slice top.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
  ]
}

function generateCookie({ ingredients }) {
  const fatIngs = ingredients.filter(
    (i) => i.category === 'ENRICHMENT' || i.category === 'SWEETENER'
  )
  const dryIngs = ingredients.filter(
    (i) =>
      i.category === 'FLOUR' ||
      i.category === 'LEAVENING' ||
      i.category === 'SEASONING' ||
      i.category === 'CONDITIONER'
  )
  const mixinIngs = ingredients.filter((i) => i.category === 'MIXIN')

  return [
    {
      stage: 'MIXING',
      title: 'Cream Butter & Sugar',
      description: `Cream ${nameList(
        fatIngs
      )} on medium speed (paddle) for 5 min until light and fluffy.`,
      duration_min: 5,
      temperature: null,
      mixer_speed: '2nd',
    },
    {
      stage: 'MIXING',
      title: 'Add Eggs',
      description:
        'Add eggs one at a time, mixing until just incorporated after each.',
      duration_min: null,
      temperature: null,
      mixer_speed: '1st',
    },
    {
      stage: 'MIXING',
      title: 'Add Dry Ingredients',
      description: `Add ${nameList(
        dryIngs
      )} on low speed. Mix until just combined \u2014 do not overmix.`,
      duration_min: null,
      temperature: null,
      mixer_speed: '1st',
    },
    ...(mixinIngs.length > 0
      ? [
          {
            stage: 'MIXING',
            title: 'Fold in Mix-ins',
            description: `Fold in ${nameList(
              mixinIngs
            )} by hand or on lowest speed.`,
            duration_min: null,
            temperature: null,
            mixer_speed: '1st',
          },
        ]
      : []),
    {
      stage: 'SHAPE',
      title: 'Portion',
      description:
        'Scoop or pipe onto parchment-lined sheets at desired weight.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'RETARD',
      title: 'Chill (optional)',
      description:
        'Refrigerate portioned dough 30\u201360 min for better spread control and flavor development.',
      duration_min: 30,
      temperature: 4,
      mixer_speed: null,
    },
    {
      stage: 'BAKE',
      title: 'Bake',
      description:
        'Bake at 175\u00B0C for 10\u201312 min. Edges set but center still soft \u2014 cookies firm as they cool.',
      duration_min: 11,
      temperature: 175,
      mixer_speed: null,
    },
    {
      stage: 'COOL',
      title: 'Cool',
      description:
        'Cool on sheet 5 min (carry-over baking continues), then transfer to wire rack.',
      duration_min: 5,
      temperature: null,
      mixer_speed: null,
    },
  ]
}

function generateShortcrust({ ingredients }) {
  const fatIngs = ingredients.filter((i) => i.category === 'ENRICHMENT')
  const flourIngs = ingredients.filter((i) => i.category === 'FLOUR')
  const liquidIngs = ingredients.filter((i) => i.category === 'LIQUID')

  return [
    {
      stage: 'MIXING',
      title: 'Sablage',
      description: `Rub ${nameList(fatIngs)} into ${nameList(
        flourIngs
      )} by hand or pulse in food processor until pea-sized crumbs.`,
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'MIXING',
      title: 'Add Liquid',
      description: `Add ${nameList(
        liquidIngs.length > 0 ? liquidIngs : [{ name: 'cold water' }]
      )}. Mix until dough just comes together. Do not knead.`,
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'SHAPE',
      title: 'Fraisage',
      description:
        'Push dough forward with heel of hand in small sections (fraisage). Redistributes fat for flaky layers.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'RETARD',
      title: 'Chill',
      description:
        'Wrap in plastic and refrigerate. Gluten relaxes, fat re-firms.',
      duration_min: 60,
      temperature: 4,
      mixer_speed: null,
    },
    {
      stage: 'SHAPE',
      title: 'Roll & Line Mold',
      description:
        'Roll to 3mm on floured surface. Line tart mold, pressing into corners. Trim excess. Dock base with fork.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'BAKE',
      title: 'Blind Bake',
      description:
        'Line with parchment and pie weights. Bake at 180\u00B0C for 15\u201320 min. Remove weights, bake 5 min more until light golden.',
      duration_min: 20,
      temperature: 180,
      mixer_speed: null,
    },
    {
      stage: 'FINISH',
      title: 'Fill & Bake',
      description:
        'Add filling and bake per recipe instructions. If no further baking needed, cool shell completely before filling.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
  ]
}

function generateSweetPastry({ ingredients }) {
  const fatIngs = ingredients.filter(
    (i) => i.category === 'ENRICHMENT' || i.category === 'SWEETENER'
  )
  const flourIngs = ingredients.filter((i) => i.category === 'FLOUR')

  return [
    {
      stage: 'MIXING',
      title: 'Cream Butter & Sugar',
      description: `Cream ${nameList(
        fatIngs
      )} on medium speed (paddle) until smooth and pale. Do not aerate excessively.`,
      duration_min: null,
      temperature: null,
      mixer_speed: '2nd',
    },
    {
      stage: 'MIXING',
      title: 'Add Egg',
      description: 'Add egg, mix until just incorporated.',
      duration_min: null,
      temperature: null,
      mixer_speed: '1st',
    },
    {
      stage: 'MIXING',
      title: 'Add Flour',
      description: `Add ${nameList(
        flourIngs
      )} on low speed. Mix until dough just comes together \u2014 minimal mixing prevents toughness.`,
      duration_min: null,
      temperature: null,
      mixer_speed: '1st',
    },
    {
      stage: 'RETARD',
      title: 'Chill',
      description: 'Wrap in plastic and refrigerate. Dough firms for rolling.',
      duration_min: 60,
      temperature: 4,
      mixer_speed: null,
    },
    {
      stage: 'SHAPE',
      title: 'Roll & Line Mold',
      description:
        'Roll to 3mm between parchment sheets. Line tart mold, press into corners, trim. Freeze 10 min if soft.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'BAKE',
      title: 'Bake',
      description:
        'Bake at 170\u00B0C for 12\u201315 min until edges are golden. Sugar content promotes fast browning \u2014 watch carefully.',
      duration_min: 14,
      temperature: 170,
      mixer_speed: null,
    },
  ]
}

function generatePasta({ ingredients }) {
  const allNames = nameList(ingredients)
  return [
    {
      stage: 'MIXING',
      title: 'Mix',
      description: `Combine ${allNames} on low speed for 3 min until a shaggy dough forms.`,
      duration_min: 3,
      temperature: null,
      mixer_speed: '1st',
    },
    {
      stage: 'MIXING',
      title: 'Knead',
      description:
        'Knead briefly by hand until smooth and elastic. Dough should spring back when poked.',
      duration_min: 3,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'REST',
      title: 'Rest',
      description:
        'Wrap tightly in plastic. Rest at room temperature. Gluten relaxes for easier rolling.',
      duration_min: 30,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'SHAPE',
      title: 'Roll',
      description:
        'Roll through pasta machine at progressively thinner settings, or roll by hand to desired thickness.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'SHAPE',
      title: 'Cut',
      description:
        'Cut to desired shape: tagliatelle, pappardelle, ravioli, etc. Dust with semolina to prevent sticking.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'FINISH',
      title: 'Dry or Cook',
      description:
        'Fresh: cook immediately in salted boiling water (2\u20134 min). Dried: hang or lay flat until brittle.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
  ]
}

// ── Component Template Generators ────────────────────────────────────

function generateTopping({ ingredients }) {
  const fatIngs = ingredients.filter((i) => i.category === 'ENRICHMENT')
  const dryIngs = ingredients.filter(
    (i) =>
      i.category !== 'ENRICHMENT' &&
      i.category !== 'LIQUID' &&
      i.category !== 'PREFERMENT'
  )
  const liquidIngs = ingredients.filter((i) => i.category === 'LIQUID')
  const hasFat = fatIngs.length > 0
  const hasLiquid = liquidIngs.length > 0

  const steps = []

  if (hasFat) {
    steps.push({
      stage: 'MIXING',
      title: 'Melt Fat',
      description: `Melt ${nameList(fatIngs)} gently. Do not overheat — just until liquid.`,
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    })
  }

  if (dryIngs.length > 0) {
    steps.push({
      stage: 'MIXING',
      title: 'Combine Dry',
      description: `Combine ${nameList(dryIngs)}. Mix until evenly distributed.`,
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    })
  }

  if (hasFat || hasLiquid) {
    const wetNames = nameList([...fatIngs, ...liquidIngs])
    steps.push({
      stage: 'MIXING',
      title: 'Mix Wet into Dry',
      description: `Add ${wetNames} to dry ingredients. Stir until uniform — do not overmix.`,
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    })
  }

  steps.push({
    stage: 'FINISH',
    title: 'Store',
    description:
      'Transfer to airtight container. Use immediately or store at room temperature.',
    duration_min: null,
    temperature: null,
    mixer_speed: null,
  })

  return steps
}

function generateGlaze({ ingredients }) {
  const liquidIngs = ingredients.filter((i) => i.category === 'LIQUID')
  const fatIngs = ingredients.filter((i) => i.category === 'ENRICHMENT')
  const dryIngs = ingredients.filter(
    (i) =>
      i.category !== 'LIQUID' &&
      i.category !== 'ENRICHMENT' &&
      i.category !== 'PREFERMENT'
  )
  const hasLiquid = liquidIngs.length > 0
  const hasFat = fatIngs.length > 0
  const allNames = nameList(ingredients)

  const steps = []

  if (hasLiquid || hasFat) {
    steps.push({
      stage: 'MIXING',
      title: 'Heat Liquid',
      description: `Heat ${nameList([...liquidIngs, ...fatIngs])} until warm and combined. Do not boil.`,
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    })
  }

  steps.push({
    stage: 'MIXING',
    title: 'Combine',
    description: hasLiquid || hasFat
      ? `Add ${nameList(dryIngs)} to warm liquid. Whisk until smooth and lump-free.`
      : `Combine ${allNames}. Whisk until smooth.`,
    duration_min: null,
    temperature: null,
    mixer_speed: null,
  })

  steps.push({
    stage: 'COOL',
    title: 'Cool to Working Temperature',
    description:
      'Cool glaze until it coats the back of a spoon. Too hot = runs off; too cool = sets unevenly.',
    duration_min: null,
    temperature: null,
    mixer_speed: null,
  })

  steps.push({
    stage: 'FINISH',
    title: 'Apply',
    description:
      'Pour or brush over product. Work quickly — glaze sets as it cools. Allow to set completely before handling.',
    duration_min: null,
    temperature: null,
    mixer_speed: null,
  })

  return steps
}

function generateFilling({ ingredients }) {
  const liquidIngs = ingredients.filter((i) => i.category === 'LIQUID')
  const fatIngs = ingredients.filter((i) => i.category === 'ENRICHMENT')
  const dryIngs = ingredients.filter(
    (i) =>
      i.category !== 'LIQUID' &&
      i.category !== 'ENRICHMENT' &&
      i.category !== 'PREFERMENT'
  )
  const allNames = nameList(ingredients)

  return [
    {
      stage: 'MIXING',
      title: 'Combine Dry',
      description: dryIngs.length > 0
        ? `Whisk ${nameList(dryIngs)} together to prevent lumps.`
        : `Prepare ${allNames}.`,
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'MIXING',
      title: 'Cook',
      description: liquidIngs.length > 0
        ? `Heat ${nameList(liquidIngs)}${fatIngs.length ? ' and ' + nameList(fatIngs) : ''} in a saucepan. Gradually whisk in dry ingredients. Cook over medium heat, stirring constantly, until thickened.`
        : `Combine all ingredients in a saucepan. Cook over medium heat, stirring constantly, until thickened.`,
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'COOL',
      title: 'Cool',
      description:
        'Transfer to a clean container. Press plastic wrap directly on surface to prevent skin. Cool rapidly — ice bath if large batch.',
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    },
    {
      stage: 'FINISH',
      title: 'Store',
      description:
        'Refrigerate until use. Whisk briefly before using to restore smooth consistency.',
      duration_min: null,
      temperature: 4,
      mixer_speed: null,
    },
  ]
}

function generateSauce({ ingredients }) {
  const allNames = nameList(ingredients)
  const sweetIngs = ingredients.filter((i) => i.category === 'SWEETENER')
  const liquidIngs = ingredients.filter((i) => i.category === 'LIQUID')
  const hasSugar = sweetIngs.length > 0

  const steps = []

  if (hasSugar && liquidIngs.length > 0) {
    steps.push({
      stage: 'MIXING',
      title: 'Cook Sugar',
      description: `Heat ${nameList(sweetIngs)} in a heavy saucepan over medium heat. Do not stir — swirl pan gently. Cook until desired color.`,
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    })
    steps.push({
      stage: 'MIXING',
      title: 'Add Liquid',
      description: `Carefully add ${nameList(liquidIngs)} — mixture will bubble vigorously. Stir until smooth.`,
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    })
  } else {
    steps.push({
      stage: 'MIXING',
      title: 'Combine & Cook',
      description: `Combine ${allNames} in a saucepan. Cook over medium heat, stirring frequently.`,
      duration_min: null,
      temperature: null,
      mixer_speed: null,
    })
  }

  steps.push({
    stage: 'MIXING',
    title: 'Reduce',
    description:
      'Simmer until sauce reaches desired consistency. It will thicken further as it cools.',
    duration_min: null,
    temperature: null,
    mixer_speed: null,
  })

  steps.push({
    stage: 'COOL',
    title: 'Cool',
    description: 'Cool to room temperature. Transfer to airtight container.',
    duration_min: null,
    temperature: null,
    mixer_speed: null,
  })

  steps.push({
    stage: 'FINISH',
    title: 'Store',
    description: 'Refrigerate. Reheat gently before use — do not boil.',
    duration_min: null,
    temperature: 4,
    mixer_speed: null,
  })

  return steps
}

// ── Per-PF Process Step Suggestions ─────────────────────────────────

/**
 * Suggest process steps for a pre-ferment build.
 *
 * @param {string} pfType - PF type key (POOLISH, BIGA, LEVAIN, etc.)
 * @param {string} pfName - display name of the PF ingredient
 * @param {string} pfIngredientId - ingredient ID to attach steps to
 * @returns {Array<{ id: string, stage: string, title: string, description: string, duration_min: number|null, temperature: number|null, mixer_speed: string|null, notes: string|null, preferment_ingredient_id: string }>}
 */
export function suggestPfProcessSteps(pfType, pfName, pfIngredientId) {
  const base = {
    mixer_speed: null,
    notes: null,
    preferment_ingredient_id: pfIngredientId,
  }
  const id = () =>
    crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10)

  switch (pfType) {
    case 'POOLISH':
      return [
        {
          ...base,
          id: id(),
          stage: 'PF_MIX',
          title: `Mix ${pfName}`,
          description:
            'Combine flour, water, and yeast. Stir until smooth — no lumps.',
          duration_min: null,
          temperature: null,
        },
        {
          ...base,
          id: id(),
          stage: 'PF_FERMENT',
          title: `Ferment ${pfName}`,
          description:
            'Cover and ferment at room temperature. Ready when surface is bubbly and slightly domed.',
          duration_min: 840,
          temperature: 21,
        },
      ]
    case 'BIGA':
      return [
        {
          ...base,
          id: id(),
          stage: 'PF_MIX',
          title: `Mix ${pfName}`,
          description:
            'Combine flour, water, and yeast. Mix until shaggy — biga is stiff, do not overdevelop.',
          duration_min: null,
          temperature: null,
        },
        {
          ...base,
          id: id(),
          stage: 'PF_FERMENT',
          title: `Ferment ${pfName}`,
          description:
            'Cover and ferment at cool room temperature. Ready when doubled and slightly domed.',
          duration_min: 840,
          temperature: 18,
        },
      ]
    case 'LEVAIN':
      return [
        {
          ...base,
          id: id(),
          stage: 'PF_MIX',
          title: `Mix ${pfName}`,
          description:
            'Combine starter, flour, and water. Mix until incorporated.',
          duration_min: null,
          temperature: null,
        },
        {
          ...base,
          id: id(),
          stage: 'PF_FEED',
          title: `Feed ${pfName}`,
          description:
            'Feed every 4 hours if building over multiple stages. Maintain at 29\u00B0C for consistent activity.',
          duration_min: 240,
          temperature: 29,
        },
        {
          ...base,
          id: id(),
          stage: 'PF_FERMENT',
          title: `Ferment ${pfName}`,
          description:
            'Final fermentation at 29\u00B0C. Ready when doubled, domed, and passes float test.',
          duration_min: 600,
          temperature: 29,
        },
      ]
    case 'PATE_FERMENTEE':
      return [
        {
          ...base,
          id: id(),
          stage: 'PF_MIX',
          title: `Mix ${pfName}`,
          description:
            'Use reserved dough from previous batch, or mix flour, water, yeast, and salt to a smooth dough.',
          duration_min: null,
          temperature: null,
        },
        {
          ...base,
          id: id(),
          stage: 'PF_FERMENT',
          title: `Ferment ${pfName}`,
          description:
            'Ferment at room temperature then refrigerate. Use within 24 hours.',
          duration_min: 150,
          temperature: 21,
        },
      ]
    case 'SPONGE':
      return [
        {
          ...base,
          id: id(),
          stage: 'PF_MIX',
          title: `Mix ${pfName}`,
          description: 'Combine flour, water, and yeast. Mix until smooth.',
          duration_min: null,
          temperature: null,
        },
        {
          ...base,
          id: id(),
          stage: 'PF_FERMENT',
          title: `Ferment ${pfName}`,
          description:
            'Cover and ferment at room temperature. Ready when bubbly and starting to recede.',
          duration_min: 840,
          temperature: 21,
        },
      ]
    default: // CUSTOM
      return [
        {
          ...base,
          id: id(),
          stage: 'PF_MIX',
          title: `Mix ${pfName}`,
          description: 'Combine ingredients for the pre-ferment.',
          duration_min: null,
          temperature: null,
        },
        {
          ...base,
          id: id(),
          stage: 'PF_FERMENT',
          title: `Ferment ${pfName}`,
          description: 'Ferment until ready.',
          duration_min: null,
          temperature: null,
        },
      ]
  }
}

/** Join ingredient names into a comma-separated list. */
function nameList(ings) {
  return ings.map((i) => i.name).join(', ') || 'ingredients'
}
