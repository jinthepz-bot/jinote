import { Platform } from 'react-native';

import { supabase } from './client';

// Signing in, once per device. Two ways, both ending with a trip back to this page
// (see finishRedirectSignIn in client.ts):
// - Google, on the web build;
// - a sign-in link by email. The link has to be opened in the same browser the
//   sign-in started in, because that's where the other half of the secret waits.

export const googleSignInAvailable = Platform.OS === 'web';

type Result = { ok: true } | { ok: false; error: string };

const fail = (error: unknown): Result => ({
  ok: false,
  error: error instanceof Error ? error.message : typeof error === 'string' ? error : 'Something went wrong.',
});

export async function signInWithGoogle(): Promise<Result> {
  if (!supabase || !googleSignInAvailable) return fail('Google sign-in is only available in the browser.');
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: thisPage() } });
  return error ? fail(error.message) : { ok: true };
}

// The page to come back to: this one (localhost or the deployed site), without
// anything in its query or hash.
const thisPage = () =>
  Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href.split(/[?#]/)[0] : undefined;

// Emails a sign-in link that returns to the page the sign-in started from.
export async function sendEmailLink(email: string): Promise<Result> {
  if (!supabase) return fail('Sync isn’t set up.');
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true, emailRedirectTo: thisPage() },
  });
  return error ? fail(error.message) : { ok: true };
}

// Stops syncing on this device. Everything stays on it.
export async function signOut(): Promise<Result> {
  if (!supabase) return { ok: true };
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  return error ? fail(error.message) : { ok: true };
}
