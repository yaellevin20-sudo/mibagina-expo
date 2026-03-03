import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { addChild } from '../lib/db/rpc';

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

export default function AddChildScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [dob, setDob]             = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function handleSubmit() {
    const f = firstName.trim();
    const l = lastName.trim();
    const d = dob.trim();

    if (!f || !l || !d) {
      setError(t('errors.generic'));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setError(t('children.date_of_birth_hint'));
      return;
    }
    if (new Date(d) > new Date()) {
      setError(t('errors.generic'));
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await addChild(f, l, d);
      router.back();
    } catch (e: any) {
      setError(e.message ?? t('errors.generic'));
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={['#FFFFFF', '#F1FDF5']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header — back button pinned to physical left, title centered */}
          <View style={{ height: 56, justifyContent: 'center', alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => router.back()}
              disabled={loading}
              style={{ position: 'absolute', left: 20 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="arrow-back" size={24} color="#111" />
            </TouchableOpacity>
            <Text className="text-xl font-rubik-semi text-black">
              {t('children.add_child_title')}
            </Text>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            {error && (
              <Text className="text-red-500 text-sm font-rubik mb-4">{error}</Text>
            )}

            <Text className="text-xs font-rubik-semi mb-1.5" style={{ color: '#4A5C4E' }}>
              {t('children.first_name')}
            </Text>
            <TextInput
              className="rounded-xl px-4 py-3 mb-5 text-base font-rubik"
              style={INPUT_STYLE}
              value={firstName}
              onChangeText={setFirstName}
              autoFocus
              editable={!loading}
            />

            <Text className="text-xs font-rubik-semi mb-1.5" style={{ color: '#4A5C4E' }}>
              {t('children.last_name')}
            </Text>
            <TextInput
              className="rounded-xl px-4 py-3 mb-5 text-base font-rubik"
              style={INPUT_STYLE}
              value={lastName}
              onChangeText={setLastName}
              editable={!loading}
            />

            <Text className="text-xs font-rubik-semi mb-1.5" style={{ color: '#4A5C4E' }}>
              {t('children.date_of_birth')}
            </Text>
            <TextInput
              className="rounded-xl px-4 py-3 mb-8 text-base font-rubik"
              style={INPUT_STYLE}
              value={dob}
              onChangeText={setDob}
              placeholder={t('children.date_of_birth_hint')}
              keyboardType="numeric"
              editable={!loading}
            />

            <TouchableOpacity
              className="rounded-lg py-4 items-center"
              style={{ backgroundColor: BRAND_GREEN, ...BTN_SHADOW }}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-rubik-semi text-base">
                  {t('children.add_child')}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
