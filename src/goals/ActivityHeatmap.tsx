import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDayKey, MONTHS_SHORT, parseDayKey } from '../coach/days';
import { HEATMAP_LEVELS, type Heatmap, type HeatmapDay } from '../coach/stats';
import { useType } from '../design/fonts';
import { useAccent } from '../design/accent';
import { colors } from '../design/theme';
import { Card } from '../design/ui';

// Weekday gutter: only every other row is labelled, like GitHub's graph.
const ROW_LABELS = ['M', '', 'W', '', 'F', '', ''];

const monthOf = (key: string) => parseDayKey(key)!.month;

function fill(day: HeatmapDay, scale: string[]): string | undefined {
  if (day.future) return undefined; // nothing drawn: the cell only holds the column's shape
  return day.level === 0 ? colors.surface2 : scale[day.level - 1];
}

interface Props {
  heatmap: Heatmap;
  todayKey: string;
  unit: string;
}

// Three months of logging at a glance: one square per day, columns running Monday
// to Sunday, shaded by that day's total against the best day on show.
export function ActivityHeatmap({ heatmap, todayKey, unit }: Props) {
  const type = useType();
  const accent = useAccent();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { weeks, max } = heatmap;
  const days = weeks.flat();
  const selected = days.find((d) => d.key === selectedKey && !d.future) ?? null;

  return (
    <Card>
      <View style={styles.monthRow}>
        <View style={styles.gutter} />
        {weeks.map((week, i) => {
          const month = monthOf(week[0].key);
          const label = i > 0 && month === monthOf(weeks[i - 1][0].key) ? '' : MONTHS_SHORT[month - 1];
          return (
            <View key={week[0].key} style={styles.monthCell}>
              <Text style={[type.label, styles.monthLabel]} numberOfLines={1}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.grid}>
        <View style={styles.gutter}>
          {ROW_LABELS.map((letter, i) => (
            <View key={i} style={styles.gutterCell}>
              <Text style={[type.label, styles.gutterLabel]}>{letter}</Text>
            </View>
          ))}
        </View>

        <View style={styles.columns}>
          {weeks.map((week) => (
            <View key={week[0].key} style={styles.column}>
              {week.map((day) => (
                <Pressable
                  key={day.key}
                  style={styles.cell}
                  disabled={day.future}
                  onPress={() => setSelectedKey(day.key === selectedKey ? null : day.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: day.key === selected?.key }}
                  accessibilityLabel={`${formatDayKey(day.key, todayKey)}: ${day.total} ${unit}`}
                >
                  <View
                    style={[
                      styles.square,
                      { backgroundColor: fill(day, accent.scale) },
                      day.isToday && styles.today,
                      day.key === selected?.key && styles.selected,
                    ]}
                  />
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legend}>
          <Text style={[type.mono, styles.legendText]}>Less</Text>
          <View style={[styles.legendSquare, { backgroundColor: colors.surface2 }]} />
          {Array.from({ length: HEATMAP_LEVELS }, (_, i) => (
            <View key={i} style={[styles.legendSquare, { backgroundColor: accent.scale[i] }]} />
          ))}
          <Text style={[type.mono, styles.legendText]}>More</Text>
        </View>
      </View>

      <View style={styles.detail}>
        {selected ? (
          <>
            <Text style={[type.bodyStrong, styles.detailHead]} numberOfLines={1}>
              {formatDayKey(selected.key, todayKey)}
              {' · '}
              <Text style={selected.total > 0 ? { color: accent.accent } : styles.muted}>
                {selected.total > 0 ? `${selected.total} ${unit}` : 'nothing logged'}
              </Text>
            </Text>
            {selected.note ? <Text style={[type.body, styles.note]}>{selected.note}</Text> : null}
          </>
        ) : (
          <Text style={[type.mono, styles.muted]} numberOfLines={1}>
            {max > 0 ? `Tap a day · best day ${max} ${unit} in total` : 'Nothing logged in the last 3 months'}
          </Text>
        )}
      </View>
    </Card>
  );
}

const GAP = 3;

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', gap: GAP, marginBottom: 2 },
  monthCell: { flex: 1, minWidth: 0 },
  monthLabel: { fontSize: 9, letterSpacing: 0 },
  // The gutter stretches to the grid's height, so its 7 slots line up with the squares.
  grid: { flexDirection: 'row', gap: GAP },
  gutter: { width: 12, gap: GAP },
  gutterCell: { flex: 1, justifyContent: 'center' },
  gutterLabel: { fontSize: 9, letterSpacing: 0 },
  columns: { flex: 1, flexDirection: 'row', gap: GAP },
  column: { flex: 1, gap: GAP },
  cell: { width: '100%', aspectRatio: 1 },
  square: { flex: 1, borderRadius: 2 },
  today: { borderWidth: 1, borderColor: colors.textMuted },
  selected: { borderWidth: 1, borderColor: colors.text },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: GAP },
  legendText: { fontSize: 10 },
  legendSquare: { width: 9, height: 9, borderRadius: 2 },
  detail: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 2,
    minHeight: 40,
  },
  detailHead: { color: colors.textMuted },
  detailValue: {},
  note: { color: colors.text },
  muted: { color: colors.textMuted },
});
