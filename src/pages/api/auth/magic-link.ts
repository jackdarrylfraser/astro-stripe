import type { APIRoute } from 'astro';
import { createMagicLink } from '../../../lib/auth';
import { getSiteUrl } from '../../../lib/site-url';
import { requiredEnv } from '../../../lib/env';
import { hasActiveAccess } from '../../../lib/authorization';
import { getFreshSubscriptionByEmail, normalizeEmail } from '../../../lib/subscriptions';

export const prerender = false;

const genericResponse = () =>
  new Response(
    JSON.stringify({
      message: 'If that email has an active subscription, a sign-in link is on its way.',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  if (
    typeof body !== 'object' ||
    body === null ||
    !('email' in body) ||
    typeof body.email !== 'string' ||
    body.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
  ) {
    return new Response('A valid email is required', { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const subscription = await getFreshSubscriptionByEmail(email);
  if (!hasActiveAccess(subscription)) {
    return genericResponse();
  }

  const verifyUrl = new URL('/api/auth/verify', getSiteUrl());
  const token = await createMagicLink(email);
  verifyUrl.searchParams.set('token', token);
  const delivery = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredEnv('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: requiredEnv('RESEND_FROM_EMAIL'),
      to: [email],
      subject: 'Your sign-in link',
      text: `Use this one-time link to sign in: ${verifyUrl.toString()}\n\nThis link expires in 15 minutes.`,
    }),
  });
  if (!delivery.ok) {
    console.error('Magic-link email delivery failed', {
      status: delivery.status,
    });
    return new Response('Unable to deliver sign-in email', { status: 502 });
  }
  return genericResponse();
};
