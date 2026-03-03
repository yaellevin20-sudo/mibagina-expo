import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { createGuardian, touchLastActive } from '../../lib/db/rpc';
import OnboardingProgress from '../../components/OnboardingProgress';

const BRAND_GREEN = '#3D7A50';

const INPUT_STYLE = {
  backgroundColor: '#F7FAF8',
  borderWidth: 1.5,
  borderColor: 'rgba(0,0,0,0.10)',
  borderRadius: 10,
};

const BTN_SHADOW = {
  shadowColor: BRAND_GREEN,
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.28,
  shadowRadius: 7,
  elevation: 6,
};

export default function NameScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill name from Google user metadata (only if truthy)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const googleName = user.user_metadata?.full_name as string | undefined;
      if (googleName) setName(googleName);
      if (user.email) setEmail(user.email);
    });
  }, []);

  async function handleContinue() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('errors.generic'));
      return;
    }

    setError(null);
    setLoading(true);
    try {
      // Create the guardians row server-side.
      await createGuardian(trimmed);

      // touch_last_active() — now the row exists, will return true.
      try {
        const found = await touchLastActive();
        if (!found) console.warn('[name] touch_last_active returned false after create_guardian');
      } catch (e) {
        console.warn('[name] touch_last_active failed', e);
      }

      // Proceed to onboarding: children step (2/4)
      router.replace('/(auth)/children');
    } catch (e: any) {
      setError(e.message ?? t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={['#FFFFFF', '#F1FDF5']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          className="flex-1 px-6"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Back button */}
          <TouchableOpacity className="pt-4 pb-2" onPress={() => router.back()}>
            <Text className="font-rubik text-sm text-gray-500">{t('nav.back')}</Text>
          </TouchableOpacity>

          {/* Progress bar */}
          <View className="pt-4">
            <OnboardingProgress steps={4} current={1} />
          </View>

          {/* Title */}
          <Text className="font-rubik-bold text-brand-green-dark mb-1" style={{ fontSize: 27 }}>
            {t('onboarding.name_title')}
          </Text>
          <Text className="font-rubik text-gray-500 mb-2">
            {t('onboarding.name_subtitle')}
          </Text>

          {email ? (
            <Text className="text-sm font-rubik text-gray-400 mb-6">{email}</Text>
          ) : (
            <View className="mb-6" />
          )}

          {error && (
            <Text className="text-red-500 text-sm mb-4 font-rubik">{error}</Text>
          )}

          <TextInput
            className="rounded-xl px-4 py-3 mb-6 text-base font-rubik"
            style={INPUT_STYLE}
            value={name}
            onChangeText={setName}
            placeholder={t('auth.display_name_placeholder')}
            autoFocus
            editable={!loading}
            returnKeyType="done"
            onSubmitEditing={handleContinue}
          />

          <TouchableOpacity
            className="rounded-xl py-4 items-center"
            style={{
              backgroundColor: name.trim() ? BRAND_GREEN : '#D1D5DB',
              ...(name.trim() ? BTN_SHADOW : {}),
            }}
            onPress={handleContinue}
            disabled={loading || !name.trim()}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-rubik-bold text-base">{t('onboarding.continue')}</Text>
            )}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
