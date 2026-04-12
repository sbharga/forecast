import React, { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRoute } from '@react-navigation/native';
import * as Location from 'expo-location';
import { Calendar, CalendarCheck, ExternalLink, MapPin, Navigation, X } from 'lucide-react-native';
import { useEvents } from '../contexts/EventsContext';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORIES, categorizeEvent } from '../utils/categories';
import { addEventToCalendar } from '../utils/calendar';

// ─── Map ───────────────────────────────────────────────────────────────────
const CAMPUS_CENTER = { latitude: 38.9869, longitude: -76.9426 };
const IRIBE_REGION = {
  ...CAMPUS_CENTER,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

// Haversine distance in miles between two {latitude, longitude} points
function distanceMiles(a, b) {
  const R   = 3958.8; // Earth radius in miles
  const lat1 = (a.latitude  * Math.PI) / 180;
  const lat2 = (b.latitude  * Math.PI) / 180;
  const dLat = ((b.latitude  - a.latitude)  * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

const CAMPUS_RADIUS_MILES = 5;

// ─── Theme ─────────────────────────────────────────────────────────────────
const SCOPE_BLUE = '#007AFF';
const UMD_RED    = '#E21833';
const INK        = '#0F172A';
const SLATE      = '#64748B';
const SURFACE    = '#F1F5F9';

// ─── Google Maps minimal style (Android only) ──────────────────────────────
const MAP_STYLE = [
  { elementType: 'geometry',            stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon',         stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'poi',        elementType: 'geometry',         stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi.park',   elementType: 'geometry',         stylers: [{ color: '#e5f5e0' }] },
  { featureType: 'road',       elementType: 'geometry',         stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry',       stylers: [{ color: '#dadada' }] },
  { featureType: 'water',      elementType: 'geometry',         stylers: [{ color: '#c9e5f5' }] },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Returns a YYYY-MM-DD key in the device's local timezone. */
function toLocalDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildDateSlider(days = 6) {
  const result = [];
  const today  = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    result.push({
      key:     toLocalDateKey(d),
      weekday: i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }),
      day:     d.getDate(),
    });
  }
  return result;
}

function relativeTime(isoString) {
  const diffMs  = new Date(isoString).getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 0)           return 'Started';
  if (diffMin < 60)          return `Starts in ${diffMin}m`;
  const hrs = Math.floor(diffMin / 60);
  if (hrs < 24)              return `Starts in ${hrs}h`;
  return `Starts in ${Math.floor(hrs / 24)}d`;
}

const DATE_SLIDER = buildDateSlider(6);

// ─── Component ─────────────────────────────────────────────────────────────
export default function MapScreen() {
  const { events, loading, error } = useEvents();
  const { user, accessToken, signIn } = useAuth();
  const route  = useRoute();
  const mapRef = useRef(null);

  const [selectedDate,   setSelectedDate]   = useState(DATE_SLIDER[0].key);
  const [selectedEvent,  setSelectedEvent]  = useState(null);
  // keyed by event.id: 'idle' | 'loading' | 'added' | 'error'
  const [calendarStates, setCalendarStates] = useState({});

  // ── Respond to "View on Map" taps from FeedScreen ────────────────────
  useEffect(() => {
    const { focusEvent, focusTimestamp } = route.params || {};
    if (!focusEvent) return;
    // Update date filter so the focused event's marker is visible
    const eventDate = toLocalDateKey(new Date(focusEvent.start_time));
    setSelectedDate(eventDate);
    setSelectedEvent(focusEvent);
    mapRef.current?.animateToRegion(
      {
        latitude:      focusEvent.lat,
        longitude:     focusEvent.lng,
        latitudeDelta:  0.006,
        longitudeDelta: 0.006,
      },
      600
    );
  }, [route.params?.focusTimestamp]);

  async function handleAddToCalendar(event) {
    if (!user) {
      signIn();
      return;
    }
    setCalendarStates(prev => ({ ...prev, [event.id]: 'loading' }));
    try {
      await addEventToCalendar(event, accessToken);
      setCalendarStates(prev => ({ ...prev, [event.id]: 'added' }));
    } catch (e) {
      console.warn('Calendar add failed:', e.message);
      setCalendarStates(prev => ({ ...prev, [event.id]: 'error' }));
    }
  }

  const filteredEvents = events.filter(
    e => toLocalDateKey(new Date(e.start_time)) === selectedDate
  );

  return (
    <View style={styles.root}>
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
        {filteredEvents.map(event => {
          const cat            = categorizeEvent(event);
          const color          = CATEGORIES[cat].color;
          const isHighPriority = event.priorityScore > 80;
          return (
            <Marker
              key={event.id}
              coordinate={{ latitude: event.lat, longitude: event.lng }}
              onPress={() => setSelectedEvent(event)}
              tracksViewChanges={false}
            >
              <View style={[
                styles.markerBubble,
                { backgroundColor: color, shadowColor: color },
                isHighPriority && styles.markerBubbleHighPriority,
              ]}>
                <MapPin size={14} color="#fff" />
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* ── FAB — center on user location (if on campus) else campus ── */}
      <SafeAreaView pointerEvents="box-none" style={styles.fabContainer}>
        <TouchableOpacity
          style={styles.fab}
          onPress={async () => {
            try {
              const { status } = await Location.getForegroundPermissionsAsync();
              if (status === 'granted') {
                const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                const userCoord = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                const miles = distanceMiles(userCoord, CAMPUS_CENTER);
                if (miles <= CAMPUS_RADIUS_MILES) {
                  mapRef.current?.animateToRegion(
                    { ...userCoord, latitudeDelta: 0.008, longitudeDelta: 0.008 },
                    450
                  );
                  return;
                }
              }
            } catch (_) {}
            // Fall back to campus center
            mapRef.current?.animateToRegion(IRIBE_REGION, 450);
          }}
          activeOpacity={0.85}
        >
          <Navigation size={20} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* ── Date slider ─────────────────────────────────────────────── */}
      <View style={styles.sliderContainer}>
        {loading && <Text style={styles.statusLabel}>Loading events…</Text>}
        {error   && <Text style={styles.errorLabel}>⚠ {error}</Text>}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sliderContent}
        >
          {DATE_SLIDER.map(item => {
            const active = item.key === selectedDate;
            const count  = events.filter(e => toLocalDateKey(new Date(e.start_time)) === item.key).length;
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

      {/* ── Event detail modal ──────────────────────────────────────── */}
      <Modal
        visible={!!selectedEvent}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedEvent(null)}
      >
        <TouchableWithoutFeedback onPress={() => setSelectedEvent(null)}>
          <View style={styles.modalBackdrop} />
        </TouchableWithoutFeedback>

        {selectedEvent && (
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setSelectedEvent(null)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={18} color={SLATE} />
            </TouchableOpacity>

            <View style={styles.relTimeBadge}>
              <Calendar size={12} color={SCOPE_BLUE} />
              <Text style={styles.relTimeBadgeText}>
                {relativeTime(selectedEvent.start_time)}
              </Text>
            </View>

            <Text style={styles.modalTitle} numberOfLines={3}>
              {selectedEvent.title}
            </Text>

            <View style={styles.modalRow}>
              <MapPin size={14} color={SLATE} />
              <Text style={styles.modalRowText} numberOfLines={1}>
                {selectedEvent.location || 'UMD Campus'}
              </Text>
            </View>

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

            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={() => Linking.openURL(selectedEvent.link).catch(() => {})}
              activeOpacity={0.85}
            >
              <ExternalLink size={16} color="#fff" />
              <Text style={styles.ctaBtnText}>View on TerpLink</Text>
            </TouchableOpacity>

            {(() => {
              const calState = calendarStates[selectedEvent.id] || 'idle';
              const isAdded  = calState === 'added';
              const isBusy   = calState === 'loading';
              return (
                <TouchableOpacity
                  style={[styles.calendarBtn, isAdded && styles.calendarBtnAdded]}
                  onPress={() => handleAddToCalendar(selectedEvent)}
                  disabled={isBusy || isAdded}
                  activeOpacity={0.75}
                >
                  <CalendarCheck size={16} color={isAdded ? '#34C759' : SCOPE_BLUE} />
                  <Text style={[styles.calendarBtnText, isAdded && styles.calendarBtnTextAdded]}>
                    {!user
                      ? 'Sign in to Save'
                      : isAdded
                      ? 'Added to Calendar'
                      : isBusy
                      ? 'Adding…'
                      : calState === 'error'
                      ? 'Retry'
                      : 'Add to My Calendar'}
                  </Text>
                </TouchableOpacity>
              );
            })()}
          </View>
        )}
      </Modal>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  markerBubble: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: SCOPE_BLUE,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: SCOPE_BLUE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45, shadowRadius: 5, elevation: 5,
    borderWidth: 2, borderColor: '#fff',
  },
  markerBubbleHighPriority: {
    transform: [{ scale: 1.2 }],
    shadowOpacity: 0.75,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 2.5,
  },

  fabContainer: {
    position: 'absolute', right: 16, bottom: 200,
  },
  fab: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: SCOPE_BLUE,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22, shadowRadius: 10, elevation: 8,
  },

  sliderContainer: {
    position: 'absolute', bottom: 32, left: 12, right: 12,
    backgroundColor: '#fff', borderRadius: 22,
    paddingTop: 14, paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13, shadowRadius: 16, elevation: 10,
  },
  sliderContent: { paddingHorizontal: 14 },
  datePill: {
    alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 16, backgroundColor: SURFACE, marginRight: 8, minWidth: 56,
  },
  datePillActive:      { backgroundColor: SCOPE_BLUE },
  pillWeekday:         { fontSize: 10, fontWeight: '600', color: SLATE, textTransform: 'uppercase', letterSpacing: 0.4 },
  pillDay:             { fontSize: 20, fontWeight: '700', color: INK, marginTop: 1 },
  pillLabelActive:     { color: '#fff' },
  pillBadge:           { marginTop: 4, backgroundColor: UMD_RED + '22', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  pillBadgeActive:     { backgroundColor: 'rgba(255,255,255,0.28)' },
  pillBadgeText:       { fontSize: 10, fontWeight: '700', color: UMD_RED },
  pillBadgeTextActive: { color: '#fff' },
  statusLabel:         { textAlign: 'center', color: SLATE, fontSize: 12, marginBottom: 8 },
  errorLabel:          { textAlign: 'center', color: UMD_RED, fontSize: 12, marginBottom: 8, paddingHorizontal: 16 },
  emptyLabel:          { textAlign: 'center', color: SLATE, fontSize: 13, marginTop: 10 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: 24, paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.14, shadowRadius: 20, elevation: 14,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 20,
  },
  modalCloseBtn:  { position: 'absolute', top: 18, right: 20, padding: 6 },
  relTimeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: SCOPE_BLUE + '18', alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginBottom: 12,
  },
  relTimeBadgeText: { fontSize: 12, fontWeight: '600', color: SCOPE_BLUE },
  modalTitle:       { fontSize: 21, fontWeight: '700', color: INK, lineHeight: 28, marginBottom: 14 },
  modalRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  modalRowText:     { flex: 1, fontSize: 14, color: SLATE, lineHeight: 20 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 20, backgroundColor: SCOPE_BLUE, borderRadius: 16, paddingVertical: 16,
  },
  ctaBtnText: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },

  calendarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 10, borderRadius: 16, paddingVertical: 14,
    borderWidth: 1.5, borderColor: SCOPE_BLUE, backgroundColor: '#fff',
  },
  calendarBtnAdded: {
    borderColor: '#34C759', backgroundColor: '#F0FDF4',
  },
  calendarBtnText: { fontSize: 15, fontWeight: '600', color: SCOPE_BLUE, letterSpacing: 0.2 },
  calendarBtnTextAdded: { color: '#34C759' },
});
