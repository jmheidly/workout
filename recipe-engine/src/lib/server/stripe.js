import Stripe from 'stripe'

/** @type {Stripe | null} */
let _stripe = null

/**
 * Get the Stripe SDK instance. Returns null if STRIPE_SECRET_KEY is not set.
 * @returns {Stripe | null}
 */
export function getStripe() {
  if (_stripe) return _stripe

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null

  _stripe = new Stripe(key)
  return _stripe
}
