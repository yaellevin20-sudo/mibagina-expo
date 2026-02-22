import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  AppState,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  getMyGroups,
  getGroupActiveCheckins,
  respondStillThere,
  leaveCheckin,
  type GroupRow,
  type HomeFeedItem,
  type HomeNamedChild,
} from '../../lib/db/rpc';

const POLL_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// SiblingGroup: one guardian's children at a playground
// ---------------------------------------------------------------------------
function SiblingGroup({
  checkins,
  isOwn,
  onStillHere,
  onLeave,
}: {
  checkins: HomeNamedChild[];
  isOwn: boolean;
  onStillHere: (ids: string[]) => void;
  onLeave: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const first = checkins[0];
  const rest  = checkins.slice(1);

  return (
    <View className="mt-2">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-sm font-medium text-gray-800">
            {first.first_name}
            <Text className="text-gray-400 font-normal">
              {' · '}{t('children.years_old', { age: first.age_years })}
            </Text>
          </Text>

          {rest.length > 0 && (
            <TouchableOpacity onPress={() => setExpanded((e) => !e)}>
              <Text className="text-xs text-green-600 mt-0.5">
                {expanded
                  ? t('home.collapse_siblings')
                  : t('children.siblings_collapsed', { count: rest.length })}
              </Text>
            </TouchableOpacity>
          )}

          {expanded && rest.map((c) => (
            <Text key={c.child_id} className="text-sm text-gray-600 mt-0.5 pl-2">
              {c.first_name} · {t('children.years_old', { age: c.age_years })}
            </Text>
          ))}
        </View>

        {isOwn && (
          <View className="flex-row gap-2">
            <TouchableOpacity
              className="border border-green-500 rounded-lg px-2 py-1"
              onPress={() => onStillHere(checkins.map((c) => c.check_in_id))}
            >
              <Text className="text-green-600 text-xs">{t('checkin.still_there')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="border border-red-300 rounded-lg px-2 py-1"
              onPress={() => onLeave(checkins.map((c) => c.check_in_id))}
            >
              <Text className="text-red-500 text-xs">{t('checkin.leaving')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// PlaygroundCard
// ---------------------------------------------------------------------------
function PlaygroundCard({
  item,
  currentUserId,
  onAction,
  onPress,
}: {
  item: HomeFeedItem;
  currentUserId: string;
  onAction: () => void;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  // Group named check-ins by posted_by (siblings share a guardian)
  const byGuardian = useMemo(() => {
    const map = new Map<string, HomeNamedChild[]>();
    for (const c of item.named) {
      if (!map.has(c.posted_by)) map.set(c.posted_by, []);
      map.get(c.posted_by)!.push(c);
    }
    return map;
  }, [item.named]);

  async function handleStillHere(checkInIds: string[]) {
    try {
      await Promise.all(checkInIds.map((id) => respondStillThere(id)));
      onAction();
    } catch (e: any) {
      Alert.alert(t('errors.generic'), e.message);
    }
  }

  async function handleLeave(checkInIds: string[]) {
    try {
      await Promise.all(checkInIds.map((id) => leaveCheckin(id)));
      onAction();
    } catch (e: any) {
      Alert.alert(t('errors.generic'), e.message);
    }
  }

  return (
    <TouchableOpacity
      className="bg-white rounded-xl mx-4 mb-3 p-4 shadow-sm border border-gray-100"
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text className="text-base font-bold text-gray-900 mb-1">
        🌳 {item.playground_name}
      </Text>

      {/* Named children grouped by guardian (siblings) */}
      {[...byGuardian.entries()].map(([guardianId, checkins]) => (
        <SiblingGroup
          key={guardianId}
          checkins={checkins}
          isOwn={guardianId === currentUserId}
          onStillHere={handleStillHere}
          onLeave={handleLeave}
        />
      ))}

      {/* Anonymous ages */}
      {item.anonymous_ages.map((age, i) => (
        <Text key={i} className="text-sm text-gray-400 mt-1">
          {t('home.anonymous_age', { age })}
        </Text>
      ))}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Home Screen
// ---------------------------------------------------------------------------
export default function HomeScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();

  const [groups, setGroups]             = useState<GroupRow[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [feed, setFeed]                 = useState<HomeFeedItem[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [feedLoading, setFeedLoading]   = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load groups on mount ──────────────────────────────────────────────────
  useEffect(() => {
    getMyGroups()
      .then((data) => {
        setGroups(data);
        if (data.length > 0) setSelectedGroupId(data[0].id);
      })
      .catch(console.error)
      .finally(() => setGroupsLoading(false));
  }, []);

  // ── Poll feed (30s, AppState-aware) ───────────────────────────────────────
  const poll = useCallback(async () => {
    if (!selectedGroupId) return;
    try {
      const data = await getGroupActiveCheckins(selectedGroupId);
      setFeed(data);
    } catch (e) {
      console.error('[home] poll error', e);
    } finally {
      setFeedLoading(false);
    }
  }, [selectedGroupId]);

  useEffect(() => {
    if (!selectedGroupId) return;
    setFeedLoading(true);

    const start = () => {
      if (intervalRef.current) return;
      poll();
      intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    };

    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    start();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });

    return () => {
      stop();
      sub.remove();
    };
  }, [poll]);

  // ── Render: loading ───────────────────────────────────────────────────────
  if (groupsLoading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator size="large" color="#16a34a" />
      </SafeAreaView>
    );
  }

  // ── Render: no groups ─────────────────────────────────────────────────────
  if (groups.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="flex-row justify-between items-center px-4 py-4 bg-white border-b border-gray-200">
          <Text className="text-xl font-bold text-gray-900">{t('home.title')}</Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-gray-500 text-base text-center mb-6">{t('home.no_groups')}</Text>
          <TouchableOpacity
            className="bg-green-600 rounded-lg px-8 py-3"
            onPress={() => router.push('/(tabs)/groups')}
          >
            <Text className="text-white font-semibold">{t('groups.create')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="px-4 py-4 bg-white border-b border-gray-200">
        <View className="flex-row justify-between items-center">
          <Text className="text-xl font-bold text-gray-900">{t('home.title')}</Text>
          <TouchableOpacity
            className="bg-green-600 rounded-lg px-4 py-2"
            onPress={() => router.push('/checkin')}
          >
            <Text className="text-white font-semibold text-sm">{t('checkin.submit')}</Text>
          </TouchableOpacity>
        </View>

        {/* Group selector — shown only when multiple groups */}
        {groups.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-3 -mx-1"
            contentContainerStyle={{ paddingHorizontal: 4 }}
          >
            {groups.map((g) => (
              <TouchableOpacity
                key={g.id}
                className={`mr-2 px-3 py-1.5 rounded-full border ${
                  g.id === selectedGroupId
                    ? 'bg-green-600 border-green-600'
                    : 'border-gray-300 bg-white'
                }`}
                onPress={() => setSelectedGroupId(g.id)}
              >
                <Text
                  className={`text-sm font-medium ${
                    g.id === selectedGroupId ? 'text-white' : 'text-gray-700'
                  }`}
                >
                  {g.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Feed */}
      {feedLoading ? (
        <ActivityIndicator size="large" color="#16a34a" style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(item) => item.playground_id}
          contentContainerStyle={{ paddingVertical: 12 }}
          renderItem={({ item }) => (
            <PlaygroundCard
              item={item}
              currentUserId={user?.id ?? ''}
              onAction={poll}
              onPress={() => router.push(`/playground/${item.playground_id}`)}
            />
          )}
          ListEmptyComponent={
            <View className="items-center justify-center mt-16 px-6">
              <Text className="text-gray-500 text-base text-center">
                {t('home.empty_state')}
              </Text>
              <TouchableOpacity
                className="mt-6 bg-green-600 rounded-lg px-8 py-3"
                onPress={() => router.push('/checkin')}
              >
                <Text className="text-white font-semibold">{t('checkin.submit')}</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
