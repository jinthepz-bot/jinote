import { StyleSheet, Text, View } from 'react-native';

import { dayKey, formatDayKey, formatTime } from '../coach/days';
import { confirmDestructive } from '../design/confirm';
import { useType } from '../design/fonts';
import { spacing } from '../design/theme';
import { Card, IconButton } from '../design/ui';
import { deleteNote, type QuickNote } from './store';

export function QuickNoteCard({ note, todayKey }: { note: QuickNote; todayKey: string }) {
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
      <Text selectable style={type.body}>
        {note.text}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
