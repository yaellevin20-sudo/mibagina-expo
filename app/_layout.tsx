import '../global.css';
import '../lib/i18n';

import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '../contexts/AuthContext';
import i18n from '../lib/i18n';

// Enforce RTL for Hebrew (default language).
// When language is Hebrew, force RTL. When English, force LTR.
// A restart is required after toggling — handled at the language-switch call site.
const isHebrew = i18n.language === 'he';
if (I18nManager.isRTL !== isHebrew) {
  I18nManager.forceRTL(isHebrew);
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
