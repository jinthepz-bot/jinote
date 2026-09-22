import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { weekdayShort } from '../../coach/days';
import { useAccent } from '../../design/accent';
import { useType } from '../../design/fonts';
import { hoverFill, hoverStyles, pointerState } from '../../design/hover';
import { colors, radius, rgba, spacing } from '../../design/theme';
import { allDayItems, layoutDay, spanOf, type CalendarItem } from './items';
import { gridLines, kindColors } from './kindColors';
import { ZOOM_LEVELS } from './viewStore';

// The grid always covers the whole day. Fitting all 24 hours on screen is the
// default (zoom 0); the other levels step up to MAX_HOUR_HEIGHT and scroll.
const HOURS_IN_DAY = 24;
const MAX_HOUR_HEIGHT = 52;
const TIME_WIDTH = 56;
const SLOTS_PER_HOUR = 2; // clicking empty space snaps to the half hour
const LABEL_INSET = 8; // headroom so the first hour label isn't clipped
const MIN_BLOCK_HEIGHT = 11;

const pad = (n: number) => String(n).padStart(2, '0');
const hourLabel = (hour: number) => `${pad(hour % 24)}:00`;

// The hour height for a zoom level: level 0 is whatever makes the day fit, the top
// level is MAX_HOUR_HEIGHT, and the levels in between are evenly spaced. On a very
// tall window "fit" can already be the biggest, and every level collapses to it.
export function hourHeightFor(level: number, fitHeight: number): number {
  const max = Math.max(fitHeight, MAX_HOUR_HEIGHT);
  const step = Math.min(ZOOM_LEVELS - 1, Math.max(0, level));
  return fitHeight + ((max - fitHeight) * step) / (ZOOM_LEVELS - 1);
}

// How often to print an hour label so they don't collide.
const labelEvery = (hourHeight: number) => (hourHeight >= 26 ? 1 : hourHeight >= 14 ? 2 : 4);

// Now, to the minute, for the red line. The timer is aligned to the next minute
// boundary so the line moves when the clock does, not 60s after mount.
function useNowMinutes(): number {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, (60 - new Date().getSeconds()) * 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);
  return now.getHours() * 60 + now.getMinutes();
}

interface Props {
  days: string[]; // one day key per column: 1 in day view, 7 in week view
  todayKey: string;
  selectedDate: string; // the day the sidebar and the tinted column agree on
  itemsByDay: CalendarItem[][]; // parallel to `days`
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onItemPress: (item: CalendarItem) => void;
  onSlotPress: (date: string, time: string) => void;
  onDayPress: (date: string) => void;
}

export function TimeGrid({
  days,
  todayKey,
  selectedDate,
  itemsByDay,
  zoom,
  onZoomChange,
  onItemPress,
  onSlotPress,
  onDayPress,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const wheelTargetRef = useRef<View>(null);
  const scrollY = useRef(0);
  const [viewport, setViewport] = useState(0);

  const fitHeight = viewport > 0 ? (viewport - LABEL_INSET) / HOURS_IN_DAY : MAX_HOUR_HEIGHT / 2;
  const hourHeight = hourHeightFor(zoom, fitHeight);
  const gridHeight = hourHeight * HOURS_IN_DAY;
  const offsetOf = useCallback((minutes: number) => (minutes / 60) * hourHeight, [hourHeight]);

  const onLayout = (e: LayoutChangeEvent) => setViewport(e.nativeEvent.layout.height);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  };

  // Zooming keeps whatever was in the middle of the view in the middle of it.
  const previousHourHeight = useRef(hourHeight);
  useEffect(() => {
    const previous = previousHourHeight.current;
    previousHourHeight.current = hourHeight;
    if (previous === hourHeight || viewport === 0) return;
    // The content starts LABEL_INSET below the scroll origin, so take that off before
    // converting pixels to minutes and add it back on the way out.
    const centreMinutes = ((scrollY.current - LABEL_INSET + viewport / 2) / previous) * 60;
    const next = (centreMinutes / 60) * hourHeight - viewport / 2 + LABEL_INSET;
    const max = Math.max(0, hourHeight * HOURS_IN_DAY + LABEL_INSET - viewport);
    scrollRef.current?.scrollTo({ y: Math.min(max, Math.max(0, next)), animated: false });
  }, [hourHeight, viewport]);

  // Ctrl/Cmd + wheel, and trackpad pinch (which Chrome reports as a ctrl-wheel).
  // Registered straight on the DOM node because it has to be non-passive to stop the
  // browser zooming the whole page instead.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const zoomChangeRef = useRef(onZoomChange);
  zoomChangeRef.current = onZoomChange;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = wheelTargetRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;

    let accumulated = 0;
    const STEP = 40; // roughly one level per deliberate pinch or wheel notch
    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      accumulated += event.deltaY;
      while (Math.abs(accumulated) >= STEP) {
        const direction = accumulated > 0 ? -1 : 1; // pinch out / wheel up zooms in
        accumulated -= Math.sign(accumulated) * STEP;
        const next = Math.min(ZOOM_LEVELS - 1, Math.max(0, zoomRef.current + direction));
        if (next === zoomRef.current) continue;
        zoomRef.current = next;
        zoomChangeRef.current(next);
      }
    };
    node.addEventListener('wheel', handler, { passive: false });
    return () => node.removeEventListener('wheel', handler);
  }, []);

  const hasAllDay = itemsByDay.some((items) => allDayItems(items).length > 0);
  const every = labelEvery(hourHeight);
  const hours = Array.from({ length: HOURS_IN_DAY }, (_, i) => i);

  return (
    <View style={styles.root} ref={wheelTargetRef} collapsable={false}>
      <DayHeader days={days} todayKey={todayKey} selectedDate={selectedDate} onDayPress={onDayPress} />

      {hasAllDay ? (
        <View style={styles.allDayRow}>
          <View style={styles.gutterCell}>
            <Text style={styles.allDayLabel} numberOfLines={1}>
              All day
            </Text>
          </View>
          {days.map((day, i) => (
            <View
              key={day}
              style={[styles.allDayCell, i > 0 && styles.columnDivider, day === selectedDate && styles.selectedColumn]}
            >
              {allDayItems(itemsByDay[i]).map((item) => (
                <AllDayChip key={item.id} item={item} onPress={() => onItemPress(item)} />
              ))}
            </View>
          ))}
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        onLayout={onLayout}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ height: gridHeight + LABEL_INSET, paddingTop: LABEL_INSET }}
      >
        <View style={styles.grid}>
          <View style={[styles.gutter, { height: gridHeight }]}>
            {hours.map((hour) => (
              <View key={hour} style={[styles.hourLabelCell, { height: hourHeight }]}>
                {hour % every === 0 ? <Text style={styles.hourLabel}>{hourLabel(hour)}</Text> : null}
              </View>
            ))}
          </View>

          {days.map((day, i) => (
            <DayColumn
              key={day}
              date={day}
              isToday={day === todayKey}
              isSelected={day === selectedDate}
              items={itemsByDay[i]}
              hours={hours}
              hourHeight={hourHeight}
              gridHeight={gridHeight}
              offsetOf={offsetOf}
              first={i === 0}
              onItemPress={onItemPress}
              onSlotPress={onSlotPress}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function DayHeader({
  days,
  todayKey,
  selectedDate,
  onDayPress,
}: {
  days: string[];
  todayKey: string;
  selectedDate: string;
  onDayPress: (date: string) => void;
}) {
  const type = useType();
  const accent = useAccent();
  return (
    <View style={styles.headerRow}>
      <View style={styles.gutterCell} />
      {days.map((day, i) => {
        const isToday = day === todayKey;
        const isSelected = day === selectedDate;
        return (
          <Pressable
            key={day}
            onPress={() => onDayPress(day)}
            accessibilityRole="button"
            accessibilityLabel={`Show ${weekdayShort(day)} ${Number(day.slice(8))} on its own`}
            accessibilityState={{ selected: isSelected }}
            style={(state) => [
              styles.headerCell,
              i > 0 && styles.columnDivider,
              isSelected && styles.selectedColumn,
              hoverFill(state),
            ]}
          >
            <Text style={[type.label, styles.headerWeekday]}>{weekdayShort(day)}</Text>
            <View
              style={[
                styles.headerDate,
                isToday && { backgroundColor: accent.accent },
                isSelected && !isToday && [styles.headerDateSelected, { borderColor: accent.accent }],
              ]}
            >
              <Text style={[type.bodyStrong, styles.headerDateText, isToday && { color: accent.onAccent }]}>
                {Number(day.slice(8))}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function AllDayChip({ item, onPress }: { item: CalendarItem; onPress: () => void }) {
  const type = useType();
  const tint = kindColors(item.kind);
  const clickable = item.source.kind === 'event' || item.source.kind === 'task';
  return (
    <Pressable
      onPress={clickable ? onPress : undefined}
      disabled={!clickable}
      accessibilityRole={clickable ? 'button' : undefined}
      accessibilityLabel={`${item.title}, all day`}
      style={(state) => {
        const { hovered } = pointerState(state);
        return [
          styles.chip,
          { backgroundColor: hovered && clickable ? tint.backgroundHover : tint.background, borderColor: tint.border },
          clickable && hoverStyles.pointer,
          hovered && clickable && hoverStyles.raised,
          state.pressed && hoverStyles.pressedDim,
        ];
      }}
    >
      <Text style={[type.body, styles.chipText, { color: tint.text }, item.done && styles.doneText]} numberOfLines={1}>
        {item.title}
      </Text>
    </Pressable>
  );
}

function DayColumn({
  date,
  isToday,
  isSelected,
  items,
  hours,
  hourHeight,
  gridHeight,
  offsetOf,
  first,
  onItemPress,
  onSlotPress,
}: {
  date: string;
  isToday: boolean;
  isSelected: boolean;
  items: CalendarItem[];
  hours: number[];
  hourHeight: number;
  gridHeight: number;
  offsetOf: (minutes: number) => number;
  first: boolean;
  onItemPress: (item: CalendarItem) => void;
  onSlotPress: (date: string, time: string) => void;
}) {
  const nowMinutes = useNowMinutes();
  const positioned = layoutDay(items);
  const slotHeight = hourHeight / SLOTS_PER_HOUR;

  return (
    <View
      style={[styles.column, { height: gridHeight }, !first && styles.columnDivider, isSelected && styles.selectedColumn]}
    >
      {/* Empty slots sit underneath: clicking one starts a new event at that time. */}
      {hours.map((hour) => (
        <View key={hour} style={[styles.hourCell, { height: hourHeight }]}>
          {Array.from({ length: SLOTS_PER_HOUR }, (_, slot) => {
            const minutes = (60 / SLOTS_PER_HOUR) * slot;
            const time = `${pad(hour % 24)}:${pad(minutes)}`;
            return <Slot key={slot} time={time} height={slotHeight} half={slot > 0} onPress={() => onSlotPress(date, time)} />;
          })}
        </View>
      ))}

      {positioned.map(({ item, lane, lanes }) => {
        const { start, end } = spanOf(item);
        const top = offsetOf(start);
        const height = Math.max(MIN_BLOCK_HEIGHT, offsetOf(end) - top);
        return (
          <Block
            key={item.id}
            item={item}
            top={top}
            height={height}
            lane={lane}
            lanes={lanes}
            onPress={() => onItemPress(item)}
          />
        );
      })}

      {isToday ? <NowLine top={offsetOf(nowMinutes)} /> : null}
    </View>
  );
}

// Half of an hour of empty space. Hovering shows what clicking it would create.
function Slot({ time, height, half, onPress }: { time: string; height: number; half: boolean; onPress: () => void }) {
  const type = useType();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`New event at ${time}`}
      style={(state) => {
        const { hovered } = pointerState(state);
        return [
          styles.slot,
          { height },
          half && styles.halfLine,
          hoverStyles.pointer,
          hovered && styles.slotHovered,
          state.pressed && styles.slotPressed,
        ];
      }}
    >
      {(state) => {
        const { hovered } = pointerState(state);
        // No room for the label in a squeezed half hour — the highlight alone says it.
        return hovered && height >= 15 ? (
          <Text style={[type.body, styles.slotLabel]} numberOfLines={1}>
            + {time}
          </Text>
        ) : null;
      }}
    </Pressable>
  );
}

function Block({
  item,
  top,
  height,
  lane,
  lanes,
  onPress,
}: {
  item: CalendarItem;
  top: number;
  height: number;
  lane: number;
  lanes: number;
  onPress: () => void;
}) {
  const type = useType();
  const tint = kindColors(item.kind);
  const clickable = item.source.kind === 'event' || item.source.kind === 'task';
  const width = `${100 / lanes}%` as const;
  const left = `${(100 / lanes) * lane}%` as const;
  const showTime = height >= 34 && item.timeLabel !== '';
  // Zoomed right out a block is barely taller than a line of text, so it drops to a
  // smaller face with no vertical padding rather than clipping its own title.
  const tight = height < 24;

  return (
    <Pressable
      onPress={clickable ? onPress : undefined}
      disabled={!clickable}
      accessibilityRole={clickable ? 'button' : undefined}
      accessibilityLabel={`${item.title}${item.timeLabel ? `, ${item.timeLabel}` : ''}`}
      style={(state) => {
        const { hovered } = pointerState(state);
        const active = hovered && clickable;
        return [
          styles.block,
          tight && styles.blockTight,
          { top, height, width, left, backgroundColor: active ? tint.backgroundHover : tint.background, borderColor: tint.border },
          clickable && hoverStyles.pointer,
          active && hoverStyles.raised,
          state.pressed && hoverStyles.pressedDim,
        ];
      }}
    >
      <Text
        style={[
          type.bodyStrong,
          styles.blockTitle,
          tight && styles.blockTitleTight,
          { color: tint.text },
          item.done && styles.doneText,
        ]}
        numberOfLines={height < 34 ? 1 : 2}
      >
        {item.title}
      </Text>
      {showTime ? (
        <Text style={[type.body, styles.blockTime, { color: tint.text }]} numberOfLines={1}>
          {item.timeLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

function NowLine({ top }: { top: number }) {
  return (
    <View style={[styles.nowLine, { top }]}>
      <View style={styles.nowDot} />
      <View style={styles.nowBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: gridLines.hour },
  gutterCell: { width: TIME_WIDTH, alignItems: 'flex-end', paddingRight: spacing.sm, justifyContent: 'center' },
  headerCell: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, gap: 2 },
  headerWeekday: { fontSize: 10 },
  headerDate: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  headerDateSelected: { borderWidth: 1.5 },
  headerDateText: { fontSize: 15 },

  allDayRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: gridLines.hour,
    backgroundColor: colors.background,
    minHeight: 32,
  },
  allDayLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  allDayCell: { flex: 1, padding: 3, gap: 3 },
  chip: { borderRadius: radius.chip, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  chipText: { fontSize: 12 },

  scroll: { flex: 1 },
  grid: { flexDirection: 'row', flex: 1 },
  gutter: { width: TIME_WIDTH },
  hourLabelCell: { alignItems: 'flex-end', paddingRight: spacing.sm },
  hourLabel: { fontSize: 11, color: colors.textMuted, marginTop: -7, fontVariant: ['tabular-nums'] },

  column: { flex: 1, position: 'relative' },
  columnDivider: { borderLeftWidth: 1, borderLeftColor: gridLines.hour },
  selectedColumn: { backgroundColor: rgba(colors.text, 0.035) },
  hourCell: { borderTopWidth: 1, borderTopColor: gridLines.hour },
  slot: { flex: 1, justifyContent: 'center', paddingHorizontal: 4 },
  halfLine: { borderTopWidth: 1, borderTopColor: gridLines.half, borderStyle: 'dashed' },
  slotHovered: { backgroundColor: rgba(colors.text, 0.05) },
  slotPressed: { backgroundColor: rgba(colors.text, 0.09) },
  slotLabel: { fontSize: 10, color: colors.textMuted },

  block: {
    position: 'absolute',
    borderRadius: radius.control,
    borderWidth: 1,
    borderLeftWidth: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  blockTight: { paddingVertical: 0, justifyContent: 'center' },
  blockTitle: { fontSize: 12, lineHeight: 15 },
  blockTitleTight: { fontSize: 10, lineHeight: 12 },
  blockTime: { fontSize: 11, lineHeight: 14, opacity: 0.9 },
  doneText: { textDecorationLine: 'line-through', opacity: 0.7 },

  // `pointerEvents` in the style, not as a prop — the prop is deprecated.
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -4,
    pointerEvents: 'none',
  },
  nowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.deadlineRed },
  nowBar: { flex: 1, height: 2, backgroundColor: colors.deadlineRed },
});
