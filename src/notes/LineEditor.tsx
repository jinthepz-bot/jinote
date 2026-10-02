import Ionicons from '@expo/vector-icons/Ionicons';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextStyle,
} from 'react-native';

import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { hoverDim } from '../design/hover';
import { colors, keyboardAppearance, radius } from '../design/theme';
import { continuation, parseLine, toggleTodoLine } from './lines';

// The body of a quick note on the desktop page, edited line by line. Every line is
// drawn with its formatting (see notes/lines.ts) except the one with the cursor,
// which is a plain text field showing exactly what's typed. It's still one text
// value underneath: lines joined with "\n".
//
// Typing only re-renders the line being edited (rows are memoised by their text),
// and saving is the parent's job, debounced — so long notes stay quick.

const LINE_HEIGHT = 28;
const noOutline = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

export const CALLOUT_TINT = '#F8EBD8';

interface Row {
  id: number;
  text: string;
}

export interface LineEditorHandle {
  // From the title: Return there moves what's after the cursor onto a new first line.
  insertFirstLine: (text: string) => void;
}

interface Props {
  initial: string;
  onChange: (body: string) => void;
  onBlurAll: () => void; // the cursor has left the body
  onMergeIntoTitle: (text: string) => void; // Backspace at the very start of the body
  onUpFromTop: () => void; // ArrowUp on the first line
}

let nextRowId = 1;
const toRows = (text: string): Row[] => text.split('\n').map((t) => ({ id: nextRowId++, text: t }));

export const LineEditor = forwardRef<LineEditorHandle, Props>(function LineEditor(
  { initial, onChange, onBlurAll, onMergeIntoTitle, onUpFromTop },
  ref,
) {
  const [rows, setRows] = useState<Row[]>(() => toRows(initial));
  const [active, setActive] = useState<number | null>(null); // row id
  const caret = useRef<{ id: number; pos: number } | null>(null);
  const activeRef = useRef<number | null>(null);
  activeRef.current = active;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const commit = useCallback((next: Row[]) => {
    rowsRef.current = next;
    setRows(next);
    onChangeRef.current(next.map((r) => r.text).join('\n'));
  }, []);

  const focusRow = useCallback((id: number, pos: number) => {
    caret.current = { id, pos };
    activeRef.current = id;
    setActive(id);
  }, []);

  useImperativeHandle(ref, () => ({
    insertFirstLine: (text: string) => {
      const row = { id: nextRowId++, text };
      const current = rowsRef.current;
      // An empty body is one empty line; fill it rather than add a second.
      const next = current.length === 1 && current[0].text === '' ? [row] : [row, ...current];
      commit(next);
      focusRow(row.id, 0);
    },
  }));

  const activate = useCallback((id: number, pos?: number) => {
    const row = rowsRef.current.find((r) => r.id === id);
    focusRow(id, pos ?? row?.text.length ?? 0);
  }, [focusRow]);

  const toggle = useCallback(
    (id: number) => commit(rowsRef.current.map((r) => (r.id === id ? { ...r, text: toggleTodoLine(r.text) } : r))),
    [commit],
  );

  const changeActive = useCallback(
    (id: number, text: string, selectionEnd: number) => {
      const current = rowsRef.current;
      const i = current.findIndex((r) => r.id === id);
      if (i === -1) return;
      if (!text.includes('\n')) {
        commit(current.map((r) => (r.id === id ? { ...r, text } : r)));
        return;
      }
      // A paste (or a newline from anywhere else): one row per line, cursor at the
      // end of what was pasted.
      const parts = text.split('\n');
      const newRows = parts.map((t, k) => (k === 0 ? { id, text: t } : { id: nextRowId++, text: t }));
      commit([...current.slice(0, i), ...newRows, ...current.slice(i + 1)]);
      const last = newRows[newRows.length - 1];
      const tailLength = text.length - selectionEnd;
      focusRow(last.id, Math.max(0, last.text.length - tailLength));
    },
    [commit, focusRow],
  );

  // Return: split at the cursor. A bullet or tick box carries on to the next line;
  // Return on an empty one ends the list instead.
  const split = useCallback(
    (id: number, pos: number) => {
      const current = rowsRef.current;
      const i = current.findIndex((r) => r.id === id);
      const text = current[i].text;
      const parsed = parseLine(text);
      if ((parsed.kind === 'bullet' || parsed.kind === 'todo') && parsed.content.trim() === '') {
        commit(current.map((r) => (r.id === id ? { ...r, text: '' } : r)));
        focusRow(id, 0);
        return;
      }
      const carry = pos >= parsed.prefix.length ? continuation(text) : '';
      const row = { id: nextRowId++, text: carry + text.slice(pos) };
      commit([...current.slice(0, i), { id, text: text.slice(0, pos) }, row, ...current.slice(i + 1)]);
      focusRow(row.id, carry.length);
    },
    [commit, focusRow],
  );

  const mergeUp = useCallback(
    (id: number) => {
      const current = rowsRef.current;
      const i = current.findIndex((r) => r.id === id);
      if (i === 0) {
        commit(current.length === 1 ? [{ id, text: '' }] : current.slice(1));
        onMergeIntoTitle(current[0].text);
        return;
      }
      const prev = current[i - 1];
      commit([...current.slice(0, i - 1), { id: prev.id, text: prev.text + current[i].text }, ...current.slice(i + 1)]);
      focusRow(prev.id, prev.text.length);
    },
    [commit, focusRow, onMergeIntoTitle],
  );

  const mergeDown = useCallback(
    (id: number) => {
      const current = rowsRef.current;
      const i = current.findIndex((r) => r.id === id);
      if (i === current.length - 1) return;
      const here = current[i];
      commit([...current.slice(0, i), { id, text: here.text + current[i + 1].text }, ...current.slice(i + 2)]);
      focusRow(id, here.text.length);
    },
    [commit, focusRow],
  );

  const move = useCallback(
    (id: number, delta: -1 | 1, column: number) => {
      const current = rowsRef.current;
      const i = current.findIndex((r) => r.id === id);
      const target = current[i + delta];
      if (!target) {
        if (delta === -1) onUpFromTop();
        return;
      }
      focusRow(target.id, Math.min(column, target.text.length));
    },
    [focusRow, onUpFromTop],
  );

  const blurred = useCallback(
    (id: number) => {
      // Moving between lines blurs one field and focuses the next, in either order
      // relative to this check — so it only counts as leaving the body if the line
      // that lost focus is still the active one a moment later.
      setTimeout(() => {
        if (activeRef.current !== id) return;
        activeRef.current = null;
        setActive(null);
        onBlurAll();
      }, 0);
    },
    [onBlurAll],
  );

  const lastId = rows[rows.length - 1].id;

  return (
    <View style={styles.root}>
      {rows.map((row) =>
        row.id === active ? (
          <ActiveLine
            key={row.id}
            row={row}
            caret={caret}
            onChange={changeActive}
            onSplit={split}
            onMergeUp={mergeUp}
            onMergeDown={mergeDown}
            onMove={move}
            onBlur={blurred}
          />
        ) : (
          <FormattedLine key={row.id} id={row.id} text={row.text} onActivate={activate} onToggle={toggle} />
        ),
      )}
      {/* The space under the last line: clicking it carries on writing at the end. */}
      <Pressable
        onPress={() => activate(lastId)}
        style={[styles.tail, styles.textCursor]}
        accessibilityLabel="Keep writing"
        // Not a button for screen readers: the lines themselves are the way in.
        accessibilityRole="none"
      >
        {rows.length === 1 && rows[0].text === '' && active === null ? (
          <Text style={styles.placeholder}>Keep writing… # heading, - bullet, [ ] to-do, &gt; callout</Text>
        ) : null}
      </Pressable>
    </View>
  );
});

// --- one line, formatted

// Where in a line's visible text a click landed, so the cursor goes there rather
// than to the end. Web only; elsewhere the end of the line.
function clickOffset(node: unknown, e: GestureResponderEvent): number | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  const el = node as HTMLElement | null;
  const ne = e.nativeEvent as unknown as { pageX?: number; pageY?: number; clientX?: number; clientY?: number };
  const x = ne.clientX ?? ne.pageX;
  const y = ne.clientY ?? ne.pageY;
  const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
  if (!el || x === undefined || y === undefined || !doc.caretRangeFromPoint) return null;
  const range = doc.caretRangeFromPoint(x, y);
  if (!range || !el.contains(range.startContainer)) return null;
  let offset = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node === range.startContainer) return offset + range.startOffset;
    offset += node.textContent?.length ?? 0;
  }
  return null;
}

const FormattedLine = memo(function FormattedLine({
  id,
  text,
  onActivate,
  onToggle,
}: {
  id: number;
  text: string;
  onActivate: (id: number, pos?: number) => void;
  onToggle: (id: number) => void;
}) {
  const type = useType();
  const accent = useAccent();
  const contentRef = useRef<Text>(null);
  const line = parseLine(text);

  const press = (e: GestureResponderEvent) => {
    const offset = clickOffset(contentRef.current, e);
    onActivate(id, offset === null ? undefined : line.prefix.length + offset);
  };

  const content = (style: TextStyle | TextStyle[], extra?: TextStyle) => (
    <Text ref={contentRef} style={[style, extra]}>
      {line.content === '' ? ' ' : line.content}
    </Text>
  );

  let body: ReactNode;
  if (line.kind === 'heading') body = content([type.display, styles.heading]);
  else if (line.kind === 'bullet')
    body = (
      <View style={styles.marked}>
        <Text style={[type.body, styles.text, styles.bullet]}>•</Text>
        <View style={styles.flex}>{content([type.body, styles.text])}</View>
      </View>
    );
  else if (line.kind === 'todo')
    body = (
      <View style={styles.marked}>
        <Pressable
          onPress={() => onToggle(id)}
          hitSlop={6}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: line.done }}
          aria-checked={line.done}
          accessibilityLabel={line.content.trim() || 'To-do'}
          style={(s) => [styles.tick, line.done && { backgroundColor: colors.goalGreen, borderColor: colors.goalGreen }, hoverDim(s)]}
        >
          {line.done ? <Ionicons name="checkmark" size={13} color={colors.surface} /> : null}
        </Pressable>
        <View style={styles.flex}>{content([type.body, styles.text], line.done ? styles.done : undefined)}</View>
      </View>
    );
  else if (line.kind === 'callout')
    body = (
      <View style={[styles.callout, { borderLeftColor: accent.accent }]}>{content([type.body, styles.text])}</View>
    );
  else body = content([type.body, styles.text]);

  return (
    <Pressable onPress={press} style={styles.textCursor} accessibilityRole="none">
      {body}
    </Pressable>
  );
});

// --- the line being edited

const ActiveLine = memo(function ActiveLine({
  row,
  caret,
  onChange,
  onSplit,
  onMergeUp,
  onMergeDown,
  onMove,
  onBlur,
}: {
  row: Row;
  caret: { current: { id: number; pos: number } | null };
  onChange: (id: number, text: string, selectionEnd: number) => void;
  onSplit: (id: number, pos: number) => void;
  onMergeUp: (id: number) => void;
  onMergeDown: (id: number) => void;
  onMove: (id: number, delta: -1 | 1, column: number) => void;
  onBlur: (id: number) => void;
}) {
  const type = useType();
  const accent = useAccent();
  const inputRef = useRef<TextInput>(null);
  const selection = useRef({ start: row.text.length, end: row.text.length });
  const [height, setHeight] = useState(LINE_HEIGHT);
  const line = parseLine(row.text);

  // Focus and place the cursor whenever this row is (re)activated.
  useEffect(() => {
    const want = caret.current;
    if (!want || want.id !== row.id) return;
    caret.current = null;
    const input = inputRef.current as (TextInput & { setSelectionRange?: (s: number, e: number) => void }) | null;
    input?.focus();
    if (input?.setSelectionRange) input.setSelectionRange(want.pos, want.pos);
    else input?.setSelection(want.pos, want.pos);
    selection.current = { start: want.pos, end: want.pos };
  });

  const keyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const key = e.nativeEvent.key;
    const { start, end } = selection.current;
    const collapsed = start === end;
    const singleRow = height < LINE_HEIGHT * 1.6;
    const stop = () => (e as unknown as { preventDefault?: () => void }).preventDefault?.();
    if (key === 'Enter' && !(e.nativeEvent as { shiftKey?: boolean }).shiftKey) {
      stop();
      onSplit(row.id, start);
    } else if (key === 'Backspace' && collapsed && start === 0) {
      stop();
      onMergeUp(row.id);
    } else if (key === 'Delete' && collapsed && start === row.text.length) {
      stop();
      onMergeDown(row.id);
    } else if (key === 'ArrowUp' && (singleRow || start === 0)) {
      stop();
      onMove(row.id, -1, start);
    } else if (key === 'ArrowDown' && (singleRow || end === row.text.length)) {
      stop();
      onMove(row.id, 1, start);
    }
  };

  const style: (TextStyle | false)[] =
    line.kind === 'heading' ? [type.display, styles.heading] : [type.body, styles.text];

  const input = (
    <TextInput
      ref={inputRef}
      style={[...style, styles.input, noOutline, { height: Math.max(LINE_HEIGHT, height) }]}
      value={row.text}
      onChangeText={(text) => onChange(row.id, text, selection.current.end + (text.length - row.text.length))}
      onSelectionChange={(e) => {
        selection.current = e.nativeEvent.selection;
      }}
      onKeyPress={keyPress}
      onContentSizeChange={(e) => setHeight(e.nativeEvent.contentSize.height)}
      onBlur={() => onBlur(row.id)}
      multiline
      // One row to start from (a browser textarea defaults to two).
      numberOfLines={1}
      keyboardAppearance={keyboardAppearance}
      accessibilityLabel="Note line"
    />
  );

  return line.kind === 'callout' ? (
    <View style={[styles.callout, { borderLeftColor: accent.accent }]}>{input}</View>
  ) : (
    input
  );
});

const styles = StyleSheet.create({
  root: { gap: 2 },
  flex: { flex: 1, minWidth: 0 },
  text: { fontSize: 17, lineHeight: LINE_HEIGHT, color: colors.text },
  heading: { fontSize: 26, lineHeight: 34, marginTop: 10 },
  input: { padding: 0, borderWidth: 0, backgroundColor: 'transparent', color: colors.text },
  marked: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: { width: 12, textAlign: 'center', color: colors.textMuted },
  tick: {
    width: 18,
    height: 18,
    marginTop: (LINE_HEIGHT - 18) / 2,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: { color: colors.textMuted, textDecorationLine: 'line-through' },
  callout: {
    backgroundColor: CALLOUT_TINT,
    borderLeftWidth: 3,
    borderRadius: radius.square,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginVertical: 2,
  },
  textCursor: { cursor: 'text' } as object,
  tail: { minHeight: 160 },
  placeholder: { fontSize: 17, lineHeight: LINE_HEIGHT, color: colors.textMuted },
});
