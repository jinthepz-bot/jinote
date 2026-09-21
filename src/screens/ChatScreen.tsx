import { useRef } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Composer } from '../components/Composer';
import { Header } from '../components/Header';
import { MessageBubble, ThinkingBubble } from '../components/MessageBubble';
import { TaskCard } from '../components/TaskCard';
import { useMock } from '../config';
import { confirmDestructive } from '../design/confirm';
import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, radius, spacing } from '../design/theme';
import { SettingsButton } from '../navigation/SettingsHost';
import type { AppMessage } from '../types';
import { useAgentChat } from '../useAgentChat';

const EXAMPLES = ['Log 24 push-ups', 'Remind me to email my professor', "I skipped today, I was wiped out"];

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const type = useType();
  const accent = useAccent();
  return (
    <View style={styles.empty}>
      <Text style={[type.display, styles.emptyTitle]}>TALK TO YOUR COACH</Text>
      <Text style={[type.body, styles.emptyBody]}>
        It can see your goals, streak, tasks and journal, and it can log progress or add things for you.
      </Text>
      <Text style={[type.label, styles.examplesLabel]}>Try</Text>
      {EXAMPLES.map((example) => (
        <Pressable
          key={example}
          style={({ pressed }) => [styles.example, pressed && styles.pressed]}
          onPress={() => onPick(example)}
          accessibilityRole="button"
        >
          <Text style={[type.body, { color: accent.accent }]}>{example}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// `embedded` is the desktop coach panel: no safe-area padding, no Settings gear
// (the sidebar has one), and a compact header. The chat logic is the same hook.
export function ChatScreen({ embedded = false }: { embedded?: boolean }) {
  const { messages, activity, loaded, send, stop, clear } = useAgentChat();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<AppMessage>>(null);

  const confirmClear = () =>
    confirmDestructive({
      title: 'Clear chat?',
      message: "This deletes the conversation from this device. Your goals, tasks and journal aren't affected.",
      confirmLabel: 'Clear',
      onConfirm: clear,
    });

  return (
    <View style={[styles.root, { paddingTop: embedded ? 0 : insets.top }]}>
      <Header
        activity={activity}
        mock={useMock}
        canClear={messages.length > 0}
        onClear={confirmClear}
        action={embedded ? undefined : <SettingsButton />}
        compact={embedded}
      />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) =>
            item.kind === 'task' ? <TaskCard task={item} /> : <MessageBubble message={item} />
          }
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={loaded ? <EmptyState onPick={send} /> : null}
          ListFooterComponent={activity.kind === 'thinking' ? <ThinkingBubble /> : null}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        />
        <Composer busy={activity.kind !== 'idle'} onSend={send} onStop={stop} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  list: { flexGrow: 1, padding: spacing.lg, width: '100%', maxWidth: 560, alignSelf: 'center' },
  empty: { flex: 1, justifyContent: 'center', gap: spacing.md },
  emptyTitle: { fontSize: 38, lineHeight: 42, letterSpacing: 1 },
  emptyBody: { color: colors.textMuted },
  examplesLabel: { marginTop: spacing.xs },
  example: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: { opacity: 0.7 },
});
