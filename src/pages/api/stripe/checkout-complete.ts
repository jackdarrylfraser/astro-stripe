import type { APIRoute } from 'astro';
import { createLoginSession, loginSessionTtlSeconds } from '../../../lib/auth';
import { requiredEnv } from '../../../lib/env';
import { redis } from '../../../lib/redis';
import { stripe } from '../../../lib/stripe';
import { mapStripeSubscription, saveSubscription } from '../../../lib/subscriptions';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  if (
    typeof body !== 'object' ||
    body === null ||
    !('sessionId' in body) ||
    typeof body.sessionId !== 'string' ||
    !/^cs_(test_|live_)?[a-zA-Z0-9]+$/.test(body.sessionId)
  ) {
    return new Response('Invalid Checkout Session ID', { status: 400 });
  }

  const session = await stripe.checkout.sessions.retrieve(body.sessionId, {
    expand: ['subscription'],
  });
  if (
    session.status !== 'complete' ||
    (session.payment_status !== 'paid' &&
      session.payment_status !== 'no_payment_required') ||
    session.mode !== 'subscription' ||
    session.payment_link !== requiredEnv('STRIPE_PAYMENT_LINK_ID') ||
    typeof session.customer !== 'string' ||
    !session.subscription
  ) {
    return new Response('Checkout Session is not eligible', { status: 400 });
  }

  const customer = await stripe.customers.retrieve(session.customer);
  const email = customer.deleted
    ? null
    : customer.email ?? session.customer_details?.email ?? session.customer_email;
  if (!email) {
    return new Response('Checkout customer has no email', { status: 400 });
  }
  const subscription =
    typeof session.subscription === 'string'
      ? await stripe.subscriptions.retrieve(session.subscription)
      : session.subscription;
  const checkoutKey = `checkout-completion:${session.id}`;
  const claimed = await redis.set(checkoutKey, 'complete', {
    nx: true,
    ex: 60 * 60 * 24 * 30,
  });
  if (claimed !== 'OK') {
    return new Response('Checkout Session has already been processed', { status: 409 });
  }

  await saveSubscription(mapStripeSubscription(subscription, email));
  const login = await createLoginSession(email);
  cookies.set('login_session', login.cookieValue, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: loginSessionTtlSeconds,
  });
  return new Response(null, { status: 204 });
};
