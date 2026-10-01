import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAccent } from '../design/accent';
import { confirmDestructive } from '../design/confirm';
import { useType } from '../design/fonts';
import { hoverDim, hoverFill } from '../design/hover';
import { colors, radius, spacing } from '../design/theme';
import { Card, IconButton } from '../design/ui';
import { deleteNotePhoto } from './photos';
import { deleteNote, type RecipeNote } from './store';

// `onOpen` (desktop only) makes the photo and the title links to the recipe's page.
export function RecipeCard({ note, onOpen }: { note: RecipeNote; onOpen?: () => void }) {
  const type = useType();
  const accent = useAccent();
  const link = (child: ReactNode, fill: boolean) =>
    onOpen ? (
      <Pressable
        onPress={onOpen}
        accessibilityRole="link"
        accessibilityLabel={`Open "${note.title}"`}
        style={(s) => (fill ? [styles.titleLink, hoverFill(s)] : hoverDim(s))}
      >
        {child}
      </Pressable>
    ) : (
      child
    );

  const confirmDelete = () =>
    confirmDestructive({
      title: `Delete "${note.title}"?`,
      message: note.photoUri ? 'Its photo is deleted too.' : undefined,
      confirmLabel: 'Delete',
      onConfirm: () => {
        deleteNotePhoto(note.photoUri);
        deleteNote(note.id);
      },
    });

  return (
    <Card style={styles.card}>
      <View style={styles.imageWrap}>
        {link(
          note.photoUri ? (
            <Image source={{ uri: note.photoUri }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={styles.placeholder}>
              <Text style={[type.label, { color: accent.accent, letterSpacing: 1 }]}>NO PHOTO</Text>
            </View>
          ),
          false,
        )}
        <IconButton icon="trash-outline" label={`Delete recipe "${note.title}"`} onPress={confirmDelete} color={colors.text} />
      </View>
      {link(
        <Text style={[type.bodyStrong, styles.title]} numberOfLines={2}>
          {note.title}
        </Text>,
        true,
      )}
      <View style={styles.tags}>
        {note.cookTime ? (
          <Text style={[type.mono, styles.tag, { color: accent.accent }]}>{note.cookTime}</Text>
        ) : null}
        <Text style={[type.mono, styles.tag, { color: accent.accent }]}>{note.category}</Text>
      </View>
      <View style={styles.rating} accessibilityLabel={`${note.rating} out of 3 stars`}>
        {[1, 2, 3].map((star) => (
          <Text key={star} style={[styles.star, star <= note.rating && { color: accent.accent }]}>
            ★
          </Text>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 0, padding: 0, overflow: 'hidden', gap: spacing.sm },
  imageWrap: { position: 'relative' },
  photo: { width: '100%', aspectRatio: 1.15, backgroundColor: colors.surface2 },
  placeholder: {
    width: '100%',
    aspectRatio: 1.15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { paddingHorizontal: spacing.md, paddingTop: 2 },
  titleLink: { marginHorizontal: spacing.xs, paddingVertical: 2, borderRadius: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingHorizontal: spacing.md },
  tag: {
    backgroundColor: colors.surface2,
    borderRadius: radius.control,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontSize: 9,
  },
  rating: { flexDirection: 'row', gap: 2, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  star: { color: colors.border, fontSize: 15 },
});
