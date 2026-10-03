import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTodayKey } from '../coach/useTodayKey';
import { useAccent } from '../design/accent';
import { hoverFill } from '../design/hover';
import { useType } from '../design/fonts';
import { colors, radius, spacing } from '../design/theme';
import type { IconName } from '../design/ui';
import { noteTitle } from '../notes/format';
import { pinnedNotes, useNotes, type NoteType } from '../notes/store';
import type { CalendarKind } from '../schedule/calendar/items';
import { kindColors } from '../schedule/calendar/kindColors';
import { goToDay, toggleFilter, useCalendarView, type CalendarFilters } from '../schedule/calendar/viewStore';
import { syncConfigured } from '../sync/client';
import { SYNC_ICONS, syncLabel, useSyncStatus, type SyncPhase } from '../sync/status';
import { MiniMonth } from './MiniMonth';
import { SidebarFolders } from './SidebarFolders';
import { SIDEBAR_RAIL_WIDTH, SIDEBAR_WIDTH } from './layout';
import { useSettings } from './SettingsHost';

export type JournalSection = 'daily' | 'quick' | 'checklist' | 'recipe' | 'buy';

export type SidebarTarget =
  | { screen: 'Home' | 'Schedule' | 'Goals' }
  | { screen: 'Journal'; section?: JournalSection; noteId?: string; folder?: string };

const NAV: { label: string; icon: IconName; target: SidebarTarget }[] = [
  { label: 'Today', icon: 'sunny-outline', target: { screen: 'Home' } },
  { label: 'Schedule', icon: 'calendar-outline', target: { screen: 'Schedule' } },
  { label: 'Goals', icon: 'flag-outline', target: { screen: 'Goals' } },
  { label: 'Journal', icon: 'book-outline', target: { screen: 'Journal' } },
];

const JOURNAL_LINKS: { label: string; section: JournalSection }[] = [
  { label: 'Daily journal', section: 'daily' },
  { label: 'Quick notes', section: 'quick' },
  { label: 'Checklists', section: 'checklist' },
  { label: 'Recipes', section: 'recipe' },
  { label: 'To-buy', section: 'buy' },
];

const NOTE_ICONS: Record<NoteType, IconName> = {
  quick: 'document-text-outline',
  checklist: 'checkbox-outline',
  recipe: 'restaurant-outline',
};

interface Props {
  route: string; // the active tab's name
  journalSection: JournalSection | undefined;
  journalFolder: string | undefined; // the folder the Journal grid is showing, if any
  openNoteId: string | undefined; // the note open as a page on Journal, if any
  onNavigate: (target: SidebarTarget) => void;
  // Set when the sidebar is open over the compact layout's icon rail: shows a button
  // to fold it back.
  onClose?: () => void;
}

export function Sidebar({ route, journalSection, journalFolder, openNoteId, onNavigate, onClose }: Props) {
  const type = useType();
  const accent = useAccent();
  const { open: openSettings } = useSettings();
  const { state: notesState } = useNotes();
  const inJournal = route === 'Journal';
  const pinned = pinnedNotes(notesState.notes);
  // A rule between the fixed links and the scrolling part, once something has
  // scrolled under it.
  const [scrolled, setScrolled] = useState(false);

  // With a note open, the sub-link for its kind stays lit, so the sidebar agrees with
  // the page's breadcrumb ("Journal / Quick notes / ...").
  const openNote = inJournal && openNoteId ? notesState.notes.find((n) => n.id === openNoteId) : undefined;
  // Browsing a folder lights the folder, not a kind of note (a chip may still filter
  // within it). An open note lights its folder if it's filed, else its kind.
  const activeFolder = !inJournal ? undefined : openNote ? (openNote.folderId ?? undefined) : journalFolder;
  const activeSection: JournalSection | undefined = activeFolder
    ? undefined
    : openNote
      ? openNote.type
      : journalSection;

  return (
    <View style={[styles.root, onClose && styles.rootOverlay]}>
      <View style={styles.logoRow}>
        <Text style={[type.display, styles.logo]} accessibilityRole="header">
          Jinote
        </Text>
        {onClose ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Collapse sidebar"
            style={(state) => [styles.closeButton, hoverFill(state)]}
          >
            <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Visual only for now: no search behind it yet. */}
      <View style={styles.search} accessibilityRole="search">
        <Ionicons name="search-outline" size={15} color={colors.textMuted} />
        <Text style={[type.body, styles.searchText]}>Search</Text>
        <Text style={[type.label, styles.kbd]}>⌘K</Text>
      </View>

      {/* The four sections stay put; only what's below them scrolls (it's the part
          that can outgrow a short window). Settings stays put at the bottom. */}
      <View style={styles.navArea}>
        <View style={styles.nav}>
          {NAV.map((item) => (
            <NavLink
              key={item.label}
              label={item.label}
              icon={item.icon}
              active={route === item.target.screen && !(inJournal && (activeSection || activeFolder))}
              activeColor={accent.accent}
              onPress={() => onNavigate(item.target)}
            />
          ))}
        </View>
        <View style={[styles.scrollEdge, scrolled && styles.scrollEdgeOn]} />

        <ScrollView
          style={styles.middle}
          contentContainerStyle={styles.middleContent}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 0)}
          scrollEventThrottle={16}
        >
          {/* Journal is the last of the four, so its sub-links still sit right under it. */}
          <View style={styles.subList}>
            {JOURNAL_LINKS.map((link) => (
              <NavLink
                key={link.section}
                label={link.label}
                sub
                active={inJournal && activeSection === link.section}
                activeColor={accent.accent}
                onPress={() => onNavigate({ screen: 'Journal', section: link.section })}
              />
            ))}
            <SidebarFolders
              activeFolderId={activeFolder}
              activeColor={accent.accent}
              onOpen={(folder) => onNavigate({ screen: 'Journal', folder })}
            />
          </View>

          {pinned.length > 0 ? (
            <View style={styles.pinned}>
              <Text style={[type.label, styles.blockLabel]}>Pinned</Text>
              {pinned.map((note) => (
                <NavLink
                  key={note.id}
                  label={noteTitle(note)}
                  icon={NOTE_ICONS[note.type]}
                  sub
                  active={inJournal && openNoteId === note.id}
                  activeColor={accent.accent}
                  onPress={() => onNavigate({ screen: 'Journal', noteId: note.id })}
                />
              ))}
            </View>
          ) : null}

          {route === 'Schedule' ? <ScheduleTools /> : null}
        </ScrollView>
      </View>

      {syncConfigured ? (
        <SyncLine
          onPress={() => {
            onClose?.();
            openSettings();
          }}
        />
      ) : null}
      <NavLink
        label="Settings"
        icon="settings-outline"
        activeColor={accent.accent}
        onPress={() => {
          onClose?.();
          openSettings();
        }}
      />
    </View>
  );
}

// The compact layout's sidebar: the four sections and Settings as icons, each named
// in a tooltip on hover. The "J" at the top opens the full sidebar over the page.
export function SidebarRail({ route, onNavigate, onExpand }: { route: string; onNavigate: (target: SidebarTarget) => void; onExpand: () => void }) {
  const type = useType();
  const accent = useAccent();
  const { open: openSettings } = useSettings();
  return (
    <View style={styles.rail}>
      <RailButton label="Expand sidebar" onPress={onExpand}>
        <Text style={[type.display, styles.railLogo]}>J</Text>
      </RailButton>
      <View style={styles.railNav}>
        {NAV.map((item) => {
          const active = route === item.target.screen;
          const tint = active ? accent.accent : colors.text;
          return (
            <RailButton key={item.label} label={item.label} active={active} onPress={() => onNavigate(item.target)}>
              <Ionicons name={active ? (item.icon.replace('-outline', '') as IconName) : item.icon} size={20} color={tint} />
            </RailButton>
          );
        })}
      </View>
      <View style={styles.flex} />
      {syncConfigured ? <RailSync onPress={() => openSettings()} /> : null}
      <RailButton label="Settings" onPress={() => openSettings()}>
        <Ionicons name="settings-outline" size={20} color={colors.text} />
      </RailButton>
    </View>
  );
}

const syncTint = (phase: SyncPhase) =>
  phase === 'error' ? colors.deadlineRed : phase === 'synced' ? colors.success : colors.textMuted;

// Above Settings: "Synced", "Syncing…", "Offline"… Opens Settings, where the details are.
function SyncLine({ onPress }: { onPress: () => void }) {
  const type = useType();
  const status = useSyncStatus();
  const label = syncLabel(status);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Open sync settings`}
      style={(state) => [styles.syncLine, hoverFill(state)]}
    >
      <Ionicons name={SYNC_ICONS[status.phase]} size={15} color={syncTint(status.phase)} />
      <Text style={[type.body, styles.syncText]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function RailSync({ onPress }: { onPress: () => void }) {
  const status = useSyncStatus();
  return (
    <RailButton label={syncLabel(status)} onPress={onPress}>
      <Ionicons name={SYNC_ICONS[status.phase]} size={20} color={syncTint(status.phase)} />
    </RailButton>
  );
}

function RailButton({
  label,
  active,
  onPress,
  children,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const type = useType();
  const [hovered, setHovered] = useState(false);
  return (
    <View>
      <Pressable
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        accessibilityRole="link"
        accessibilityLabel={label}
        accessibilityState={{ selected: !!active }}
        style={(state) => [styles.railButton, active && styles.linkActive, hoverFill(state)]}
      >
        {children}
      </Pressable>
      {hovered ? (
        <View style={styles.tooltip} pointerEvents="none">
          <Text style={[type.bodyStrong, styles.tooltipText]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const FILTERS: { key: keyof CalendarFilters; label: string; kind: CalendarKind }[] = [
  { key: 'events', label: 'Events', kind: 'event' },
  { key: 'tasks', label: 'Tasks', kind: 'task' },
  { key: 'sessions', label: 'Goal sessions', kind: 'session' },
  { key: 'deadlines', label: 'Deadlines', kind: 'deadline' },
];

// Only while Schedule is the open screen: the month to jump around with, and which
// kinds of item the grid draws. Both drive the calendar's own view store.
function ScheduleTools() {
  const type = useType();
  const todayKey = useTodayKey();
  const { anchor, filters } = useCalendarView();

  return (
    <View style={styles.tools}>
      <MiniMonth anchor={anchor} todayKey={todayKey} onSelect={goToDay} />

      <View style={styles.showBlock}>
        <Text style={[type.label, styles.showLabel]}>Show</Text>
        {FILTERS.map(({ key, label, kind }) => {
          const on = filters[key];
          const tint = kindColors(kind);
          return (
            <Pressable
              key={key}
              onPress={() => toggleFilter(key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              aria-checked={on}
              accessibilityLabel={`Show ${label.toLowerCase()}`}
              style={(state) => [styles.showRow, hoverFill(state)]}
            >
              <View
                style={[
                  styles.showBox,
                  { borderColor: tint.text },
                  on && { backgroundColor: tint.text },
                ]}
              >
                {on ? <Ionicons name="checkmark" size={12} color={colors.surface} /> : null}
              </View>
              <Text style={[type.body, styles.showText, !on && styles.showTextOff]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function NavLink({
  label,
  icon,
  sub,
  active,
  activeColor,
  onPress,
}: {
  label: string;
  icon?: IconName;
  sub?: boolean;
  active?: boolean;
  activeColor: string;
  onPress: () => void;
}) {
  const type = useType();
  const tint = active ? activeColor : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={(state) => [styles.link, sub && styles.linkSub, active && styles.linkActive, hoverFill(state)]}
    >
      {icon ? <Ionicons name={icon} size={17} color={tint} /> : null}
      <Text
        style={[active ? type.bodyStrong : type.body, styles.linkText, { color: tint, fontSize: sub ? 14 : 15 }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.sidebar,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  rootOverlay: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 4, height: 0 },
    elevation: 8,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { fontSize: 28, lineHeight: 34, paddingHorizontal: spacing.sm },
  closeButton: { width: 32, height: 32, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  // Above the main column, so the tooltips can stick out over it.
  rail: {
    width: SIDEBAR_RAIL_WIDTH,
    zIndex: 10,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.lg,
    backgroundColor: colors.sidebar,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  railNav: { gap: spacing.xs },
  railButton: { width: 44, height: 44, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  railLogo: { fontSize: 26, lineHeight: 32 },
  tooltip: {
    position: 'absolute',
    left: 44 + spacing.sm,
    top: 9,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.control,
    backgroundColor: colors.darkCard,
    zIndex: 20,
  },
  tooltipText: { fontSize: 12, lineHeight: 18, color: colors.isDark ? colors.text : colors.background },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 36,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
  },
  searchText: { flex: 1, color: colors.textMuted, fontSize: 14 },
  kbd: { fontSize: 11, letterSpacing: 0.4, textTransform: 'none' },
  nav: { gap: 2 },
  subList: { marginLeft: spacing.xl, gap: 2, marginBottom: spacing.xs },
  tools: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  showBlock: { gap: 2 },
  showLabel: { paddingHorizontal: spacing.sm + 2, paddingBottom: 2 },
  showRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 28,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.control,
  },
  showBox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  showText: { fontSize: 13 },
  showTextOff: { color: colors.textMuted },
  navArea: { flex: 1 },
  // Always 1px tall, so the rule appearing doesn't nudge the list.
  scrollEdge: { height: 1 },
  scrollEdgeOn: { backgroundColor: colors.border },
  middle: { flex: 1, marginHorizontal: -spacing.xs },
  middleContent: { gap: spacing.lg, paddingHorizontal: spacing.xs },
  pinned: { gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  blockLabel: { paddingHorizontal: spacing.sm + 2, paddingBottom: 4 },
  linkText: { flexShrink: 1 },
  syncLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 28,
    marginBottom: -spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.control,
  },
  syncText: { fontSize: 13, color: colors.textMuted },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: 36,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.control,
  },
  linkSub: { minHeight: 32 },
  linkActive: { backgroundColor: colors.surface },
  pressed: { opacity: 0.7 },
});
