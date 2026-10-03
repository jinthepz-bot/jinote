import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useType } from '../design/fonts';
import { Sheet } from '../design/Sheet';
import { colors, keyboardAppearance, spacing } from '../design/theme';
import { Button, Card, fieldStyles, Section } from '../design/ui';
import { googleSignInAvailable, sendEmailLink, signInWithGoogle, signOut } from './auth';
import { syncConfigured } from './client';
import { syncNow } from './engine';
import { SYNC_ICONS, syncLabel, useSyncStatus, type SyncStatus } from './status';

// "just now", "4 min ago", "2 h ago".
function ago(ms: number, now: number): string {
  const minutes = Math.floor((now - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

export function statusDetail(s: SyncStatus, now: number): string {
  if (s.phase === 'synced' && s.lastSyncedAt) return `Synced ${ago(s.lastSyncedAt, now)}`;
  if (s.phase === 'offline')
    return s.pending > 0 ? `Offline · ${s.pending} ${s.pending === 1 ? 'change' : 'changes'} saved on this device` : 'Offline';
  if (s.phase === 'error') return s.message ? `Sync problem: ${s.message}` : 'Sync problem';
  return syncLabel(s);
}

// Settings → Sync. Hidden entirely when no Supabase project is configured.
export function SyncSection() {
  const type = useType();
  const status = useSyncStatus();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!syncConfigured) return null;
  const signedIn = status.email !== null;
  // A failed trip back from Google, say.
  const shownError = error ?? (!signedIn && status.phase === 'error' ? status.message : null);
  const tint = status.phase === 'error' ? colors.deadlineRed : status.phase === 'synced' ? colors.success : colors.textMuted;

  return (
    <Section label="Sync">
      <Card style={styles.card}>
        {signedIn ? (
          <>
            <View style={styles.statusRow} accessibilityLiveRegion="polite">
              <Ionicons name={SYNC_ICONS[status.phase]} size={18} color={tint} />
              <Text style={[type.bodyStrong, styles.flex]}>{statusDetail(status, now)}</Text>
            </View>
            <Text style={[type.body, styles.muted]}>
              Signed in as {status.email ?? '…'}. Changes on this device and your other signed-in devices are kept in
              step; everything still works offline.
            </Text>
            <View style={styles.buttons}>
              <Button label="Sync now" onPress={() => void syncNow()} disabled={status.phase === 'syncing'} small />
              <Button
                label="Sign out"
                variant="secondary"
                small
                onPress={async () => {
                  const result = await signOut();
                  setError(result.ok ? null : result.error);
                }}
              />
            </View>
            <Text style={[type.mono, styles.footnote]}>
              Signing out stops syncing; your data stays on this device. The chat syncs its newest 200 messages.
            </Text>
          </>
        ) : (
          <>
            <Text style={[type.body, styles.muted]}>
              Sign in to keep this device and your others in step. Until then everything stays on this device only.
            </Text>
            <View style={styles.buttons}>
              {googleSignInAvailable ? (
                <Button
                  label="Sign in with Google"
                  small
                  onPress={async () => {
                    const result = await signInWithGoogle();
                    if (!result.ok) setError(result.error);
                  }}
                />
              ) : null}
              <Button
                label="Sign in with email"
                variant={googleSignInAvailable ? 'secondary' : 'primary'}
                small
                onPress={() => setSigningIn(true)}
              />
            </View>
          </>
        )}
        {shownError ? <Text style={[type.mono, { color: colors.deadlineRed }]}>{shownError}</Text> : null}
      </Card>
      <EmailSignInSheet visible={signingIn} onClose={() => setSigningIn(false)} />
    </Section>
  );
}

// Email → a sign-in link → back to this page, signed in. The link may open in a new
// tab; this one notices the sign-in too and closes the sheet.
function EmailSignInSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const type = useType();
  const status = useSyncStatus();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setSentTo(null);
    setError(null);
    setBusy(false);
    onClose();
  };

  useEffect(() => {
    if (visible && status.email) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, status.email]);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const send = async () => {
    if (!validEmail || busy) return;
    setBusy(true);
    setError(null);
    const result = await sendEmailLink(email);
    setBusy(false);
    if (result.ok) setSentTo(email.trim());
    else setError(result.error);
  };

  return (
    <Sheet visible={visible} onClose={close}>
      <Text style={[type.display, styles.sheetTitle]}>Sign in with email</Text>
      {sentTo === null ? (
        <>
          <Text style={[type.body, styles.muted]}>We'll email you a sign-in link. No password needed.</Text>
          <TextInput
            style={[fieldStyles.input, fieldStyles.single, type.body]}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            autoFocus
            keyboardAppearance={keyboardAppearance}
            onSubmitEditing={send}
            accessibilityLabel="Email address"
          />
          <View style={styles.buttons}>
            <Button label={busy ? 'Sending…' : 'Email me a link'} onPress={send} disabled={!validEmail || busy} />
            <Button label="Cancel" variant="secondary" onPress={close} />
          </View>
        </>
      ) : (
        <>
          <Text style={type.bodyStrong}>Check your email and click the link</Text>
          <Text style={[type.body, styles.muted]}>
            We sent it to {sentTo}. Open it in this browser and it brings you back here, signed in.
          </Text>
          <View style={styles.buttons}>
            <Button label="Done" onPress={close} />
            <Button
              label="Use another email"
              variant="secondary"
              onPress={() => {
                setSentTo(null);
                setError(null);
              }}
            />
          </View>
        </>
      )}
      {error ? <Text style={[type.mono, { color: colors.deadlineRed }]}>{error}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  flex: { flex: 1 },
  muted: { color: colors.textMuted },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footnote: { fontSize: 11, color: colors.textMuted },
  sheetTitle: { fontSize: 24, lineHeight: 30 },
});
