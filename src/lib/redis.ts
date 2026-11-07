import { Redis } from '@upstash/redis';
import { requiredEnv } from './env';

export const redis = new Redis({
  url: requiredEnv('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL'),
  token: requiredEnv('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN'),
});
