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
import { useState, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccent } from '../design/accent';
import { useType } from '../design/fonts';
import { colors } from '../design/theme';
import { ChatScreen } from '../screens/ChatScreen';
import { GoalsScreen } from '../screens/GoalsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { JournalScreen } from '../screens/JournalScreen';
import { ScheduleScreen } from '../screens/ScheduleScreen';
import { COACH_PANEL_WIDTH, useIsDesktop } from './layout';
import { SettingsHost } from './SettingsHost';
import { Sidebar, type JournalSection, type SidebarTarget } from './Sidebar';

export type RootTabParamList = {
  Home: undefined;
  Goals: undefined;
  // `n` changes on every sidebar click so choosing the same section twice still applies it.
  Journal: { section?: JournalSection; n?: number } | undefined;
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
  const desktop = useIsDesktop();
  const navRef = useNavigationContainerRef<RootTabParamList>();
  const [route, setRoute] = useState<string>('Home');
  const [journalSection, setJournalSection] = useState<JournalSection | undefined>();

  const syncRoute = () => {
    const current = navRef.getCurrentRoute();
    setRoute(current?.name ?? 'Home');
    setJournalSection(current?.name === 'Journal' ? (current.params as { section?: JournalSection } | undefined)?.section : undefined);
  };

  const navigate = (target: SidebarTarget) => {
    if (target.screen === 'Journal') navRef.navigate('Journal', { section: target.section, n: Date.now() });
    else navRef.navigate(target.screen);
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
          <View style={styles.desktop}>
            <Sidebar route={route} journalSection={journalSection} onNavigate={navigate} />
            <View style={styles.main}>{tabs}</View>
            <View style={styles.coach}>
              <ChatScreen embedded />
            </View>
          </View>
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
});
