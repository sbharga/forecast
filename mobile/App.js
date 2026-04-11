import React, { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Calendar, ExternalLink, MapPin, Navigation, X } from 'lucide-react-native';
import * as Location from 'expo-location';

// ─── API Config ────────────────────────────────────────────────────────────
// Physical device: replace localhost with your machine's local IP, e.g.
//   "http://192.168.1.42:8000"
// Find your IP with: ipconfig getifaddr en0 (macOS) or ipconfig (Windows)
const API_BASE_URL = 'http://10.173.67.106:8000';

// ─── Map ───────────────────────────────────────────────────────────────────
const IRIBE_REGION = {
  latitude: 38.9891,
  longitude: -76.9364,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

// ─── Theme ─────────────────────────────────────────────────────────────────
const SCOPE_BLUE = '#1A56DB';
const UMD_RED    = '#E21833';
const INK        = '#0F172A';
const SLATE      = '#64748B';
const SURFACE    = '#F1F5F9';

// ─── Google Maps — minimal/modern style (Android only) ────────────────────
const MAP_STYLE = [
  { elementType: 'geometry',            stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon',         stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'poi',        elementType: 'geometry',         stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi.park',   elementType: 'geometry',         stylers: [{ color: '#e5f5e0' }] },
  { featureType: 'road',       elementType: 'geometry',         stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry',       stylers: [{ color: '#dadada' }] },
  { featureType: 'transit.line', elementType: 'geometry',       stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'water',      elementType: 'geometry',         stylers: [{ color: '#c9e5f5' }] },
  { featureType: 'water',      elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
];

// ─── Helpers ───────────────────────────────────────────────────────────────
function buildDateSlider(days = 7) {
  const result = [];
  const today  = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    result.push({
      key:     d.toISOString().split('T')[0],
      weekday: i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }),
      day:     d.getDate(),
    });
  }
  return result;
}

function relativeTime(isoString) {
  const diffMs  = new Date(isoString).getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 0)             return 'Started';
  if (diffMin < 60)            return `Starts in ${diffMin}m`;
  const hrs = Math.floor(diffMin / 60);
  if (hrs < 24)                return `Starts in ${hrs}h`;
  return `Starts in ${Math.floor(hrs / 24)}d`;
}

// ─── Component ─────────────────────────────────────────────────────────────
const DATE_SLIDER = buildDateSlider(7);

export default function App() {
  const mapRef = useRef(null);

  const [events,        setEvents]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [selectedDate,  setSelectedDate]  = useState(DATE_SLIDER[0].key);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // ── Location permission ───────────────────────────────────────────────
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().catch(() => {
      // Permission denied — showsUserLocation will simply not render the dot
    });
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/events`);
        if (!res.ok) throw new Error(`Backend error: HTTP ${res.status}`);
        const data = await res.json();
        setEvents(data);
        console.log(`Scope: loaded ${data.length} events`);
      } catch (err) {
        // "Network request failed" = phone can't reach backend IP
        // "Backend error: HTTP 502" = backend couldn't reach TerpLink
        console.warn('Scope: fetch failed —', err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────
  const filteredEvents = events.filter(e => e.start_time.startsWith(selectedDate));

  // ── Handlers ──────────────────────────────────────────────────────────
  function centerOnCampus() {
    mapRef.current?.animateToRegion(IRIBE_REGION, 450);
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <SafeAreaProvider>
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── Full-screen map ─────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        customMapStyle={Platform.OS === 'android' ? MAP_STYLE : undefined}
        initialRegion={IRIBE_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {filteredEvents.map(event => (
          <Marker
            key={event.id}
            coordinate={{ latitude: event.lat, longitude: event.lng }}
            onPress={() => setSelectedEvent(event)}
            tracksViewChanges={false}
          >
            {/* Custom blue pin bubble */}
            <View style={styles.markerBubble}>
              <MapPin size={14} color="#fff" />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* ── FAB — center on campus ──────────────────────────────────── */}
      <SafeAreaView pointerEvents="box-none" style={styles.fabContainer}>
        <TouchableOpacity style={styles.fab} onPress={centerOnCampus} activeOpacity={0.85}>
          <Navigation size={20} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* ── Date slider (Weather Scroll) ────────────────────────────── */}
      <View style={styles.sliderContainer}>
        {/* Status line above pills */}
        {loading && <Text style={styles.statusLabel}>Loading events…</Text>}
        {error   && <Text style={styles.errorLabel}>⚠ Could not load events</Text>}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sliderContent}
        >
          {DATE_SLIDER.map(item => {
            const active = item.key === selectedDate;
            const count  = events.filter(e => e.start_time.startsWith(item.key)).length;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => setSelectedDate(item.key)}
                style={[styles.datePill, active && styles.datePillActive]}
                activeOpacity={0.75}
              >
                <Text style={[styles.pillWeekday, active && styles.pillLabelActive]}>
                  {item.weekday}
                </Text>
                <Text style={[styles.pillDay, active && styles.pillLabelActive]}>
                  {item.day}
                </Text>
                {count > 0 && (
                  <View style={[styles.pillBadge, active && styles.pillBadgeActive]}>
                    <Text style={[styles.pillBadgeText, active && styles.pillBadgeTextActive]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {!loading && !error && filteredEvents.length === 0 && (
          <Text style={styles.emptyLabel}>No events on this day</Text>
        )}
      </View>

      {/* ── Event detail modal (bottom sheet) ──────────────────────── */}
      <Modal
        visible={!!selectedEvent}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedEvent(null)}
      >
        {/* Dim backdrop — tap to dismiss */}
        <TouchableWithoutFeedback onPress={() => setSelectedEvent(null)}>
          <View style={styles.modalBackdrop} />
        </TouchableWithoutFeedback>

        {selectedEvent && (
          <View style={styles.modalSheet}>
            {/* Drag handle */}
            <View style={styles.modalHandle} />

            {/* Dismiss button */}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setSelectedEvent(null)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={18} color={SLATE} />
            </TouchableOpacity>

            {/* Relative-time badge */}
            <View style={styles.relTimeBadge}>
              <Calendar size={12} color={SCOPE_BLUE} />
              <Text style={styles.relTimeBadgeText}>
                {relativeTime(selectedEvent.start_time)}
              </Text>
            </View>

            {/* Title */}
            <Text style={styles.modalTitle} numberOfLines={3}>
              {selectedEvent.title}
            </Text>

            {/* Location row */}
            <View style={styles.modalRow}>
              <MapPin size={14} color={SLATE} />
              <Text style={styles.modalRowText} numberOfLines={1}>
                {selectedEvent.location || 'UMD Campus'}
              </Text>
            </View>

            {/* Full date + time */}
            <View style={styles.modalRow}>
              <Calendar size={14} color={SLATE} />
              <Text style={styles.modalRowText}>
                {new Date(selectedEvent.start_time).toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric',
                })}
                {'  ·  '}
                {new Date(selectedEvent.start_time).toLocaleTimeString('en-US', {
                  hour: 'numeric', minute: '2-digit',
                })}
              </Text>
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={() => Linking.openURL(selectedEvent.link).catch(() => {})}
              activeOpacity={0.85}
            >
              <ExternalLink size={16} color="#fff" />
              <Text style={styles.ctaBtnText}>View on TerpLink</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </View>
    </SafeAreaProvider>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },

  // ── Custom marker ────────────────────────────────────────────────────────
  markerBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: SCOPE_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    // Glow shadow
    shadowColor: SCOPE_BLUE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
    elevation: 5,
    borderWidth: 2,
    borderColor: '#fff',
  },

  // ── FAB ──────────────────────────────────────────────────────────────────
  fabContainer: {
    position: 'absolute',
    right: 16,
    bottom: 200,       // sits comfortably above the slider card
  },
  fab: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: SCOPE_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 8,
  },

  // ── Date slider ──────────────────────────────────────────────────────────
  sliderContainer: {
    position: 'absolute',
    bottom: 32,
    left: 12,
    right: 12,
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingTop: 14,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13,
    shadowRadius: 16,
    elevation: 10,
  },
  sliderContent: {
    paddingHorizontal: 14,
  },
  datePill: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: SURFACE,
    marginRight: 8,
    minWidth: 56,
  },
  datePillActive: {
    backgroundColor: SCOPE_BLUE,
  },
  pillWeekday: {
    fontSize: 10,
    fontWeight: '600',
    color: SLATE,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pillDay: {
    fontSize: 20,
    fontWeight: '700',
    color: INK,
    marginTop: 1,
  },
  pillLabelActive: {
    color: '#fff',
  },
  pillBadge: {
    marginTop: 4,
    backgroundColor: UMD_RED + '22',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  pillBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  pillBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: UMD_RED,
  },
  pillBadgeTextActive: {
    color: '#fff',
  },
  statusLabel: {
    textAlign: 'center',
    color: SLATE,
    fontSize: 12,
    marginBottom: 8,
  },
  errorLabel: {
    textAlign: 'center',
    color: UMD_RED,
    fontSize: 12,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  emptyLabel: {
    textAlign: 'center',
    color: SLATE,
    fontSize: 13,
    marginTop: 10,
  },

  // ── Modal ────────────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 14,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 18,
    right: 20,
    padding: 6,
  },
  relTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SCOPE_BLUE + '18',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 12,
  },
  relTimeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: SCOPE_BLUE,
  },
  modalTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: INK,
    lineHeight: 28,
    marginBottom: 14,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  modalRowText: {
    flex: 1,
    fontSize: 14,
    color: SLATE,
    lineHeight: 20,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    backgroundColor: SCOPE_BLUE,
    borderRadius: 16,
    paddingVertical: 16,
  },
  ctaBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
});
