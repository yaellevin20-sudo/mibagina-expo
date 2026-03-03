import { useState, useRef, useEffect } from 'react';
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
import { AntDesign } from '@expo/vector-icons';
import { Link, useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { signIn, signInWithGoogle, sendPasswordReset, getJoinToken } from '../../lib/auth';
import { touchLastActive } from '../../lib/db/rpc';
import { registerForPushNotifications } from '../../lib/notifications';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// Required for OAuth redirect completion on iOS
WebBrowser.maybeCompleteAuthSession();

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

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useAuth();
  const { prefillEmail, showForgot } = useLocalSearchParams<{ prefillEmail?: string; showForgot?: string }>();

  const [email, setEmail] = useState(prefillEmail ?? '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot password state
  const [showForgotForm, setShowForgotForm] = useState(showForgot === '1');
  const [forgotEmail, setForgotEmail] = useState(prefillEmail ?? '');
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // Prevent double-routing when both email login and Google OAuth trigger session
  const hasRouted = useRef(false);

  // Route after any auth method sets a session
  useEffect(() => {
    if (!session || hasRouted.current) return;
    hasRouted.current = true;
    routeAfterAuth(session.user.id);
  }, [session]);

  async function routeAfterAuth(userId: string) {
    // touch_last_active — best effort (runs once for all auth methods)
    try {
      const found = await touchLastActive();
      if (!found) console.warn('[login] touch_last_active returned false — guardian row not found');
    } catch (e) {
      console.warn('[login] touch_last_active failed', e);
    }

    const { data: guardian } = await supabase
      .from('guardians')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (!guardian) {
      router.replace('/(auth)/name');
      return;
    }

    registerForPushNotifications(); // fire-and-forget — non-blocking
    const pendingToken = await getJoinToken();
    if (pendingToken) {
      router.replace(`/join/${pendingToken}`);
      return;
    }

    router.replace('/(tabs)');
  }

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      // session useEffect handles routing
    } catch (e: any) {
      setError(e.message ?? t('errors.generic'));
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      if (e.message === 'cancelled') return;
      setError(e.message ?? t('errors.generic'));
    }
  }

  async function handleForgotPassword() {
    setForgotSending(true);
    try {
      await sendPasswordReset(forgotEmail.trim());
      setForgotSent(true);
    } catch (e: any) {
      setError(e.message ?? t('errors.generic'));
    } finally {
      setForgotSending(false);
    }
  }

  return (
    <LinearGradient colors={['#FFFFFF', '#F1FDF5']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          className="flex-1 px-6"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View className="pt-6 pb-8">
            <Text className="font-rubik-bold text-brand-green-dark" style={{ fontSize: 30 }}>
              {t('auth.login')}
            </Text>
          </View>

          {error && (
            <Text className="text-red-500 text-sm mb-4 text-center font-rubik">{error}</Text>
          )}

          {/* Google sign-in — filled green */}
          <TouchableOpacity
            className="rounded-xl py-4 items-center mb-4 flex-row justify-center"
            style={{ backgroundColor: BRAND_GREEN, ...BTN_SHADOW }}
            onPress={handleGoogleSignIn}
            disabled={loading}
          >
            <AntDesign name="google" size={18} color="white" style={{ marginEnd: 8 }} />
            <Text className="font-rubik-semi text-base text-white">
              {t('auth.continue_with_google')}
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View className="flex-row items-center mb-4">
            <View className="flex-1 h-px bg-gray-200" />
            <Text className="mx-3 text-gray-400 text-sm font-rubik">{t('common.or')}</Text>
            <View className="flex-1 h-px bg-gray-200" />
          </View>

          <Text className="text-xs font-rubik-semi mb-1.5" style={{ color: '#4A5C4E' }}>
            {t('auth.email')}
          </Text>
          <TextInput
            className="rounded-xl px-4 py-3 mb-4 text-base font-rubik"
            style={INPUT_STYLE}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={!loading}
          />

          <Text className="text-xs font-rubik-semi mb-1.5" style={{ color: '#4A5C4E' }}>
            {t('auth.password')}
          </Text>
          <TextInput
            className="rounded-xl px-4 py-3 text-base font-rubik"
            style={INPUT_STYLE}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            editable={!loading}
          />

          {/* Forgot password link */}
          <TouchableOpacity
            className="items-end mb-6 mt-2"
            onPress={() => setShowForgotForm((v) => !v)}
            disabled={loading}
          >
            <Text className="font-rubik text-sm" style={{ color: BRAND_GREEN }}>
              {t('auth.forgot_password')}
            </Text>
          </TouchableOpacity>

          {/* Inline forgot password form */}
          {showForgotForm && (
            <View className="mb-4 p-4 rounded-xl" style={{ backgroundColor: '#F7FAF8', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
              {forgotSent ? (
                <Text className="font-rubik text-sm text-center" style={{ color: BRAND_GREEN }}>
                  {t('auth.reset_password_sent')}
                </Text>
              ) : (
                <>
                  <Text className="text-xs font-rubik-semi mb-1.5" style={{ color: '#4A5C4E' }}>
                    {t('auth.email')}
                  </Text>
                  <TextInput
                    className="rounded-xl px-4 py-3 mb-3 text-base font-rubik"
                    style={{ ...INPUT_STYLE, backgroundColor: 'white' }}
                    value={forgotEmail}
                    onChangeText={setForgotEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    editable={!forgotSending}
                  />
                  <TouchableOpacity
                    className="rounded-xl py-3 items-center"
                    style={{ backgroundColor: BRAND_GREEN, ...BTN_SHADOW }}
                    onPress={handleForgotPassword}
                    disabled={forgotSending || !forgotEmail.trim()}
                  >
                    {forgotSending ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text className="text-white font-rubik-semi text-sm">
                        {t('auth.reset_password_title')}
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          <TouchableOpacity
            className="rounded-xl py-4 items-center mb-4"
            style={{ backgroundColor: BRAND_GREEN, ...BTN_SHADOW }}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-rubik-bold text-base">{t('auth.login')}</Text>
            )}
          </TouchableOpacity>

          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity className="items-center" disabled={loading}>
              <Text className="font-rubik text-sm" style={{ color: BRAND_GREEN }}>
                {t('auth.signup')}
              </Text>
            </TouchableOpacity>
          </Link>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
