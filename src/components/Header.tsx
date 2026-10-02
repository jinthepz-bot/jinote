import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, radius, spacing } from '../design/theme';
import type { Activity } from '../types';

interface Props {
  activity: Activity;
  mock: boolean;
  canClear: boolean;
  onClear: () => void;
  action?: React.ReactNode; // the shared top-right screen control (Settings)
  compact?: boolean; // the desktop coach panel: a smaller headline
  sees?: string; // the desktop coach panel: what it's looking at ("Schedule · 21–27 Sep")
}

export function Header({ activity, mock, canClear, onClear, action, compact, sees }: Props) {
  const type = useType();
  const accent = useAccent();
  const busy = activity.kind !== 'idle';

  return (
    <View style={styles.header}>
      <View style={styles.statusRow}>
        {busy ? (
          <ActivityIndicator size="small" color={accent.accent} style={styles.spinner} />
        ) : (
          <View style={styles.dot} />
        )}
        <Text style={[type.label, styles.statusText, busy && { color: accent.accent }]} numberOfLines={1}>
          {activity.kind === 'thinking' && activity.retrying ? 'Busy, retrying...' : busy ? 'Thinking...' : 'Your coach'}
        </Text>
        {mock ? (
          <Text
            style={[
              type.label,
              styles.mockBadge,
              { color: accent.accent, backgroundColor: accent.accentSoft, borderColor: accent.accent },
            ]}
          >
            Mock
          </Text>
        ) : null}
        <Pressable onPress={onClear} disabled={!canClear} hitSlop={10} accessibilityRole="button">
          <Text style={[type.label, { color: canClear ? accent.accent : colors.border }]}>Clear</Text>
        </Pressable>
        {action}
      </View>

      <Text style={[type.display, styles.title, compact && styles.titleCompact]} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">
        CHAT
      </Text>
      {sees ? (
        <View style={styles.seesRow} accessibilityLabel={`The coach sees: ${sees}`}>
          <Ionicons name="eye-outline" size={13} color={colors.textMuted} />
          <Text style={[type.body, styles.sees]} numberOfLines={1}>
            Sees: {sees}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  statusText: { flex: 1 },
  spinner: { transform: [{ scale: 0.6 }], width: 8, marginHorizontal: -2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  mockBadge: {
    fontSize: 10,
    borderWidth: 1,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.square,
    overflow: 'hidden',
  },
  // Matches ScreenTitle's headline on the other screens.
  title: { fontSize: 56, lineHeight: 62, letterSpacing: 1.5 },
  titleCompact: { fontSize: 32, lineHeight: 38, letterSpacing: 0 },
  seesRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sees: { flexShrink: 1, fontSize: 12, color: colors.textMuted },
});
