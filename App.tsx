import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccentProvider } from './src/design/accent';
import { FontProvider } from './src/design/fonts';
import { RootNavigator } from './src/navigation/RootNavigator';
import { NotificationsEngine } from './src/notifications/NotificationsEngine';
import { migrateChatData } from './src/storage/migrateChatData';

export default function App() {
  // One-time: brings the old Chat to-dos and notes into tasks and the journal.
  useEffect(() => {
    migrateChatData();
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
