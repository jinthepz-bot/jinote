import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
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
  type ViewStyle,
} from 'react-native';

import { formatDayKey, weekdayShort } from '../../coach/days';
import { useAccent } from '../../design/accent';
import { useType } from '../../design/fonts';
import { hoverFill, hoverStyles, pointerState } from '../../design/hover';
import type { IconName } from '../../design/ui';
import { colors, radius, rgba, spacing } from '../../design/theme';
import { allDayItems, layoutDay, spanOf, type CalendarItem } from './items';
import {
  canDrag,
  canResize,
  GridInteractions,
  hhmm,
  InteractionsContext,
  rectRelativeTo,
  useInteractions,
  useInteractionState,
  type BlockAction,
  type DropResult,
  type RetimeScope,
} from './gridInteractions';
import { RoundCheck } from './RoundCheck';
import { SeriesChoiceCard, type SeriesScope } from './SeriesChoiceCard';
import { MiniMonth } from '../../navigation/MiniMonth';
import { gridLines, kindColors } from './kindColors';
import { TIME_GUTTER_WIDTH, ZOOM_LEVELS } from './viewStore';

// The grid always covers the whole day. Fitting all 24 hours on screen is the
// default (zoom 0); the other levels step up to MAX_HOUR_HEIGHT and scroll.
const HOURS_IN_DAY = 24;
const MAX_HOUR_HEIGHT = 52;
const TIME_WIDTH = TIME_GUTTER_WIDTH;
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
  days: string[]; // one day key per column: 1 in day view, 7 in week view (3 when narrow)
  todayKey: string;
  selectedDate: string; // the day the sidebar and the tinted column agree on
  itemsByDay: CalendarItem[][]; // parallel to `days`
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onItemPress: (item: CalendarItem) => void;
  onSlotPress: (date: string, time: string) => void;
  onDayPress: (date: string) => void;
  // The event being created in the side sheet, per column (null where it doesn't
  // fall), drawn as a dashed block that follows the sheet as it's edited.
  ghostByDay?: (CalendarItem | null)[];
  // A block dragged to a new time or day (or resized) and released. For an
  // occurrence of a repeating event, `scope` says whether it was "Only this event".
  onDrop?: (result: DropResult, scope: RetimeScope) => void;
  onToggleTask?: (item: CalendarItem) => void; // a task's round tick-box
  onBlockAction?: (item: CalendarItem, action: BlockAction, date?: string) => void; // the block menu
}

export const isGhost = (item: CalendarItem) => item.id.startsWith('ghost:');

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
  ghostByDay,
  onDrop,
  onToggleTask,
  onBlockAction,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const wheelTargetRef = useRef<View>(null);
  const gridRef = useRef<View>(null);

  // One controller for this grid's drags and hover cards. It reads the latest days,
  // hour height and drop handler at the moment a pointer event arrives.
  const interactionsRef = useRef<GridInteractions | null>(null);
  if (!interactionsRef.current) interactionsRef.current = new GridInteractions();
  const interactions = interactionsRef.current;
  interactions.days = days;
  interactions.onDrop = onDrop ?? (() => {});
  interactions.onToggleTask = onToggleTask ?? (() => {});
  interactions.onAction = onBlockAction ?? (() => {});
  useLayoutEffect(() => {
    interactions.root = wheelTargetRef.current as unknown as HTMLElement | null;
    interactions.grid = gridRef.current as unknown as HTMLElement | null;
    const scroller = scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement } | null;
    interactions.scroller = scroller?.getScrollableNode?.() ?? null;
  });
  useEffect(() => () => interactions.dispose(), [interactions]);
  const scrollY = useRef(0);
  const [viewport, setViewport] = useState(0);

  const fitHeight = viewport > 0 ? (viewport - LABEL_INSET) / HOURS_IN_DAY : MAX_HOUR_HEIGHT / 2;
  const hourHeight = hourHeightFor(zoom, fitHeight);
  interactions.hourHeight = hourHeight;
  const gridHeight = hourHeight * HOURS_IN_DAY;
  const offsetOf = useCallback((minutes: number) => (minutes / 60) * hourHeight, [hourHeight]);

  const onLayout = (e: LayoutChangeEvent) => setViewport(e.nativeEvent.layout.height);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
    interactions.hideTooltip(); // its anchor just moved
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
    <InteractionsContext.Provider value={interactions}>
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
        <View style={styles.grid} ref={gridRef} collapsable={false}>
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
              ghost={ghostByDay?.[i] ?? null}
              hours={hours}
              hourHeight={hourHeight}
              gridHeight={gridHeight}
              offsetOf={offsetOf}
              first={i === 0}
              columnRef={(node) => {
                interactions.columns[i] = node as unknown as HTMLElement | null;
              }}
              onItemPress={onItemPress}
              onSlotPress={onSlotPress}
            />
          ))}
          <DragPreview />
        </View>
      </ScrollView>

      <HoverCard todayKey={todayKey} />
      <SeriesChoice />
      <BlockMenu todayKey={todayKey} />
    </View>
    </InteractionsContext.Provider>
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
  const interactions = useInteractions();
  const tint = kindColors(item.kind);
  const clickable = item.source.kind === 'event' || item.source.kind === 'task';
  const chipRef = useRef<View>(null);
  useContextMenu(chipRef, item, interactions);
  return (
    <Pressable
      ref={chipRef}
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
          item.done && styles.doneBlock,
        ];
      }}
    >
      {item.source.kind === 'task' ? (
        <RoundCheck
          done={item.done}
          color={tint.text}
          size={13}
          label={`${item.done ? 'Mark not done' : 'Mark done'}: ${item.title}`}
          onToggle={() => interactions?.onToggleTask(item)}
        />
      ) : null}
      <Text style={[type.body, styles.chipText, { color: tint.text }, item.done && styles.doneText]} numberOfLines={1}>
        {item.title}
      </Text>
    </Pressable>
  );
}

// Right-click on a block or chip opens its menu instead of the browser's.
function useContextMenu(ref: RefObject<View | null>, item: CalendarItem, interactions: GridInteractions | null) {
  const itemRef = useRef(item);
  itemRef.current = item;
  const hasMenu = item.source.kind === 'event' || item.source.kind === 'task';
  useEffect(() => {
    const node = ref.current as unknown as HTMLElement | null;
    if (!interactions || !hasMenu || !node?.addEventListener) return;
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      interactions.openMenu(itemRef.current, e.clientX, e.clientY);
    };
    node.addEventListener('contextmenu', onContext);
    return () => node.removeEventListener('contextmenu', onContext);
  }, [ref, interactions, hasMenu]);
}

function DayColumn({
  date,
  isToday,
  isSelected,
  items,
  ghost,
  hours,
  hourHeight,
  gridHeight,
  offsetOf,
  first,
  columnRef,
  onItemPress,
  onSlotPress,
}: {
  columnRef: (node: View | null) => void;
  date: string;
  isToday: boolean;
  isSelected: boolean;
  items: CalendarItem[];
  ghost: CalendarItem | null;
  hours: number[];
  hourHeight: number;
  gridHeight: number;
  offsetOf: (minutes: number) => number;
  first: boolean;
  onItemPress: (item: CalendarItem) => void;
  onSlotPress: (date: string, time: string) => void;
}) {
  const nowMinutes = useNowMinutes();
  const positioned = layoutDay(ghost ? [...items, ghost] : items);
  const slotHeight = hourHeight / SLOTS_PER_HOUR;

  return (
    <View
      ref={columnRef}
      collapsable={false}
      style={[styles.column, { height: gridHeight }, !first && styles.columnDivider, isSelected && styles.selectedColumn]}
    >
      {/* Empty slots sit underneath: clicking one starts a new event at that time. */}
      {hours.map((hour) => (
        <View key={hour} style={[styles.hourCell, { height: hourHeight }]}>
          {Array.from({ length: SLOTS_PER_HOUR }, (_, slot) => {
            const minutes = (60 / SLOTS_PER_HOUR) * slot;
            const time = `${pad(hour % 24)}:${pad(minutes)}`;
            return <Slot key={slot} time={time} height={slotHeight} onPress={() => onSlotPress(date, time)} />;
          })}
        </View>
      ))}

      {positioned.map(({ item, lane, lanes }) => {
        const { start, end } = spanOf(item);
        const top = offsetOf(start);
        const height = Math.max(MIN_BLOCK_HEIGHT, offsetOf(end) - top);
        if (isGhost(item)) {
          return <GhostBlock key={item.id} item={item} top={top} height={height} lane={lane} lanes={lanes} />;
        }
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

// Half of an hour of empty space. Nothing marks the half hour itself — the grid only
// draws hour lines — but hovering shows what clicking here would create.
function Slot({ time, height, onPress }: { time: string; height: number; onPress: () => void }) {
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
  const interactions = useInteractions();
  const tint = kindColors(item.kind);
  const clickable = item.source.kind === 'event' || item.source.kind === 'task';
  const draggable = canDrag(item);
  const resizable = canResize(item);
  const width = `${100 / lanes}%` as const;
  const left = `${(100 / lanes) * lane}%` as const;
  const showTime = height >= 34 && item.timeLabel !== '';
  // Zoomed right out a block is barely taller than a line of text, so it drops to a
  // smaller face with no vertical padding rather than clipping its own title.
  const tight = height < 24;
  // While it's being dragged the original stays put, faint, as a reminder of where
  // it came from.
  const dragging = useInteractionState(interactions, (s) => s.draggingId === item.id);

  const blockRef = useRef<View>(null);
  const handleRef = useRef<View>(null);
  const checkRef = useRef<View>(null);
  const itemRef = useRef(item);
  itemRef.current = item;
  useContextMenu(blockRef, item, interactions);
  const isTask = item.source.kind === 'task';

  // Straight DOM listeners: a drag begins on pointerdown, before react-native-web's
  // press handling decides anything. The press still fires on a plain click, which
  // is how a click and a drag stay apart (see shouldSuppressClick).
  useEffect(() => {
    const block = blockRef.current as unknown as HTMLElement | null;
    const handle = handleRef.current as unknown as HTMLElement | null;
    if (!interactions || !block?.addEventListener || !draggable) return;
    const onBlockDown = (e: PointerEvent) => {
      // Pressing the tick-box ticks; it never starts a drag.
      const check = checkRef.current as unknown as HTMLElement | null;
      if (check?.contains(e.target as Node)) return;
      interactions.pointerDown(itemRef.current, 'move', e);
    };
    const onHandleDown = (e: PointerEvent) => {
      e.stopPropagation(); // a resize, not also a move
      interactions.pointerDown(itemRef.current, 'resize', e);
    };
    block.addEventListener('pointerdown', onBlockDown);
    handle?.addEventListener('pointerdown', onHandleDown);
    return () => {
      block.removeEventListener('pointerdown', onBlockDown);
      handle?.removeEventListener('pointerdown', onHandleDown);
    };
  }, [interactions, draggable, resizable]);

  return (
    <Pressable
      ref={blockRef}
      onPress={
        clickable
          ? () => {
              if (!interactions?.shouldSuppressClick()) onPress();
            }
          : undefined
      }
      onHoverIn={() => interactions?.hoverIn(item, blockRef.current as unknown as HTMLElement | null)}
      onHoverOut={() => interactions?.hoverOut()}
      accessibilityRole={clickable ? 'button' : undefined}
      accessibilityLabel={`${item.title}${item.timeLabel ? `, ${item.timeLabel}` : ''}`}
      style={(state) => {
        const { hovered } = pointerState(state);
        const active = hovered && clickable && !dragging;
        return [
          styles.block,
          tight && styles.blockTight,
          { top, height, width, left, backgroundColor: active ? tint.backgroundHover : tint.background, borderColor: tint.border },
          styles.noSelect,
          clickable && hoverStyles.pointer,
          active && hoverStyles.raised,
          item.done && styles.doneBlock,
          dragging && styles.dragOrigin,
        ];
      }}
    >
      <View style={isTask && styles.taskRow}>
        {isTask ? (
          <View ref={checkRef} collapsable={false} style={styles.taskCheck}>
            <RoundCheck
              done={item.done}
              color={tint.text}
              size={tight ? 11 : 14}
              label={`${item.done ? 'Mark not done' : 'Mark done'}: ${item.title}`}
              onToggle={() => interactions?.onToggleTask(item)}
            />
          </View>
        ) : null}
        <Text
          style={[
            type.bodyStrong,
            styles.blockTitle,
            tight && styles.blockTitleTight,
            isTask && styles.taskTitle,
            { color: tint.text },
            item.done && styles.doneText,
          ]}
          numberOfLines={height < 34 ? 1 : 2}
        >
          {item.title}
        </Text>
      </View>
      {showTime ? (
        <Text style={[type.body, styles.blockTime, { color: tint.text }]} numberOfLines={1}>
          {item.timeLabel}
        </Text>
      ) : null}
      {resizable ? <View ref={handleRef} collapsable={false} style={styles.resizeHandle} /> : null}
    </Pressable>
  );
}

// The block following the pointer during a drag. React only mounts and unmounts it;
// its position and time label are written directly by the interactions controller.
function DragPreview() {
  const type = useType();
  const interactions = useInteractions();
  const preview = useInteractionState(interactions, (s) => s.preview);
  const nodeRef = useRef<View>(null);
  const labelRef = useRef<Text>(null);
  const id = preview?.item.id;

  useLayoutEffect(() => {
    if (!interactions || !id) return;
    interactions.registerPreview(
      nodeRef.current as unknown as HTMLElement | null,
      labelRef.current as unknown as HTMLElement | null,
    );
    return () => interactions.registerPreview(null, null);
  }, [interactions, id]);

  if (!preview) return null;
  const tint = kindColors(preview.item.kind);
  return (
    <View
      ref={nodeRef}
      collapsable={false}
      style={[styles.block, styles.preview, { backgroundColor: tint.backgroundHover, borderColor: tint.border }, hoverStyles.raised]}
    >
      <Text style={[type.bodyStrong, styles.blockTitle, { color: tint.text }]} numberOfLines={1}>
        {preview.item.title}
      </Text>
      <Text ref={labelRef} style={[type.bodyStrong, styles.previewTime, { color: tint.text }]} numberOfLines={1}>
        {preview.label}
      </Text>
    </View>
  );
}

const CARD_WIDTH = 260;

// Where a card goes next to a block: to its right if it fits, else to its left,
// kept inside the grid top to bottom.
function placeBeside(anchor: { left: number; top: number; right: number }, root: HTMLElement, height: number) {
  const box = root.getBoundingClientRect();
  const left = anchor.right + 8 + CARD_WIDTH <= box.width ? anchor.right + 8 : Math.max(4, anchor.left - 8 - CARD_WIDTH);
  const top = Math.min(Math.max(4, anchor.top), Math.max(4, box.height - height - 4));
  return { left, top };
}

const duration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "Repeats weekdays", "Repeats daily", "Repeats weekends", or "Repeats Mon + Wed".
function repeatsLabel(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return 'Repeats daily';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Repeats weekdays';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Repeats weekends';
  const mondayFirst = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  return `Repeats ${mondayFirst.map((d) => WEEKDAY_SHORT[d]).join(' + ')}`;
}

// "Reminder 15 min before", "Reminder 1 h before".
const reminderLabel = (m: number) => `Reminder ${m % 60 === 0 ? `${m / 60} h` : `${m} min`} before`;

// The details card shown after hovering a block for a moment.
function HoverCard({ todayKey }: { todayKey: string }) {
  const type = useType();
  const interactions = useInteractions();
  const tooltip = useInteractionState(interactions, (s) => s.tooltip);
  if (!tooltip || !interactions?.root) return null;

  const { item } = tooltip;
  const start = item.start ?? 0;
  const when =
    item.end !== null
      ? `${formatDayKey(item.date, todayKey)} · ${hhmm(start)}–${hhmm(item.end)} · ${duration(item.end - start)}`
      : `${formatDayKey(item.date, todayKey)} · ${item.start !== null ? hhmm(start) : 'All day'}`;

  const lines: { icon?: IconName; text: string }[] = [];
  if (item.source.kind === 'event') {
    const { event, occurrenceDate } = item.source;
    if (event.location) lines.push({ icon: 'location-outline', text: event.location });
    if (event.type === 'recurring') {
      lines.push({ text: repeatsLabel(event.days) });
      if (event.exceptions[occurrenceDate]) lines.push({ text: 'Changed for this day only' });
    }
    if (event.reminderMinutesBefore) lines.push({ text: reminderLabel(event.reminderMinutesBefore) });
  } else if (item.source.kind === 'task') {
    lines.push({ text: item.done ? 'Task · done' : 'Task' });
  }

  const height = 58 + lines.length * 20;
  const { left, top } = placeBeside(rectRelativeTo(tooltip.anchor, interactions.root), interactions.root, height);
  const tint = kindColors(item.kind);
  const hasMenu = item.source.kind === 'event' || item.source.kind === 'task';

  return (
    // A Pressable only for its hover events: resting on the card keeps it open, so
    // its "…" button can be reached.
    <Pressable
      onHoverIn={() => interactions.cardHoverIn()}
      onHoverOut={() => interactions.cardHoverOut()}
      style={[styles.card, styles.cardLive, { left, top, width: CARD_WIDTH }]}
      accessibilityRole="summary"
    >
      <View style={styles.cardTitleRow}>
        <View style={[styles.cardSwatch, { backgroundColor: tint.text }]} />
        <Text style={[type.bodyStrong, styles.cardTitle]} numberOfLines={2}>
          {item.title}
        </Text>
        {hasMenu ? (
          <Pressable
            onPress={(e) => {
              const { pageX, pageY } = e.nativeEvent;
              interactions.openMenu(item, pageX, pageY);
            }}
            onHoverIn={() => interactions.cardHoverIn()}
            accessibilityRole="button"
            accessibilityLabel={`More for ${item.title}`}
            style={(state) => [styles.cardMore, hoverFill(state)]}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <Text style={[type.body, styles.cardWhen]}>{when}</Text>
      {lines.map((line) => (
        <View key={line.text} style={styles.cardLineRow}>
          {line.icon ? <Ionicons name={line.icon} size={13} color={colors.textMuted} /> : null}
          <Text style={[type.body, styles.cardLine]} numberOfLines={2}>
            {line.text}
          </Text>
        </View>
      ))}
    </Pressable>
  );
}

const MENU_WIDTH = 236;

// The block menu: make an event repeat, duplicate it or a task to another day, or
// delete it. Every action comes back with an Undo toast (see DesktopSchedule).
function BlockMenu({ todayKey }: { todayKey: string }) {
  const type = useType();
  const interactions = useInteractions();
  const menu = useInteractionState(interactions, (s) => s.menu);
  if (!menu || !interactions?.root) return null;

  const { item } = menu;
  const isEvent = item.source.kind === 'event';
  const isSeries = isEvent && item.source.kind === 'event' && item.source.event.type === 'recurring';
  const run = (action: BlockAction, date?: string) => {
    interactions.closeMenu();
    interactions.onAction(item, action, date);
  };

  const box = interactions.root.getBoundingClientRect();
  const height = menu.picking ? 250 : isEvent ? 214 : 96;
  const left = Math.min(Math.max(4, menu.x), box.width - MENU_WIDTH - 4);
  const top = Math.min(Math.max(4, menu.y), box.height - height - 4);

  return (
    <>
      <Pressable style={styles.choiceBackdrop} onPress={interactions.closeMenu} accessibilityLabel="Close menu" />
      <View style={[styles.card, styles.cardLive, styles.menu, { left, top, width: MENU_WIDTH }]} accessibilityRole="menu">
        {menu.picking ? (
          <>
            <Text style={[type.label, styles.menuHeading]}>Duplicate to…</Text>
            <MiniMonth anchor={item.date} todayKey={todayKey} onSelect={(day) => run('duplicate', day)} />
          </>
        ) : (
          <>
            {isEvent ? (
              <>
                <MenuItem icon="briefcase-outline" label="Repeat on all weekdays" onPress={() => run('weekdays')} />
                <MenuItem icon="repeat-outline" label="Repeat every day" onPress={() => run('daily')} />
                <MenuItem icon="calendar-outline" label="Repeat every week this month" onPress={() => run('weeklyThisMonth')} />
                <View style={styles.menuDivider} />
              </>
            ) : null}
            <MenuItem icon="copy-outline" label="Duplicate to…" onPress={() => interactions.pickDateInMenu()} />
            <MenuItem
              icon="trash-outline"
              label={isSeries ? 'Delete…' : 'Delete'}
              danger
              onPress={() =>
                isSeries ? interactions.askDelete(item, box.left + left, box.top + top) : run('delete')
              }
            />
          </>
        )}
      </View>
    </>
  );
}

function MenuItem({ icon, label, danger, onPress }: { icon: IconName; label: string; danger?: boolean; onPress: () => void }) {
  const type = useType();
  const color = danger ? colors.deadlineRed : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      style={(state) => [styles.menuItem, hoverFill(state)]}
    >
      <Ionicons name={icon} size={15} color={danger ? colors.deadlineRed : colors.textMuted} />
      <Text style={[type.body, styles.menuText, { color }]}>{label}</Text>
    </Pressable>
  );
}

// Asked after moving or resizing one occurrence of a repeating event, or when
// deleting one from its menu. Clicking anywhere else on the grid is the same as Cancel.
function SeriesChoice() {
  const interactions = useInteractions();
  const pending = useInteractionState(interactions, (s) => s.pending);
  if (!pending || !interactions?.root) return null;

  const { left, top } = placeBeside(rectRelativeTo(pending.anchor, interactions.root), interactions.root, 170);
  const choose = (scope: SeriesScope | null) => interactions.resolvePending(scope);
  const item = pending.kind === 'drop' ? pending.result.item : pending.item;

  return (
    <>
      <Pressable style={styles.choiceBackdrop} onPress={() => choose(null)} accessibilityLabel="Cancel change" />
      <SeriesChoiceCard
        title={pending.kind === 'drop' ? 'Change repeating event' : 'Delete repeating event'}
        subtitle={item.title}
        onChoose={choose}
        style={[styles.choice, { position: 'absolute', zIndex: 40, left, top }]}
      />
    </>
  );
}

function GhostBlock({
  item,
  top,
  height,
  lane,
  lanes,
}: {
  item: CalendarItem;
  top: number;
  height: number;
  lane: number;
  lanes: number;
}) {
  const type = useType();
  const accent = useAccent();
  return (
    <View
      style={[
        styles.block,
        styles.ghost,
        height < 24 && styles.blockTight,
        {
          top,
          height,
          width: `${100 / lanes}%`,
          left: `${(100 / lanes) * lane}%`,
          borderColor: accent.accent,
          backgroundColor: rgba(accent.accent, 0.1),
        },
      ]}
      accessibilityLabel={`New event: ${item.title}, ${item.timeLabel}`}
    >
      <Text
        style={[type.bodyStrong, styles.blockTitle, height < 24 && styles.blockTitleTight, { color: accent.accent }]}
        numberOfLines={height < 34 ? 1 : 2}
      >
        {item.title}
      </Text>
      {height >= 34 ? (
        <Text style={[type.body, styles.blockTime, { color: accent.accent }]} numberOfLines={1}>
          {item.timeLabel}
        </Text>
      ) : null}
    </View>
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
  chip: {
    borderRadius: radius.chip,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
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
  // Dragging must not select text. `userSelect` is typed for Text only, but it's a
  // plain CSS property on the web.
  noSelect: { userSelect: 'none' } as unknown as ViewStyle,
  doneBlock: { opacity: 0.55 },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  taskCheck: { paddingTop: 1 },
  taskTitle: { flex: 1, minWidth: 0 },
  dragOrigin: { opacity: 0.35 },
  // The bottom edge: drag it to change the end time. 'ns-resize' is a web cursor
  // React Native's types don't list.
  resizeHandle: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -2,
    height: 8,
    cursor: 'ns-resize',
  } as unknown as ViewStyle,
  preview: { zIndex: 20, pointerEvents: 'none', userSelect: 'none' } as unknown as ViewStyle,
  previewTime: { fontSize: 11, lineHeight: 14 },

  card: {
    position: 'absolute',
    zIndex: 40,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    pointerEvents: 'none',
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardSwatch: { width: 10, height: 10, borderRadius: 3 },
  cardTitle: { flex: 1, fontSize: 15, lineHeight: 20 },
  cardWhen: { fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'] },
  cardLine: { fontSize: 13, color: colors.textMuted },
  cardLineRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  choice: { pointerEvents: 'auto', gap: 2 },
  cardLive: { pointerEvents: 'auto' },
  cardMore: { width: 26, height: 22, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  menu: { zIndex: 41, paddingHorizontal: 4, paddingVertical: 4, gap: 0 },
  menuHeading: { paddingHorizontal: spacing.sm, paddingTop: 4 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
  },
  menuText: { fontSize: 14 },
  menuDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 4, marginHorizontal: spacing.sm },
  choiceBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 39 },
  ghost: { borderStyle: 'dashed', borderWidth: 1.5, borderLeftWidth: 1.5, pointerEvents: 'none' },
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
