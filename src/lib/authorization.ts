import type { SubscriptionRecord } from './subscriptions';

export function hasActiveAccess(
  record: SubscriptionRecord | null,
): boolean {
  return record !== null
    && (record.status === 'active' || record.status === 'trialing')
    && record.currentPeriodEnd * 1000 > Date.now();
}
