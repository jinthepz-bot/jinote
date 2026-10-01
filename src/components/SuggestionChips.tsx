import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { hoverFill } from '../design/hover';
import { colors, radius, spacing } from '../design/theme';

// One-tap prompts above the coach's input; clicking one sends it as is.
export function SuggestionChips({ suggestions, disabled, onPick }: { suggestions: string[]; disabled: boolean; onPick: (text: string) => void }) {
  const type = useType();
  const accent = useAccent();
  if (suggestions.length === 0) return null;
  return (
    <View style={styles.row}>
      {suggestions.map((s) => (
        <Pressable
          key={s}
          onPress={() => onPick(s)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Ask: ${s}`}
          style={(state) => [styles.chip, disabled ? styles.disabled : hoverFill(state)]}
        >
          <Text style={[type.body, styles.text, { color: accent.accent }]} numberOfLines={1}>
            {s}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.chip * 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  disabled: { opacity: 0.45 },
  text: { fontSize: 13 },
});
