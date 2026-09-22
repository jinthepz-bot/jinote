import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resetCoachData } from '../coach/store';
import { applyBackup, currentCounts, describeCounts, parseBackup, type BackupCounts } from '../data/backup';
import { exportBackup, readBackupFile } from '../data/backupFile';
import { hoverFill } from '../design/hover';
import { useAccent, useAccentChooser } from '../design/accent';
import { confirmDestructive } from '../design/confirm';
import { useType } from '../design/fonts';
import { ACCENTS, colors, radius, sizes, spacing, keyboardAppearance } from '../design/theme';
import { Button, Card, fieldStyles, screenContentStyle, ScreenTitle, Section, ToggleRow } from '../design/ui';
import { deleteNotePhoto } from '../notes/photos';
import { resetNotes } from '../notes/store';
import { setUserName, useProfile } from '../profile/store';
import { notificationsSupported, requestPermission, usePermissionState, type PermissionState } from '../notifications/scheduler';
import {
  setDailyReminderEnabled,
  setDailyReminderTime,
  setDeadlineWarningsEnabled,
  setNotificationsEnabled,
  setScheduleRemindersEnabled,
  setStreakAtRiskEnabled,
  useNotificationPrefs,
} from '../notifications/store';
import { resetSchedule } from '../schedule/store';
import { isTimeKey, sanitizeTimeInput } from '../schedule/time';

// Turns a type on with a permission prompt the first time it's needed, never before —
// this is the only place in the app that calls requestPermission. A denied prompt still
// saves the preference; the banner above explains why nothing will show up.
async function enable(next: boolean, permission: PermissionState, setter: (v: boolean) => void) {
  if (next && permission === 'undetermined') await requestPermission();
  setter(next);
}

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const type = useType();
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { state: prefs, loaded } = useNotificationPrefs();
  const permission = usePermissionState();

  if (!loaded) return <View style={styles.root} />;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenTitle
          label="Appearance, reminders and your data"
          title="SETTINGS"
          action={
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
              style={(state) => [styles.close, hoverFill(state)]}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          }
        />

        <ProfileSection />

        <AppearanceSection />

        <Section label="Notifications">
          {!notificationsSupported ? (
            <Card>
              <Text style={[type.body, styles.muted]}>
                Notifications aren't available on web — install the app on your phone to get reminders.
              </Text>
            </Card>
          ) : (
            <>
              {permission === 'denied' ? (
                <Card style={styles.warningCard}>
                  <Text style={[type.bodyStrong, styles.warningTitle]}>Notifications are off in your phone's settings</Text>
                  <Text style={[type.body, styles.muted]}>
                    Your preferences below are saved, but nothing will show up until you turn notifications back on for
                    Jinote.
                  </Text>
                  <Text
                    style={[type.label, { color: accent.accent, marginTop: spacing.xs / 2 }]}
                    onPress={() => Linking.openSettings()}
                    accessibilityRole="button"
                    accessibilityLabel="Open phone settings"
                  >
                    Open settings
                  </Text>
                </Card>
              ) : null}

              <Card style={styles.list}>
                <View style={styles.item}>
                  <ToggleRow
                    label="Notifications"
                    hint="One switch to turn every reminder below off, without losing your choices."
                    value={prefs.enabled}
                    onChange={setNotificationsEnabled}
                  />
                </View>

                <View style={[styles.item, styles.divider]}>
                  <ToggleRow
                    label="Daily log reminder"
                    hint="If I haven't logged progress on my featured goal by this time, remind me."
                    value={prefs.dailyReminderEnabled}
                    onChange={(next) => enable(next, permission, setDailyReminderEnabled)}
                  />
                  {prefs.dailyReminderEnabled ? (
                    <TimeField value={prefs.dailyReminderTime} onChange={setDailyReminderTime} />
                  ) : null}
                </View>

                <View style={[styles.item, styles.divider]}>
                  <ToggleRow
                    label="Streak at risk"
                    hint="A sharper nudge late at night if today would break an active streak."
                    value={prefs.streakAtRiskEnabled}
                    onChange={(next) => enable(next, permission, setStreakAtRiskEnabled)}
                  />
                </View>

                <View style={[styles.item, styles.divider]}>
                  <ToggleRow
                    label="Schedule reminders"
                    hint="Remind me before events that have a lead time set — edit an event in Schedule to set one."
                    value={prefs.scheduleRemindersEnabled}
                    onChange={(next) => enable(next, permission, setScheduleRemindersEnabled)}
                  />
                </View>

                <View style={[styles.item, styles.divider]}>
                  <ToggleRow
                    label="Deadline warnings"
                    hint="A week before a goal's deadline, and again the day before."
                    value={prefs.deadlineWarningsEnabled}
                    onChange={(next) => enable(next, permission, setDeadlineWarningsEnabled)}
                  />
                </View>
              </Card>
            </>
          )}
        </Section>

        <DataSection />
      </ScrollView>
    </View>
  );
}

// --- profile

// Saved on every keystroke: it's one short field, and there's nothing to validate.
// Clearing it is allowed — the greeting then just says "Good morning."
function ProfileSection() {
  const type = useType();
  const { state, loaded } = useProfile();

  return (
    <Section label="You">
      <Card style={styles.card}>
        <Text style={[type.body, styles.muted]}>
          What your coach calls you in the greeting on a wide screen. Leave it empty for no name.
        </Text>
        <TextInput
          style={[fieldStyles.input, fieldStyles.single, type.body]}
          value={loaded ? state.name : ''}
          onChangeText={setUserName}
          placeholder="Your name"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearance}
          autoCapitalize="words"
          returnKeyType="done"
          maxLength={40}
          accessibilityLabel="Your name"
        />
      </Card>
    </Section>
  );
}

// --- appearance

function AppearanceSection() {
  const type = useType();
  const { palette, savedId, previewId, preview, commit, cancel } = useAccentChooser();
  const previewing = previewId !== null && previewId !== savedId;

  return (
    <Section label="Appearance" aside={palette.name}>
      <Card style={styles.card}>
        <Text style={[type.body, styles.muted]}>
          The accent colours buttons, highlights and charts. Tap one to see it across the app, then keep it.
        </Text>

        <View style={styles.swatches} accessibilityRole="radiogroup">
          {ACCENTS.map((option) => {
            const selected = option.id === palette.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => preview(option.id)}
                style={(state) => [
                  styles.swatch,
                  { borderColor: selected ? colors.text : colors.border },
                  hoverFill(state),
                ]}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                accessibilityLabel={option.name}
              >
                <View style={[styles.swatchDot, { backgroundColor: option.hex }]}>
                  {selected ? <Ionicons name="checkmark" size={18} color={palette.onAccent} /> : null}
                </View>
                <Text style={[type.label, styles.swatchLabel]} numberOfLines={1}>
                  {option.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {previewing ? (
          <View style={styles.previewRow}>
            <Text style={[type.mono, styles.previewText]} numberOfLines={2}>
              Previewing {palette.name}. Keep it?
            </Text>
            <Button label="Cancel" variant="secondary" small onPress={cancel} accessibilityLabel="Cancel accent change" />
            <Button label="Keep" small onPress={commit} accessibilityLabel={`Keep ${palette.name}`} />
          </View>
        ) : null}
      </Card>
    </Section>
  );
}

// --- data

type Status = { tone: 'ok' | 'error'; text: string } | null;

function DataSection() {
  const type = useType();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const counts = currentCounts();

  const runExport = async () => {
    setBusy('export');
    setStatus(null);
    const result = await exportBackup();
    setBusy(null);
    setStatus(
      result.ok
        ? { tone: 'ok', text: Platform.OS === 'web' ? `Downloaded ${result.where}` : `Exported ${result.where}` }
        : { tone: 'error', text: result.error },
    );
  };

  const runImport = async () => {
    setBusy('import');
    setStatus(null);
    const read = await readBackupFile();
    setBusy(null);
    if (!read.ok) {
      if (!read.canceled) setStatus({ tone: 'error', text: read.error });
      return;
    }
    const parsed = parseBackup(read.text);
    if (!parsed.ok) {
      setStatus({ tone: 'error', text: parsed.error });
      return;
    }
    confirmDestructive({
      title: 'Replace everything with this backup?',
      message: `${read.name}\n\nThis replaces your goals, tasks, journal and schedule on this device with:\n${describeCounts(parsed.counts)}`,
      confirmLabel: 'Replace',
      onConfirm: () => {
        applyBackup(parsed.backup);
        setStatus({ tone: 'ok', text: `Imported ${describeCounts(parsed.counts)}` });
      },
    });
  };

  const confirmReset = () =>
    confirmDestructive({
      title: 'Reset all data?',
      message:
        'This permanently deletes your goals and their progress, tasks, to-buy list, notes, and schedule on this device. ' +
        "Chat isn't affected. Export first if you might want it back.",
      confirmLabel: 'Reset',
      onConfirm: () => {
        resetCoachData();
        for (const note of resetNotes()) {
          if (note.type === 'recipe') deleteNotePhoto(note.photoUri);
        }
        resetSchedule();
        setStatus({ tone: 'ok', text: 'All data reset.' });
      },
    });

  return (
    <Section label="Your data" aside={describeCountsShort(counts)}>
      <Card style={styles.card}>
        <Text style={[type.body, styles.muted]}>
          Everything stays on this device. Export writes one file you can keep or move to another phone; importing it
          replaces what's here.
        </Text>

        <View style={styles.dataButtons}>
          <Button
            label={busy === 'export' ? 'Exporting...' : 'Export'}
            onPress={runExport}
            disabled={busy !== null}
            accessibilityLabel="Export all data to a file"
          />
          <Button
            label={busy === 'import' ? 'Reading...' : 'Import'}
            variant="secondary"
            onPress={runImport}
            disabled={busy !== null}
            accessibilityLabel="Import data from a backup file"
          />
        </View>

        {status ? (
          <Text style={[type.mono, status.tone === 'ok' ? styles.statusOk : styles.statusError]}>{status.text}</Text>
        ) : null}

        <Text style={[type.mono, styles.footnote]}>
          Recipe photos stay on this device — a backup records that a photo was attached, not the image itself.
        </Text>

        <View style={styles.resetRow}>
          <Pressable onPress={confirmReset} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reset all data">
            <Text style={[type.label, styles.resetText]}>Reset all data</Text>
          </Pressable>
        </View>
      </Card>
    </Section>
  );
}

function describeCountsShort(counts: BackupCounts): string {
  return `${counts.goals + counts.tasks + counts.notes + counts.events} items`;
}

// Local draft text so typing "19:0" doesn't get overwritten mid-keystroke by the last
// committed value — the persisted time only updates once the text is a full "HH:MM".
function TimeField({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  const type = useType();
  const [text, setText] = useState(value);
  const valid = isTimeKey(text);
  return (
    <View style={styles.timeRow}>
      <Text style={type.label}>At</Text>
      <TextInput
        style={[fieldStyles.input, styles.timeInput, type.mono, !valid && styles.invalid]}
        value={text}
        onChangeText={(t) => {
          const sanitized = sanitizeTimeInput(t);
          setText(sanitized);
          if (isTimeKey(sanitized)) onChange(sanitized);
        }}
        onBlur={() => {
          if (!isTimeKey(text)) setText(value); // revert an unfinished edit
        }}
        placeholder="19:00"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        keyboardAppearance={keyboardAppearance}
        maxLength={5}
        accessibilityLabel="Daily reminder time"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { ...screenContentStyle, gap: spacing.xl },
  card: { gap: spacing.md },
  muted: { color: colors.textMuted },
  close: {
    width: sizes.controlSm,
    height: sizes.controlSm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  warningCard: { gap: spacing.xs, borderColor: colors.accentStrong },
  warningTitle: { color: colors.accentStrong },
  list: { gap: 0 },
  item: { paddingVertical: spacing.xs, gap: spacing.sm },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.md },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timeInput: { width: 90, height: sizes.controlSm, textAlign: 'center' },
  invalid: { borderColor: colors.accentStrong },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: {
    flexGrow: 1,
    flexBasis: 96,
    minWidth: 0,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
    borderWidth: 1,
    backgroundColor: colors.surface2,
  },
  swatchDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  swatchLabel: { letterSpacing: 0.4 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  previewText: { flex: 1, color: colors.text },
  dataButtons: { flexDirection: 'row', gap: spacing.sm },
  statusOk: { color: colors.success },
  statusError: { color: colors.accentStrong },
  footnote: { color: colors.textMuted, fontSize: 11 },
  resetRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, alignItems: 'flex-start' },
  resetText: { color: colors.accentStrong },
});
