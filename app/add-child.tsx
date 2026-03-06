import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { addChild } from '../lib/db/rpc';

const BRAND_GREEN = '#3D7A50';

const WheelColumn = React.forwardRef<FlatList, {
  data: string[];
  labels?: string[];
  selected: string;
  onSelect: (v: string) => void;
  itemHeight: number;
  visibleItems: number;
  flex?: number;
}>(({ data, labels, selected, onSelect, itemHeight, visibleItems, flex = 1 }, ref) => {
  const padding = Math.floor(visibleItems / 2);
  const padded  = [...Array(padding).fill(''), ...data, ...Array(padding).fill('')];

  return (
    <FlatList
      ref={ref}
      data={padded}
      keyExtractor={(_, i) => String(i)}
      style={{ flex }}
      showsVerticalScrollIndicator={false}
      snapToInterval={itemHeight}
      decelerationRate="fast"
      getItemLayout={(_, i) => ({ length: itemHeight, offset: itemHeight * i, index: i })}
      initialScrollIndex={Math.max(0, data.indexOf(selected))}
      onMomentumScrollEnd={(e) => {
        const idx = Math.round(e.nativeEvent.contentOffset.y / itemHeight);
        if (data[idx]) onSelect(data[idx]);
      }}
      renderItem={({ item }) => {
        const isSelected = item === selected;
        const label = item && labels ? labels[data.indexOf(item)] : item;
        return (
          <View style={{ height: itemHeight, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{
              fontSize: isSelected ? 17 : 15,
              fontFamily: isSelected ? 'Rubik_600SemiBold' : 'Rubik',
              color: isSelected ? BRAND_GREEN : '#888',
            }}>
              {label}
            </Text>
          </View>
        );
      }}
    />
  );
});

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
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  const ITEM_H = 48;
  const VISIBLE = 5;

  const currentYear = new Date().getFullYear();
  const years  = Array.from({ length: currentYear - 1999 }, (_, i) => String(currentYear - i));
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const MONTH_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

  function daysInMonth(y: number, m: number) {
    return new Date(y, m, 0).getDate();
  }

  const [firstName, setFirstName]     = useState('');
  const [lastName, setLastName]       = useState('');
  const [dob, setDob]                 = useState('');
  const [showPicker, setShowPicker]   = useState(false);

  const [selYear,  setSelYear]  = useState(2020);
  const [selMonth, setSelMonth] = useState(1);
  const [selDay,   setSelDay]   = useState(1);

  const days = Array.from({ length: daysInMonth(selYear, selMonth) }, (_, i) => String(i + 1).padStart(2, '0'));

  const yearRef  = useRef<FlatList>(null);
  const monthRef = useRef<FlatList>(null);
  const dayRef   = useRef<FlatList>(null);

  function openPicker() {
    // seed from existing dob or default 2020-01-01
    if (dob) {
      const [y, m, d] = dob.split('-').map(Number);
      setSelYear(y); setSelMonth(m); setSelDay(d);
    }
    setShowPicker(true);
  }

  function confirmDate() {
    const mm = String(selMonth).padStart(2, '0');
    const dd = String(selDay).padStart(2, '0');
    setDob(`${selYear}-${mm}-${dd}`);
    setShowPicker(false);
  }

  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && dob.length > 0;

  async function handleSubmit() {
    const f = firstName.trim();
    const l = lastName.trim();
    const d = dob.trim();

    if (!f || !l || !d) {
      setError(t('errors.generic'));
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const childId = await addChild(f, l, d);
      Toast.show({ type: 'success', text1: t('children.child_added_toast') });
      if (returnTo === 'create-group') {
        router.navigate({ pathname: '/(tabs)/groups', params: { newChildId: childId } });
      } else {
        router.back();
      }
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
          {/* Header — back button first child = physical RIGHT in RTL */}
          <View style={{ height: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              disabled={loading}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ fontSize: 18 }}>→</Text>
              <Text className="font-rubik text-base" style={{ color: '#111' }}>{t('nav.back')}</Text>
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
            <TouchableOpacity
              onPress={openPicker}
              disabled={loading}
              style={{
                ...INPUT_STYLE,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 14,
                marginBottom: 32,
              }}
            >
              <Text style={{ fontSize: 16, color: dob ? '#111' : '#aaa', fontFamily: 'Rubik' }}>
                {dob ? `${dob.slice(8, 10)}/${dob.slice(5, 7)}/${dob.slice(0, 4)}` : t('children.date_of_birth_hint')}
              </Text>
              <Ionicons name="calendar-outline" size={20} color={BRAND_GREEN} />
            </TouchableOpacity>

            {/* Date wheel picker modal (pure JS, no native module) */}
            <Modal transparent animationType="slide" visible={showPicker} onRequestClose={() => setShowPicker(false)}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }}
                activeOpacity={1}
                onPress={() => setShowPicker(false)}
              />
              <View style={{ backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 }}>
                  <TouchableOpacity onPress={() => setShowPicker(false)}>
                    <Text style={{ color: '#888', fontSize: 15, fontFamily: 'Rubik' }}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 16, fontFamily: 'Rubik_600SemiBold', color: '#111' }}>{t('children.date_of_birth')}</Text>
                  <TouchableOpacity onPress={confirmDate}>
                    <Text style={{ color: BRAND_GREEN, fontSize: 15, fontFamily: 'Rubik_600SemiBold' }}>{t('common.confirm')}</Text>
                  </TouchableOpacity>
                </View>

                {/* Selection highlight */}
                <View style={{ flexDirection: 'row', height: ITEM_H * VISIBLE, overflow: 'hidden' }}>
                  {/* Highlight bar */}
                  <View pointerEvents="none" style={{
                    position: 'absolute', left: 0, right: 0,
                    top: ITEM_H * Math.floor(VISIBLE / 2),
                    height: ITEM_H,
                    backgroundColor: '#E4F2EA',
                    borderRadius: 10,
                    marginHorizontal: 12,
                    zIndex: 0,
                  }}/>

                  {/* Day column */}
                  <WheelColumn
                    ref={dayRef}
                    data={days}
                    selected={String(selDay).padStart(2, '0')}
                    onSelect={(v) => setSelDay(Number(v))}
                    itemHeight={ITEM_H}
                    visibleItems={VISIBLE}
                  />

                  {/* Month column */}
                  <WheelColumn
                    ref={monthRef}
                    data={months}
                    labels={MONTH_NAMES}
                    selected={String(selMonth).padStart(2, '0')}
                    onSelect={(v) => setSelMonth(Number(v))}
                    itemHeight={ITEM_H}
                    visibleItems={VISIBLE}
                    flex={2}
                  />

                  {/* Year column */}
                  <WheelColumn
                    ref={yearRef}
                    data={years}
                    selected={String(selYear)}
                    onSelect={(v) => setSelYear(Number(v))}
                    itemHeight={ITEM_H}
                    visibleItems={VISIBLE}
                  />
                </View>
              </View>
            </Modal>

            <TouchableOpacity
              className="rounded-lg py-4 items-center"
              style={{ backgroundColor: canSubmit && !loading ? BRAND_GREEN : '#afafaf', ...(canSubmit && !loading ? BTN_SHADOW : {}) }}
              onPress={handleSubmit}
              disabled={!canSubmit || loading}
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
