import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

// Placeholder — full implementation in Phase 7
export default function HomeScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
      <Text className="text-gray-400 text-base">{t('nav.home')}</Text>
    </SafeAreaView>
  );
}
