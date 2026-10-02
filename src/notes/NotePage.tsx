import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';

import { useAccent } from '../design/accent';
import { confirmDestructive } from '../design/confirm';
import { useType } from '../design/fonts';
import { hoverDim, hoverFill } from '../design/hover';
import { colors, keyboardAppearance, radius, sizes, spacing } from '../design/theme';
import { MenuDivider, MenuRow, Popover, useAnchoredPopover } from '../design/Popover';
import { Button, Checkbox, IconButton, RowIconButton } from '../design/ui';
import { COVERS, coverStyle } from './covers';
import { editedAgo, joinQuickNote, noteTitle, SECTION_LABELS, splitQuickNote } from './format';
import { LineEditor, type LineEditorHandle } from './LineEditor';
import { deleteNotePhoto } from './photos';
import {
  addChecklistItem,
  addFolder,
  deleteChecklistItem,
  deleteNote,
  MAX_FOLDER_NAME,
  setNoteCover,
  setNoteFolder,
  setPinned,
  toggleChecklistItem,
  updateQuickNote,
  useNotes,
  type ChecklistNote,
  type Note,
  type NoteType,
  type QuickNote,
  type RecipeNote,
} from './store';
import { TagRow } from './TagRow';

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

export interface BackTarget {
  section?: NoteType; // the grid filtered to that kind of note
  folderId?: string; // the grid scoped to that folder
}

interface Props {
  noteId: string;
  // Back to the Journal grid, optionally filtered.
  onBack: (to?: BackTarget) => void;
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
  const folder = note.folderId ? state.folders.find((f) => f.id === note.folderId) : undefined;

  const confirmDelete = () =>
    confirmDestructive({
      title: `Delete "${title}"?`,
      message: note.type === 'recipe' && note.photoUri ? 'Its photo is deleted too.' : undefined,
      confirmLabel: 'Delete',
      onConfirm: () => {
        if (note.type === 'recipe') deleteNotePhoto(note.photoUri);
        deleteNote(note.id);
        onBack({ section: note.type });
      },
    });

  return (
    <View style={styles.root}>
      <ScrollView keyboardShouldPersistTaps="handled">
        {note.cover ? <View style={[styles.cover, coverStyle(note.cover)]} accessibilityLabel="Cover" /> : null}
        <View style={styles.scroll}>
        <View style={styles.page}>
          <View style={styles.topRow}>
            <View style={styles.crumbs} role="navigation" accessibilityLabel="Breadcrumb">
              <Crumb label="Journal" onPress={() => onBack()} />
              <Text style={[type.body, styles.crumbSep]}>/</Text>
              {/* Filed in a folder, the folder stands in for the kind of note. */}
              {folder ? (
                <Crumb label={folder.name} onPress={() => onBack({ folderId: folder.id })} />
              ) : (
                <Crumb label={SECTION_LABELS[note.type]} onPress={() => onBack({ section: note.type })} />
              )}
              <Text style={[type.body, styles.crumbSep]}>/</Text>
              <Text style={[type.body, styles.crumbCurrent]} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <Text style={[type.body, styles.edited]} numberOfLines={1}>
              {editedAgo(note.updatedAt, now)}
            </Text>
            <CoverButton note={note} />
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

// Typing is saved once it pauses this long, and straight away on leaving the note.
const SAVE_DELAY_MS = 400;

// A quick note is written straight into the page: the first line is the title, the
// rest the body (edited line by line, with light formatting — see LineEditor), saved
// as the one text field the note has always had.
function QuickNoteEditor({ note }: { note: QuickNote }) {
  const type = useType();
  const initial = useRef(splitQuickNote(note.text)).current;
  const [title, setTitle] = useState(initial.title);
  const [titleHeight, setTitleHeight] = useState(0);
  const titleRef = useRef<TextInput>(null);
  const editorRef = useRef<LineEditorHandle>(null);
  const latest = useRef({ title: initial.title, body: initial.body });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    updateQuickNote(note.id, joinQuickNote(latest.current.title, latest.current.body));
  }, [note.id]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      updateQuickNote(note.id, joinQuickNote(latest.current.title, latest.current.body));
    }, SAVE_DELAY_MS);
  }, [note.id]);

  useEffect(() => () => flush(), [flush]);

  const changeBody = useCallback(
    (body: string) => {
      latest.current.body = body;
      schedule();
    },
    [schedule],
  );

  const focusTitle = useCallback((pos: number) => {
    const input = titleRef.current as (TextInput & { setSelectionRange?: (s: number, e: number) => void }) | null;
    input?.focus();
    if (input?.setSelectionRange) input.setSelectionRange(pos, pos);
    else input?.setSelection(pos, pos);
  }, []);

  // Backspace at the start of the body joins its first line onto the title.
  const mergeIntoTitle = useCallback(
    (text: string) => {
      const before = latest.current.title;
      const next = before + text;
      latest.current.title = next;
      setTitle(next);
      schedule();
      setTimeout(() => focusTitle(before.length), 0);
    },
    [focusTitle, schedule],
  );

  // Return in the title starts a new first line of the body — carrying anything after
  // the cursor down with it — instead of making a two-line title. A pasted block with
  // line breaks is split the same way.
  const changeTitle = (text: string) => {
    const newline = text.indexOf('\n');
    const nextTitle = newline === -1 ? text : text.slice(0, newline);
    latest.current.title = nextTitle;
    setTitle(nextTitle);
    schedule();
    if (newline !== -1) editorRef.current?.insertFirstLine(text.slice(newline + 1));
  };

  return (
    <>
      <TextInput
        ref={titleRef}
        style={[type.display, styles.title, styles.editable, noOutline, titleHeight ? { height: titleHeight } : null]}
        value={title}
        onChangeText={changeTitle}
        onContentSizeChange={(e) => setTitleHeight(e.nativeEvent.contentSize.height)}
        onBlur={flush}
        placeholder="Untitled"
        placeholderTextColor={colors.textMuted}
        keyboardAppearance={keyboardAppearance}
        multiline
        // One row to start from (a browser textarea defaults to two); it still grows
        // with a long title through onContentSizeChange.
        numberOfLines={1}
        accessibilityLabel="Title"
      />
      <NoteMeta note={note} />
      <LineEditor
        ref={editorRef}
        initial={initial.body}
        onChange={changeBody}
        onBlurAll={flush}
        onMergeIntoTitle={mergeIntoTitle}
        onUpFromTop={() => focusTitle(title.length)}
      />
    </>
  );
}

// Under every note's title: which folder it's in, and its tags.
function NoteMeta({ note }: { note: Note }) {
  return (
    <View style={styles.meta}>
      <FolderLine note={note} />
      <TagRow note={note} />
    </View>
  );
}

const FOLDER_MENU_WIDTH = 220;

// "Folder  [Trips ▾]": a dropdown to file the note somewhere else, or nowhere, or in
// a folder made on the spot.
function FolderLine({ note }: { note: Note }) {
  const type = useType();
  const { state } = useNotes();
  const menu = useAnchoredPopover('left', FOLDER_MENU_WIDTH);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const folder = note.folderId ? state.folders.find((f) => f.id === note.folderId) : undefined;

  const close = () => {
    menu.close();
    setNaming(false);
    setName('');
  };
  const move = (folderId: string | null) => {
    setNoteFolder(note.id, folderId);
    close();
  };
  const create = () => {
    const made = addFolder(name);
    if (made) setNoteFolder(note.id, made.id);
    close();
  };

  return (
    <View style={styles.folderLine}>
      <Text style={[type.body, styles.folderLabel]}>Folder</Text>
      <View ref={menu.ref} collapsable={false}>
        <Pressable
          onPress={menu.open}
          accessibilityRole="button"
          accessibilityLabel={`Folder: ${folder ? folder.name : 'none'}. Move to another folder`}
          style={(s) => [styles.folderButton, hoverFill(s)]}
        >
          <Ionicons name={folder ? 'folder' : 'folder-outline'} size={14} color={colors.textMuted} />
          <Text style={[type.body, styles.folderText, !folder && styles.muted]} numberOfLines={1}>
            {folder ? folder.name : 'None'}
          </Text>
          <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
        </Pressable>
      </View>
      <Popover anchor={menu.anchor} width={FOLDER_MENU_WIDTH} onClose={close}>
        <MenuRow icon="remove-circle-outline" label="No folder" checked={!folder} onPress={() => move(null)} />
        {state.folders.map((f) => (
          <MenuRow key={f.id} icon="folder-outline" label={f.name} checked={f.id === note.folderId} onPress={() => move(f.id)} />
        ))}
        <MenuDivider />
        {naming ? (
          <TextInput
            style={[type.body, styles.newFolderInput, noOutline]}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={MAX_FOLDER_NAME}
            placeholder="Folder name"
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={keyboardAppearance}
            onSubmitEditing={create}
            onKeyPress={(e) => {
              if (e.nativeEvent.key === 'Escape') setNaming(false);
            }}
            accessibilityLabel="New folder name"
          />
        ) : (
          <MenuRow icon="add" label="New folder…" onPress={() => setNaming(true)} />
        )}
      </Popover>
    </View>
  );
}

const COVER_MENU_WIDTH = 200;

// The top bar's "Cover" button: five soft strips, or none.
function CoverButton({ note }: { note: Note }) {
  const type = useType();
  const menu = useAnchoredPopover('right', COVER_MENU_WIDTH);
  const pick = (cover: Note['cover']) => {
    setNoteCover(note.id, cover);
    menu.close();
  };
  return (
    <>
      <View ref={menu.ref} collapsable={false}>
        <Pressable
          onPress={menu.open}
          accessibilityRole="button"
          accessibilityLabel={note.cover ? 'Change cover' : 'Add a cover'}
          style={(s) => [styles.pin, hoverFill(s)]}
        >
          <Ionicons name="color-palette-outline" size={15} color={colors.text} />
          <Text style={[type.bodyStrong, styles.pinText]}>Cover</Text>
        </Pressable>
      </View>
      <Popover anchor={menu.anchor} width={COVER_MENU_WIDTH} onClose={menu.close}>
        <View style={styles.swatches}>
          {COVERS.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => pick(c.id)}
              accessibilityRole="button"
              accessibilityLabel={`${c.label} cover`}
              accessibilityState={{ selected: note.cover === c.id }}
              style={(s) => [styles.swatch, coverStyle(c.id), note.cover === c.id && styles.swatchOn, hoverDim(s)]}
            />
          ))}
        </View>
        <MenuDivider />
        <MenuRow icon="close-circle-outline" label="No cover" checked={note.cover === null} onPress={() => pick(null)} />
      </Popover>
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
      <NoteMeta note={note} />
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
      <NoteMeta note={note} />
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
  cover: { height: 132, width: '100%' },
  meta: { gap: spacing.sm, zIndex: 10, marginBottom: spacing.sm },
  folderLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  folderLabel: { fontSize: 13, color: colors.textMuted, width: 48 },
  folderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 260,
  },
  folderText: { fontSize: 13, flexShrink: 1 },
  newFolderInput: {
    marginHorizontal: spacing.sm,
    height: sizes.controlSm,
    paddingHorizontal: spacing.sm,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    backgroundColor: colors.background,
    color: colors.text,
  },
  swatches: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  swatch: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: colors.text },
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
