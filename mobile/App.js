import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LayoutList, Map, UserCog } from 'lucide-react-native';
import * as Location from 'expo-location';

import { EventsProvider } from './contexts/EventsContext';
import { AuthProvider } from './contexts/AuthContext';
import MapScreen   from './screens/MapScreen';
import FeedScreen  from './screens/FeedScreen';
import IntelScreen from './screens/IntelScreen';

const Tab = createBottomTabNavigator();

const SCOPE_BLUE = '#007AFF';
const INACTIVE   = '#8E8E93';

export default function App() {
  // Request location permission once on app open
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
      <EventsProvider>
        <StatusBar barStyle="dark-content" />
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarActiveTintColor:   SCOPE_BLUE,
              tabBarInactiveTintColor: INACTIVE,
              tabBarStyle: {
                backgroundColor: '#fff',
                borderTopColor: '#E5E5EA',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -2 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: 8,
              },
              tabBarIcon: ({ color, size }) => {
                const icons = {
                  Map:   <Map        size={size} color={color} />,
                  Feed:  <LayoutList size={size} color={color} />,
                  Intel: <UserCog    size={size} color={color} />,
                };
                return icons[route.name] ?? null;
              },
            })}
          >
            <Tab.Screen name="Map"   component={MapScreen}   />
            <Tab.Screen name="Feed"  component={FeedScreen}  />
            <Tab.Screen name="Intel" component={IntelScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      </EventsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
