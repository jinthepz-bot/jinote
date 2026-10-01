import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dayKey, formatDayKey, formatTime } from '../coach/days';
import { confirmDestructive } from '../design/confirm';
import { useType } from '../design/fonts';
import { hoverFill } from '../design/hover';
import { spacing } from '../design/theme';
import { Card, IconButton } from '../design/ui';
import { deleteNote, type QuickNote } from './store';

// `onOpen` (desktop only) makes the text a link to the note's own page.
export function QuickNoteCard({ note, todayKey, onOpen }: { note: QuickNote; todayKey: string; onOpen?: () => void }) {
  const type = useType();
  const day = dayKey(new Date(note.createdAt));
  const stamp = `${day === todayKey ? 'Today' : formatDayKey(day, todayKey)} · ${formatTime(note.createdAt)}`;

  const confirmDelete = () =>
    confirmDestructive({
      title: 'Delete this note?',
      message: note.text.length > 120 ? `${note.text.slice(0, 117)}...` : note.text,
      confirmLabel: 'Delete',
      onConfirm: () => deleteNote(note.id),
    });

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={type.label}>{stamp}</Text>
        <IconButton icon="trash-outline" label={`Delete note from ${stamp}`} onPress={confirmDelete} />
      </View>
      {onOpen ? (
        <Pressable onPress={onOpen} accessibilityRole="link" accessibilityLabel="Open note" style={(s) => [styles.open, hoverFill(s)]}>
          <Text style={type.body} numberOfLines={6}>
            {note.text}
          </Text>
        </Pressable>
      ) : (
        <Text selectable style={type.body}>
          {note.text}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  // Bleeds into the card's padding so the hover tint has a little room around the text.
  open: { marginHorizontal: -spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 6 },
});
