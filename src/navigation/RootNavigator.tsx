import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  useIsFocused,
  useNavigationContainerRef,
  type Theme,
} from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccent } from '../design/accent';
import { hoverFill } from '../design/hover';
import { useType } from '../design/fonts';
import { colors, radius, sizes, spacing } from '../design/theme';
import { ChatScreen } from '../screens/ChatScreen';
import { GoalsScreen } from '../screens/GoalsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { JournalScreen } from '../screens/JournalScreen';
import { ScheduleScreen } from '../screens/ScheduleScreen';
import { setCoachPanelCollapsed } from './coachPanelStore';
import { CoachPanel } from './CoachPanel';
import {
  COACH_PANEL_COLLAPSED_WIDTH,
  COACH_PANEL_WIDTH,
  useCoachPanelCollapsed,
  useLayoutMode,
} from './layout';
import { RightSheetHost } from './RightSheet';
import { SettingsHost } from './SettingsHost';
import { Sidebar, SidebarRail, type JournalSection, type SidebarTarget } from './Sidebar';

export type RootTabParamList = {
  Home: undefined;
  Goals: undefined;
  // `n` changes on every sidebar click so choosing the same section twice still applies it.
  // `noteId` opens that note as a page (desktop only). `day` is the Daily journal's
  // date when it isn't today. `folder` scopes the card grid to one folder's notes.
  Journal: { section?: JournalSection; noteId?: string; day?: string; folder?: string; n?: number } | undefined;
  Schedule: undefined;
  Chat: undefined;
};

type IconName = ComponentProps<typeof Ionicons>['name'];

// [focused, unfocused]
const TAB_ICONS: Record<keyof RootTabParamList, [IconName, IconName]> = {
  Home: ['home', 'home-outline'],
  Goals: ['flag', 'flag-outline'],
  Journal: ['book', 'book-outline'],
  Schedule: ['calendar', 'calendar-outline'],
  Chat: ['chatbubble-ellipses', 'chatbubble-ellipses-outline'],
};

const Tab = createBottomTabNavigator<RootTabParamList>();

function navigationTheme(accent: string): Theme {
  const base = colors.isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: accent,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.accentStrong,
    },
  };
}

// Tabs stay mounted, so only the focused screen renders the status bar.
function FocusAwareStatusBar() {
  return useIsFocused() ? <StatusBar style={colors.isDark ? 'light' : 'dark'} /> : null;
}

function HomeTab() {
  return (
    <>
      <FocusAwareStatusBar />
      <HomeScreen />
    </>
  );
}

function GoalsTab() {
  return (
    <>
      <FocusAwareStatusBar />
      <GoalsScreen />
    </>
  );
}

function JournalTab() {
  return (
    <>
      <FocusAwareStatusBar />
      <JournalScreen />
    </>
  );
}

function ScheduleTab() {
  return (
    <>
      <FocusAwareStatusBar />
      <ScheduleScreen />
    </>
  );
}

// ChatScreen pads its composer for the home indicator itself. Inside the tab
// navigator the tab bar already covers that, so give it a zero bottom inset.
function ChatTab() {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaInsetsContext.Provider value={{ ...insets, bottom: 0 }}>
      <FocusAwareStatusBar />
      <ChatScreen />
    </SafeAreaInsetsContext.Provider>
  );
}

export function RootNavigator() {
  const type = useType();
  const accent = useAccent();
  const layout = useLayoutMode();
  const desktop = layout !== 'phone';
  const compact = layout === 'compact';
  const coachCollapsed = useCoachPanelCollapsed();
  // The compact layout's two overlays: the full sidebar over the rail, and the coach
  // panel over the right of the main area. Neither is remembered — they're for a
  // quick look, and they close when the window grows out of the compact layout.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const navRef = useNavigationContainerRef<RootTabParamList>();
  const [route, setRoute] = useState<string>('Home');
  const [journalSection, setJournalSection] = useState<JournalSection | undefined>();
  const [openNoteId, setOpenNoteId] = useState<string | undefined>();
  const [journalDay, setJournalDay] = useState<string | undefined>();
  const [journalFolder, setJournalFolder] = useState<string | undefined>();

  const syncRoute = () => {
    const current = navRef.getCurrentRoute();
    const params = current?.name === 'Journal' ? (current.params as RootTabParamList['Journal']) : undefined;
    setRoute(current?.name ?? 'Home');
    setJournalSection(params?.section);
    setOpenNoteId(params?.noteId);
    setJournalDay(params?.day);
    setJournalFolder(params?.folder);
  };

  useEffect(() => {
    if (compact) return;
    setSidebarOpen(false);
    setCoachOpen(false);
  }, [compact]);

  // Escape folds the open overlay back (the sidebar first, as it's on top).
  useEffect(() => {
    if (Platform.OS !== 'web' || (!sidebarOpen && !coachOpen)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (sidebarOpen) setSidebarOpen(false);
      else setCoachOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen, coachOpen]);

  const navigate = (target: SidebarTarget) => {
    setSidebarOpen(false);
    if (target.screen === 'Journal') {
      navRef.navigate('Journal', {
        section: target.section,
        noteId: target.noteId,
        folder: target.folder,
        day: undefined,
        n: Date.now(),
      });
    } else navRef.navigate(target.screen);
  };

  const tabs = (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: accent.accent,
        tabBarInactiveTintColor: colors.textMuted,
        // The sidebar replaces the tab bar on desktop.
        tabBarStyle: desktop
          ? { display: 'none' }
          : { backgroundColor: colors.surface, borderTopColor: colors.border },
        // Five tabs fit their labels at the normal size; Settings moved to a gear
        // in each screen's title row (see SettingsHost).
        tabBarLabelStyle: [type.label, { fontSize: 10, letterSpacing: 0.4, color: undefined }],
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={TAB_ICONS[route.name][focused ? 0 : 1]} size={size - 2} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeTab} />
      <Tab.Screen name="Goals" component={GoalsTab} />
      <Tab.Screen name="Journal" component={JournalTab} />
      <Tab.Screen name="Schedule" component={ScheduleTab} />
      {/* On desktop the coach lives in its own always-visible panel. */}
      {desktop ? null : <Tab.Screen name="Chat" component={ChatTab} />}
    </Tab.Navigator>
  );

  return (
    <NavigationContainer ref={navRef} theme={navigationTheme(accent.accent)} onStateChange={syncRoute}>
      <SettingsHost>
        {desktop ? (
          <RightSheetHost>
            <View style={styles.desktop}>
              {compact ? (
                <SidebarRail route={route} onNavigate={navigate} onExpand={() => setSidebarOpen(true)} />
              ) : (
                <Sidebar
                  route={route}
                  journalSection={journalSection}
                  journalFolder={journalFolder}
                  openNoteId={openNoteId}
                  onNavigate={navigate}
                />
              )}
              <View style={styles.main}>{tabs}</View>
              {coachCollapsed ? (
                <View style={styles.coachStrip}>
                  <Pressable
                    onPress={() => (compact ? setCoachOpen(true) : setCoachPanelCollapsed(false))}
                    accessibilityRole="button"
                    accessibilityLabel="Show coach panel"
                    style={(state) => [styles.coachStripButton, hoverFill(state)]}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color={accent.accent} />
                  </Pressable>
                </View>
              ) : null}
              {/* Collapsing only unmounts the panel's view — the chat state lives in
                  useAgentChat's store, so reopening it shows the same conversation. */}
              {!coachCollapsed || (compact && coachOpen) ? (
                <View style={[styles.coach, compact && styles.coachOverlay]}>
                  <CoachPanel
                    route={route}
                    journalSection={journalSection}
                    openNoteId={openNoteId}
                    journalDay={journalDay}
                    onCollapse={() => (compact ? setCoachOpen(false) : setCoachPanelCollapsed(true))}
                  />
                </View>
              ) : null}
              {compact && sidebarOpen ? (
                <>
                  <Pressable
                    style={styles.scrim}
                    onPress={() => setSidebarOpen(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Close sidebar"
                  />
                  <View style={styles.sidebarOverlay}>
                    <Sidebar
                      route={route}
                      journalSection={journalSection}
                      journalFolder={journalFolder}
                      openNoteId={openNoteId}
                      onNavigate={navigate}
                      onClose={() => setSidebarOpen(false)}
                    />
                  </View>
                </>
              ) : null}
            </View>
          </RightSheetHost>
        ) : (
          tabs
        )}
      </SettingsHost>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  desktop: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  main: { flex: 1, minWidth: 0 },
  coach: {
    width: COACH_PANEL_WIDTH,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    backgroundColor: colors.background,
  },
  // Over the main area's right edge rather than beside it, in the compact layout.
  coachOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: -4, height: 0 },
    elevation: 8,
  },
  sidebarOverlay: { position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 41, flexDirection: 'row' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 40, backgroundColor: 'rgba(0,0,0,0.18)' },
  coachStrip: {
    width: COACH_PANEL_COLLAPSED_WIDTH,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    backgroundColor: colors.sidebar,
    alignItems: 'center',
    paddingTop: spacing.lg,
  },
  coachStripButton: {
    width: sizes.controlSm,
    height: sizes.controlSm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
