import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { hoverDim } from '../design/hover';
import { useType } from '../design/fonts';
import { colors, spacing } from '../design/theme';
import { Card } from '../design/ui';

interface Props {
  label: string;
  value: number | string;
  unit?: string;
  tone?: 'default' | 'muted' | 'warning';
  onPress?: () => void;
  accessibilityHint?: string;
}

export function StatTile({ label, value, unit, tone = 'default', onPress, accessibilityHint }: Props) {
  const type = useType();
  const color = tone === 'warning' ? colors.accentStrong : tone === 'muted' ? colors.textMuted : colors.text;
  const isText = typeof value === 'string';

  const content = (
    <>
      <View style={styles.labelRow}>
        <Text style={[type.label, styles.label]} numberOfLines={1}>
          {label}
        </Text>
        {onPress ? <Ionicons name="calendar-outline" size={12} color={colors.textMuted} /> : null}
      </View>
      <View style={styles.valueRow}>
        <Text
          style={[isText ? type.display : type.number, isText ? styles.textValue : styles.value, { color }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {isText ? value.toUpperCase() : value}
        </Text>
        {unit ? <Text style={[type.mono, styles.unit, tone === 'warning' && { color }]}>{unit}</Text> : null}
      </View>
    </>
  );

  const card = <Card style={styles.tile}>{content}</Card>;

  // Every tile sits in an unpadded wrapper that takes the equal share of the row.
  // (If the padded card itself were the flex item, its padding and border would be
  // added on top of its share and tiles with and without a wrapper would differ.)
  if (!onPress) return <View style={styles.slot}>{card}</View>;

  return (
    <Pressable
      style={(state) => [styles.slot, hoverDim(state)]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}
      accessibilityHint={accessibilityHint}
    >
      {card}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Tiles share the row evenly but never squeeze below a readable width: past four
  // per row (a phone), the row wraps instead.
  slot: { flexGrow: 1, flexBasis: 120, minWidth: 0 },
  tile: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: 4 },
  pressed: { opacity: 0.75 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  label: { flexShrink: 1, fontSize: 10, letterSpacing: 0.8 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, minHeight: 44 },
  value: { fontSize: 40, lineHeight: 44 },
  textValue: { fontSize: 26, lineHeight: 44, letterSpacing: 0.5 },
  unit: { fontSize: 11, color: colors.textMuted },
});
