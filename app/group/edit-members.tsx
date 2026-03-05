import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import {
  getGroupMembers,
  removeChildFromGroup,
  type GroupMember,
} from '../../lib/db/rpc';

const BRAND_GREEN = '#3D7A50';

export default function EditMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();

  const [members, setMembers]     = useState<GroupMember[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [removing, setRemoving]   = useState(false);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      getGroupMembers(id)
        .then(setMembers)
        .catch((e) => console.error('[edit-members] load error', e))
        .finally(() => setLoading(false));
    }, [id])
  );

  const allChildren = members.flatMap((m) =>
    m.children.map((c) => ({ ...c, guardianId: m.guardian_id }))
  );

  function toggleChild(childId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(childId)) next.delete(childId); else next.add(childId);
      return next;
    });
  }

  async function handleConfirmRemove() {
    setRemoving(true);
    try {
      await Promise.all([...selected].map((childId) => removeChildFromGroup(id, childId)));
      setShowModal(false);
      setSelected(new Set());
      const refreshed = await getGroupMembers(id);
      setMembers(refreshed);
      Toast.show({ type: 'success', text1: t('groups.members_removed_toast') });
    } catch (e: any) {
      setShowModal(false);
      Alert.alert(t('errors.generic'), e.message);
    } finally {
      setRemoving(false);
    }
  }

  const count = selected.size;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f1fdf5' }}>

      {/* Nav bar */}
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, flexDirection: 'row', justifyContent: 'flex-start' }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ fontSize: 18 }}>→</Text>
          <Text style={{ fontSize: 15, fontWeight: '600' }}>{t('nav.back')}</Text>
        </TouchableOpacity>
      </View>

      {/* Title */}
      <Text
        style={{
          fontSize: 28,
          fontWeight: '700',
          color: '#111',
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 16,
          textAlign: 'right',
        }}
      >
        {t('groups.edit_members_title')}
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={BRAND_GREEN} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20 }}>
          {allChildren.map((child, idx) => {
            const isSelected = selected.has(child.child_id);
            return (
              <TouchableOpacity
                key={child.child_id}
                onPress={() => toggleChild(child.child_id)}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 13,
                  borderBottomWidth: idx < allChildren.length - 1 ? 1 : 0,
                  borderBottomColor: '#f3f4f6',
                }}
              >
                {/* Info: first → physical RIGHT in RTL */}
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flex: 1 }}>
                  <Text style={{ fontSize: 17, color: '#111' }}>
                    {child.first_name} {child.last_name}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '300', color: '#777' }}>
                    ({t('children.years_old', { age: child.age_years })})
                  </Text>
                </View>

                {/* Checkbox: second → physical LEFT in RTL */}
                <Ionicons
                  name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={isSelected ? BRAND_GREEN : '#c8c8c8'}
                />
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {/* Sticky remove button */}
      {!loading && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 36, paddingTop: 10 }}>
          <TouchableOpacity
            onPress={() => count > 0 && setShowModal(true)}
            disabled={count === 0}
            style={{
              alignSelf: 'center',
              borderWidth: 1.5,
              borderColor: count > 0 ? '#ef4444' : '#c8c8c8',
              borderRadius: 10,
              height: 44,
              paddingHorizontal: 28,
              backgroundColor: 'white',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 120,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: count > 0 ? '#ef4444' : '#afafaf' }}>
              {count > 0 ? t('groups.remove_selected_count', { count }) : t('groups.remove_selected')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Confirmation modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => !removing && setShowModal(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.43)', alignItems: 'center', justifyContent: 'center' }}
          activeOpacity={1}
          onPress={() => !removing && setShowModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              backgroundColor: 'white',
              borderRadius: 14,
              width: 295,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
              overflow: 'hidden',
            }}
          >
            {/* Body */}
            <View style={{ padding: 20, paddingBottom: 12 }}>
              {/* Header: title RIGHT (first), × LEFT (second) in RTL */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#111', flex: 1, textAlign: 'right' }}>
                  {t('groups.confirm_remove_members_title')}
                </Text>
                <TouchableOpacity onPress={() => setShowModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 18, color: '#9ca3af', lineHeight: 22 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 15, color: '#444', textAlign: 'right', lineHeight: 22 }}>
                <Text style={{ fontWeight: '600', color: '#111' }}>{t('groups.confirm_remove_members_sure')}{'\n\n'}</Text>
                {t('groups.confirm_remove_members_body')}
              </Text>
            </View>

            {/* Actions: הסרה RIGHT (first), ביטול LEFT (second) in RTL */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: 20, paddingTop: 12, gap: 24, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
              {removing ? (
                <ActivityIndicator color={BRAND_GREEN} />
              ) : (
                <>
                  <TouchableOpacity onPress={handleConfirmRemove}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#ef4444' }}>
                      {t('groups.remove_selected')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowModal(false)}>
                    <Text style={{ fontSize: 16, fontWeight: '500', color: '#111' }}>
                      {t('common.cancel')}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}
