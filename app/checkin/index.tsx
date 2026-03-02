import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  getMyChildren,
  getMyPlaygrounds,
  createPlayground,
  postCheckin,
  type ChildRow,
  type PlaygroundRow,
} from '../../lib/db/rpc';
import { normalizePlaygroundName } from '../../lib/playground';
import { enqueueGroupNotification } from '../../lib/notifications';

type Step = 'form' | 'submitting' | 'success';

export default function CheckinScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  // childIds param: pre-selects children when coming from "switch playground" flow
  const { childIds: childIdsParam } = useLocalSearchParams<{ childIds?: string }>();

  const [children, setChildren]         = useState<ChildRow[]>([]);
  const [playgrounds, setPlaygrounds]   = useState<PlaygroundRow[]>([]);
  const [selectedChildren, setSelectedChildren] = useState<Set<string>>(new Set());
  const [selectedPlayground, setSelectedPlayground] = useState<PlaygroundRow | null>(null);
  const [guardian, setGuardian]         = useState<string | null>(null);
  const [dataLoading, setDataLoading]   = useState(true);
  const [step, setStep]                 = useState<Step>('form');

  // Dropdown open state
  const [pgOpen, setPgOpen]       = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);

  // Add new playground inline
  const [showAddPg, setShowAddPg] = useState(false);
  const [newPgName, setNewPgName] = useState('');
  const [creating, setCreating]   = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [kidsResult, parksResult] = await Promise.allSettled([
        getMyChildren(),
        getMyPlaygrounds(),
      ]);
      if (kidsResult.status === 'fulfilled')  setChildren(kidsResult.value);
      else console.error('[checkin] children load error', kidsResult.reason);
      if (parksResult.status === 'fulfilled') setPlaygrounds(parksResult.value);
      else console.error('[checkin] playgrounds load error', parksResult.reason);
      // Pre-select children from URL params (switch playground flow)
      if (childIdsParam) {
        setSelectedChildren(new Set(childIdsParam.split(',').filter(Boolean)));
      }
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Child toggle ──────────────────────────────────────────────────────────
  function toggleChild(id: string) {
    setSelectedChildren(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Submit check-in ───────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!selectedPlayground || selectedChildren.size === 0) return;
    setStep('submitting');
    try {
      await postCheckin([...selectedChildren], selectedPlayground.id);
      enqueueGroupNotification(selectedPlayground.id); // fire-and-forget
      setStep('success');
    } catch (e: any) {
      Alert.alert(t('errors.generic'), e.message);
      setStep('form');
    }
  }

  // ── Add new playground ────────────────────────────────────────────────────
  async function handleAddPlayground() {
    const raw = newPgName.trim();
    if (!raw) return;
    const normalized = normalizePlaygroundName(raw);
    if (!normalized) {
      Alert.alert(t('playground.name_too_generic'));
      return;
    }
    setCreating(true);
    try {
      const id = await createPlayground(raw, normalized);
      const newPg: PlaygroundRow = { id, name: raw };
      setPlaygrounds(prev => [newPg, ...prev]);
      setSelectedPlayground(newPg);
      setNewPgName('');
      setShowAddPg(false);
      setPgOpen(false);
    } catch (e: any) {
      Alert.alert(t('errors.generic'), e.message);
    } finally {
      setCreating(false);
    }
  }

  // ── Render: loading ───────────────────────────────────────────────────────
  if (dataLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#3D7A50" />
      </SafeAreaView>
    );
  }

  // ── Render: submitting ────────────────────────────────────────────────────
  if (step === 'submitting') {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#3D7A50" />
        <Text className="text-gray-500 text-sm mt-4 font-rubik">{t('checkin.submitting')}</Text>
      </SafeAreaView>
    );
  }

  // ── Render: success ───────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <Text className="text-3xl mb-2">✅</Text>
        <Text className="text-xl font-rubik-bold text-gray-900 mb-2">{t('checkin.success_title')}</Text>
        <Text className="text-gray-500 text-base text-center mb-8 font-rubik">{t('checkin.success_body')}</Text>
        <TouchableOpacity
          className="rounded-xl px-8 py-3"
          style={{ backgroundColor: '#3D7A50' }}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text className="text-white font-rubik-bold">{t('checkin.done')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Render: form ──────────────────────────────────────────────────────────
  const canSubmit = selectedChildren.size > 0 && selectedPlayground !== null;

  const guardianOptions = [
    t('checkin.guardian_mom'),
    t('checkin.guardian_dad'),
    t('checkin.guardian_other'),
  ];

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Nav — RTL: back button is first child (physical right) */}
        <View className="flex-row items-center px-5 pt-3">
          <TouchableOpacity
            className="flex-row items-center gap-1 py-2"
            onPress={() => router.back()}
          >
            {/* RTL: → arrow first = physical right, text second = physical left */}
            <Text className="text-base font-rubik" style={{ color: '#1a1a1a' }}>→</Text>
            <Text className="text-sm font-rubik-bold" style={{ color: '#1a1a1a' }}>
              {t('common.back')}
            </Text>
          </TouchableOpacity>
        </View>

        <Text className="text-2xl font-rubik-bold text-gray-900 px-5 pt-2 pb-5">
          {t('checkin.form_title')}
        </Text>

        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {/* ── Section 1: Children chips ── */}
          <View className="px-5 mb-6">
            <Text className="text-base font-rubik text-gray-900 mb-1">
              {t('checkin.who_is_coming')}
            </Text>
            <Text className="text-xs font-rubik text-gray-400 mb-3">
              {t('checkin.who_is_coming_hint')}
            </Text>
            {children.length === 0 ? (
              <Text className="text-sm font-rubik text-gray-400">{t('checkin.no_children')}</Text>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {children.map(child => {
                  const on = selectedChildren.has(child.id);
                  return (
                    <TouchableOpacity
                      key={child.id}
                      className="rounded-lg px-4 py-2"
                      style={{
                        borderWidth: 1.5,
                        borderColor: on ? '#3D7A50' : '#008234',
                        backgroundColor: on ? '#3D7A50' : 'white',
                      }}
                      onPress={() => toggleChild(child.id)}
                    >
                      <Text
                        className="text-sm font-rubik-medium"
                        style={{ color: on ? 'white' : '#008234' }}
                      >
                        {child.first_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* ── Section 2: Playground dropdown ── */}
          <View className="px-5 mb-6">
            <Text className="text-base font-rubik text-gray-900 mb-3">
              {t('checkin.select_playground')}
            </Text>
            {/* Trigger — RTL: label RIGHT (first), arrow LEFT (last) */}
            <TouchableOpacity
              className="flex-row items-center px-4 rounded-xl"
              style={{
                borderWidth: 1.5,
                borderColor: selectedPlayground ? '#1a1a1a' : '#afafaf',
                minHeight: 48,
              }}
              onPress={() => {
                setPgOpen(o => !o);
                setGuardOpen(false);
              }}
            >
              <Text
                className="flex-1 text-sm font-rubik text-right"
                style={{ color: selectedPlayground ? '#1a1a1a' : '#767d8b' }}
              >
                {selectedPlayground?.name ?? t('checkin.playground_placeholder')}
              </Text>
              <Text className="text-gray-400 ms-2">{pgOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {/* Dropdown list */}
            {pgOpen && (
              <View
                className="bg-white rounded-xl mt-1 overflow-hidden"
                style={{ borderWidth: 1.5, borderColor: '#1a1a1a' }}
              >
                {playgrounds.map((pg, i) => (
                  <TouchableOpacity
                    key={pg.id}
                    className="px-4 py-3"
                    style={{
                      borderBottomWidth: i < playgrounds.length - 1 ? 1 : 0,
                      borderBottomColor: '#f3f4f6',
                    }}
                    onPress={() => {
                      setSelectedPlayground(pg);
                      setPgOpen(false);
                      setShowAddPg(false);
                    }}
                  >
                    <Text className="text-sm font-rubik text-gray-900 text-right">{pg.name}</Text>
                  </TouchableOpacity>
                ))}

                {/* "הוספת גינה חדשה" — RTL: text RIGHT (first), + badge LEFT (last) */}
                <TouchableOpacity
                  className="flex-row items-center justify-end px-4 py-3"
                  style={{
                    borderTopWidth: playgrounds.length > 0 ? 1 : 0,
                    borderTopColor: '#f3f4f6',
                  }}
                  onPress={() => setShowAddPg(o => !o)}
                >
                  <Text className="text-sm font-rubik-medium" style={{ color: '#3D7A50' }}>
                    {t('checkin.add_playground')}
                  </Text>
                  <View
                    className="w-6 h-6 rounded items-center justify-center ms-2"
                    style={{ backgroundColor: '#E4F2EA' }}
                  >
                    <Text className="text-sm font-rubik-bold" style={{ color: '#3D7A50' }}>+</Text>
                  </View>
                </TouchableOpacity>

                {/* Inline add form */}
                {showAddPg && (
                  <View
                    className="flex-row items-center px-3 py-2 gap-2"
                    style={{ borderTopWidth: 1, borderTopColor: '#ebebeb' }}
                  >
                    <TouchableOpacity
                      className="rounded-lg px-3 py-2 items-center justify-center"
                      style={{ backgroundColor: creating ? '#E4F2EA' : '#3D7A50' }}
                      onPress={handleAddPlayground}
                      disabled={creating}
                    >
                      {creating
                        ? <ActivityIndicator size="small" color="#3D7A50" />
                        : <Text className="text-white text-sm font-rubik-bold">{t('common.add')}</Text>
                      }
                    </TouchableOpacity>
                    <TextInput
                      className="flex-1 bg-gray-100 rounded-lg px-3 py-2 text-sm font-rubik"
                      style={{ textAlign: 'right' }}
                      placeholder={t('checkin.playground_name_placeholder')}
                      value={newPgName}
                      onChangeText={setNewPgName}
                      onSubmitEditing={handleAddPlayground}
                      autoCapitalize="none"
                      editable={!creating}
                    />
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ── Section 3: Guardian dropdown ── */}
          <View className="px-5 mb-6">
            <Text className="text-base font-rubik text-gray-900 mb-3">
              {t('checkin.guardian_label')}
            </Text>
            {/* Trigger */}
            <TouchableOpacity
              className="flex-row items-center px-4 rounded-xl"
              style={{
                borderWidth: 1.5,
                borderColor: guardian ? '#1a1a1a' : '#afafaf',
                minHeight: 48,
              }}
              onPress={() => {
                setGuardOpen(o => !o);
                setPgOpen(false);
              }}
            >
              <Text
                className="flex-1 text-sm font-rubik text-right"
                style={{ color: guardian ? '#1a1a1a' : '#767d8b' }}
              >
                {guardian ?? t('checkin.guardian_placeholder')}
              </Text>
              <Text className="text-gray-400 ms-2">{guardOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {/* Dropdown list */}
            {guardOpen && (
              <View
                className="bg-white rounded-xl mt-1 overflow-hidden"
                style={{ borderWidth: 1.5, borderColor: '#1a1a1a' }}
              >
                {guardianOptions.map((opt, i) => (
                  <TouchableOpacity
                    key={opt}
                    className="px-4 py-3"
                    style={{
                      borderBottomWidth: i < guardianOptions.length - 1 ? 1 : 0,
                      borderBottomColor: '#f3f4f6',
                    }}
                    onPress={() => {
                      setGuardian(opt);
                      setGuardOpen(false);
                    }}
                  >
                    <Text className="text-sm font-rubik text-gray-900 text-right">{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        {/* ── Submit button ── */}
        <TouchableOpacity
          className="mx-5 mb-6 rounded-xl py-4 items-center"
          style={{ backgroundColor: canSubmit ? '#3D7A50' : '#E9EAEC' }}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          <Text
            className="text-base font-rubik-medium"
            style={{ color: canSubmit ? 'white' : '#B0B4BB' }}
          >
            {t('checkin.save')}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
