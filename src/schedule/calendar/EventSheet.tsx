import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';

import { addDays, daysInMonth, formatDayKey, makeDayKey, parseDayKey, startOfWeek } from '../../coach/days';
import { useAccent } from '../../design/accent';
import { confirmDestructive } from '../../design/confirm';
import { useType } from '../../design/fonts';
import { hoverDim, hoverFill } from '../../design/hover';
import { colors, keyboardAppearance, radius, rgba, sizes, spacing } from '../../design/theme';
import { Button, IconButton, Segmented, type IconName } from '../../design/ui';
import { MiniMonth } from '../../navigation/MiniMonth';
import { eventColorDot } from '../EventForm';
import { describeWeekdays } from '../format';
import { EVENT_COLORS, type EventColor, type NewEventInput, type ScheduleEvent } from '../store';
import { isTimeKey, minutesOf, sanitizeTimeInput, timeFromMinutes } from '../time';
import { SeriesChoiceCard, type SeriesScope } from './SeriesChoiceCard';

// One occurrence's edit, as saved from the sheet: its final values, and which of them
// were actually changed (only those are applied to the series for "All events").
export interface OccurrenceSave {
  date: string;
  startTime: string;
  endTime: string | null;
  details: { title: string; location: string; note: string; color: EventColor; reminderMinutesBefore: number | null };
  changed: { date: boolean; times: boolean; details: (keyof OccurrenceSave['details'])[]; repeat: boolean };
  days: number[];
  until: string | null;
}

// What's being edited, as the calendar needs it to draw the dashed "ghost" block.
export interface EventDraft {
  title: string;
  date: string; // a one-off's day, or the day a repeating event starts
  startTime: string;
  endTime: string | null;
  days: number[]; // weekdays it repeats on; empty = one-off
  until: string | null; // last day a repeating event can occur; null = forever
}

// The draft as an event, so the same recurrence rules decide which days show it.
export function draftAsEvent(draft: EventDraft): ScheduleEvent | null {
  if (!isTimeKey(draft.startTime)) return null;
  const repeats = draft.days.length > 0;
  return {
    id: 'draft',
    title: draft.title.trim() || '(No title)',
    type: repeats ? 'recurring' : 'one-off',
    days: repeats ? draft.days : [],
    date: repeats ? null : draft.date,
    startDate: repeats ? draft.date : null,
    endDate: repeats ? draft.until : null,
    startTime: draft.startTime,
    endTime: draft.endTime && isTimeKey(draft.endTime) ? draft.endTime : null,
    color: 'accent',
    location: '',
    note: '',
    reminderMinutesBefore: null,
    createdAt: 0,
    exceptions: {},
  };
}

// Monday first, like the rest of the calendar. Values are JS weekdays (0 = Sunday).
const WEEKDAYS: { value: number; letter: string; name: string }[] = [
  { value: 1, letter: 'M', name: 'Monday' },
  { value: 2, letter: 'T', name: 'Tuesday' },
  { value: 3, letter: 'W', name: 'Wednesday' },
  { value: 4, letter: 'T', name: 'Thursday' },
  { value: 5, letter: 'F', name: 'Friday' },
  { value: 6, letter: 'S', name: 'Saturday' },
  { value: 0, letter: 'S', name: 'Sunday' },
];

const REMINDERS = [
  { value: 'off', label: 'Off' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '30', label: '30m' },
  { value: '60', label: '1h' },
] as const;

const COLOR_NAMES: Record<EventColor, string> = {
  accent: 'Accent',
  soft: 'Soft accent',
  strong: 'Red',
  success: 'Green',
};

const DAY_MINUTES = 24 * 60;
const STEP_MINUTES = 15;
const TIME_ROW_HEIGHT = 34;

// Borderless fields: the browser's focus ring would draw a box the design doesn't
// have. 'none' is a web value React Native's types don't list.
const noOutline = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

type Picker = 'date' | 'start' | 'end' | 'until' | 'untilDate';

// A new event on today starts at the next half hour; on any other day, at 09:00.
function defaultStart(date: string, todayKey: string): string {
  if (date !== todayKey) return '09:00';
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return timeFromMinutes(Math.min(DAY_MINUTES - 30, Math.ceil((minutes + 1) / 30) * 30));
}

// An hour later, or no end if that would run past midnight.
function hourAfter(start: string): string | null {
  const end = minutesOf(start) + 60;
  return end >= DAY_MINUTES ? null : timeFromMinutes(end);
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const endOfWeek = (day: string) => addDays(startOfWeek(day), 6);
function endOfMonth(day: string): string {
  const p = parseDayKey(day)!;
  return makeDayKey(p.year, p.month, daysInMonth(p.year, p.month));
}

interface Props {
  todayKey: string;
  editing: ScheduleEvent | null; // null = a new event
  date: string; // new: the day it starts on; edit: the occurrence that was clicked
  startTime?: string; // new only: the slot that was clicked
  // New only: a later click on an empty slot moves the draft there (n makes each
  // click distinct, so clicking the same slot twice still counts).
  moveTo?: { date: string; startTime: string; n: number };
  onDraftChange?: (draft: EventDraft) => void;
  onClose: () => void;
  onSave: (input: NewEventInput) => void;
  onDelete?: () => void;
  // Editing one occurrence of a repeating event: that day's own date, times and
  // details (with any one-day change applied). Save and Delete then ask whether it's
  // "Only this event" or "All events in the series".
  occurrence?: { date: string; event: ScheduleEvent; changed: boolean };
  onSaveOccurrence?: (save: OccurrenceSave, scope: SeriesScope) => void;
  onDeleteOccurrence?: (scope: SeriesScope) => void;
}

// The desktop calendar's event editor, shown in the right-hand sheet (see
// navigation/RightSheet). The phone keeps the full-screen EventForm.
export function EventSheet({
  todayKey,
  editing,
  date: initialDate,
  startTime: initialStart,
  moveTo,
  onDraftChange,
  onClose,
  onSave,
  onDelete,
  occurrence,
  onSaveOccurrence,
  onDeleteOccurrence,
}: Props) {
  const type = useType();
  const accent = useAccent();

  // An occurrence of a series opens with that day's values; anything else with the
  // event's own (or, for a new one, the defaults).
  const inSeries = editing?.type === 'recurring' && occurrence !== undefined;
  const shown = inSeries ? occurrence.event : editing;
  const firstStart = shown?.startTime ?? initialStart ?? defaultStart(initialDate, todayKey);
  const [title, setTitle] = useState(shown?.title ?? '');
  const [date, setDate] = useState(
    inSeries
      ? occurrence.date
      : editing
        ? editing.type === 'one-off'
          ? (editing.date ?? initialDate)
          : (editing.startDate ?? initialDate)
        : initialDate,
  );
  // An existing repeating event with no start date keeps having none unless the
  // date is actually changed here (the field shows the clicked occurrence instead).
  const [dateTouched, setDateTouched] = useState(false);
  const [startTime, setStartTime] = useState(firstStart);
  const [endTime, setEndTime] = useState<string | null>(shown ? shown.endTime : hourAfter(firstStart));
  const [days, setDays] = useState<number[]>(editing?.days ?? []);
  const [until, setUntil] = useState<string | null>(editing?.endDate ?? null);
  const [reminder, setReminder] = useState<number | null>(shown?.reminderMinutesBefore ?? null);
  const [color, setColor] = useState<EventColor>(shown?.color ?? 'accent');
  const [location, setLocation] = useState(shown?.location ?? '');
  const [note, setNote] = useState(shown?.note ?? '');
  // The question over the footer, for an occurrence of a series.
  const [question, setQuestion] = useState<'save' | 'delete' | null>(null);
  // What the sheet opened with, to tell what was changed.
  const opened = useRef({ title: shown?.title ?? '', date, startTime: firstStart, endTime, days, until, reminder, color, location, note }).current;
  const [noteHeight, setNoteHeight] = useState(0);
  const [picker, setPicker] = useState<Picker | null>(null);

  const repeats = days.length > 0;
  const startValid = isTimeKey(startTime);
  const endValid = endTime === null || (isTimeKey(endTime) && startValid && minutesOf(endTime) > minutesOf(startTime));
  const untilValid = !repeats || until === null || until >= date;
  const canSave = title.trim() !== '' && startValid && endValid && untilValid;

  const pickDate = (day: string) => {
    setDate(day);
    setDateTouched(true);
  };

  // Moving the start keeps the length, the way calendar apps do.
  const changeStart = (next: string) => {
    if (endTime && isTimeKey(endTime) && startValid) {
      const end = minutesOf(next) + (minutesOf(endTime) - minutesOf(startTime));
      setEndTime(end < DAY_MINUTES ? timeFromMinutes(end) : null);
    }
    setStartTime(next);
  };

  const lastMove = useRef(moveTo?.n);
  useEffect(() => {
    if (!moveTo || moveTo.n === lastMove.current) return;
    lastMove.current = moveTo.n;
    pickDate(moveTo.date);
    changeStart(moveTo.startTime);
    setPicker(null);
  }, [moveTo]); // eslint-disable-line react-hooks/exhaustive-deps -- only a new click should move it

  const draftListener = useRef(onDraftChange);
  draftListener.current = onDraftChange;
  useEffect(() => {
    draftListener.current?.({ title, date, startTime, endTime, days, until });
  }, [title, date, startTime, endTime, days, until]);

  const detailsNow = { title: title.trim(), location: location.trim(), note: note.trim(), color, reminderMinutesBefore: reminder };
  const changedDetails = (Object.keys(detailsNow) as (keyof typeof detailsNow)[]).filter((k) => {
    const before = { title: opened.title.trim(), location: opened.location.trim(), note: opened.note.trim(), color: opened.color, reminderMinutesBefore: opened.reminder };
    return detailsNow[k] !== before[k];
  });
  const sameDays = days.length === opened.days.length && days.every((d) => opened.days.includes(d));
  const repeatChanged = !sameDays || until !== opened.until;
  const anythingChanged =
    changedDetails.length > 0 || date !== opened.date || startTime !== opened.startTime || endTime !== opened.endTime || repeatChanged;

  // Saving an occurrence of a series asks first — unless nothing changed. A change to
  // the repeat itself can only apply to the whole series, so it offers just that.
  const saveOccurrence = (scope: SeriesScope) => {
    setQuestion(null);
    if (!repeats) {
      // Repeat switched off: the whole series becomes this one event.
      save(true);
      return;
    }
    onSaveOccurrence?.(
      {
        date,
        startTime,
        endTime,
        details: detailsNow,
        changed: {
          date: date !== opened.date,
          times: startTime !== opened.startTime || endTime !== opened.endTime,
          details: changedDetails,
          repeat: repeatChanged,
        },
        days,
        until,
      },
      scope,
    );
  };

  const save = (force = false) => {
    if (!canSave) return;
    if (inSeries && !force) {
      if (!anythingChanged) onClose();
      else setQuestion('save');
      return;
    }
    onSave({
      title: title.trim(),
      type: repeats ? 'recurring' : 'one-off',
      days: repeats ? days : [],
      date: repeats ? null : date,
      startDate: repeats ? (editing?.type === 'recurring' && !dateTouched ? editing.startDate : date) : null,
      endDate: repeats ? until : null,
      startTime,
      endTime,
      color,
      location,
      note,
      reminderMinutesBefore: reminder,
    });
  };

  const confirmDelete = () => {
    if (inSeries) {
      setQuestion('delete');
      return;
    }
    if (!onDelete) return;
    confirmDestructive({ title: `Delete "${title.trim() || 'this event'}"?`, confirmLabel: 'Delete', onConfirm: onDelete });
  };

  const answer = (scope: SeriesScope | null) => {
    const asked = question;
    setQuestion(null);
    if (!scope) return;
    if (asked === 'delete') onDeleteOccurrence?.(scope);
    else saveOccurrence(scope);
  };

  // Esc closes an open picker first, then the sheet; Cmd/Ctrl+Enter saves. The
  // handler reads through a ref so it's registered once but always sees fresh state.
  // It listens in the capture phase: react-native-web's TextInput stops every keydown
  // from bubbling, and focus is almost always in one of the sheet's fields.
  const keys = useRef({ save, onClose, picker, setPicker, question, setQuestion });
  keys.current = { save, onClose, picker, setPicker, question, setQuestion };
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (keys.current.question) keys.current.setQuestion(null);
        else if (keys.current.picker) keys.current.setPicker(null);
        else keys.current.onClose();
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (!keys.current.question) keys.current.save();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const toggle = (which: Picker) => setPicker((open) => (open === which ? null : which));
  const toggleDay = (value: number) =>
    setDays((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort((a, b) => a - b)));

  const startOptions = Array.from({ length: DAY_MINUTES / STEP_MINUTES }, (_, i) => ({
    time: timeFromMinutes(i * STEP_MINUTES),
  }));
  const endOptions = startValid
    ? Array.from({ length: DAY_MINUTES / STEP_MINUTES }, (_, i) => (i + 1) * STEP_MINUTES + minutesOf(startTime))
        .filter((m) => m < DAY_MINUTES)
        .map((m) => ({ time: timeFromMinutes(m), hint: formatDuration(m - minutesOf(startTime)) }))
    : [];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={type.label}>{editing ? 'Edit event' : 'New event'}</Text>
        <IconButton icon="close" label="Close" onPress={onClose} color={colors.text} />
      </View>
      {inSeries ? (
        <View style={[styles.seriesNote, { backgroundColor: rgba(accent.accent, 0.08) }]} accessibilityRole="text">
          <Ionicons name="repeat" size={14} color={accent.accent} />
          <Text style={[type.body, styles.seriesNoteText]} numberOfLines={2}>
            Repeating event · every {describeWeekdays(editing.days)}
            {occurrence.changed ? ' · changed for this day' : ''}
          </Text>
        </View>
      ) : null}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextInput
          style={[type.display, styles.title, { borderBottomColor: accent.accent }, noOutline]}
          value={title}
          onChangeText={setTitle}
          placeholder="Add title"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearance}
          autoFocus
          accessibilityLabel="Event title"
        />

        <Field label="When">
          <View style={styles.whenRow}>
            <PillButton
              label={formatDayKey(date, todayKey)}
              active={picker === 'date'}
              onPress={() => toggle('date')}
              accessibilityLabel="Date"
            />
            <PillButton
              label={startTime || '--:--'}
              active={picker === 'start'}
              invalid={!startValid}
              onPress={() => toggle('start')}
              accessibilityLabel="Start time"
            />
            <Text style={[type.body, styles.dash]}>–</Text>
            <PillButton
              label={endTime ?? 'No end'}
              active={picker === 'end'}
              invalid={!endValid}
              onPress={() => toggle('end')}
              accessibilityLabel="End time"
            />
          </View>
          {picker === 'date' ? (
            <View style={styles.pickerPanel}>
              <MiniMonth
                anchor={date}
                todayKey={todayKey}
                onSelect={(day) => {
                  pickDate(day);
                  setPicker(null);
                }}
              />
            </View>
          ) : null}
          {picker === 'start' ? (
            <TimeList
              value={startTime}
              options={startOptions}
              onPick={(t) => {
                if (t) changeStart(t); // the start list has no "no time" row
                setPicker(null);
              }}
            />
          ) : null}
          {picker === 'end' ? (
            <TimeList
              value={endTime}
              options={endOptions}
              noEnd
              minMinutes={startValid ? minutesOf(startTime) + 1 : 0}
              onPick={(t) => {
                setEndTime(t);
                setPicker(null);
              }}
            />
          ) : null}
        </Field>

        <Field label="Repeats on">
          <View style={styles.weekdays} accessibilityRole="none">
            {WEEKDAYS.map(({ value, letter, name }) => {
              const on = days.includes(value);
              return (
                <Pressable
                  key={value}
                  onPress={() => toggleDay(value)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  aria-checked={on}
                  accessibilityLabel={`Repeat on ${name}`}
                  style={(s) => [styles.weekday, on && styles.weekdayOn, on ? hoverDim(s) : hoverFill(s)]}
                >
                  <Text style={[type.bodyStrong, styles.weekdayText, on && styles.weekdayTextOn]}>{letter}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[type.body, styles.hint]}>
            {!repeats
              ? 'One-off event'
              : inSeries
                ? // The date above is this occurrence's day, not when the series began.
                  `Every ${describeWeekdays(days)}${editing.startDate ? `, from ${formatDayKey(editing.startDate, todayKey)}` : ''}`
                : `Every ${describeWeekdays(days)}, from ${formatDayKey(date, todayKey)}`}
          </Text>

          {repeats ? (
            <View style={styles.untilRow}>
              <Text style={[type.body, styles.untilLabel]}>Until</Text>
              <PillButton
                label={until ? formatDayKey(until, todayKey) : 'Forever'}
                active={picker === 'until' || picker === 'untilDate'}
                invalid={!untilValid}
                icon="chevron-down"
                onPress={() => toggle('until')}
                accessibilityLabel="Repeat until"
              />
            </View>
          ) : null}
          {repeats && picker === 'until' ? (
            <View style={styles.menu}>
              <MenuRow label="Forever" selected={until === null} onPress={() => (setUntil(null), setPicker(null))} />
              <MenuRow
                label="End of this week"
                hint={formatDayKey(endOfWeek(date), todayKey)}
                selected={until !== null && until === endOfWeek(date)}
                onPress={() => (setUntil(endOfWeek(date)), setPicker(null))}
              />
              <MenuRow
                label="End of this month"
                hint={formatDayKey(endOfMonth(date), todayKey)}
                selected={until !== null && until === endOfMonth(date) && until !== endOfWeek(date)}
                onPress={() => (setUntil(endOfMonth(date)), setPicker(null))}
              />
              <MenuRow label="Pick a date…" onPress={() => setPicker('untilDate')} />
            </View>
          ) : null}
          {repeats && picker === 'untilDate' ? (
            <View style={styles.pickerPanel}>
              <MiniMonth
                anchor={until ?? date}
                todayKey={todayKey}
                onSelect={(day) => {
                  setUntil(day);
                  setPicker(null);
                }}
              />
            </View>
          ) : null}
          {!untilValid ? <Text style={[type.body, styles.error]}>Ends before it starts.</Text> : null}
        </Field>

        <Field label="Remind me">
          <Segmented
            options={REMINDERS}
            value={reminder === null ? 'off' : (String(reminder) as (typeof REMINDERS)[number]['value'])}
            onChange={(v) => setReminder(v === 'off' ? null : Number(v))}
            describe={(o) => (o.value === 'off' ? 'No reminder' : `Remind me ${o.label} before`)}
          />
        </Field>

        <Field label="Colour">
          <View style={styles.colors} accessibilityRole="radiogroup">
            {EVENT_COLORS.map((option) => {
              const selected = option === color;
              return (
                <Pressable
                  key={option}
                  onPress={() => setColor(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  aria-checked={selected}
                  accessibilityLabel={COLOR_NAMES[option]}
                  style={(s) => [styles.colorRing, selected && styles.colorRingOn, hoverDim(s)]}
                >
                  <View style={[styles.colorDot, { backgroundColor: eventColorDot(option, accent) }]} />
                </Pressable>
              );
            })}
          </View>
        </Field>

        <View style={styles.lineRow}>
          <Ionicons name="location-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={[type.body, styles.lineInput, noOutline]}
            value={location}
            onChangeText={setLocation}
            placeholder="Location"
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={keyboardAppearance}
            accessibilityLabel="Location"
          />
        </View>
        <View style={styles.lineRow}>
          <Ionicons name="document-text-outline" size={18} color={colors.textMuted} style={styles.noteIcon} />
          {/* One line to look at, but it grows and keeps line breaks, so a longer
              note written elsewhere isn't flattened by editing it here. */}
          <TextInput
            style={[type.body, styles.lineInput, noOutline, noteHeight ? { height: noteHeight } : null]}
            value={note}
            onChangeText={setNote}
            onContentSizeChange={(e) => setNoteHeight(e.nativeEvent.contentSize.height)}
            placeholder="Note"
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={keyboardAppearance}
            multiline
            numberOfLines={1}
            accessibilityLabel="Note"
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {editing && onDelete ? (
          <TextButton label="Delete" color={colors.deadlineRed} onPress={confirmDelete} />
        ) : null}
        <View style={styles.footerSpacer} />
        <TextButton label="Cancel" color={colors.textMuted} onPress={onClose} />
        <Button label="Save event" onPress={() => save()} disabled={!canSave} />
      </View>

      {question ? (
        <>
          <Pressable style={styles.questionBackdrop} onPress={() => answer(null)} accessibilityLabel="Cancel" />
          <SeriesChoiceCard
            title={question === 'delete' ? 'Delete repeating event' : 'Change repeating event'}
            subtitle={title.trim() || opened.title}
            onlyThis={question === 'delete' || !repeatChanged}
            note={question === 'save' && repeatChanged ? 'A change to how it repeats applies to the whole series.' : undefined}
            onChoose={answer}
            style={styles.question}
          />
        </>
      ) : null}
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const type = useType();
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      {children}
    </View>
  );
}

function PillButton({
  label,
  active,
  invalid,
  icon,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  active?: boolean;
  invalid?: boolean;
  icon?: IconName;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const type = useType();
  const accent = useAccent();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}: ${label}`}
      accessibilityState={{ expanded: !!active }}
      style={(s) => [
        styles.pill,
        active && { borderColor: accent.accent },
        invalid && styles.pillInvalid,
        hoverFill(s),
      ]}
    >
      <Text style={[type.body, styles.pillText, invalid && { color: colors.deadlineRed }]}>{label}</Text>
      {icon ? <Ionicons name={icon} size={13} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

function TextButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  const type = useType();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(s) => [styles.textButton, hoverFill(s)]}
    >
      <Text style={[type.bodyStrong, { color, fontSize: 14 }]}>{label}</Text>
    </Pressable>
  );
}

function MenuRow({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const type = useType();
  const accent = useAccent();
  return (
    <Pressable onPress={onPress} accessibilityRole="menuitem" accessibilityLabel={label} style={(s) => [styles.menuRow, hoverFill(s)]}>
      <Text style={[selected ? type.bodyStrong : type.body, styles.menuText, selected && { color: accent.accent }]}>
        {label}
      </Text>
      {hint ? <Text style={[type.body, styles.menuHint]}>{hint}</Text> : null}
    </Pressable>
  );
}

// A 15-minute list with a type-in box on top, for times that aren't on the list.
function TimeList({
  value,
  options,
  noEnd,
  minMinutes = 0,
  onPick,
}: {
  value: string | null;
  options: { time: string; hint?: string }[];
  noEnd?: boolean;
  minMinutes?: number;
  onPick: (time: string | null) => void;
}) {
  const type = useType();
  const accent = useAccent();
  const listRef = useRef<ScrollView>(null);
  const [typed, setTyped] = useState('');
  const typedValid = isTimeKey(typed) && minutesOf(typed) >= minMinutes;

  // Open with the current time (or the nearest one after it) in view.
  useEffect(() => {
    if (!value) return;
    const index = options.findIndex((o) => o.time >= value);
    if (index > 0) listRef.current?.scrollTo({ y: Math.max(0, index - 2) * TIME_ROW_HEIGHT, animated: false });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on open

  return (
    <View style={styles.menu}>
      <TextInput
        style={[type.body, styles.typeIn, noOutline, typed !== '' && !typedValid && { borderBottomColor: colors.deadlineRed }]}
        value={typed}
        onChangeText={(t) => setTyped(sanitizeTimeInput(t))}
        onSubmitEditing={() => typedValid && onPick(typed)}
        placeholder="Type a time, e.g. 09:40"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        keyboardAppearance={keyboardAppearance}
        autoFocus
        accessibilityLabel="Type a time"
      />
      <ScrollView ref={listRef} style={styles.timeScroll} keyboardShouldPersistTaps="handled">
        {noEnd ? (
          <MenuRow label="No end time" selected={value === null} onPress={() => onPick(null)} />
        ) : null}
        {options.map((o) => {
          const selected = o.time === value;
          return (
            <Pressable
              key={o.time}
              onPress={() => onPick(o.time)}
              accessibilityRole="menuitem"
              accessibilityLabel={o.time}
              style={(s) => [styles.timeRow, hoverFill(s)]}
            >
              <Text style={[selected ? type.bodyStrong : type.body, styles.timeText, selected && { color: accent.accent }]}>
                {o.time}
              </Text>
              {o.hint ? <Text style={[type.body, styles.menuHint]}>{o.hint}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  scroll: { flex: 1 },
  body: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.xl },

  title: {
    fontSize: 28,
    lineHeight: 36,
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderBottomWidth: 2,
    color: colors.text,
    backgroundColor: 'transparent',
  },

  field: { gap: spacing.sm },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  dash: { color: colors.textMuted },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: sizes.controlSm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillInvalid: { borderColor: colors.deadlineRed },
  pillText: { fontSize: 14, fontVariant: ['tabular-nums'] },
  pickerPanel: {
    padding: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },

  weekdays: { flexDirection: 'row', gap: 6 },
  weekday: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayOn: { backgroundColor: colors.text, borderColor: colors.text },
  weekdayText: { fontSize: 13 },
  weekdayTextOn: { color: colors.surface },
  hint: { fontSize: 13, color: colors.textMuted },
  untilRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  untilLabel: { fontSize: 14, color: colors.textMuted },
  error: { fontSize: 13, color: colors.deadlineRed },

  menu: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TIME_ROW_HEIGHT,
    paddingHorizontal: spacing.md,
  },
  menuText: { fontSize: 14 },
  menuHint: { fontSize: 13, color: colors.textMuted },
  typeIn: {
    marginHorizontal: spacing.md,
    marginBottom: 4,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    fontSize: 14,
    color: colors.text,
  },
  timeScroll: { maxHeight: TIME_ROW_HEIGHT * 6 },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: TIME_ROW_HEIGHT,
    paddingHorizontal: spacing.md,
  },
  timeText: { fontSize: 14, fontVariant: ['tabular-nums'] },

  colors: { flexDirection: 'row', gap: spacing.sm },
  colorRing: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorRingOn: { borderColor: colors.text },
  colorDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: rgba(colors.text, 0.12) },

  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginTop: -spacing.md,
  },
  noteIcon: { marginTop: 2 },
  lineInput: { flex: 1, minWidth: 0, padding: 0, fontSize: 15, color: colors.text, backgroundColor: 'transparent' },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerSpacer: { flex: 1 },
  seriesNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.control,
  },
  seriesNoteText: { flex: 1, fontSize: 13, color: colors.text },
  questionBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.04)' },
  question: { position: 'absolute', right: spacing.xl, bottom: 76 },
  textButton: { paddingHorizontal: spacing.md, height: sizes.controlSm, justifyContent: 'center', borderRadius: radius.control },
});
