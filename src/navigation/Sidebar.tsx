import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors, radius, spacing } from '../design/theme';
import type { IconName } from '../design/ui';
import { SIDEBAR_WIDTH } from './layout';
import { useSettings } from './SettingsHost';

export type JournalSection = 'quick' | 'checklist' | 'recipe' | 'buy';

export type SidebarTarget =
  | { screen: 'Home' | 'Schedule' | 'Goals' }
  | { screen: 'Journal'; section?: JournalSection };

const NAV: { label: string; icon: IconName; target: SidebarTarget }[] = [
  { label: 'Today', icon: 'sunny-outline', target: { screen: 'Home' } },
  { label: 'Schedule', icon: 'calendar-outline', target: { screen: 'Schedule' } },
  { label: 'Goals', icon: 'flag-outline', target: { screen: 'Goals' } },
  { label: 'Journal', icon: 'book-outline', target: { screen: 'Journal' } },
];

const JOURNAL_LINKS: { label: string; section: JournalSection }[] = [
  { label: 'Quick notes', section: 'quick' },
  { label: 'Checklists', section: 'checklist' },
  { label: 'Recipes', section: 'recipe' },
  { label: 'To-buy', section: 'buy' },
];

interface Props {
  route: string; // the active tab's name
  journalSection: JournalSection | undefined;
  onNavigate: (target: SidebarTarget) => void;
}

export function Sidebar({ route, journalSection, onNavigate }: Props) {
  const type = useType();
  const accent = useAccent();
  const { open: openSettings } = useSettings();
  const inJournal = route === 'Journal';

  return (
    <View style={styles.root}>
      <Text style={[type.display, styles.logo]} accessibilityRole="header">
        Jinote
      </Text>

      {/* Visual only for now: no search behind it yet. */}
      <View style={styles.search} accessibilityRole="search">
        <Ionicons name="search-outline" size={15} color={colors.textMuted} />
        <Text style={[type.body, styles.searchText]}>Search</Text>
        <Text style={[type.label, styles.kbd]}>⌘K</Text>
      </View>

      <View style={styles.nav}>
        {NAV.map((item) => {
          const active = route === item.target.screen;
          return (
            <View key={item.label}>
              <NavLink
                label={item.label}
                icon={item.icon}
                active={active && !(inJournal && journalSection)}
                activeColor={accent.accent}
                onPress={() => onNavigate(item.target)}
              />
              {item.target.screen === 'Journal' && (
                <View style={styles.subList}>
                  {JOURNAL_LINKS.map((link) => (
                    <NavLink
                      key={link.section}
                      label={link.label}
                      sub
                      active={inJournal && journalSection === link.section}
                      activeColor={accent.accent}
                      onPress={() => onNavigate({ screen: 'Journal', section: link.section })}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.spacer} />
      <NavLink label="Settings" icon="settings-outline" activeColor={accent.accent} onPress={openSettings} />
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
      style={({ pressed }) => [
        styles.link,
        sub && styles.linkSub,
        active && styles.linkActive,
        pressed && styles.pressed,
      ]}
    >
      {icon ? <Ionicons name={icon} size={17} color={tint} /> : null}
      <Text style={[active ? type.bodyStrong : type.body, { color: tint, fontSize: sub ? 14 : 15 }]}>{label}</Text>
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
  logo: { fontSize: 28, lineHeight: 34, paddingHorizontal: spacing.sm },
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
  spacer: { flex: 1 },
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
