import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatAmount } from '../coach/format';
import { addBuyItem, deleteBuyItem, toggleBought, useCoach } from '../coach/store';
import { useTodayKey } from '../coach/useTodayKey';
import { useType } from '../design/fonts';
import { colors, radius, spacing, keyboardAppearance } from '../design/theme';
import { AddAction, Button, Card, Chip, fieldStyles, screenContentStyle, ScreenTitle, Section, Segmented } from '../design/ui';
import type { RootTabParamList } from '../navigation/RootNavigator';
import { SettingsButton } from '../navigation/SettingsHost';
import { BuyListCard } from '../goals/BuyListCard';
import { ChecklistCard } from '../notes/ChecklistCard';
import { NoteForm } from '../notes/NoteForm';
import { QuickNoteCard } from '../notes/QuickNoteCard';
import { RecipeCard } from '../notes/RecipeCard';
import {
  addQuickNote,
  RECIPE_CATEGORIES,
  searchNotes,
  useNotes,
  type Note,
  type NoteType,
  type RecipeCategory,
} from '../notes/store';

type Filter = 'all' | NoteType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'quick', label: 'Quick' },
  { value: 'recipe', label: 'Recipes' },
  { value: 'checklist', label: 'Lists' },
];

const CATEGORY_FILTERS: { value: RecipeCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All categories' },
  ...RECIPE_CATEGORIES.map((category) => ({ value: category, label: category })),
];

// Holds its own draft state so typing doesn't re-render the note list. Always
// creates a quick note — the "+ New note" flow below is where you pick a type.
//
// The draft is mirrored into `draft` (a ref owned by the screen), so it survives the
// list remounting when the layout switches between list and recipe grid. A ref rather
// than screen state, so typing still doesn't re-render the note list.
function Composer({ draft }: { draft: { current: string } }) {
  const type = useType();
  const [text, setTextState] = useState(draft.current);
  const canSave = text.trim() !== '';

  const setText = (next: string) => {
    draft.current = next;
    setTextState(next);
  };

  const save = () => {
    if (addQuickNote(text)) {
      setText('');
      Keyboard.dismiss();
    }
  };

  return (
    <Card style={styles.composer}>
      <TextInput
        style={[fieldStyles.input, type.body, styles.textArea]}
        value={text}
        onChangeText={setText}
        placeholder="What are you thinking about or curious about right now?"
        placeholderTextColor={colors.textMuted}
        keyboardAppearance={keyboardAppearance}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Quick note"
      />
      <View style={styles.composerFooter}>
        <Text style={[type.mono, styles.hint]}>Saved with today's date and time</Text>
        <Button label="Save" onPress={save} disabled={!canSave} accessibilityLabel="Save quick note" />
      </View>
    </Card>
  );
}

function FilterBar({
  filter,
  onFilterChange,
  query,
  onQueryChange,
  category,
  onCategoryChange,
}: {
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  query: string;
  onQueryChange: (q: string) => void;
  category: RecipeCategory | 'all';
  onCategoryChange: (category: RecipeCategory | 'all') => void;
}) {
  const type = useType();
  return (
    <View style={styles.filterWrap}>
      <Segmented
        options={FILTERS}
        value={filter}
        onChange={onFilterChange}
        describe={(option) => `Show ${option.label.toLowerCase()}`}
      />
      <TextInput
        style={[fieldStyles.input, fieldStyles.single, type.body]}
        value={query}
        onChangeText={onQueryChange}
        placeholder="Search notes"
        placeholderTextColor={colors.textMuted}
        keyboardAppearance={keyboardAppearance}
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel="Search notes"
      />
      <View style={styles.categoryRow} accessibilityRole="radiogroup">
        {CATEGORY_FILTERS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={option.value === category}
            onPress={() => onCategoryChange(option.value)}
            accessibilityLabel={`Filter by ${option.label}`}
          />
        ))}
      </View>
    </View>
  );
}

function NoteRow({ note, todayKey }: { note: Note; todayKey: string }) {
  if (note.type === 'quick') return <QuickNoteCard note={note} todayKey={todayKey} />;
  if (note.type === 'checklist') return <ChecklistCard note={note} />;
  return <RecipeCard note={note} />;
}

export function JournalScreen() {
  const type = useType();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { state: notesState, loaded } = useNotes();
  const { state: coachState } = useCoach();
  const todayKey = useTodayKey();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<RecipeCategory | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const listRef = useRef<FlatList<Note>>(null);
  const draftRef = useRef('');

  // The desktop sidebar's Journal sub-links arrive as route params. To-buy has no
  // filter of its own — the shopping list sits at the top — so it just scrolls there.
  const params = useRoute<RouteProp<RootTabParamList, 'Journal'>>().params;
  useEffect(() => {
    const section = params?.section;
    if (!section) return;
    setQuery('');
    setCategory('all');
    setFilter(section === 'buy' ? 'all' : section);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [params?.section, params?.n]);

  if (!loaded) return <View style={styles.root} />;

  const count = notesState.notes.length;
  const byType = filter === 'all' ? notesState.notes : notesState.notes.filter((n) => n.type === filter);
  const byCategory = category === 'all' ? byType : byType.filter((n) => n.type === 'recipe' && n.category === category);
  const visible = searchNotes(byCategory, query);
  const recipeGrid = filter === 'recipe' || category !== 'all';
  const columns = width >= 1050 ? 4 : width >= 700 ? 3 : 2;
  const filtering = filter !== 'all' || category !== 'all' || query.trim() !== '';

  const toBuyLeft = coachState.toBuy.filter((b) => !b.bought);
  const toBuyTotal = toBuyLeft.reduce((sum, b) => sum + (b.price ?? 0), 0);
  const buyAside = `${toBuyLeft.length} left${toBuyTotal > 0 ? ` · ${formatAmount(toBuyTotal)}` : ''}`;

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <FlatList
          // FlatList can't change numColumns in place; a new key remounts it.
          key={recipeGrid ? 'grid' : 'list'}
          ref={listRef}
          data={visible}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => <NoteRow note={item} todayKey={todayKey} />}
          numColumns={recipeGrid ? columns : 1}
          columnWrapperStyle={recipeGrid ? styles.recipeRow : undefined}
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={
            <View style={styles.header}>
              <ScreenTitle
                label={`${count} ${count === 1 ? 'note' : 'notes'}`}
                title="JOURNAL"
                action={<SettingsButton />}
              />
              <Composer draft={draftRef} />
              <Section label="Shopping list" aside={buyAside}>
                <BuyListCard items={coachState.toBuy} onAdd={addBuyItem} onToggle={toggleBought} onDelete={deleteBuyItem} />
              </Section>
              <FilterBar
                filter={filter}
                onFilterChange={(next) => {
                  setFilter(next);
                  if (next !== 'recipe') setCategory('all');
                }}
                query={query}
                onQueryChange={setQuery}
                category={category}
                onCategoryChange={(next) => {
                  setCategory(next);
                  if (next !== 'all') setFilter('recipe');
                }}
              />
              <AddAction label="New note (recipe or checklist)" onPress={() => setCreating(true)} />
            </View>
          }
          ListEmptyComponent={
            <Text style={[type.body, styles.empty]}>
              {filtering ? 'No notes match.' : 'Nothing here yet. Write down whatever is on your mind.'}
            </Text>
          }
          contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      </KeyboardAvoidingView>

      <NoteForm visible={creating} onCancel={() => setCreating(false)} onSaved={() => setCreating(false)} />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: screenContentStyle,
  header: { gap: spacing.xl, marginBottom: spacing.xl },
  composer: { gap: spacing.md },
  textArea: { minHeight: 120, paddingTop: spacing.md, paddingBottom: spacing.md },
  composerFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  hint: { flex: 1, fontSize: 11 },
  filterWrap: { gap: spacing.sm },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pressed: { opacity: 0.7 },
  empty: { color: colors.textMuted },
  separator: { height: spacing.sm },
  recipeRow: { gap: spacing.sm, alignItems: 'stretch' },
});
