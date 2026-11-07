import type { APIRoute } from 'astro';
import { revokeLoginSession } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, redirect }) => {
  await revokeLoginSession(cookies.get('login_session')?.value);
  cookies.delete('login_session', { path: '/' });
  return redirect('/');
};
