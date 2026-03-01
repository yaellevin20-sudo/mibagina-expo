import { ActivityIndicator, View } from 'react-native';

export default function AuthCallback() {
  // Token extraction is handled by Linking.useURL() in app/_layout.tsx.
  // This screen shows briefly while setSession() completes.
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
