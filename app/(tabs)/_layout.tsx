import { Tabs } from 'expo-router';
import { strings } from '@/core/strings';

/**
 * Tab skeleton. UX decision E1: the tab bar is intentionally hidden —
 * the index (Home) is the only tab; Stats and Settings live on the root
 * stack (native iOS swipe-back), pushed from the Home header.
 */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="index" options={{ title: strings.tabs.home }} />
    </Tabs>
  );
}
