/**
 * Per-preferment fermentation defaults and helpers (§5.5)
 */

export const FERMENTATION_DEFAULTS = {
  POOLISH: 720,
  BIGA: 960,
  LEVAIN: 480,
  PATE_FERMENTEE: 720,
  SPONGE: 240,
  CUSTOM: 480,
}

/**
 * @param {{ fermentation_duration_min?: number|null, type: string }} settings
 * @returns {number}
 */
export function getEffectiveFermentationDuration(settings) {
  return settings.fermentation_duration_min ?? FERMENTATION_DEFAULTS[settings.type] ?? 480
}

/**
 * @param {{ ddt?: number|null }} settings
 * @param {number} recipeDdt
 * @returns {number}
 */
export function getEffectiveDdt(settings, recipeDdt) {
  return settings.ddt ?? recipeDdt
}

/**
 * @param {number} min
 * @returns {string}
 */
export function formatDuration(min) {
  if (min == null || min <= 0) return '0m'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
