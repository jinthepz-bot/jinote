import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';

import { formatAmount } from '../coach/format';
import { addBuyItem, toggleBought, useCoach, type BuyItem } from '../coach/store';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { hoverDim, hoverFill, hoverStyles, pointerState } from '../design/hover';
import { colors, keyboardAppearance, radius, rgba, sizes, spacing } from '../design/theme';
import type { IconName } from '../design/ui';
import {
  useMainWidth,
} from '../navigation/layout';
import type { JournalSection } from '../navigation/Sidebar';
import { coverStyle } from './covers';
import { editedShort, noteTitle, splitQuickNote } from './format';
import { previewText } from './lines';
import { NoteForm } from './NoteForm';
import {
  hasTag,
  matchesQuery,
  pinnedNotes,
  tagsInUse,
  toggleChecklistItem,
  useNotes,
  type ChecklistNote,
  type Note,
  type NoteType,
  type QuickNote,
  type RecipeNote,
} from './store';

// The desktop Journal home: every note, checklist and recipe — and the to-buy list —
// as a grid of cards, with search and filter chips. The phone keeps its list.

type Filter = 'all' | 'quick' | 'checklist' | 'recipe' | 'buy' | `tag:${string}`;

const TYPE_CHIPS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'quick', label: 'Notes' },
  { value: 'checklist', label: 'Checklists' },
  { value: 'recipe', label: 'Recipes' },
  { value: 'buy', label: 'To-buy' },
];

const TYPE_LABELS: Record<NoteType, string> = { quick: 'Note', checklist: 'Checklist', recipe: 'Recipe' };

const CONTENT_MAX = 1100;
const GUTTER = spacing.xl + spacing.sm;
const COLUMN_GAP = spacing.lg;
// Below this content width the grid drops from three columns to two.
const THREE_COLUMNS_MIN = 760;
const MENU_WIDTH = 190;
const CHECKLIST_PREVIEW = 4;
const BUY_PREVIEW = 6;
const PHOTO_HEIGHT = 150;

const noOutline = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

const filterFor = (section: JournalSection | undefined): Filter =>
  section === 'quick' || section === 'checklist' || section === 'recipe' || section === 'buy' ? section : 'all';

// Keeps "Edited 5m ago" moving while the page sits open.
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

type GridItem = { kind: 'note'; note: Note } | { kind: 'buy' };

interface Props {
  section: JournalSection | undefined; // from the sidebar's sub-links
  folderId: string | undefined; // a sidebar folder: the grid shows only its notes
  onLeaveFolder: () => void;
  n: number | undefined; // changes on every sidebar click, so the same link twice still applies
  onOpen: (noteId: string) => void;
  // A type chip lights the matching sidebar link; All and tag chips light "Journal".
  onSection: (section: JournalSection | undefined) => void;
  onDaily: () => void; // "+ New → Today's journal"
}

export function JournalGrid({ section, folderId, n, onOpen, onSection, onDaily, onLeaveFolder }: Props) {
  const type = useType();
  const mainWidth = useMainWidth();
  const { state: notesState, loaded } = useNotes();
  const coach = useCoach();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>(() => filterFor(section));
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState<NoteType | null>(null);
  // Bumped to put the cursor in the to-buy card's add field.
  const [focusBuy, setFocusBuy] = useState(0);

  // A sidebar click sets the matching chip (and clears a search, which would
  // otherwise hide what was just asked for).
  useEffect(() => {
    if (n === undefined) return;
    setFilter(filterFor(section));
    setQuery('');
    // Only sidebar clicks bump `n`; a chip changing `section` mustn't re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  if (!loaded || !coach.loaded) return <View style={styles.root} />;

  // Inside a folder, everything below — chips, tags, search — works on its notes only,
  // and the to-buy list (which isn't filed anywhere) steps aside.
  const folder = folderId ? notesState.folders.find((f) => f.id === folderId) : undefined;
  const notes = folder ? notesState.notes.filter((n) => n.folderId === folder.id) : notesState.notes;
  const tags = tagsInUse(notes);
  // A tag filter whose last note lost the tag falls back to All; so does To-buy in a folder.
  const activeFilter: Filter =
    (filter.startsWith('tag:') && !tags.some((t) => `tag:${t}`.toLowerCase() === filter.toLowerCase())) ||
    (folder && filter === 'buy')
      ? 'all'
      : filter;

  const pickFilter = (next: Filter) => {
    setFilter(next);
    onSection(next === 'all' || next.startsWith('tag:') ? undefined : (next as JournalSection));
  };

  const noteShown = (note: Note) => {
    if (activeFilter === 'buy') return false;
    if (activeFilter.startsWith('tag:')) {
      if (!hasTag(note, activeFilter.slice(4))) return false;
    } else if (activeFilter !== 'all' && note.type !== activeFilter) return false;
    return matchesQuery(note, query);
  };

  const q = query.trim().toLowerCase();
  const buyItems = q ? coach.state.toBuy.filter((b) => b.name.toLowerCase().includes(q)) : coach.state.toBuy;
  const showBuy = !folder && (activeFilter === 'all' || activeFilter === 'buy') && (q ? buyItems.length > 0 : true);

  const pinned = pinnedNotes(notes).filter(noteShown);
  const recent = notes
    .filter((n) => n.pinnedAt === null && noteShown(n))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const recentItems: GridItem[] = [...(showBuy ? [{ kind: 'buy' } as const] : []), ...recent.map((note) => ({ kind: 'note', note }) as const)];
  const pinnedItems: GridItem[] = pinned.map((note) => ({ kind: 'note', note }));

  const contentWidth = Math.min(CONTENT_MAX, mainWidth - GUTTER * 2);
  const columns = contentWidth >= THREE_COLUMNS_MIN ? 3 : 2;
  const columnWidth = (contentWidth - COLUMN_GAP * (columns - 1)) / columns;

  const newChoice = (choice: NewChoice) => {
    if (choice === 'daily') onDaily();
    else if (choice === 'buy') {
      if (folder) onLeaveFolder();
      else if (activeFilter !== 'all' && activeFilter !== 'buy') pickFilter('buy');
      setQuery('');
      setFocusBuy((k) => k + 1);
    } else setCreating(choice);
  };

  const renderItem = (item: GridItem) =>
    item.kind === 'buy' ? (
      <BuyCard
        key="buy"
        items={buyItems}
        expanded={activeFilter === 'buy' || q !== ''}
        focusKey={focusBuy}
        onExpand={activeFilter === 'buy' ? undefined : () => pickFilter('buy')}
      />
    ) : (
      <NoteCard key={item.note.id} note={item.note} now={now} onOpen={() => onOpen(item.note.id)} />
    );

  const nothing = pinnedItems.length === 0 && recentItems.length === 0;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          {folder ? (
            <View style={styles.folderTitle}>
              <Pressable
                onPress={onLeaveFolder}
                accessibilityRole="link"
                accessibilityLabel="Back to all of Journal"
                style={(s) => [styles.crumb, hoverFill(s)]}
              >
                <Text style={[type.body, styles.crumbText]}>Journal /</Text>
              </Pressable>
              <Text style={[type.display, styles.title]} accessibilityRole="header" numberOfLines={1}>
                {folder.name}
              </Text>
            </View>
          ) : (
            <Text style={[type.display, styles.title]} accessibilityRole="header">
              Journal
            </Text>
          )}
          <View style={styles.headerSpacer} />
          <SearchBox value={query} onChange={setQuery} />
          <NewMenu onChoose={newChoice} />
        </View>

        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Show">
          {TYPE_CHIPS.filter((chip) => !(folder && chip.value === 'buy')).map((chip) => (
            <FilterChip
              key={chip.value}
              label={chip.label}
              active={activeFilter === chip.value}
              onPress={() => pickFilter(chip.value)}
            />
          ))}
          {tags.length > 0 ? <View style={styles.chipDivider} /> : null}
          {tags.map((tag) => (
            <FilterChip
              key={tag}
              label={`#${tag}`}
              active={activeFilter.toLowerCase() === `tag:${tag}`.toLowerCase()}
              onPress={() => pickFilter(`tag:${tag}`)}
            />
          ))}
        </View>

        {nothing ? (
          <EmptyState
            filter={activeFilter}
            query={query.trim()}
            hasNotes={notes.length > 0}
            inFolder={!!folder}
            onChoose={newChoice}
          />
        ) : (
          <>
            {pinnedItems.length > 0 ? (
              <View style={styles.section}>
                <Text style={type.label}>Pinned</Text>
                <Masonry items={pinnedItems} columns={columns} columnWidth={columnWidth} render={renderItem} />
              </View>
            ) : null}
            {recentItems.length > 0 ? (
              <View style={styles.section}>
                <Text style={type.label}>Recent</Text>
                <Masonry items={recentItems} columns={columns} columnWidth={columnWidth} render={renderItem} />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <NoteForm
        visible={creating !== null}
        initialType={creating ?? undefined}
        folderId={folder?.id}
        onCancel={() => setCreating(null)}
        onSaved={() => setCreating(null)}
      />
    </View>
  );
}

// --- masonry

// Cards keep their natural height. Each one goes into whichever column is shortest
// so far, by an estimate of its height — close enough to keep the columns even
// without measuring, and stable, so cards don't hop around after they've drawn.
function estimateHeight(item: GridItem, columnWidth: number, buyCount: number): number {
  const charsPerLine = Math.max(16, Math.floor((columnWidth - 2 * spacing.lg) / 7.5));
  const lines = (text: string, max: number) => Math.min(max, Math.max(1, Math.ceil(text.length / charsPerLine)));
  const base = 100; // padding, type label, one title line, footer
  if (item.kind === 'buy') return base + Math.min(buyCount, BUY_PREVIEW) * 28 + 48;
  const note = item.note;
  const titleLines = lines(noteTitle(note), 2) - 1;
  let h = base + titleLines * 24;
  if (note.type === 'quick') {
    const body = splitQuickNote(note.text).body;
    if (body) h += lines(body, 3) * 21;
  } else if (note.type === 'checklist') {
    h += 22 + Math.min(note.items.length, CHECKLIST_PREVIEW) * 28 + (note.items.length > CHECKLIST_PREVIEW ? 20 : 0);
  } else {
    if (note.photoUri) h += PHOTO_HEIGHT;
    h += 20 + 42;
  }
  return h;
}

function Masonry({
  items,
  columns,
  columnWidth,
  render,
}: {
  items: GridItem[];
  columns: number;
  columnWidth: number;
  render: (item: GridItem) => ReactNode;
}) {
  const { state } = useCoach();
  const openBuy = state.toBuy.filter((b) => !b.bought).length;
  const cols: GridItem[][] = Array.from({ length: columns }, () => []);
  const heights = new Array(columns).fill(0);
  for (const item of items) {
    const shortest = heights.indexOf(Math.min(...heights));
    cols[shortest].push(item);
    heights[shortest] += estimateHeight(item, columnWidth, openBuy) + COLUMN_GAP;
  }
  return (
    <View style={styles.masonry}>
      {cols.map((col, i) => (
        <View key={i} style={styles.column}>
          {col.map(render)}
        </View>
      ))}
    </View>
  );
}

// --- cards

// A card lifts while the pointer is over it. On the web, moving onto a control
// inside it (a tick box) reports the card as left, so leaving waits a moment and
// the inner controls report themselves as "still on the card".
function useCardHover() {
  const [hovered, setHovered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const enter = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHovered(true);
  };
  const leave = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(false), 120);
  };
  return { hovered, enter, leave };
}

function CardShell({
  label,
  onPress,
  tint,
  hover,
  children,
}: {
  label: string;
  onPress?: () => void;
  tint?: { background: string; border: string };
  hover: ReturnType<typeof useCardHover>;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={hover.enter}
      onHoverOut={hover.leave}
      accessibilityRole={onPress ? 'link' : undefined}
      accessibilityLabel={label}
      style={(s) => [
        styles.card,
        tint && { backgroundColor: tint.background, borderColor: tint.border },
        onPress && hoverStyles.pointer,
        hover.hovered && styles.cardHovered,
        pointerState(s).pressed && onPress && styles.cardPressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

function NoteCard({ note, now, onOpen }: { note: Note; now: number; onOpen: () => void }) {
  const type = useType();
  const hover = useCardHover();
  const title = noteTitle(note);
  return (
    <CardShell label={`Open ${TYPE_LABELS[note.type].toLowerCase()} "${title}"`} onPress={onOpen} hover={hover}>
      {note.cover ? <View style={[styles.coverStrip, coverStyle(note.cover)]} /> : null}
      {note.type === 'recipe' && note.photoUri ? (
        <Image source={{ uri: note.photoUri }} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : null}
      <View style={styles.cardBody}>
        <Text style={type.label}>{TYPE_LABELS[note.type]}</Text>
        <Text style={[type.display, styles.cardTitle]} numberOfLines={2}>
          {title || 'Untitled'}
        </Text>
        {note.type === 'quick' ? (
          <QuickPreview note={note} />
        ) : note.type === 'checklist' ? (
          <ChecklistPreview note={note} hover={hover} />
        ) : (
          <RecipePreview note={note} />
        )}
        <View style={styles.footer}>
          <Text style={[type.body, styles.tags]} numberOfLines={1}>
            {note.tags.map((t) => `#${t}`).join('  ')}
          </Text>
          <Text style={[type.body, styles.edited]} numberOfLines={1}>
            {editedShort(note.updatedAt, now)}
          </Text>
        </View>
      </View>
    </CardShell>
  );
}

function QuickPreview({ note }: { note: QuickNote }) {
  const type = useType();
  const body = previewText(splitQuickNote(note.text).body).trim();
  if (!body) return null;
  return (
    <Text style={[type.body, styles.preview]} numberOfLines={3}>
      {body}
    </Text>
  );
}

function ChecklistPreview({ note, hover }: { note: ChecklistNote; hover: ReturnType<typeof useCardHover> }) {
  const type = useType();
  const done = note.items.filter((i) => i.done).length;
  const total = note.items.length;
  const shown = note.items.slice(0, CHECKLIST_PREVIEW);
  return (
    <View style={styles.checklist}>
      <View style={styles.progressRow}>
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: Math.max(total, 1), now: done }}
        >
          <View style={[styles.fill, { width: total ? `${(done / total) * 100}%` : '0%' }]} />
        </View>
        <Text style={[type.body, styles.count]}>{total ? `${done} of ${total}` : 'No items'}</Text>
      </View>
      {shown.map((item) => (
        <View key={item.id} style={styles.itemRow}>
          <TickBox
            checked={item.done}
            label={`${item.done ? 'Uncheck' : 'Check'} ${item.text}`}
            onPress={() => toggleChecklistItem(note.id, item.id)}
            hover={hover}
          />
          <Text style={[type.body, styles.itemText, item.done && styles.itemDone]} numberOfLines={1}>
            {item.text}
          </Text>
        </View>
      ))}
      {total > CHECKLIST_PREVIEW ? (
        <Text style={[type.body, styles.more]}>+{total - CHECKLIST_PREVIEW} more</Text>
      ) : null}
    </View>
  );
}

function RecipePreview({ note }: { note: RecipeNote }) {
  const type = useType();
  const accent = useAccent();
  const meta = [note.category, note.cookTime].filter(Boolean).join(' · ');
  // The free-text notes are the closest thing a recipe has to a description; with
  // none, the start of the ingredient list says what it is.
  const description = note.notes.trim() || note.ingredients.slice(0, 5).join(', ');
  return (
    <>
      <View style={styles.recipeMeta}>
        <Text style={[type.body, styles.metaText]} numberOfLines={1}>
          {meta}
        </Text>
        <Text style={styles.stars} accessibilityLabel={`${note.rating} out of 3 stars`}>
          {[1, 2, 3].map((star) => (
            <Text key={star} style={{ color: star <= note.rating ? accent.accent : colors.border }}>
              ★
            </Text>
          ))}
        </Text>
      </View>
      {description ? (
        <Text style={[type.body, styles.preview]} numberOfLines={2}>
          {description}
        </Text>
      ) : null}
    </>
  );
}

const BUY_TINT = { background: '#F8EBD8', border: '#EBD3B2' };

// The to-buy list as one warm card: open items to tick off, and a field to add one.
// In the To-buy filter (or a search) it shows everything that matches, bought items
// included so a tick can be undone; elsewhere just the first few open ones.
function BuyCard({
  items,
  expanded,
  focusKey,
  onExpand,
}: {
  items: BuyItem[];
  expanded: boolean;
  focusKey: number;
  onExpand?: () => void;
}) {
  const type = useType();
  const hover = useCardHover();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);

  // After the "+ New" menu has closed and handed focus back to its button.
  useEffect(() => {
    if (focusKey === 0) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [focusKey]);

  const open = items.filter((b) => !b.bought);
  const bought = items.filter((b) => b.bought);
  const shown = expanded ? [...open, ...bought] : open.slice(0, BUY_PREVIEW);
  const total = open.reduce((sum, b) => sum + (b.price ?? 0), 0);

  const add = () => {
    if (!draft.trim()) return;
    addBuyItem(draft, null);
    setDraft('');
  };

  return (
    <CardShell label="To-buy list" onPress={onExpand} tint={BUY_TINT} hover={hover}>
      <View style={styles.cardBody}>
        <Text style={type.label}>To-buy</Text>
        <Text style={[type.display, styles.cardTitle]}>Shopping list</Text>
        {shown.length === 0 ? (
          <Text style={[type.body, styles.preview]}>All bought. Nice.</Text>
        ) : (
          <View style={styles.checklist}>
            {shown.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <TickBox
                  checked={item.bought}
                  label={`${item.bought ? 'Not bought' : 'Bought'}: ${item.name}`}
                  onPress={() => toggleBought(item.id)}
                  hover={hover}
                />
                <Text style={[type.body, styles.itemText, item.bought && styles.itemDone]} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.price !== null ? <Text style={[type.body, styles.price]}>{formatAmount(item.price)}</Text> : null}
              </View>
            ))}
            {!expanded && open.length > BUY_PREVIEW ? (
              <Text style={[type.body, styles.more]}>+{open.length - BUY_PREVIEW} more</Text>
            ) : null}
          </View>
        )}
        <TextInput
          ref={inputRef}
          style={[type.body, styles.buyInput, noOutline]}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          submitBehavior="submit"
          returnKeyType="done"
          placeholder="+ Add an item"
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={keyboardAppearance}
          accessibilityLabel="Add a to-buy item"
        />
        <View style={styles.footer}>
          <Text style={[type.body, styles.edited]}>
            {open.length} left{total > 0 ? ` · ${formatAmount(total)}` : ''}
          </Text>
        </View>
      </View>
    </CardShell>
  );
}

function TickBox({
  checked,
  label,
  onPress,
  hover,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
  hover: ReturnType<typeof useCardHover>;
}) {
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={hover.enter}
      onHoverOut={hover.leave}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel={label}
      style={(s) => [styles.tick, checked && styles.tickOn, hoverDim(s)]}
    >
      {checked ? <Ionicons name="checkmark" size={12} color={colors.surface} /> : null}
    </Pressable>
  );
}

// --- header

function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const type = useType();
  return (
    <View style={styles.search}>
      <Ionicons name="search-outline" size={15} color={colors.textMuted} />
      <TextInput
        style={[type.body, styles.searchInput, noOutline]}
        value={value}
        onChangeText={onChange}
        placeholder="Search notes"
        placeholderTextColor={colors.textMuted}
        keyboardAppearance={keyboardAppearance}
        returnKeyType="search"
        accessibilityLabel="Search notes"
      />
      {value ? (
        <Pressable
          onPress={() => onChange('')}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={(s) => [styles.clear, hoverFill(s)]}
        >
          <Ionicons name="close" size={14} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

type NewChoice = NoteType | 'buy' | 'daily';

const NEW_CHOICES: { value: NewChoice; label: string; icon: IconName }[] = [
  { value: 'quick', label: 'Note', icon: 'document-text-outline' },
  { value: 'checklist', label: 'Checklist', icon: 'checkbox-outline' },
  { value: 'recipe', label: 'Recipe', icon: 'restaurant-outline' },
  { value: 'buy', label: 'To-buy item', icon: 'cart-outline' },
  { value: 'daily', label: "Today's journal", icon: 'sunny-outline' },
];

// The accent "+ New" button and its menu, measured into a modal layer like the
// calendar's (see CalendarToolbar), so a click anywhere else closes it.
function NewMenu({ onChoose }: { onChoose: (choice: NewChoice) => void }) {
  const type = useType();
  const accent = useAccent();
  const ref = useRef<View>(null);
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);

  const openMenu = () =>
    ref.current?.measureInWindow((x, y, width, height) => setMenu({ top: y + height + 4, left: x + width - MENU_WIDTH }));
  const close = () => setMenu(null);

  return (
    <View ref={ref} collapsable={false}>
      <Pressable
        onPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel="New"
        accessibilityState={{ expanded: menu !== null }}
        style={(s) => [styles.newButton, { backgroundColor: accent.accent }, hoverDim(s)]}
      >
        <Ionicons name="add" size={18} color={accent.onAccent} />
        <Text style={[type.bodyStrong, { color: accent.onAccent }]}>New</Text>
      </Pressable>
      <Modal visible={menu !== null} transparent animationType="none" onRequestClose={close}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close menu" />
        {menu ? (
          <View style={[styles.menu, { top: menu.top, left: Math.max(spacing.sm, menu.left) }]}>
            {NEW_CHOICES.map((c) => (
              <Pressable
                key={c.value}
                onPress={() => {
                  close();
                  onChoose(c.value);
                }}
                accessibilityRole="menuitem"
                accessibilityLabel={`New ${c.label.toLowerCase()}`}
                style={(s) => [styles.menuItem, hoverFill(s)]}
              >
                <Ionicons name={c.icon} size={16} color={colors.textMuted} />
                <Text style={type.body}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const type = useType();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      aria-checked={active}
      accessibilityLabel={`Show ${label}`}
      style={(s) => [styles.chip, active ? [styles.chipActive, hoverDim(s)] : hoverFill(s)]}
    >
      <Text style={[active ? type.bodyStrong : type.body, styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({
  filter,
  query,
  hasNotes,
  inFolder,
  onChoose,
}: {
  filter: Filter;
  query: string;
  hasNotes: boolean;
  inFolder: boolean;
  onChoose: (choice: NewChoice) => void;
}) {
  const type = useType();
  const kind =
    filter === 'quick' ? 'notes' : filter === 'checklist' ? 'checklists' : filter === 'recipe' ? 'recipes' : null;
  const line = query
    ? `Nothing matches "${query}". Try fewer words, or start something new.`
    : filter.startsWith('tag:')
      ? `Nothing tagged #${filter.slice(4)} yet.`
      : kind
        ? `No ${kind} yet. Your first one is a click away.`
        : inFolder && !hasNotes
          ? 'This folder is empty. File a note here from its page, or start a new one.'
          : hasNotes
          ? 'Nothing here.'
          : 'Nothing here yet. Write down whatever is on your mind.';
  return (
    <View style={styles.empty}>
      <Ionicons name="leaf-outline" size={28} color={colors.textMuted} />
      <Text style={[type.body, styles.emptyText]}>{line}</Text>
      <NewMenu onChoose={onChoose} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: GUTTER,
    paddingVertical: GUTTER,
    gap: spacing.lg,
    width: '100%',
    maxWidth: CONTENT_MAX + GUTTER * 2,
    alignSelf: 'center',
  },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 40, lineHeight: 48, flexShrink: 1 },
  folderTitle: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, flexShrink: 1, minWidth: 0 },
  crumb: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.square },
  crumbText: { fontSize: 15, color: colors.textMuted },
  coverStrip: { height: 8, width: '100%' },
  headerSpacer: { flex: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: 260,
    height: sizes.controlSm,
    paddingLeft: spacing.md,
    paddingRight: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, padding: 0, borderWidth: 0, color: colors.text },
  clear: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  newButton: {
    height: sizes.controlSm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingVertical: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.controlSm, paddingHorizontal: spacing.md },

  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  chip: {
    height: 30,
    paddingHorizontal: spacing.md,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.darkCard, borderColor: colors.darkCard },
  chipText: { fontSize: 13 },
  chipTextActive: { color: colors.background },
  chipDivider: { width: 1, height: 18, backgroundColor: colors.border, marginHorizontal: 2 },

  section: { gap: spacing.sm, marginTop: spacing.xs },
  masonry: { flexDirection: 'row', gap: COLUMN_GAP, alignItems: 'flex-start' },
  column: { flex: 1, minWidth: 0, gap: COLUMN_GAP },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardHovered: {
    ...hoverStyles.raised,
    borderColor: rgba(colors.text, 0.18),
    transform: [{ translateY: -2 }],
  },
  cardPressed: { opacity: 0.85 },
  photo: { width: '100%', height: PHOTO_HEIGHT, backgroundColor: colors.surface2 },
  cardBody: { padding: spacing.lg, gap: 6 },
  cardTitle: { fontSize: 19, lineHeight: 24 },
  preview: { fontSize: 14, lineHeight: 21, color: colors.textMuted },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  tags: { flex: 1, minWidth: 0, fontSize: 12, color: colors.textMuted },
  edited: { fontSize: 12, color: colors.textMuted },

  checklist: { gap: 2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.goalGreen },
  count: { fontSize: 12, color: colors.textMuted },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 26 },
  itemText: { flex: 1, minWidth: 0, fontSize: 14 },
  itemDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  more: { fontSize: 12, color: colors.textMuted, paddingLeft: 24 },
  price: { fontSize: 13, color: colors.textMuted },
  tick: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: { backgroundColor: colors.goalGreen, borderColor: colors.goalGreen },

  recipeMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaText: { flex: 1, minWidth: 0, fontSize: 13, color: colors.textMuted },
  stars: { fontSize: 13, letterSpacing: 1 },

  buyInput: {
    fontSize: 14,
    paddingVertical: 6,
    paddingHorizontal: 0,
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#EBD3B2',
    backgroundColor: 'transparent',
    color: colors.text,
  },

  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl * 2 },
  emptyText: { color: colors.textMuted, textAlign: 'center' },
});
