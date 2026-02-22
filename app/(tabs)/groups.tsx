import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Share,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  getMyGroups,
  createGroup,
  renameGroup,
  regenerateInviteToken,
  removeGuardianFromGroup,
  removeChildFromGroup,
  getGroupMembers,
  type GroupRow,
  type GroupMember,
} from '../../lib/db/rpc';

// ---------------------------------------------------------------------------
// Text input modal (reused for Create & Rename)
// ---------------------------------------------------------------------------
function TextInputModal({
  visible,
  title,
  placeholder,
  initialValue,
  submitLabel,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [value, setValue]   = useState(initialValue ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (visible) setValue(initialValue ?? '');
  }, [visible, initialValue]);

  async function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) { setError(t('errors.generic')); return; }
    setError(null);
    setLoading(true);
    try {
      await onSubmit(trimmed);
      setValue('');
    } catch (e: any) {
      setError(e.message ?? t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-white">
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="flex-row justify-between items-center px-4 py-4 border-b border-gray-200">
            <TouchableOpacity onPress={onClose} disabled={loading}>
              <Text className="text-gray-500 text-base">{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text className="text-lg font-semibold">{title}</Text>
            <View style={{ width: 56 }} />
          </View>
          <View className="px-4 pt-6">
            {error && <Text className="text-red-500 text-sm mb-4">{error}</Text>}
            <TextInput
              className="border border-gray-300 rounded-lg px-4 py-3 mb-6 text-base"
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              autoFocus
              editable={!loading}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
            <TouchableOpacity
              className="bg-green-600 rounded-lg py-4 items-center"
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-base">{submitLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Members Modal
// ---------------------------------------------------------------------------
function MembersModal({
  visible,
  groupId,
  isAdmin,
  currentUserId,
  onClose,
  onChanged,
}: {
  visible: boolean;
  groupId: string;
  isAdmin: boolean;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    getGroupMembers(groupId)
      .then(setMembers)
      .catch((e) => console.error('[members] load error', e))
      .finally(() => setLoading(false));
  }, [visible, groupId]);

  function confirmRemoveGuardian(member: GroupMember) {
    Alert.alert(
      t('groups.confirm_remove_guardian', { name: member.name }),
      '',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await removeGuardianFromGroup(groupId, member.guardian_id);
              onChanged();
              onClose();
            } catch (e: any) {
              Alert.alert(
                e.message?.includes('last admin') ? t('groups.last_admin_error') : t('errors.generic'),
                e.message
              );
            }
          },
        },
      ]
    );
  }

  function confirmRemoveChild(childName: string, childId: string) {
    Alert.alert(
      t('groups.confirm_remove_child', { name: childName }),
      '',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await removeChildFromGroup(groupId, childId);
              onChanged();
              // Refresh member list
              getGroupMembers(groupId).then(setMembers).catch(console.error);
            } catch (e: any) {
              Alert.alert(t('errors.generic'), e.message);
            }
          },
        },
      ]
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-row justify-between items-center px-4 py-4 border-b border-gray-200">
          <TouchableOpacity onPress={onClose}>
            <Text className="text-gray-500 text-base">{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text className="text-lg font-semibold">{t('groups.view_members')}</Text>
          <View style={{ width: 56 }} />
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#16a34a" style={{ marginTop: 32 }} />
        ) : (
          <ScrollView className="flex-1 px-4 pt-4">
            {members.map((member) => (
              <View key={member.guardian_id} className="bg-gray-50 rounded-xl p-4 mb-3">
                <View className="flex-row justify-between items-center">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base font-semibold text-gray-900">{member.name}</Text>
                    {member.is_admin && (
                      <View className="bg-green-100 rounded px-2 py-0.5">
                        <Text className="text-green-700 text-xs">{t('groups.admin_badge')}</Text>
                      </View>
                    )}
                  </View>
                  {isAdmin && member.guardian_id !== currentUserId && (
                    <TouchableOpacity onPress={() => confirmRemoveGuardian(member)}>
                      <Text className="text-red-500 text-sm">{t('children.remove_child')}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Children in this group */}
                {member.children.map((child) => (
                  <View key={child.child_id} className="flex-row justify-between items-center mt-2 pl-2">
                    <Text className="text-sm text-gray-600">
                      {child.first_name} {child.last_name} · {t('children.years_old', { age: child.age_years })}
                    </Text>
                    {isAdmin && (
                      <TouchableOpacity
                        onPress={() => confirmRemoveChild(child.first_name, child.child_id)}
                      >
                        <Text className="text-red-400 text-xs">{t('children.remove_child')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Group Card
// ---------------------------------------------------------------------------
function GroupCard({
  group,
  currentUserId,
  onRefresh,
}: {
  group: GroupRow;
  currentUserId: string;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [showRename, setShowRename]   = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  function handleShareInvite() {
    Share.share({ message: `mibagina://join/${group.invite_token}` });
  }

  function handleRegenerateInvite() {
    Alert.alert(
      t('groups.regenerate_invite'),
      t('groups.confirm_regenerate'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            try {
              await regenerateInviteToken(group.id);
              onRefresh();
            } catch (e: any) {
              Alert.alert(t('errors.generic'), e.message);
            }
          },
        },
      ]
    );
  }

  function handleLeaveGroup() {
    Alert.alert(
      t('groups.leave_group'),
      '',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('groups.leave_group'),
          style: 'destructive',
          onPress: async () => {
            try {
              await removeGuardianFromGroup(group.id, currentUserId);
              onRefresh();
            } catch (e: any) {
              Alert.alert(
                e.message?.includes('last admin') ? t('groups.last_admin_error') : t('errors.generic'),
                e.message
              );
            }
          },
        },
      ]
    );
  }

  const memberLabel =
    group.member_count === 1
      ? t('groups.members_count_one')
      : t('groups.members_count_other', { count: group.member_count });

  return (
    <View className="bg-white rounded-xl mx-4 mb-3 p-4 shadow-sm border border-gray-100">
      {/* Title row */}
      <View className="flex-row justify-between items-center">
        <Text className="text-lg font-semibold text-gray-900 flex-1 mr-2">{group.name}</Text>
        {group.is_admin && (
          <View className="bg-green-100 rounded px-2 py-0.5">
            <Text className="text-green-700 text-xs">{t('groups.admin_badge')}</Text>
          </View>
        )}
      </View>

      <Text className="text-sm text-gray-500 mt-1">{memberLabel}</Text>

      {/* My children in this group */}
      {group.my_children.length > 0 && (
        <Text className="text-sm text-gray-600 mt-1">
          {group.my_children.map((c) => c.first_name).join(', ')}
        </Text>
      )}

      {/* Actions */}
      <View className="mt-3 flex-row flex-wrap gap-2">
        <TouchableOpacity
          className="border border-green-600 rounded-lg px-3 py-2"
          onPress={handleShareInvite}
        >
          <Text className="text-green-600 text-sm">{t('groups.share_invite')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="border border-gray-300 rounded-lg px-3 py-2"
          onPress={() => setShowMembers(true)}
        >
          <Text className="text-gray-600 text-sm">{t('groups.view_members')}</Text>
        </TouchableOpacity>

        {group.is_admin && (
          <>
            <TouchableOpacity
              className="border border-gray-300 rounded-lg px-3 py-2"
              onPress={() => setShowRename(true)}
            >
              <Text className="text-gray-600 text-sm">{t('groups.rename')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="border border-orange-300 rounded-lg px-3 py-2"
              onPress={handleRegenerateInvite}
            >
              <Text className="text-orange-600 text-sm">{t('groups.regenerate_invite')}</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          className="border border-red-200 rounded-lg px-3 py-2"
          onPress={handleLeaveGroup}
        >
          <Text className="text-red-500 text-sm">{t('groups.leave_group')}</Text>
        </TouchableOpacity>
      </View>

      {/* Rename modal */}
      <TextInputModal
        visible={showRename}
        title={t('groups.rename_title')}
        initialValue={group.name}
        submitLabel={t('common.save')}
        onClose={() => setShowRename(false)}
        onSubmit={async (name) => {
          await renameGroup(group.id, name);
          setShowRename(false);
          onRefresh();
        }}
      />

      {/* Members modal */}
      <MembersModal
        visible={showMembers}
        groupId={group.id}
        isAdmin={group.is_admin}
        currentUserId={currentUserId}
        onClose={() => setShowMembers(false)}
        onChanged={onRefresh}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Groups Screen
// ---------------------------------------------------------------------------
export default function GroupsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [groups, setGroups]           = useState<GroupRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showCreate, setShowCreate]   = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getMyGroups();
      setGroups(data);
    } catch (e) {
      console.error('[groups] load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row justify-between items-center px-4 py-4 bg-white border-b border-gray-200">
        <Text className="text-xl font-bold text-gray-900">{t('nav.groups')}</Text>
        <TouchableOpacity onPress={() => setShowCreate(true)}>
          <Text className="text-green-600 font-semibold text-base">{t('groups.create')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#16a34a" style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <GroupCard
              group={item}
              currentUserId={user?.id ?? ''}
              onRefresh={load}
            />
          )}
          contentContainerStyle={{ paddingVertical: 12 }}
          ListEmptyComponent={
            <View className="items-center justify-center mt-16 px-6">
              <Text className="text-gray-500 text-base text-center">{t('groups.no_groups')}</Text>
              <TouchableOpacity
                className="mt-6 bg-green-600 rounded-lg px-8 py-3"
                onPress={() => setShowCreate(true)}
              >
                <Text className="text-white font-semibold">{t('groups.create')}</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Create group modal */}
      <TextInputModal
        visible={showCreate}
        title={t('groups.create_group_title')}
        placeholder={t('groups.group_name')}
        submitLabel={t('groups.create')}
        onClose={() => setShowCreate(false)}
        onSubmit={async (name) => {
          await createGroup(name);
          setShowCreate(false);
          load();
        }}
      />
    </SafeAreaView>
  );
}
