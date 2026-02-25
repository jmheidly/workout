import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind CSS classes with clsx
 * @param  {...any} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * Zero-safe division (§4.15)
 * @param {number} numerator
 * @param {number} denominator
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function safeDivide(numerator, denominator, fallback = 0) {
  if (denominator === 0) return fallback
  return numerator / denominator
}

/**
 * Generate a UUID v4
 * @returns {string}
 */
export function generateId() {
  return crypto.randomUUID()
}

/**
 * Format a number as a percentage string
 * @param {number} value - decimal value (0.7 = 70%)
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatPct(value, decimals = 1) {
  return (value * 100).toFixed(decimals) + '%'
}

/**
 * Format a number as grams
 * @param {number} value
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatGrams(value, decimals = 1) {
  return value.toFixed(decimals) + 'g'
}
