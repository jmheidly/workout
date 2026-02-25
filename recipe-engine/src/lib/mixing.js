/**
 * Mixing & Friction System (§7)
 * Shared module — used by recipe builder, production page, and mixer management.
 */

export const MIX_TYPES = {
  'Short Mix': { target_rounds: 600, friction_mult: 0.7, has_second: false },
  'Improved Mix': { target_rounds: 1000, friction_mult: 1.0, has_second: true },
  'Intensive Mix': { target_rounds: 1600, friction_mult: 1.3, has_second: true },
  'Short Improved': { target_rounds: 400, friction_mult: 0.5, has_second: true },
}

export const MIX_TYPE_NAMES = Object.keys(MIX_TYPES)

export const MIXER_TYPES = ['SPIRAL', 'PLANETARY', 'FORK', 'HAND']

export const MIXER_TYPE_DEFAULTS = {
  SPIRAL: {
    friction: 14,
    first_speed_rpm: 105,
    second_speed_rpm: 204,
    cal: { 'Improved Mix': 420, 'Intensive Mix': 500, 'Short Improved': 500 },
  },
  PLANETARY: {
    friction: 8,
    first_speed_rpm: 80,
    second_speed_rpm: 160,
    cal: { 'Improved Mix': 350, 'Intensive Mix': 400, 'Short Improved': 400 },
  },
  FORK: {
    friction: 5,
    first_speed_rpm: 40,
    second_speed_rpm: 80,
    cal: { 'Improved Mix': 300, 'Intensive Mix': 350, 'Short Improved': 350 },
  },
  HAND: {
    friction: 2,
    first_speed_rpm: 0,
    second_speed_rpm: 0,
    cal: {},
  },
}

/**
 * Effective friction = base friction * mix-type multiplier.
 * @param {number} frictionFactor - base friction from mixer profile
 * @param {string} mixType - one of MIX_TYPE_NAMES
 * @returns {number}
 */
export function effectiveFriction(frictionFactor, mixType) {
  const mult = MIX_TYPES[mixType]?.friction_mult ?? 1.0
  return frictionFactor * mult
}

/**
 * Port of spec §7.3 calc_mix_durations.
 * Returns { first_speed_min, second_speed_min } for the selected mixer + mix type.
 *
 * @param {{ first_speed_rpm: number, second_speed_rpm: number, calibrations: Array<{ mix_type: string, first_speed_rounds: number }> }} mixerProfile
 * @param {string} mixType
 * @returns {{ first_speed_min: number, second_speed_min: number }}
 */
export function calcMixDurations(mixerProfile, mixType) {
  const mt = MIX_TYPES[mixType]
  if (!mt) return { first_speed_min: 0, second_speed_min: 0 }

  const rpm1 = mixerProfile.first_speed_rpm
  const rpm2 = mixerProfile.second_speed_rpm
  if (!rpm1 || !rpm2) return { first_speed_min: 0, second_speed_min: 0 }

  if (mixType === 'Short Mix') {
    // No 2nd speed — all development on 1st speed
    // 1st rounds = Improved Mix 1st rounds + 600 (Short Mix target rounds)
    const improvedCal = findCalibration(mixerProfile.calibrations, 'Improved Mix')
    return {
      first_speed_min: (improvedCal.first_speed_rounds + 600) / rpm1,
      second_speed_min: 0,
    }
  }

  const cal = findCalibration(mixerProfile.calibrations, mixType)

  return {
    first_speed_min: cal.first_speed_rounds / rpm1,
    second_speed_min: mt.target_rounds / rpm2,
  }
}

/**
 * @param {Array<{ mix_type: string, first_speed_rounds: number }>} calibrations
 * @param {string} mixType
 * @returns {{ first_speed_rounds: number }}
 */
function findCalibration(calibrations, mixType) {
  return (calibrations || []).find((c) => c.mix_type === mixType) || {
    first_speed_rounds: 0,
  }
}

/**
 * Port of spec §7.4 — back-calculate actual friction from production results.
 *
 * @param {object} params
 * @param {number} params.waterTempUsed
 * @param {number} params.flourTemp
 * @param {number} params.roomTemp
 * @param {number} params.actualDoughTemp
 * @param {number} [params.prefermentTemp]
 * @returns {number}
 */
export function calibrateFriction({
  waterTempUsed,
  flourTemp,
  roomTemp,
  actualDoughTemp,
  prefermentTemp,
}) {
  const temps = [waterTempUsed, flourTemp, roomTemp]
  if (prefermentTemp != null) temps.push(prefermentTemp)
  const factorCount = temps.length
  return actualDoughTemp * factorCount - temps.reduce((a, b) => a + b, 0)
}
