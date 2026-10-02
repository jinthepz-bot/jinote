import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { screenLabel, screenSuggestions, type CoachScreen } from '../agent/screen';
import { getFeaturedGoal, useCoach } from '../coach/store';
import { useTodayKey } from '../coach/useTodayKey';
import { CoachProgress } from '../components/CoachProgress';
import { Composer } from '../components/Composer';
import { Header } from '../components/Header';
import { MessageBubble, ThinkingBubble } from '../components/MessageBubble';
import { SuggestionChips } from '../components/SuggestionChips';
import { TaskCard } from '../components/TaskCard';
import { useMock } from '../config';
import { confirmDestructive } from '../design/confirm';
import { useAccent } from '../design/accent';
import { hoverFill } from '../design/hover';
import { useType } from '../design/fonts';
import { colors, radius, sizes, spacing } from '../design/theme';
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
          style={(state) => [styles.example, hoverFill(state)]}
          onPress={() => onPick(example)}
          accessibilityRole="button"
        >
          <Text style={[type.body, { color: accent.accent }]}>{example}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// A bordered chevron matching the Settings gear, so the panel's two header controls
// are the same size and shape.
function CollapseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Hide coach panel"
      style={(state) => [styles.headerButton, hoverFill(state)]}
    >
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

// `embedded` is the desktop coach panel: no safe-area padding, no Settings gear
// (the sidebar has one), a compact header, and a button to collapse the panel.
// The chat logic is the same hook.
//
// `screen` (embedded only) is what the user is looking at: shown as "Sees: …", sent
// with each message, and used to pick the suggestion chips.
export function ChatScreen({
  embedded = false,
  onCollapse,
  screen,
}: {
  embedded?: boolean;
  onCollapse?: () => void;
  screen?: CoachScreen;
}) {
  const { messages, activity, loaded, send: sendRaw, retry, stop, clear, undo } = useAgentChat();
  const todayKey = useTodayKey();
  const coach = useCoach();
  // Read at send time, so a message goes with the screen the user is on right then.
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const send = (text: string) => sendRaw(text, screenRef.current);
  const suggestions = embedded && screen && coach.loaded ? screenSuggestions(screen, getFeaturedGoal(coach.state), todayKey) : [];
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<AppMessage>>(null);

  // A new message (and the receipts under it) can finish laying out after the list's
  // own content-size scroll has run, leaving the newest reply half hidden. Scrolling
  // again once things settle keeps the latest reply and its receipts in view.
  useEffect(() => {
    const soon = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    // A second, instant pass for a long history on first load, whose rows keep
    // measuring in after the first scroll has already stopped.
    const settled = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 400);
    return () => {
      clearTimeout(soon);
      clearTimeout(settled);
    };
  }, [messages.length, activity]);

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
        action={embedded ? onCollapse && <CollapseButton onPress={onCollapse} /> : <SettingsButton />}
        compact={embedded}
        sees={embedded && screen ? screenLabel(screen, todayKey) : undefined}
      />
      {embedded ? <CoachProgress /> : null}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <FlatList
          ref={listRef}
          data={messages}
          // Try again shows only while idle, so rows re-render when that changes.
          extraData={activity}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) =>
            item.kind === 'task' ? (
              <TaskCard task={item} />
            ) : (
              <MessageBubble
                message={item}
                receipts={embedded}
                onUndo={(i) => undo(item.id, i)}
                onRetry={
                  item.canRetry && activity.kind === 'idle' && item.id === messages[messages.length - 1]?.id
                    ? () => retry(item.id, screenRef.current)
                    : undefined
                }
              />
            )
          }
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={loaded ? <EmptyState onPick={send} /> : null}
          ListFooterComponent={activity.kind === 'thinking' ? <ThinkingBubble retrying={activity.retrying} /> : null}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        />
        {embedded ? <SuggestionChips suggestions={suggestions} disabled={activity.kind !== 'idle'} onPick={send} /> : null}
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
  headerButton: {
    width: sizes.controlSm,
    height: sizes.controlSm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
