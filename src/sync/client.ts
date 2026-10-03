import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// Cloud sync is optional: with no Supabase project configured the app is exactly the
// local-only app it always was, and none of the sync UI shows.
//
// Only the project URL and the *publishable* key ever reach the app (both are meant
// to be public; Row Level Security in supabase/schema.sql is what keeps each
// person's rows private). Never put the secret key here.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

export const syncConfigured = url !== '' && publishableKey !== '';

export const supabase: SupabaseClient | null = syncConfigured
  ? createClient(url, publishableKey, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        // The Google sign-in return is handled below instead: the navigator rewrites
        // the address bar as the app starts, which can happen before the client
        // would get round to reading it.
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

// Read once, as this module loads, before anything else can change the URL.
const returnParams: URLSearchParams | null =
  Platform.OS === 'web' && typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;

// Coming back from Google: swaps the one-time code for a session and tidies the
// address bar. Resolves to an error message if Google or Supabase refused.
export async function finishRedirectSignIn(): Promise<string | null> {
  if (!supabase || !returnParams) return null;
  const code = returnParams.get('code');
  const failure = returnParams.get('error_description') ?? returnParams.get('error');
  if (!code && !failure) return null;
  const clean = new URL(window.location.href);
  for (const key of ['code', 'error', 'error_code', 'error_description', 'state']) clean.searchParams.delete(key);
  window.history.replaceState(window.history.state, '', clean.toString());
  if (failure) return failure;
  const { error } = await supabase.auth.exchangeCodeForSession(code!);
  return error ? error.message : null;
}

// On a phone build the session refresh timer should only run while the app is in
// front (the web build manages this itself).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
