import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getPlaygroundChildren, type PlaygroundChildrenResult, type NamedChild } from '../../lib/db/rpc';

// ---------------------------------------------------------------------------
// SiblingGroup — collapsed by default when >1 child from same guardian
// ---------------------------------------------------------------------------
function SiblingGroup({ checkins }: { checkins: NamedChild[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const first = checkins[0];
  const rest  = checkins.slice(1);

  return (
    <View className="mt-2">
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
  );
}

// ---------------------------------------------------------------------------
// Playground View
// ---------------------------------------------------------------------------
export default function PlaygroundScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  type State =
    | { name: 'loading' }
    | { name: 'data'; result: PlaygroundChildrenResult }
    | { name: 'no_visible' }
    | { name: 'access_denied' }
    | { name: 'error'; message: string };

  const [state, setState] = useState<State>({ name: 'loading' });

  useEffect(() => {
    if (!id) return;
    getPlaygroundChildren(id)
      .then((result) => {
        if (result.no_visible_children) {
          setState({ name: 'no_visible' });
        } else {
          setState({ name: 'data', result });
        }
      })
      .catch((e: any) => {
        if (e.message?.includes('Access denied')) {
          setState({ name: 'access_denied' });
        } else {
          setState({ name: 'error', message: e.message ?? t('errors.generic') });
        }
      });
  }, [id]);

  // Group named children by posted_by for sibling collapse
  const byGuardian = useMemo(() => {
    if (state.name !== 'data') return new Map<string, NamedChild[]>();
    const map = new Map<string, NamedChild[]>();
    for (const c of state.result.named) {
      const key = c.posted_by ?? c.child_id; // fallback if posted_by missing
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [state]);

  const header = (
    <View className="flex-row justify-between items-center px-4 py-4 bg-white border-b border-gray-200">
      <TouchableOpacity onPress={() => router.back()}>
        <Text className="text-gray-500 text-base">{t('common.back')}</Text>
      </TouchableOpacity>
      <Text className="text-lg font-semibold">{t('playground.title')}</Text>
      <View style={{ width: 56 }} />
    </View>
  );

  if (state.name === 'loading') {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        {header}
        <ActivityIndicator size="large" color="#16a34a" style={{ marginTop: 48 }} />
      </SafeAreaView>
    );
  }

  if (state.name === 'access_denied') {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        {header}
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-gray-500 text-base text-center">
            {t('errors.access_denied')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state.name === 'no_visible' || state.name === 'error') {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        {header}
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-gray-500 text-base text-center">
            {state.name === 'error' ? state.message : t('home.no_one_here')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { result } = state;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {header}
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Named children grouped by guardian */}
        {byGuardian.size > 0 && (
          <View className="bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100">
            <Text className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              {t('playground.who_is_here')}
            </Text>
            {[...byGuardian.values()].map((checkins, i) => (
              <SiblingGroup key={i} checkins={checkins} />
            ))}
          </View>
        )}

        {/* Anonymous ages */}
        {result.anonymous_ages.length > 0 && (
          <View className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <Text className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              {t('playground.also_here')}
            </Text>
            {result.anonymous_ages.map((age, i) => (
              <Text key={i} className="text-sm text-gray-500 mt-1">
                {t('home.anonymous_age', { age })}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
