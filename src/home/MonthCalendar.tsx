import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { daysInMonth, formatDayKey, makeDayKey, MONTH_NAMES, parseDayKey, weekdayIndex } from '../coach/days';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, spacing } from '../design/theme';

const WEEK_HEADER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function monthOf(key: string) {
  const p = parseDayKey(key)!;
  return { year: p.year, month: p.month };
}

interface Props {
  selected: string | null;
  onSelect: (day: string) => void;
  todayKey: string;
}

// Month grid built in JS (not a native date picker) so it looks the same on iOS,
// Android, and web. Days before today can't be picked.
export function MonthCalendar({ selected, onSelect, todayKey }: Props) {
  const type = useType();
  const accent = useAccent();
  const [view, setView] = useState(() => monthOf(selected ?? todayKey));

  const current = monthOf(todayKey);
  const canGoBack = view.year * 12 + view.month > current.year * 12 + current.month;
  const shiftMonth = (delta: number) =>
    setView(({ year, month }) => {
      const index = year * 12 + (month - 1) + delta;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });

  const leadingBlanks = (weekdayIndex(makeDayKey(view.year, view.month, 1)) + 6) % 7; // Monday first
  const cells: (string | null)[] = [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth(view.year, view.month) }, (_, i) => makeDayKey(view.year, view.month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={styles.wrap}>
      <View style={styles.monthRow}>
        <Pressable
          onPress={() => shiftMonth(-1)}
          disabled={!canGoBack}
          hitSlop={12}
          style={!canGoBack && styles.disabled}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={[type.display, styles.monthTitle]}>
          {MONTH_NAMES[view.month - 1].toUpperCase()} {view.year}
        </Text>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.grid}>
        {WEEK_HEADER.map((letter, i) => (
          <Text key={`head-${i}`} style={[type.label, styles.headCell]}>
            {letter}
          </Text>
        ))}
        {cells.map((key, i) => {
          if (!key) return <View key={`blank-${i}`} style={styles.cell} />;
          const past = key < todayKey;
          const isSelected = key === selected;
          const isToday = key === todayKey;
          return (
            <Pressable
              key={key}
              style={styles.cell}
              disabled={past}
              onPress={() => onSelect(key)}
              accessibilityRole="button"
              accessibilityLabel={formatDayKey(key, todayKey)}
              accessibilityState={{ selected: isSelected, disabled: past }}
            >
              <View
                style={[
                  styles.day,
                  isToday && [styles.today, { borderColor: accent.accent }],
                  isSelected && { backgroundColor: accent.accent, borderColor: accent.accent },
                ]}
              >
                <Text
                  style={[type.mono, styles.dayText, past && styles.pastText, isSelected && { color: accent.onAccent }]}
                >
                  {Number(key.slice(8))}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitle: { fontSize: 28, lineHeight: 32, letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  headCell: { width: `${100 / 7}%`, textAlign: 'center', paddingVertical: spacing.sm, letterSpacing: 0 },
  cell: { width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center' },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1 },
  selected: { borderWidth: 1 },
  dayText: { fontSize: 14, color: colors.text },
  pastText: { color: colors.border },

  disabled: { opacity: 0.35 },
});
