import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccentProvider } from './src/design/accent';
import { FontProvider } from './src/design/fonts';
import { RootNavigator } from './src/navigation/RootNavigator';
import { NotificationsEngine } from './src/notifications/NotificationsEngine';
import { migrateChatData } from './src/storage/migrateChatData';
import { startSync } from './src/sync/engine';

export default function App() {
  // One-time: brings the old Chat to-dos and notes into tasks and the journal.
  useEffect(() => {
    migrateChatData();
  }, []);

  // Cloud sync, if a Supabase project is configured; otherwise it only keeps track
  // of what changes here, for the day this device signs in.
  useEffect(() => {
    void startSync();
  }, []);

  return (
    <SafeAreaProvider>
      <FontProvider>
        <AccentProvider>
          <RootNavigator />
          <NotificationsEngine />
        </AccentProvider>
      </FontProvider>
    </SafeAreaProvider>
  );
}
