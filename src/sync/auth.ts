import { Platform } from 'react-native';

import { supabase } from './client';

// Signing in, once per device. Two ways:
// - Google, on the web build: a full-page trip to Google and back (see
//   finishRedirectSignIn in client.ts for the way back);
// - a 6-digit code by email, anywhere. A code rather than a link on purpose: a link
//   opened from Mail lands in Safari, which on an iPhone doesn't share storage with
//   the home-screen app.

export const googleSignInAvailable = Platform.OS === 'web';

type Result = { ok: true } | { ok: false; error: string };

const fail = (error: unknown): Result => ({
  ok: false,
  error: error instanceof Error ? error.message : typeof error === 'string' ? error : 'Something went wrong.',
});

export async function signInWithGoogle(): Promise<Result> {
  if (!supabase || !googleSignInAvailable) return fail('Google sign-in is only available in the browser.');
  // Back to exactly this page, without any leftovers in the query.
  const back = window.location.href.split(/[?#]/)[0];
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back } });
  return error ? fail(error.message) : { ok: true };
}

export async function sendEmailCode(email: string): Promise<Result> {
  if (!supabase) return fail('Sync isn’t set up.');
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  return error ? fail(error.message) : { ok: true };
}

export async function verifyEmailCode(email: string, code: string): Promise<Result> {
  if (!supabase) return fail('Sync isn’t set up.');
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  return error ? fail(error.message) : { ok: true };
}

// Stops syncing on this device. Everything stays on it.
export async function signOut(): Promise<Result> {
  if (!supabase) return { ok: true };
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  return error ? fail(error.message) : { ok: true };
}
