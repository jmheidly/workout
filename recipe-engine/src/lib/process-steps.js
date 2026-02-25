/**
 * Process Steps helpers (§10)
 * Shared module — used client-side for stage constants and step suggestions.
 */

export const PROCESS_STAGES = [
  'PREFERMENT_BUILD',
  'AUTOLYSE',
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
 * Suggest 3 template steps for an autolyse workflow.
 *
 * @param {number} durationMin - autolyse rest duration in minutes
 * @returns {Array<{ stage: string, title: string, description: string, duration_min: number|null }>}
 */
export function suggestAutolyseSteps(durationMin) {
  return [
    {
      stage: 'AUTOLYSE',
      title: 'Autolyse Mix',
      description:
        'Combine flour and water. Mix on 1st speed until just combined — no gluten development.',
      duration_min: 3,
    },
    {
      stage: 'AUTOLYSE',
      title: 'Autolyse Rest',
      description: `Cover and rest for ${durationMin} minutes. Flour hydrates and enzymes begin breaking down starch.`,
      duration_min: durationMin,
    },
    {
      stage: 'MIXING',
      title: 'Final Mix',
      description:
        'Add remaining ingredients (salt, yeast, preferments, enrichments). Mix to desired development.',
      duration_min: null,
    },
  ]
}
