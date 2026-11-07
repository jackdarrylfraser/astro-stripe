import { kv } from '@vercel/kv';
import { normalizeEmail } from './subscriptions';
import { createToken, hashToken } from './tokens';

const LOGIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const MAGIC_LINK_TTL_SECONDS = 60 * 15;

export interface LoginSessionRecord {
  email: string;
  expiresAt: number;
}

const loginSessionKey = (tokenHash: string): string =>
  `login-session:${tokenHash}`;
const magicLinkKey = (tokenHash: string): string =>
  `magic-link:${tokenHash}`;

export async function getCurrentIdentity(
  cookieValue: string | undefined,
): Promise<{ email: string } | null> {
  if (!cookieValue) {
    return null;
  }
  const record = await kv.get<LoginSessionRecord>(
    loginSessionKey(await hashToken(cookieValue)),
  );
  if (!record || record.expiresAt <= Date.now()) {
    return null;
  }
  return { email: normalizeEmail(record.email) };
}

export async function createLoginSession(
  email: string,
): Promise<{ cookieValue: string; record: LoginSessionRecord }> {
  const cookieValue = createToken();
  const record = {
    email: normalizeEmail(email),
    expiresAt: Date.now() + LOGIN_SESSION_TTL_SECONDS * 1000,
  };
  await kv.set(
    loginSessionKey(await hashToken(cookieValue)),
    record,
    { ex: LOGIN_SESSION_TTL_SECONDS },
  );
  return { cookieValue, record };
}

export async function revokeLoginSession(
  cookieValue: string | undefined,
): Promise<void> {
  if (cookieValue) {
    await kv.del(loginSessionKey(await hashToken(cookieValue)));
  }
}

export async function createMagicLink(email: string): Promise<string> {
  const token = createToken();
  await kv.set(
    magicLinkKey(await hashToken(token)),
    { email: normalizeEmail(email) },
    { ex: MAGIC_LINK_TTL_SECONDS, nx: true },
  );
  return token;
}

export async function redeemMagicLink(
  token: string,
): Promise<{ email: string } | null> {
  const key = magicLinkKey(await hashToken(token));
  const value = await kv.getdel<{ email: string }>(key);
  return value ? { email: normalizeEmail(value.email) } : null;
}

export const loginSessionTtlSeconds = LOGIN_SESSION_TTL_SECONDS;
