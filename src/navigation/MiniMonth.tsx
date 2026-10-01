import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  daysInMonth,
  formatDayKey,
  makeDayKey,
  MONTH_NAMES,
  parseDayKey,
  weekdayIndex,
} from '../coach/days';
import { useAccent } from '../design/accent';
import { hoverFill, hoverStyles, pointerState } from '../design/hover';
import { useType } from '../design/fonts';
import { colors, radius, rgba, spacing } from '../design/theme';

const WEEK_HEADER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// A small month for choosing a day: the sidebar's calendar navigator, and the date
// picker in the desktop event sheet. It's a sibling of home/MonthCalendar rather than
// a reuse of it: that one disables past days and has phone-sized touch targets.
//
// Nothing here marks a whole week or row. The only per-day states are today (filled
// circle), the selected day (ring) and the day under the pointer (soft circle).
export function MiniMonth({
  anchor,
  todayKey,
  onSelect,
}: {
  anchor: string; // the selected day, drawn with a ring; the month shown follows it
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
          return (
            <Pressable
              key={key}
              onPress={() => onSelect(key)}
              // The square cell never changes on hover; only the date's own circle does.
              style={[styles.cell, hoverStyles.pointer]}
              accessibilityRole="button"
              accessibilityLabel={formatDayKey(key, todayKey)}
              accessibilityState={{ selected: isSelected }}
            >
              {(state) => {
                const { hovered, pressed } = pointerState(state);
                return (
                  // Today is always the filled circle; the ring is wherever you're looking.
                  // Hover and press only tint this one date's circle.
                  <View
                    style={[
                      styles.day,
                      !isToday && hovered && styles.dayHovered,
                      !isToday && pressed && styles.dayPressed,
                      isToday && { backgroundColor: accent.accent },
                      isToday && (hovered || pressed) && hoverStyles.hoveredDim,
                      isSelected && [styles.selectedDay, { borderColor: accent.accent }],
                    ]}
                  >
                    <Text style={[type.body, styles.dayText, isToday && { color: accent.onAccent }]}>
                      {Number(key.slice(8))}
                    </Text>
                  </View>
                );
              }}
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
  day: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  selectedDay: { borderWidth: 1.5 },
  dayHovered: { backgroundColor: rgba(colors.text, 0.1) },
  dayPressed: { backgroundColor: rgba(colors.text, 0.18) },
  monthArrow: { width: 20, height: 20, borderRadius: radius.square, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 12 },
});
