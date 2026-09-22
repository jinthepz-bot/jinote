import { StyleSheet, Text, View } from 'react-native';

import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, rgba, spacing } from '../design/theme';
import { Card } from '../design/ui';
import type { DayActivity } from '../coach/stats';

const BAR_AREA = 84;
const BAR_AREA_COMPACT = 44;

// `compact` is the small chart on the desktop streak card: no card of its own, shorter
// bars, no values, and light-on-dark colours (`onDark` is the text colour for that card).
export function WeekBars({ days, compact, onDark }: { days: DayActivity[]; compact?: boolean; onDark?: string }) {
  const type = useType();
  const accent = useAccent();
  const max = Math.max(1, ...days.map((d) => d.total));
  const area = compact ? BAR_AREA_COMPACT : BAR_AREA;

  const chart = (
      <View style={styles.row}>
        {days.map((day) => {
          const active = day.total > 0;
          const height = active ? Math.max(8, Math.round((day.total / max) * area)) : 4;
          return (
            <View
              key={day.key}
              style={styles.column}
              accessible
              accessibilityLabel={`${day.isToday ? 'Today' : day.letter}: ${day.total}`}
            >
              {compact ? null : <Text style={[type.mono, styles.value, !active && styles.hidden]}>{day.total}</Text>}
              <View style={[styles.barArea, { height: area }]}>
                <View
                  style={[
                    styles.bar,
                    { height },
                    active ? { backgroundColor: accent.accent } : styles.barEmpty,
                    !active && onDark ? { backgroundColor: rgba(onDark, 0.16) } : null,
                  ]}
                />
              </View>
              <Text
                style={[
                  type.label,
                  styles.letter,
                  day.isToday && styles.today,
                  onDark ? { color: rgba(onDark, day.isToday ? 1 : 0.6) } : null,
                ]}
              >
                {day.letter}
              </Text>
            </View>
          );
        })}
      </View>
  );
  return compact ? chart : <Card>{chart}</Card>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  column: { flex: 1, alignItems: 'center', gap: spacing.sm },
  value: { fontSize: 10 },
  hidden: { opacity: 0 },
  barArea: { width: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '55%', maxWidth: 26, borderRadius: 3 },
  barEmpty: { backgroundColor: colors.surface2 },
  letter: { letterSpacing: 0 },
  today: { color: colors.text },
});
