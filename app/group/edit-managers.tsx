import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  getGroupMembers,
  demoteAdmin,
  type GroupMember,
} from '../../lib/db/rpc';
import { useAuth } from '../../contexts/AuthContext';

const BRAND_GREEN = '#3D7A50';

export default function EditManagersScreen() {
  const { id, name: groupName, inviteToken } = useLocalSearchParams<{
    id: string;
    name: string;
    inviteToken: string;
  }>();
  const router    = useRouter();
  const { t }     = useTranslation();
  const { user }  = useAuth();

  const [members, setMembers]               = useState<GroupMember[]>([]);
  const [loading, setLoading]               = useState(true);
  const [targetAdmin, setTargetAdmin]       = useState<GroupMember | null>(null);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [showAddModal, setShowAddModal]     = useState(false);
  const [removing, setRemoving]             = useState(false);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      getGroupMembers(id)
        .then(setMembers)
        .catch((e) => console.error('[edit-managers] load error', e))
        .finally(() => setLoading(false));
    }, [id])
  );

  const admins = members.filter((m) => m.is_admin);

  function handlePressRemove(admin: GroupMember) {
    setTargetAdmin(admin);
    setShowRemoveModal(true);
  }

  async function handleConfirmRemove() {
    if (!targetAdmin) return;
    setRemoving(true);
    try {
      await demoteAdmin(id, targetAdmin.guardian_id);
      setShowRemoveModal(false);
      const isSelf = targetAdmin.guardian_id === user?.id;
      setTargetAdmin(null);
      if (isSelf) {
        router.back();
      } else {
        const refreshed = await getGroupMembers(id);
        setMembers(refreshed);
      }
    } catch (e: any) {
      setShowRemoveModal(false);
      Alert.alert(
        e.message?.includes('last admin') ? t('groups.last_admin_error') : t('errors.generic'),
        e.message
      );
    } finally {
      setRemoving(false);
    }
  }

  function handleSendInvite() {
    const link = `https://mibagina.co.il/join/${inviteToken}`;
    Share.share({ message: t('groups.add_manager_invite_message', { name: groupName, link }) });
    setShowAddModal(false);
  }

  const avatarStyle = {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E4F2EA',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0 as const,
  };

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
      <Text style={{
        fontSize: 28,
        fontWeight: '700',
        color: '#111',
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 16,
        textAlign: 'right',
      }}>
        {t('groups.edit_managers_title')}
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={BRAND_GREEN} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView style={{ flex: 1 }}>

          {/* Admins card */}
          <View style={{
            backgroundColor: 'white',
            shadowColor: '#a4a4a4',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.25,
            shadowRadius: 5,
            elevation: 1,
          }}>
            {admins.map((admin, idx) => (
              <View
                key={admin.guardian_id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderBottomWidth: idx < admins.length - 1 ? 1 : 0,
                  borderBottomColor: '#f3f4f6',
                }}
              >
                {/* Admin info: RTL → avatar RIGHT (first) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={avatarStyle}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: BRAND_GREEN }}>
                      {admin.name.charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 17, fontWeight: '500', color: '#111' }}>{admin.name}</Text>
                    <View style={{ backgroundColor: 'rgba(0,215,87,0.26)', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700' }}>{t('groups.admin_badge')}</Text>
                    </View>
                    {admin.guardian_id === user?.id && (
                      <Text style={{ fontSize: 13, color: '#767d8b' }}>{t('groups.you_indicator')}</Text>
                    )}
                  </View>
                </View>

                {/* Remove button — all admins including self */}
                <TouchableOpacity
                  onPress={() => handlePressRemove(admin)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#767d8b' }}>
                    {t('groups.demote_action')}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Add manager link */}
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            style={{ paddingHorizontal: 16, paddingVertical: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 6 }}
          >
            <Text style={{ fontSize: 18, color: '#008234', fontWeight: '400' }}>+</Text>
            <Text style={{ fontSize: 17, fontWeight: '500', color: '#008234' }}>{t('groups.add_manager')}</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── Remove manager confirm modal ── */}
      <Modal
        visible={showRemoveModal}
        transparent
        animationType="fade"
        onRequestClose={() => !removing && setShowRemoveModal(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.43)', alignItems: 'center', justifyContent: 'center' }}
          activeOpacity={1}
          onPress={() => !removing && setShowRemoveModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              backgroundColor: 'white',
              borderRadius: 10,
              width: 329,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            {/* Header */}
            <View style={{ padding: 18, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '500', color: '#111', flex: 1, textAlign: 'right' }}>
                {t('groups.remove_manager_title')}
              </Text>
              <TouchableOpacity onPress={() => setShowRemoveModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 20, color: '#9ca3af', lineHeight: 22 }}>×</Text>
              </TouchableOpacity>
            </View>

            {/* Body */}
            <View style={{ paddingHorizontal: 18, paddingBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#111', textAlign: 'right', marginBottom: 8 }}>
                {t('groups.confirm_remove_members_sure')}
              </Text>
              <Text style={{ fontSize: 15, fontWeight: '300', color: '#333', textAlign: 'right', lineHeight: 22 }}>
                {t('groups.confirm_demote_body')}
              </Text>
            </View>

            {/* Actions */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 24, paddingHorizontal: 18, paddingBottom: 18, paddingTop: 4 }}>
              {removing ? (
                <ActivityIndicator color={BRAND_GREEN} />
              ) : (
                <>
                  <TouchableOpacity onPress={() => setShowRemoveModal(false)}>
                    <Text style={{ fontSize: 16, fontWeight: '500', color: '#111' }}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleConfirmRemove}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#ef4444' }}>{t('groups.demote_action')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Add manager modal ── */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.43)', alignItems: 'center', justifyContent: 'center' }}
          activeOpacity={1}
          onPress={() => setShowAddModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              backgroundColor: 'white',
              borderRadius: 10,
              width: 295,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            {/* Header */}
            <View style={{ padding: 18, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '500', color: '#111', flex: 1, textAlign: 'right' }}>
                {t('groups.add_manager_title')}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 20, color: '#9ca3af', lineHeight: 22 }}>×</Text>
              </TouchableOpacity>
            </View>

            {/* Invite text box */}
            <View style={{ marginHorizontal: 18, marginBottom: 8, borderWidth: 1, borderColor: '#d5d9e0', borderRadius: 10, padding: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '300', color: '#111', textAlign: 'right', lineHeight: 22 }}>
                {t('groups.add_manager_invite_message', {
                  name: groupName,
                  link: `https://mibagina.co.il/join/${inviteToken}`,
                })}
              </Text>
            </View>

            {/* Note */}
            <View style={{ paddingHorizontal: 18, paddingBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '300', color: '#767d8b', textAlign: 'right' }}>
                {t('groups.add_manager_note')}
              </Text>
            </View>

            {/* Action */}
            <View style={{ alignItems: 'center', paddingBottom: 18, paddingTop: 4 }}>
              <TouchableOpacity onPress={handleSendInvite}>
                <Text style={{ fontSize: 17, fontWeight: '500', color: '#008234' }}>{t('groups.send_invite')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}
