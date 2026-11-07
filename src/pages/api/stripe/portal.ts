import type { APIRoute } from 'astro';
import { getCurrentIdentity } from '../../../lib/auth';
import { getSiteUrl } from '../../../lib/site-url';
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
    return_url: new URL('/members', getSiteUrl()).toString(),
  });
  return redirect(portal.url);
};
