import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';

import { useAccent } from '../design/accent';
import { confirmDestructive } from '../design/confirm';
import { useType } from '../design/fonts';
import { hoverDim, hoverFill } from '../design/hover';
import { colors, keyboardAppearance, radius, sizes, spacing } from '../design/theme';
import { Button, Checkbox, IconButton, RowIconButton } from '../design/ui';
import { editedAgo, joinQuickNote, noteTitle, SECTION_LABELS, splitQuickNote } from './format';
import { deleteNotePhoto } from './photos';
import {
  addChecklistItem,
  deleteChecklistItem,
  deleteNote,
  setPinned,
  toggleChecklistItem,
  updateQuickNote,
  useNotes,
  type ChecklistNote,
  type NoteType,
  type QuickNote,
  type RecipeNote,
} from './store';

const PAGE_WIDTH = 640;
// Borderless editing: the page is the field, so the browser's focus ring would just
// be a box around the text. Chrome draws an `auto` ring whatever its width, so the
// style has to be switched off too — 'none' is a web value React Native's types don't
// list, hence the cast; native platforms have no focus ring to remove.
const noOutline = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

// "Edited 5 minutes ago" has to keep moving while the page sits open.
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

interface Props {
  noteId: string;
  // Back to the Journal list: with a type, filtered to that kind of note.
  onBack: (section?: NoteType) => void;
}

// One note as a page to read and write in (desktop Journal). The list still lives
// on the Journal screen; this replaces it while a note is open.
export function NotePage({ noteId, onBack }: Props) {
  const type = useType();
  const now = useNow();
  const { state, loaded } = useNotes();
  const note = state.notes.find((n) => n.id === noteId);

  if (!loaded) return <View style={styles.root} />;

  if (!note) {
    return (
      <View style={[styles.root, styles.missing]}>
        <Text style={[type.body, styles.muted]}>This note doesn't exist any more.</Text>
        <Button label="Back to Journal" variant="secondary" onPress={() => onBack()} />
      </View>
    );
  }

  const title = noteTitle(note);
  const pinned = note.pinnedAt !== null;

  const confirmDelete = () =>
    confirmDestructive({
      title: `Delete "${title}"?`,
      message: note.type === 'recipe' && note.photoUri ? 'Its photo is deleted too.' : undefined,
      confirmLabel: 'Delete',
      onConfirm: () => {
        if (note.type === 'recipe') deleteNotePhoto(note.photoUri);
        deleteNote(note.id);
        onBack(note.type);
      },
    });

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.page}>
          <View style={styles.topRow}>
            <View style={styles.crumbs} role="navigation" accessibilityLabel="Breadcrumb">
              <Crumb label="Journal" onPress={() => onBack()} />
              <Text style={[type.body, styles.crumbSep]}>/</Text>
              <Crumb label={SECTION_LABELS[note.type]} onPress={() => onBack(note.type)} />
              <Text style={[type.body, styles.crumbSep]}>/</Text>
              <Text style={[type.body, styles.crumbCurrent]} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <Text style={[type.body, styles.edited]} numberOfLines={1}>
              {editedAgo(note.updatedAt, now)}
            </Text>
            <Pressable
              onPress={() => setPinned(note.id, !pinned)}
              accessibilityRole="button"
              accessibilityLabel={pinned ? 'Unpin note' : 'Pin note'}
              accessibilityState={{ selected: pinned }}
              style={(s) => [styles.pin, pinned && styles.pinOn, hoverFill(s)]}
            >
              <Ionicons name={pinned ? 'pin' : 'pin-outline'} size={15} color={colors.text} />
              <Text style={[type.bodyStrong, styles.pinText]}>{pinned ? 'Pinned' : 'Pin'}</Text>
            </Pressable>
            <IconButton icon="trash-outline" label={`Delete "${title}"`} onPress={confirmDelete} />
          </View>

          {note.type === 'quick' ? (
            <QuickNoteEditor key={note.id} note={note} />
          ) : note.type === 'checklist' ? (
            <ChecklistBody note={note} />
          ) : (
            <RecipeBody note={note} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Crumb({ label, onPress }: { label: string; onPress: () => void }) {
  const type = useType();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`Back to ${label}`}
      style={(s) => [styles.crumb, hoverFill(s)]}
    >
      <Text style={[type.body, styles.crumbText]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// A quick note is written straight into the page: the first line is the title, the
// rest the body, saved as the one text field the note has always had. Local state
// holds what's being typed, so a save never moves the cursor.
function QuickNoteEditor({ note }: { note: QuickNote }) {
  const type = useType();
  const initial = splitQuickNote(note.text);
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [titleHeight, setTitleHeight] = useState(0);
  const [bodyHeight, setBodyHeight] = useState(0);
  const bodyRef = useRef<TextInput>(null);
  // Where to put the caret in the body once a title split has been rendered.
  const pendingCaret = useRef<number | null>(null);

  useEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null) return;
    pendingCaret.current = null;
    const input = bodyRef.current as (TextInput & {
      setSelectionRange?: (start: number, end: number) => void; // web: the DOM textarea
    }) | null;
    input?.focus();
    if (input?.setSelectionRange) input.setSelectionRange(caret, caret);
    else input?.setSelection(caret, caret);
  }); // every render: an empty body doesn't change on a split, but focus still has to move

  const save = (nextTitle: string, nextBody: string) => updateQuickNote(note.id, joinQuickNote(nextTitle, nextBody));

  // Return in the title starts a new first line of the body — carrying anything after
  // the cursor down with it — instead of making a two-line title. A pasted block with
  // line breaks is split the same way. The caret lands where that new line begins.
  const changeTitle = (text: string) => {
    const newline = text.indexOf('\n');
    if (newline === -1) {
      setTitle(text);
      save(text, body);
      return;
    }
    const nextTitle = text.slice(0, newline);
    const carried = text.slice(newline + 1);
    const nextBody = body ? `${carried}\n${body}` : carried;
    setTitle(nextTitle);
    setBody(nextBody);
    save(nextTitle, nextBody);
    pendingCaret.current = carried.length;
  };

  return (
    <>
      <TextInput
        style={[type.display, styles.title, styles.editable, noOutline, titleHeight ? { height: titleHeight } : null]}
        value={title}
        onChangeText={changeTitle}
        onContentSizeChange={(e) => setTitleHeight(e.nativeEvent.contentSize.height)}
        placeholder="Untitled"
        placeholderTextColor={colors.textMuted}
        keyboardAppearance={keyboardAppearance}
        multiline
        // One row to start from (a browser textarea defaults to two); it still grows
        // with a long title through onContentSizeChange.
        numberOfLines={1}
        accessibilityLabel="Title"
      />
      <TextInput
        ref={bodyRef}
        style={[type.body, styles.body, styles.editable, noOutline, { height: Math.max(220, bodyHeight) }]}
        value={body}
        onChangeText={(text) => {
          setBody(text);
          save(title, text);
        }}
        onContentSizeChange={(e) => setBodyHeight(e.nativeEvent.contentSize.height)}
        placeholder="Keep writing…"
        placeholderTextColor={colors.textMuted}
        keyboardAppearance={keyboardAppearance}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Note"
      />
    </>
  );
}

function ChecklistBody({ note }: { note: ChecklistNote }) {
  const type = useType();
  const accent = useAccent();
  const [draft, setDraft] = useState('');
  const canAdd = draft.trim() !== '';
  const done = note.items.filter((i) => i.done).length;

  const add = () => {
    if (!canAdd) return;
    addChecklistItem(note.id, draft);
    setDraft('');
  };

  return (
    <>
      <Text style={[type.display, styles.title]} accessibilityRole="header" selectable>
        {note.title}
      </Text>
      <Text style={[type.body, styles.muted]}>
        {note.items.length === 0 ? 'No items yet' : `${done} of ${note.items.length} done`}
      </Text>

      <View style={styles.items}>
        {note.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Checkbox checked={item.done} onPress={() => toggleChecklistItem(note.id, item.id)} label={item.text} />
            <Pressable
              onPress={() => toggleChecklistItem(note.id, item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.done }}
              accessibilityLabel={`${item.done ? 'Uncheck' : 'Check'} ${item.text}`}
              style={(s) => [styles.itemTextWrap, hoverFill(s)]}
            >
              <Text style={[type.body, styles.itemText, item.done && styles.itemDone]}>{item.text}</Text>
            </Pressable>
            <RowIconButton
              icon="trash-outline"
              label={`Delete item "${item.text}"`}
              onPress={() => deleteChecklistItem(note.id, item.id)}
            />
          </View>
        ))}
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={[type.body, styles.addInput]}
          value={draft}
          onChangeText={setDraft}
          placeholder="Add an item"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearance}
          returnKeyType="done"
          onSubmitEditing={add}
          submitBehavior="submit"
          accessibilityLabel={`Add item to "${note.title}"`}
        />
        <Pressable
          onPress={add}
          disabled={!canAdd}
          accessibilityRole="button"
          accessibilityLabel="Add item"
          style={(s) => [styles.addButton, { backgroundColor: accent.accent }, !canAdd && styles.disabled, canAdd && hoverDim(s)]}
        >
          <Ionicons name="add" size={20} color={accent.onAccent} />
        </Pressable>
      </View>
    </>
  );
}

function RecipeBody({ note }: { note: RecipeNote }) {
  const type = useType();
  const accent = useAccent();
  const meta = [note.category, note.cookTime].filter(Boolean).join(' · ');

  return (
    <>
      <Text style={[type.display, styles.title]} accessibilityRole="header" selectable>
        {note.title}
      </Text>
      <View style={styles.recipeMeta}>
        <Text style={[type.body, styles.muted]}>{meta}</Text>
        <Text style={styles.stars} accessibilityLabel={`${note.rating} out of 3 stars`}>
          {[1, 2, 3].map((star) => (
            <Text key={star} style={{ color: star <= note.rating ? accent.accent : colors.border }}>
              ★
            </Text>
          ))}
        </Text>
      </View>

      {note.photoUri ? <Image source={{ uri: note.photoUri }} style={styles.photo} resizeMode="cover" /> : null}

      {note.ingredients.length > 0 ? (
        <View style={styles.section}>
          <Text style={[type.bodyStrong, styles.sectionTitle]}>Ingredients</Text>
          {note.ingredients.map((line, i) => (
            <Text key={i} style={[type.body, styles.body]} selectable>
              •  {line}
            </Text>
          ))}
        </View>
      ) : null}

      {note.steps.length > 0 ? (
        <View style={styles.section}>
          <Text style={[type.bodyStrong, styles.sectionTitle]}>Steps</Text>
          {note.steps.map((line, i) => (
            <Text key={i} style={[type.body, styles.body]} selectable>
              {i + 1}.  {line}
            </Text>
          ))}
        </View>
      ) : null}

      {note.notes ? (
        <View style={styles.section}>
          <Text style={[type.bodyStrong, styles.sectionTitle]}>Notes</Text>
          <Text style={[type.body, styles.body]} selectable>
            {note.notes}
          </Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // A shade lighter than the rest of the app, so an open note reads as paper.
  root: { flex: 1, backgroundColor: colors.surface },
  missing: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xl * 3 },
  page: { width: '100%', maxWidth: PAGE_WIDTH, alignSelf: 'center', gap: spacing.md },
  muted: { color: colors.textMuted },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  crumbs: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 2 },
  crumb: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.square, flexShrink: 0 },
  crumbText: { fontSize: 13, color: colors.textMuted },
  crumbSep: { fontSize: 13, color: colors.border },
  crumbCurrent: { fontSize: 13, color: colors.text, flexShrink: 1, paddingHorizontal: 6 },
  edited: { fontSize: 12, color: colors.textMuted },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: sizes.controlSm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pinOn: { backgroundColor: colors.background },
  pinText: { fontSize: 13 },

  title: { fontSize: 40, lineHeight: 48 },
  body: { fontSize: 17, lineHeight: 28, color: colors.text },
  editable: { padding: 0, borderWidth: 0, backgroundColor: 'transparent', color: colors.text },

  items: { marginTop: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  itemTextWrap: { flex: 1, borderRadius: radius.square, paddingHorizontal: 6, paddingVertical: 6 },
  itemText: { fontSize: 17, lineHeight: 26 },
  itemDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  addRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  addInput: {
    flex: 1,
    minWidth: 0,
    height: sizes.control,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  addButton: { width: sizes.control, height: sizes.control, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },

  recipeMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stars: { fontSize: 16, letterSpacing: 2 },
  photo: { width: '100%', aspectRatio: 1.6, borderRadius: radius.card, backgroundColor: colors.surface2, marginTop: spacing.sm },
  section: { gap: 4, marginTop: spacing.lg },
  sectionTitle: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: colors.textMuted },
});
