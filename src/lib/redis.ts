import { Redis } from '@upstash/redis';
import { requiredEnv } from './env';

export const redis = new Redis({
  url: requiredEnv('UPSTASH_REDIS_REST_URL'),
  token: requiredEnv('UPSTASH_REDIS_REST_TOKEN'),
});
