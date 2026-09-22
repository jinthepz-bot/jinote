import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  addDays,
  daysInMonth,
  formatDayKey,
  makeDayKey,
  MONTH_NAMES,
  parseDayKey,
  startOfWeek,
  weekdayIndex,
} from '../coach/days';
import { useAccent } from '../design/accent';
import { hoverFill } from '../design/hover';
import { useType } from '../design/fonts';
import { colors, radius, spacing } from '../design/theme';

const WEEK_HEADER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// The sidebar's month, for jumping the calendar around. It's a sibling of
// home/MonthCalendar rather than a reuse of it: that one is a date *picker* (past days
// disabled, big touch targets, no sense of a selected week), this one navigates.
export function MiniMonth({
  anchor,
  todayKey,
  onSelect,
}: {
  anchor: string; // the day the calendar is showing; its week is highlighted
  todayKey: string;
  onSelect: (day: string) => void;
}) {
  const type = useType();
  const accent = useAccent();
  const anchorParts = parseDayKey(anchor)!;
  // Follows the anchor as the main view moves, until the user pages this calendar
  // itself, and then follows it again when the anchor lands in another month.
  const [view, setView] = useState({ year: anchorParts.year, month: anchorParts.month });
  const [pinnedTo, setPinnedTo] = useState(anchor);
  if (pinnedTo !== anchor) {
    setPinnedTo(anchor);
    if (view.year !== anchorParts.year || view.month !== anchorParts.month) {
      setView({ year: anchorParts.year, month: anchorParts.month });
    }
  }

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

  const weekStart = startOfWeek(anchor);
  const weekEnd = addDays(weekStart, 6);

  return (
    <View style={styles.root}>
      <View style={styles.monthRow}>
        <Text style={[type.bodyStrong, styles.monthTitle]} numberOfLines={1}>
          {MONTH_NAMES[view.month - 1]} {view.year}
        </Text>
        <Pressable
          onPress={() => shiftMonth(-1)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          style={(state) => [styles.monthArrow, hoverFill(state)]}
        >
          <Ionicons name="chevron-back" size={15} color={colors.textMuted} />
        </Pressable>
        <Pressable
          onPress={() => shiftMonth(1)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={(state) => [styles.monthArrow, hoverFill(state)]}
        >
          <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
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
          const isToday = key === todayKey;
          const isSelected = key === anchor;
          const inWeek = key >= weekStart && key <= weekEnd;
          return (
            <Pressable
              key={key}
              onPress={() => onSelect(key)}
              style={(state) => [styles.cell, inWeek && styles.inWeek, hoverFill(state)]}
              accessibilityRole="button"
              accessibilityLabel={formatDayKey(key, todayKey)}
              accessibilityState={{ selected: isSelected }}
            >
              {/* Today is always the filled circle; the ring is wherever you're looking. */}
              <View
                style={[
                  styles.day,
                  isToday && { backgroundColor: accent.accent },
                  isSelected && [styles.selectedDay, { borderColor: accent.accent }],
                ]}
              >
                <Text style={[type.body, styles.dayText, isToday && { color: accent.onAccent }]}>
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
  root: { gap: spacing.xs },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  monthTitle: { flex: 1, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  headCell: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 9, letterSpacing: 0, paddingBottom: 2 },
  cell: { width: `${100 / 7}%`, height: 26, alignItems: 'center', justifyContent: 'center' },
  inWeek: { backgroundColor: colors.surface, borderRadius: radius.square },
  day: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  selectedDay: { borderWidth: 1.5 },
  monthArrow: { width: 20, height: 20, borderRadius: radius.square, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 12 },
});
