import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Keyboard,
  Pressable,
  Image,
} from 'react-native';
import { EmojiKeyboard } from 'rn-emoji-keyboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  getMyGroups,
  getMyChildren,
  addChild,
  createGroup,
  renameGroup,
  removeGuardianFromGroup,
  removeChildFromGroup,
  getGroupMembers,
  getChildGroupContext,
  transferGroupOwnership,
  addChildrenToGroup,
  demoteToMember,
  deleteGroup,
  type GroupRow,
  type GroupMember,
  type ChildRow,
} from '../../lib/db/rpc';

// ---------------------------------------------------------------------------
// Text input modal (reused for Create & Rename)
// ---------------------------------------------------------------------------
export function TextInputModal({
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
// Inline Add Child Form (mirrors join/[token].tsx InlineAddChildForm)
// ---------------------------------------------------------------------------
function InlineAddChildForm({ onAdded }: { onAdded: (child: ChildRow) => void }) {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [dob, setDob]             = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function handleSubmit() {
    const f = firstName.trim();
    const l = lastName.trim();
    const d = dob.trim();
    if (!f || !l || !d) { setError(t('errors.generic')); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { setError(t('children.date_of_birth_hint')); return; }
    if (new Date(d) > new Date()) { setError(t('errors.generic')); return; }
    setError(null);
    setLoading(true);
    try {
      const childId = await addChild(f, l, d);
      const newChild: ChildRow = {
        id: childId,
        first_name: f,
        last_name: l,
        age_years: new Date().getFullYear() - parseInt(d.slice(0, 4)),
        created_at: new Date().toISOString(),
        co_guardians: [],
        groups: [],
      };
      onAdded(newChild);
    } catch (e: any) {
      setError(e.message ?? t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200">
      {error && <Text className="text-red-500 text-sm mb-3">{error}</Text>}
      <Text className="text-sm font-medium text-gray-700 mb-1">{t('children.first_name')}</Text>
      <TextInput
        className="border border-gray-300 rounded-lg px-3 py-2 mb-3 text-base bg-white"
        value={firstName}
        onChangeText={setFirstName}
        autoFocus
        editable={!loading}
      />
      <Text className="text-sm font-medium text-gray-700 mb-1">{t('children.last_name')}</Text>
      <TextInput
        className="border border-gray-300 rounded-lg px-3 py-2 mb-3 text-base bg-white"
        value={lastName}
        onChangeText={setLastName}
        editable={!loading}
      />
      <Text className="text-sm font-medium text-gray-700 mb-1">{t('children.date_of_birth')}</Text>
      <TextInput
        className="border border-gray-300 rounded-lg px-3 py-2 mb-4 text-base bg-white"
        value={dob}
        onChangeText={setDob}
        placeholder={t('children.date_of_birth_hint')}
        keyboardType="numeric"
        editable={!loading}
      />
      <TouchableOpacity
        className="bg-green-600 rounded-lg py-3 items-center"
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-semibold text-base">{t('children.add_child')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Create Group Modal — single-step form with required child selection
// ---------------------------------------------------------------------------
function CreateGroupModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [groupName, setGroupName]           = useState('');
  const [children, setChildren]             = useState<ChildRow[]>([]);
  const [selectedChildIds, setSelectedChildIds] = useState<Set<string>>(new Set());
  const [showPicker, setShowPicker]         = useState(false);
  const [showAddChild, setShowAddChild]     = useState(false);
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setGroupName('');
      setSelectedChildIds(new Set());
      setPendingGroupId(null);
      setError(null);
      setShowPicker(false);
      setShowAddChild(false);
      getMyChildren().then(setChildren).catch(console.error);
    }
  }, [visible]);

  function toggleChild(id: string) {
    setSelectedChildIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleChildAdded(newChild: ChildRow) {
    setChildren((prev) => [...prev, newChild]);
    setSelectedChildIds((prev) => new Set([...prev, newChild.id]));
    setShowAddChild(false);
  }

  const canSubmit = groupName.trim().length > 0 && selectedChildIds.size > 0 && !loading;

  async function handleCreate() {
    if (submittingRef.current) return;
    const trimmed = groupName.trim();
    if (!trimmed || selectedChildIds.size === 0) return;
    submittingRef.current = true;
    setError(null);
    setLoading(true);
    try {
      const gid = pendingGroupId ?? await createGroup(trimmed);
      if (!pendingGroupId) setPendingGroupId(gid);
      await addChildrenToGroup(gid, [...selectedChildIds]);
      onCreated();
    } catch (e: any) {
      setError(e.message ?? t('errors.generic'));
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  const selectedLabel =
    selectedChildIds.size === 0
      ? t('groups.select_child_placeholder')
      : children
          .filter((c) => selectedChildIds.has(c.id))
          .map((c) => c.first_name)
          .join(', ');

  if (!visible) return null;

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <SafeAreaView className="flex-1 bg-white">
          <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {/* Header */}
            <View className="flex-row justify-between items-center px-4 py-4 border-b border-gray-200">
              <TouchableOpacity onPress={onClose} disabled={loading}>
                <Text className="text-gray-500 text-base">{t('common.cancel')}</Text>
              </TouchableOpacity>
              <Text className="text-lg font-semibold">{t('groups.create_group_title')}</Text>
              <View style={{ width: 56 }} />
            </View>

            {/* Form */}
            <ScrollView className="flex-1 px-4 pt-6">
              {error && <Text className="text-red-500 text-sm mb-4">{error}</Text>}

              <Text className="text-sm font-medium text-gray-700 mb-1">{t('groups.group_name')}</Text>
              <TextInput
                className="border border-gray-300 rounded-lg px-4 py-3 mb-6 text-base"
                value={groupName}
                onChangeText={setGroupName}
                placeholder={t('groups.group_name')}
                autoFocus
                editable={!loading}
                returnKeyType="done"
              />

              <Text className="text-sm font-medium text-gray-700 mb-1">{t('groups.select_child_label')}</Text>
              <TouchableOpacity
                className="border border-gray-300 rounded-lg px-4 py-3 mb-4 flex-row justify-between items-center"
                onPress={() => {
                  Keyboard.dismiss();
                  setShowPicker(true);
                }}
                disabled={loading}
              >
                <Text
                  className="text-base flex-1"
                  style={{ color: selectedChildIds.size === 0 ? '#9ca3af' : '#111827' }}
                >
                  {selectedLabel}
                </Text>
                <Text className="text-gray-400 text-sm ml-2">▼</Text>
              </TouchableOpacity>

              {showAddChild && <InlineAddChildForm onAdded={handleChildAdded} />}
            </ScrollView>

            {/* Footer */}
            <View className="px-4 pb-6 pt-2">
              <TouchableOpacity
                className={`rounded-lg py-4 items-center ${canSubmit ? 'bg-green-600' : 'bg-gray-300'}`}
                onPress={handleCreate}
                disabled={!canSubmit}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold text-base">{t('groups.create_group_title')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Child picker bottom sheet — sibling modal, RN renders to root window */}
      <Modal
        visible={showPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => setShowPicker(false)}
        >
          <Pressable>
            <View className="bg-white rounded-t-2xl" style={{ maxHeight: '60%' }}>
              {/* Handle bar */}
              <View className="items-center pt-3 pb-2">
                <View className="w-10 rounded-full bg-gray-300" style={{ height: 4 }} />
              </View>

              {/* Picker header */}
              <View className="flex-row justify-between items-center px-4 pb-3 border-b border-gray-200">
                <Text className="text-base font-semibold">{t('groups.select_child_label')}</Text>
                <TouchableOpacity onPress={() => setShowPicker(false)}>
                  <Text className="text-green-600 font-semibold">{t('onboarding.done')}</Text>
                </TouchableOpacity>
              </View>

              <ScrollView>
                {children.map((child) => {
                  const isSelected = selectedChildIds.has(child.id);
                  return (
                    <TouchableOpacity
                      key={child.id}
                      className="flex-row items-center px-4 py-3 border-b border-gray-100"
                      onPress={() => toggleChild(child.id)}
                    >
                      <View
                        className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                          isSelected ? 'bg-green-600 border-green-600' : 'border-gray-300'
                        }`}
                      >
                        {isSelected && <Text className="text-white text-xs font-bold">✓</Text>}
                      </View>
                      <Text className="text-base text-gray-900">
                        {child.first_name} {child.last_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Add a child row */}
                <TouchableOpacity
                  className="flex-row items-center px-4 py-4"
                  onPress={() => {
                    setShowPicker(false);
                    setShowAddChild(true);
                  }}
                >
                  <Text className="text-green-600 text-base mr-2">+</Text>
                  <Text className="text-green-600 text-base">{t('groups.add_child_option')}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
            {/* White fill for nav bar area — prevents parent modal showing through */}
            <View style={{ height: insets.bottom, backgroundColor: 'white' }} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Members Modal
// ---------------------------------------------------------------------------
export function MembersModal({
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

  async function confirmRemoveChild(childName: string, childId: string) {
    try {
      const ctx = await getChildGroupContext(groupId, childId);
      const msg = ctx.is_last_child_for_me
        ? t('groups.confirm_remove_guardian', { name: childName })  // cascade removes guardian too
        : t('groups.confirm_remove_child', { name: childName });
      Alert.alert(
        msg,
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
                getGroupMembers(groupId).then(setMembers).catch(console.error);
              } catch (e: any) {
                Alert.alert(t('errors.generic'), e.message);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert(t('errors.generic'), e.message);
    }
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
// Transfer Ownership Modal
// After transfer: ask "stay in group?" → yes = demoteToMember, no = leave
// ---------------------------------------------------------------------------
function TransferOwnershipModal({
  visible,
  group,
  currentUserId,
  onClose,
  onDone,
}: {
  visible: boolean;
  group: GroupRow;
  currentUserId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [members, setMembers]       = useState<GroupMember[]>([]);
  const [loading, setLoading]       = useState(false);
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    getGroupMembers(group.id)
      .then(setMembers)
      .catch((e) => console.error('[transfer] load members error', e))
      .finally(() => setLoading(false));
  }, [visible, group.id]);

  const otherMembers = members.filter((m) => m.guardian_id !== currentUserId);

  function confirmTransfer(member: GroupMember) {
    Alert.alert(
      t('groups.transfer_ownership_title'),
      t('groups.transfer_ownership_confirm', { name: member.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            setTransferring(true);
            try {
              await transferGroupOwnership(group.id, member.guardian_id);
              // Ask if they want to stay in the group as a regular member
              Alert.alert(
                t('groups.stay_in_group'),
                '',
                [
                  {
                    text: t('groups.stay_in_group_yes'),
                    onPress: async () => {
                      try {
                        await demoteToMember(group.id);
                      } catch (e: any) {
                        console.warn('[transfer] demote error', e.message);
                      } finally {
                        setTransferring(false);
                        onDone();
                      }
                    },
                  },
                  {
                    text: t('groups.stay_in_group_no'),
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await removeGuardianFromGroup(group.id, currentUserId);
                      } catch (e: any) {
                        console.warn('[transfer] remove error', e.message);
                      } finally {
                        setTransferring(false);
                        onDone();
                      }
                    },
                  },
                ],
                { cancelable: false }
              );
            } catch (e: any) {
              setTransferring(false);
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
          <TouchableOpacity onPress={onClose} disabled={transferring}>
            <Text className="text-gray-500 text-base">{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text className="text-lg font-semibold">{t('groups.transfer_ownership_title')}</Text>
          <View style={{ width: 56 }} />
        </View>

        <Text className="px-4 pt-4 pb-2 text-sm text-gray-500">
          {t('groups.transfer_ownership_prompt')}
        </Text>

        {loading || transferring ? (
          <ActivityIndicator size="large" color="#16a34a" style={{ marginTop: 32 }} />
        ) : (
          <ScrollView className="flex-1 px-4 pt-2">
            {otherMembers.map((member) => (
              <TouchableOpacity
                key={member.guardian_id}
                className="bg-gray-50 rounded-xl p-4 mb-3 flex-row justify-between items-center"
                onPress={() => confirmTransfer(member)}
              >
                <Text className="text-base text-gray-900">{member.name}</Text>
                <Text className="text-green-600 text-sm font-semibold">
                  {t('groups.make_owner')}
                </Text>
              </TouchableOpacity>
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
const BRAND_GREEN = '#3D7A50';

function GroupCard({
  group,
  onRefresh,
}: {
  group: GroupRow;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  const childLabel =
    group.child_count === 1
      ? t('groups.children_count_one')
      : t('groups.children_count_other', { count: group.child_count });

  return (
    <TouchableOpacity
      style={{
        marginHorizontal: 16,
        marginBottom: 10,
        backgroundColor: 'white',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#d9d9d9',
        paddingVertical: 18,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
      onPress={() =>
        router.push({
          pathname: '/group/[id]',
          params: {
            id: group.id,
            name: group.name,
            emoji: group.emoji ?? '',
            isAdmin: group.is_admin ? '1' : '0',
            memberCount: String(group.member_count),
            inviteToken: group.invite_token,
          },
        })
      }
      activeOpacity={0.7}
    >
      {/* Emoji — first child → physical RIGHT in RTL */}
      <Text style={{ fontSize: 38, lineHeight: 46, flexShrink: 0 }}>
        {group.emoji ?? '🌳'}
      </Text>

      {/* Info — second child → physical LEFT in RTL */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Text className="text-lg font-rubik-medium text-black" style={{ flexShrink: 1 }}>
            {group.name}
          </Text>
          {group.is_admin && (
            <View
              style={{
                backgroundColor: 'rgba(0, 215, 87, 0.26)',
                borderRadius: 5,
                paddingHorizontal: 7,
                paddingVertical: 2,
                flexShrink: 0,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700' }}>{t('groups.admin_badge')}</Text>
            </View>
          )}
        </View>
        <Text className="text-sm font-rubik text-gray-500" style={{ textAlign: 'right' }}>
          {childLabel}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Groups Screen
// ---------------------------------------------------------------------------
export default function GroupsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [groups, setGroups]         = useState<GroupRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [menuOpen, setMenuOpen]     = useState(false);

  const knownGroupsRef = useRef<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    try {
      const data = await getMyGroups();
      if (knownGroupsRef.current.size > 0) {
        for (const [id, name] of knownGroupsRef.current) {
          if (!data.find((g) => g.id === id)) {
            Toast.show({ text1: t('groups.group_deleted_toast', { name }) });
          }
        }
      }
      knownGroupsRef.current = new Map(data.map((g) => [g.id, g.name]));
      setGroups(data);
    } catch (e) {
      console.error('[groups] load error', e);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f1fdf5' }}>

      {/* App bar */}
      <View style={{ backgroundColor: '#f1fdf5' }} className="px-6 py-3 flex-row justify-between items-center">
        <View className="flex-row items-center" style={{ gap: 4 }}>
          <Image source={require('../../assets/tree.png')} style={{ width: 26, height: 26 }} />
          <Text className="text-2xl font-rubik-semi text-black">{t('common.app_name')}</Text>
        </View>
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => setMenuOpen((v) => !v)}
        >
          <Ionicons name="menu" size={24} color="black" />
        </TouchableOpacity>
      </View>

      {/* Title + create button row */}
      <View
        className="flex-row justify-between items-center"
        style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12 }}
      >
        <Text className="text-3xl font-rubik-semi text-black">{t('onboarding.groups_title')}</Text>
        <TouchableOpacity
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => setShowCreate(true)}
        >
          <Text className="font-rubik-semi text-base" style={{ color: BRAND_GREEN }}>+ {t('groups.create')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={BRAND_GREEN} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <GroupCard group={item} onRefresh={load} />}
          contentContainerStyle={{ paddingVertical: 12 }}
          ListEmptyComponent={
            <View className="items-center justify-center mt-16 px-6">
              <Text className="text-base text-center font-rubik" style={{ color: '#6b7280' }}>
                {t('groups.no_groups')}
              </Text>
              <TouchableOpacity
                style={{
                  backgroundColor: BRAND_GREEN,
                  borderRadius: 8,
                  marginTop: 24,
                  paddingHorizontal: 32,
                  paddingVertical: 12,
                }}
                onPress={() => setShowCreate(true)}
              >
                <Text className="text-white font-rubik-semi">{t('groups.create')}</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Create group modal */}
      <CreateGroupModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); load(); }}
      />

      {/* FAB — home icon, bottom-right */}
      <TouchableOpacity
        onPress={() => router.replace('/(tabs)')}
        style={{
          position: 'absolute',
          bottom: 64,
          left: 16,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: 'white',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <Image
          source={require('../../assets/home-fab.png')}
          style={{ width: 24, height: 24 }}
          resizeMode="contain"
        />
      </TouchableOpacity>

      {/* Hamburger dropdown menu */}
      {menuOpen && (
        <>
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}
            onPress={() => setMenuOpen(false)}
            activeOpacity={1}
          />
          <View
            style={{
              position: 'absolute',
              top: insets.top + 56,
              right: 12,
              zIndex: 51,
              backgroundColor: 'white',
              borderRadius: 10,
              width: 160,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 8,
              overflow: 'hidden',
            }}
          >
            {([
              { labelKey: 'menu.my_children', icon: require('../../assets/icons/Heart.png'),  route: '/(tabs)/children' },
              { labelKey: 'menu.my_groups',   icon: require('../../assets/icons/groups.png'), route: '/(tabs)/groups'   },
              { labelKey: 'menu.my_profile',  icon: require('../../assets/person.png'), route: '/(tabs)/profile'  },
            ] as const).map(({ labelKey, icon, route }, idx) => (
              <TouchableOpacity
                key={labelKey}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                  gap: 10,
                  height: 48,
                  borderTopWidth: idx > 0 ? 1 : 0,
                  borderTopColor: '#f3f4f6',
                }}
                onPress={() => { setMenuOpen(false); router.replace(route); }}
              >
                <Image source={icon} style={{ width: 20, height: 20 }} resizeMode="contain" />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: '#111827', textAlign: 'right' }}>
                  {t(labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

    </SafeAreaView>
  );
}
