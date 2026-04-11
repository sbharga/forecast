import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { MapPin, Calendar, ExternalLink } from 'lucide-react-native';

// ─── Config ────────────────────────────────────────────────────────────────
// For Expo Go on a physical device replace localhost with your machine's
// local IP address, e.g. "http://192.168.1.42:8000/api/events"
const EVENTS_URL = 'http://localhost:8000/api/events';

// UMD campus center
const UMD_REGION = {
  latitude: 38.9869,
  longitude: -76.9426,
  latitudeDelta: 0.018,
  longitudeDelta: 0.018,
};

// UMD Red — used as accent colour throughout
const UMD_RED = '#E21833';

// Generate a label for each date button in the slider
function buildDateSlider(days = 7) {
  const labels = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    labels.push({
      key: d.toISOString().split('T')[0],
      label: i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    });
  }
  return labels;
}

export default function App() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(buildDateSlider()[0].key);

  const dateSlider = buildDateSlider(7);

  // ── Fetch events from the FastAPI backend ──────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(EVENTS_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setEvents(data);
      } catch (err) {
        console.warn('Failed to fetch events:', err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Filter events by selected date ────────────────────────────────────
  const visibleEvents = events.filter(
    (e) => e.start_time.startsWith(selectedDate)
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Map ──────────────────────────────────────────────────────── */}
      <MapView
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={UMD_REGION}
        showsUserLocation
        showsMyLocationButton
      >
        {visibleEvents.map((event) => (
          <Marker
            key={event.id}
            coordinate={{ latitude: event.lat, longitude: event.lng }}
            title={event.title}
            description={event.start_time}
            pinColor={UMD_RED}
          />
        ))}
      </MapView>

      {/* ── Bottom Sheet ─────────────────────────────────────────────── */}
      <View style={styles.bottomSheet}>
        {/* Date Slider — "Weather Scroll UI" */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sliderContent}
          style={styles.dateSlider}
        >
          {dateSlider.map((item) => {
            const active = item.key === selectedDate;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => setSelectedDate(item.key)}
                style={[styles.datePill, active && styles.datePillActive]}
                activeOpacity={0.7}
              >
                <Calendar
                  size={13}
                  color={active ? '#fff' : UMD_RED}
                  style={styles.pillIcon}
                />
                <Text style={[styles.datePillText, active && styles.datePillTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Event List */}
        {loading ? (
          <ActivityIndicator color={UMD_RED} style={{ marginTop: 16 }} />
        ) : error ? (
          <Text style={styles.errorText}>Could not load events: {error}</Text>
        ) : visibleEvents.length === 0 ? (
          <Text style={styles.emptyText}>No events on this day.</Text>
        ) : (
          <ScrollView style={styles.eventList} showsVerticalScrollIndicator={false}>
            {visibleEvents.map((event) => (
              <View key={event.id} style={styles.eventCard}>
                <View style={styles.eventCardLeft}>
                  <MapPin size={16} color={UMD_RED} />
                </View>
                <View style={styles.eventCardBody}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventTime}>
                    {new Date(event.start_time).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <TouchableOpacity style={styles.eventLinkBtn}>
                  <ExternalLink size={16} color="#888" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  map: {
    flex: 1,
  },

  // ── Bottom sheet ──────────────────────────────────────────────────────
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 8,
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
    maxHeight: '40%',
  },

  // ── Date slider ───────────────────────────────────────────────────────
  dateSlider: {
    flexGrow: 0,
  },
  sliderContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: UMD_RED,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  datePillActive: {
    backgroundColor: UMD_RED,
  },
  pillIcon: {
    marginRight: 4,
  },
  datePillText: {
    fontSize: 13,
    fontWeight: '600',
    color: UMD_RED,
  },
  datePillTextActive: {
    color: '#fff',
  },

  // ── Event cards ───────────────────────────────────────────────────────
  eventList: {
    marginTop: 10,
    paddingHorizontal: 16,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  eventCardLeft: {
    width: 32,
    alignItems: 'center',
  },
  eventCardBody: {
    flex: 1,
    marginLeft: 8,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  eventTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  eventLinkBtn: {
    padding: 6,
  },

  // ── States ────────────────────────────────────────────────────────────
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
    fontSize: 14,
  },
  errorText: {
    textAlign: 'center',
    color: UMD_RED,
    marginTop: 20,
    fontSize: 13,
    paddingHorizontal: 16,
  },
});
