import { redis } from './redis';
import type Stripe from 'stripe';
import { stripe } from './stripe';

export interface SubscriptionRecord {
  email: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: Stripe.Subscription.Status;
  currentPeriodEnd: number;
  checkedAt: number;
}

const FRESHNESS_MS = 5 * 60 * 1000;

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

const subscriptionKey = (email: string): string =>
  `subscription:${normalizeEmail(email)}`;
const customerEmailKey = (customerId: string): string =>
  `stripe-customer-email:${customerId}`;

const subscriptionPeriodEnd = (subscription: Stripe.Subscription): number =>
  Math.max(
    0,
    ...subscription.items.data.map((item) => item.current_period_end),
  );

export function getSubscriptionByEmail(
  email: string,
): Promise<SubscriptionRecord | null> {
  return redis.get<SubscriptionRecord>(subscriptionKey(email));
}

export async function saveSubscription(
  updatedRecord: SubscriptionRecord,
): Promise<void> {
  const email = normalizeEmail(updatedRecord.email);
  const previousEmail = await redis.get<string>(
    customerEmailKey(updatedRecord.stripeCustomerId),
  );
  if (previousEmail && previousEmail !== email) {
    const previousRecord = await getSubscriptionByEmail(previousEmail);
    if (previousRecord?.stripeCustomerId === updatedRecord.stripeCustomerId) {
      await redis.del(subscriptionKey(previousEmail));
    }
  }
  await redis.set(subscriptionKey(email), {
    ...updatedRecord,
    email,
    checkedAt: Date.now(),
  });
  await redis.set(customerEmailKey(updatedRecord.stripeCustomerId), email);
}

export async function deleteSubscriptionIfMatches(
  email: string,
  subscriptionId: string,
): Promise<void> {
  const current = await getSubscriptionByEmail(email);
  if (current?.stripeSubscriptionId === subscriptionId) {
    await redis.del(subscriptionKey(email));
    await redis.del(customerEmailKey(current.stripeCustomerId));
  }
}

export function mapStripeSubscription(
  subscription: Stripe.Subscription,
  email: string,
): SubscriptionRecord {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;
  return {
    email: normalizeEmail(email),
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: subscriptionPeriodEnd(subscription),
    checkedAt: Date.now(),
  };
}

function chooseSubscription(
  subscriptions: Stripe.Subscription[],
): Stripe.Subscription | undefined {
  return subscriptions
    .filter(
      (subscription) =>
        subscription.status !== 'canceled' &&
        subscription.status !== 'incomplete_expired',
    )
    .sort((left, right) => {
      const activeRank = (status: Stripe.Subscription.Status): number =>
        status === 'active' || status === 'trialing' ? 1 : 0;
      return (
        activeRank(right.status) - activeRank(left.status) ||
        subscriptionPeriodEnd(right) - subscriptionPeriodEnd(left) ||
        right.created - left.created ||
        left.id.localeCompare(right.id)
      );
    })[0];
}

export async function syncCustomerSubscriptions(
  customerId: string,
  excludedSubscriptionId?: string,
): Promise<SubscriptionRecord | null> {
  const customer = await stripe.customers.retrieve(customerId);
  const previousEmail = await redis.get<string>(customerEmailKey(customerId));
  if (customer.deleted || !customer.email) {
    if (previousEmail) {
      const previous = await getSubscriptionByEmail(previousEmail);
      if (previous?.stripeCustomerId === customerId) {
        await redis.del(subscriptionKey(previousEmail));
      }
      await redis.del(customerEmailKey(customerId));
    }
    return null;
  }

  const email = normalizeEmail(customer.email);
  if (previousEmail && previousEmail !== email) {
    const previous = await getSubscriptionByEmail(previousEmail);
    if (previous?.stripeCustomerId === customerId) {
      await redis.del(subscriptionKey(previousEmail));
    }
  }

  await redis.set(customerEmailKey(customerId), email);
  return refreshSubscriptionByEmail(email, excludedSubscriptionId);
}

export async function refreshSubscriptionByEmail(
  email: string,
  excludedSubscriptionId?: string,
): Promise<SubscriptionRecord | null> {
  const normalizedEmail = normalizeEmail(email);
  const customers = await stripe.customers.list({
    email: normalizedEmail,
    limit: 100,
  });
  const matches: Stripe.Subscription[] = [];
  for (const customer of customers.data) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 100,
    });
    matches.push(
      ...subscriptions.data.filter(
        (subscription) => subscription.id !== excludedSubscriptionId,
      ),
    );
  }

  const selected = chooseSubscription(matches);
  if (!selected) {
    const cached = await getSubscriptionByEmail(normalizedEmail);
    if (cached) {
      await deleteSubscriptionIfMatches(
        normalizedEmail,
        cached.stripeSubscriptionId,
      );
    }
    return null;
  }

  const customer = await stripe.customers.retrieve(
    typeof selected.customer === 'string'
      ? selected.customer
      : selected.customer.id,
  );
  if (customer.deleted || !customer.email) {
    return null;
  }

  const record = mapStripeSubscription(selected, customer.email);
  await saveSubscription(record);
  return record;
}

export async function getFreshSubscriptionByEmail(
  email: string,
): Promise<SubscriptionRecord | null> {
  const normalizedEmail = normalizeEmail(email);
  const cached = await getSubscriptionByEmail(normalizedEmail);
  if (cached && Date.now() - cached.checkedAt < FRESHNESS_MS) {
    return cached;
  }
  return refreshSubscriptionByEmail(normalizedEmail);
}
