import type { APIRoute } from 'astro';
import { syncCustomerSubscriptions } from '../../../lib/subscriptions';
import { requiredEnv } from '../../../lib/env';
import { stripe } from '../../../lib/stripe';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing Stripe signature', { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      requiredEnv('STRIPE_WEBHOOK_SECRET'),
    );
  } catch (error) {
    console.error('Stripe webhook signature verification failed', error);
    return new Response('Invalid Stripe signature', { status: 400 });
  }

  switch (event.type) {
    case 'customer.updated': {
      const customer = event.data.object;
      await syncCustomerSubscriptions(customer.id);
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const customerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id;
      await syncCustomerSubscriptions(customerId);
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id;
      await syncCustomerSubscriptions(customerId, subscription.id);
      break;
    }
  }

  return new Response('ok', { status: 200 });
};
