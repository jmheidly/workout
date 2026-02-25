/**
 * Water Temperature Calculator (§6)
 * Shared module — used client-side for reactive calculation.
 */

/**
 * @typedef {Object} WaterTempInput
 * @property {number} ddt - Desired Dough Temperature (°C)
 * @property {number} flour_temp - Current flour temperature (°C)
 * @property {number} room_temp - Ambient room temperature (°C)
 * @property {number} friction_factor - Mixer friction factor (°C)
 * @property {number} [preferment_temp] - Pre-ferment temperature (°C), enables 4-factor
 * @property {boolean} [has_autolyse] - Whether autolyse is active
 * @property {number} [autolyse_duration_min] - Autolyse rest duration in minutes
 */

/**
 * @typedef {Object} WaterTempResult
 * @property {number} water_temp - Calculated water temperature (°C)
 * @property {string} method - '3-factor' | '4-factor' | '3-factor-autolyse'
 * @property {string|null} warning - Warning message or null
 */

/**
 * Calculate the required water temperature to hit the DDT.
 *
 * 3-factor: water = (DDT × 3) − flour − room − friction
 * 4-factor: water = (DDT × 4) − flour − room − preferment − friction
 * Autolyse: flour temp drifts toward room temp during rest, adjusting the calc.
 *
 * @param {WaterTempInput} input
 * @returns {WaterTempResult}
 */
export function calcWaterTemp(input) {
  const { ddt, flour_temp, room_temp, friction_factor } = input

  // Autolyse adjustment (§6.4)
  if (input.has_autolyse && input.autolyse_duration_min > 0) {
    const initialMixTemp = (flour_temp + room_temp) / 2
    const drift = Math.min(input.autolyse_duration_min / 60, 1.0)
    const postAutolyseTemp = initialMixTemp + (room_temp - initialMixTemp) * drift

    const waterTemp = ddt * 3 - postAutolyseTemp - room_temp - friction_factor

    return {
      water_temp: waterTemp,
      method: '3-factor-autolyse',
      warning: getWarning(waterTemp)
    }
  }

  // 4-factor with pre-ferment temp
  if (input.preferment_temp != null) {
    const waterTemp =
      ddt * 4 - flour_temp - room_temp - input.preferment_temp - friction_factor

    return {
      water_temp: waterTemp,
      method: '4-factor',
      warning: getWarning(waterTemp)
    }
  }

  // 3-factor (standard)
  const waterTemp = ddt * 3 - flour_temp - room_temp - friction_factor

  return {
    water_temp: waterTemp,
    method: '3-factor',
    warning: getWarning(waterTemp)
  }
}

/**
 * @param {number} temp
 * @returns {string|null}
 */
function getWarning(temp) {
  if (temp < 1) return 'Use ice water. Target unachievable with liquid water alone.'
  if (temp > 43) return 'Water too hot — will kill yeast above 43°C.'
  return null
}
