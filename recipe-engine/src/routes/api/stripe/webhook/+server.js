import { error, json } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { getStripe } from '$lib/server/stripe.js'
import { upsertBakerySubscription } from '$lib/server/db.js'

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
  const stripe = getStripe()
  if (!stripe) {
    error(503, 'Stripe not configured')
  }

  const webhookSecret = env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    error(503, 'Webhook secret not configured')
  }

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    error(400, 'Invalid signature')
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const bakeryId =
        session.client_reference_id ||
        session.subscription_data?.metadata?.bakery_id ||
        session.metadata?.bakery_id

      if (!bakeryId || !session.subscription) break

      // Fetch the full subscription from Stripe
      const stripeSub = await stripe.subscriptions.retrieve(session.subscription)

      upsertBakerySubscription(bakeryId, {
        plan: 'pro',
        status: stripeSub.status,
        stripe_customer_id: session.customer,
        stripe_subscription_id: stripeSub.id,
        stripe_price_id: stripeSub.items.data[0]?.price?.id ?? null,
        current_period_end: stripeSub.current_period_end,
        cancel_at_period_end: stripeSub.cancel_at_period_end ? 1 : 0,
      })
      break
    }

    case 'customer.subscription.updated': {
      const stripeSub = event.data.object
      const bakeryId = stripeSub.metadata?.bakery_id
      if (!bakeryId) break

      upsertBakerySubscription(bakeryId, {
        status: stripeSub.status,
        stripe_price_id: stripeSub.items.data[0]?.price?.id ?? null,
        current_period_end: stripeSub.current_period_end,
        cancel_at_period_end: stripeSub.cancel_at_period_end ? 1 : 0,
      })
      break
    }

    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object
      const bakeryId = stripeSub.metadata?.bakery_id
      if (!bakeryId) break

      upsertBakerySubscription(bakeryId, {
        status: 'canceled',
        cancel_at_period_end: 0,
      })
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object
      if (!invoice.subscription) break

      const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription)
      const bakeryId = stripeSub.metadata?.bakery_id
      if (!bakeryId) break

      upsertBakerySubscription(bakeryId, {
        status: 'past_due',
      })
      break
    }

    case 'invoice.paid': {
      const invoice = event.data.object
      if (!invoice.subscription) break

      const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription)
      const bakeryId = stripeSub.metadata?.bakery_id
      if (!bakeryId) break

      upsertBakerySubscription(bakeryId, {
        status: stripeSub.status,
        current_period_end: stripeSub.current_period_end,
      })
      break
    }
  }

  return json({ received: true })
}
