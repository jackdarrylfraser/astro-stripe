import { defineMiddleware } from 'astro:middleware';
import { getCurrentIdentity } from './lib/auth';
import { hasActiveAccess } from './lib/authorization';
import { getFreshSubscriptionByEmail } from './lib/subscriptions';

export const onRequest = defineMiddleware(async (context, next) => {
  if (
    context.url.pathname !== '/members' &&
    !context.url.pathname.startsWith('/members/')
  ) {
    return next();
  }

  const identity = await getCurrentIdentity(
    context.cookies.get('login_session')?.value,
  );
  if (!identity) {
    return context.redirect('/sign-in');
  }

  const subscription = await getFreshSubscriptionByEmail(identity.email);
  if (!hasActiveAccess(subscription)) {
    return context.redirect('/pricing');
  }

  context.locals.email = identity.email;
  return next();
});
