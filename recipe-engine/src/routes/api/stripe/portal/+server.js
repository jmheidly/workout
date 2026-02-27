import { json, error } from '@sveltejs/kit'
import { requireRole } from '$lib/server/auth.js'
import { getStripe } from '$lib/server/stripe.js'
import { getBakerySubscription } from '$lib/server/db.js'

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, url }) {
  requireRole(locals, 'owner')

  const stripe = getStripe()
  if (!stripe) {
    error(503, 'Billing is not configured. Please set STRIPE_SECRET_KEY.')
  }

  const sub = getBakerySubscription(locals.bakery.id)
  if (!sub?.stripe_customer_id) {
    error(400, 'No billing customer found. Please subscribe first.')
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${url.origin}/bakeries/settings/billing`,
  })

  return json({ url: session.url })
}
