import type { APIRoute } from 'astro';
import { createLoginSession, loginSessionTtlSeconds, redeemMagicLink } from '../../../../lib/auth';
import { hasActiveAccess } from '../../../../lib/authorization';
import { getFreshSubscriptionByEmail } from '../../../../lib/subscriptions';

export const prerender = false;

const noCacheHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const token = form.get('token');
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    return new Response('Invalid or expired sign-in link', {
      status: 400,
      headers: noCacheHeaders,
    });
  }

  const identity = await redeemMagicLink(token);
  if (!identity) {
    return new Response('Invalid or expired sign-in link', {
      status: 400,
      headers: noCacheHeaders,
    });
  }
  const subscription = await getFreshSubscriptionByEmail(identity.email);
  if (!hasActiveAccess(subscription)) {
    return new Response('An active subscription is required', {
      status: 403,
      headers: noCacheHeaders,
    });
  }

  const session = await createLoginSession(identity.email);
  cookies.set('login_session', session.cookieValue, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: loginSessionTtlSeconds,
  });
  return redirect('/members');
};
