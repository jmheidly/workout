import { json, error } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { requireRole } from '$lib/server/auth.js'
import { getStripe } from '$lib/server/stripe.js'
import {
  getBakerySubscription,
  upsertBakerySubscription,
} from '$lib/server/db.js'

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, url }) {
  requireRole(locals, 'owner')

  const stripe = getStripe()
  if (!stripe) {
    error(503, 'Billing is not configured. Please set STRIPE_SECRET_KEY.')
  }

  const priceId = env.STRIPE_PRO_PRICE_ID
  if (!priceId) {
    error(503, 'Billing is not configured. Please set STRIPE_PRO_PRICE_ID.')
  }

  const sub = getBakerySubscription(locals.bakery.id)

  try {
    // Create or reuse Stripe customer
    let customerId = sub?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: locals.user.email,
        metadata: {
          bakery_id: locals.bakery.id,
          user_id: locals.user.id,
        },
      })
      customerId = customer.id
      upsertBakerySubscription(locals.bakery.id, {
        stripe_customer_id: customerId,
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: locals.bakery.id,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      subscription_data: {
        metadata: {
          bakery_id: locals.bakery.id,
        },
      },
      success_url: `${url.origin}/bakeries/settings/billing?success=1`,
      cancel_url: `${url.origin}/bakeries/settings/billing?canceled=1`,
    })

    return json({ url: session.url })
  } catch (err) {
    console.error('Stripe checkout error:', err.message)
    return json({ error: err.message || 'Failed to create checkout session' }, { status: 500 })
  }
}
