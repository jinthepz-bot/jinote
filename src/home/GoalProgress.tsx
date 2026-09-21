import { StyleSheet, Text, View } from 'react-native';

import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, spacing } from '../design/theme';
import { Card } from '../design/ui';

export function GoalProgress({ current, target }: { current: number; target: number }) {
  const type = useType();
  const accent = useAccent();
  const percent = Math.min(100, Math.round((current / target) * 100));

  return (
    <Card style={styles.card}>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: target, now: current }}
      >
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: accent.accent }]} />
      </View>
      <View style={styles.caption}>
        <Text style={[type.mono, styles.captionText]}>
          {current} / {target} nonstop
        </Text>
        <Text style={[type.mono, { color: accent.accent }]}>{percent}%</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  track: {
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 6 },
  caption: { flexDirection: 'row', justifyContent: 'space-between' },
  captionText: { color: colors.text },

});
