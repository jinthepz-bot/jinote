import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAccent } from '../../design/accent';
import { useType } from '../../design/fonts';
import { hoverFill } from '../../design/hover';
import { colors, radius, spacing } from '../../design/theme';

export type SeriesScope = 'one' | 'all';

// The question asked whenever one occurrence of a repeating event is moved, resized,
// edited or deleted: just this one, or the whole series? Positioned by whoever shows it
// (next to a dropped block, over the sheet's footer).
export function SeriesChoiceCard({
  title,
  subtitle,
  onlyThis = true,
  note,
  onChoose,
  style,
}: {
  title: string; // "Change repeating event", "Delete repeating event"
  subtitle: string; // the event's title
  onlyThis?: boolean; // false when the change can only apply to the series
  note?: string; // why "Only this event" isn't offered
  onChoose: (scope: SeriesScope | null) => void; // null = Cancel
  style?: StyleProp<ViewStyle>;
}) {
  const type = useType();
  const accent = useAccent();
  return (
    <View style={[styles.card, style]} accessibilityRole="alert">
      <Text style={[type.bodyStrong, styles.title]}>{title}</Text>
      <Text style={[type.body, styles.subtitle]} numberOfLines={1}>
        {subtitle}
      </Text>
      {note ? <Text style={[type.body, styles.note]}>{note}</Text> : null}
      {onlyThis ? <Choice label="Only this event" onPress={() => onChoose('one')} /> : null}
      <Choice label="All events in the series" onPress={() => onChoose('all')} />
      <Pressable
        onPress={() => onChoose(null)}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        style={(s) => [styles.button, styles.cancel, hoverFill(s)]}
      >
        <Text style={[type.bodyStrong, styles.text, { color: accent.accent }]}>Cancel</Text>
      </Pressable>
    </View>
  );
}

function Choice({ label, onPress }: { label: string; onPress: () => void }) {
  const type = useType();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(s) => [styles.button, hoverFill(s)]}
    >
      <Text style={[type.body, styles.text]}>{label}</Text>
    </Pressable>
  );
}

export const SERIES_CHOICE_WIDTH = 260;

const styles = StyleSheet.create({
  card: {
    width: SERIES_CHOICE_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  title: { fontSize: 15, lineHeight: 20 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 2 },
  note: { fontSize: 12, color: colors.textMuted, marginBottom: 2 },
  button: { borderRadius: radius.control, paddingHorizontal: spacing.sm, paddingVertical: 7, marginHorizontal: -spacing.sm },
  cancel: { marginTop: 2 },
  text: { fontSize: 14 },
});
