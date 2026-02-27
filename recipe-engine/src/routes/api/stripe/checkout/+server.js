import { json, error } from '@sveltejs/kit'
import { requireRole } from '$lib/server/auth.js'
import { getStripe } from '$lib/server/stripe.js'
import {
  getBakerySubscription,
  upsertBakerySubscription,
  getBakery,
} from '$lib/server/db.js'

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, url }) {
  requireRole(locals, 'owner')

  const stripe = getStripe()
  if (!stripe) {
    error(503, 'Billing is not configured. Please set STRIPE_SECRET_KEY.')
  }

  const priceId = process.env.STRIPE_PRO_PRICE_ID
  if (!priceId) {
    error(503, 'Billing is not configured. Please set STRIPE_PRO_PRICE_ID.')
  }

  const bakery = getBakery(locals.bakery.id)
  const sub = getBakerySubscription(locals.bakery.id)

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
}
