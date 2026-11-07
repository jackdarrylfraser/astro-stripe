import type { APIRoute } from 'astro';
import { getCurrentIdentity } from '../../../lib/auth';
import { requiredEnv } from '../../../lib/env';
import { getFreshSubscriptionByEmail } from '../../../lib/subscriptions';
import { stripe } from '../../../lib/stripe';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, redirect }) => {
  const identity = await getCurrentIdentity(cookies.get('login_session')?.value);
  if (!identity) {
    return redirect('/sign-in');
  }

  const subscription = await getFreshSubscriptionByEmail(identity.email);
  if (!subscription) {
    return redirect('/pricing');
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: new URL('/members', requiredEnv('SITE_URL')).toString(),
  });
  return redirect(portal.url);
};
