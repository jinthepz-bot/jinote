import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';

import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { hoverFill } from '../design/hover';
import { colors, keyboardAppearance, radius, spacing } from '../design/theme';
import { addTag, cleanTag, MAX_TAG_LENGTH, removeTag, tagsInUse, useNotes, type Note } from './store';

const MAX_SUGGESTIONS = 6;
const noOutline = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;

// A note's tags under its title on the desktop note page: each with a × to remove
// it, and "+ tag" to add one, suggesting tags already used on other notes.
export function TagRow({ note }: { note: Note }) {
  const type = useType();
  const accent = useAccent();
  const { state } = useNotes();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  // -1 until the arrow keys (or the pointer) pick a suggestion.
  const [highlight, setHighlight] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);

  const q = cleanTag(draft).toLowerCase();
  const own = new Set(note.tags.map((t) => t.toLowerCase()));
  const suggestions = adding
    ? tagsInUse(state.notes)
        .filter((t) => !own.has(t.toLowerCase()) && t.toLowerCase().includes(q))
        .slice(0, MAX_SUGGESTIONS)
    : [];

  const close = () => {
    setAdding(false);
    setDraft('');
    setHighlight(-1);
  };

  // Enter adds what was typed, unless a suggestion was picked with the arrows.
  const commit = (tag?: string) => {
    const chosen = tag ?? suggestions[highlight] ?? draft;
    if (cleanTag(chosen)) addTag(note.id, chosen);
    close();
  };

  return (
    <View style={styles.row}>
      {note.tags.map((tag) => (
        <View key={tag} style={[styles.tag, { backgroundColor: accent.accentSoft }]}>
          <Text style={[type.body, styles.tagText, { color: accent.accent }]}>#{tag}</Text>
          <Pressable
            onPress={() => removeTag(note.id, tag)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Remove tag ${tag}`}
            style={(s) => [styles.remove, hoverFill(s)]}
          >
            <Ionicons name="close" size={12} color={accent.accent} />
          </Pressable>
        </View>
      ))}

      {adding ? (
        <View style={styles.inputWrap}>
          <TextInput
            style={[type.body, styles.input, noOutline]}
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              setHighlight(-1);
            }}
            autoFocus
            maxLength={MAX_TAG_LENGTH + 1}
            placeholder="tag"
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={keyboardAppearance}
            onSubmitEditing={() => commit()}
            submitBehavior="submit"
            onKeyPress={(e) => {
              const key = e.nativeEvent.key;
              if (key === 'Escape') close();
              else if (key === 'ArrowDown') setHighlight((h) => Math.min(h + 1, Math.max(0, suggestions.length - 1)));
              else if (key === 'ArrowUp') setHighlight((h) => Math.max(-1, h - 1));
            }}
            // A click on a suggestion blurs the field first; wait so it still lands.
            onBlur={() => {
              blurTimer.current = setTimeout(close, 150);
            }}
            accessibilityLabel="New tag"
          />
          {suggestions.length > 0 ? (
            <View style={styles.menu} accessibilityRole="menu">
              {suggestions.map((s, i) => (
                <Pressable
                  key={s}
                  onPress={() => {
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                    commit(s);
                  }}
                  onHoverIn={() => setHighlight(i)}
                  accessibilityRole="menuitem"
                  accessibilityLabel={`Add tag ${s}`}
                  style={(st) => [styles.option, i === highlight && styles.optionOn, hoverFill(st)]}
                >
                  <Text style={[type.body, styles.optionText]}>#{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          accessibilityLabel="Add a tag"
          style={(s) => [styles.add, hoverFill(s)]}
        >
          <Text style={[type.body, styles.addText]}>+ tag</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Above the page's body text, so the suggestions open over it.
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, zIndex: 10 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 26, paddingLeft: 10, paddingRight: 4, borderRadius: 13 },
  tagText: { fontSize: 13 },
  remove: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  add: { height: 26, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', justifyContent: 'center' },
  addText: { fontSize: 13, color: colors.textMuted },
  inputWrap: { position: 'relative' },
  input: {
    width: 140,
    height: 26,
    paddingHorizontal: 10,
    fontSize: 13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
  },
  menu: {
    position: 'absolute',
    top: 30,
    left: 0,
    minWidth: 160,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  option: { paddingHorizontal: spacing.md, paddingVertical: 6 },
  optionOn: { backgroundColor: colors.background },
  optionText: { fontSize: 14 },
});
