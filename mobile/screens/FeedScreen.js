import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Clock, MapPin, Navigation, Search } from 'lucide-react-native';
import { useEvents } from '../contexts/EventsContext';

// ─── Theme ─────────────────────────────────────────────────────────────────
const SCOPE_BLUE = '#007AFF';
const INK        = '#0F172A';
const SLATE      = '#64748B';
const BG         = '#F2F2F7';
const UMD_RED    = '#E21833';

// ─── Helpers ───────────────────────────────────────────────────────────────
function isLive(event) {
  const now   = Date.now();
  const start = new Date(event.start_time).getTime();
  const end   = start + 2 * 60 * 60 * 1000; // assume 2-hour window
  return now >= start && now <= end;
}

function formatDateTime(isoString) {
  const d = new Date(isoString);
  return (
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

// ─── Event Card ────────────────────────────────────────────────────────────
function EventCard({ event, onViewOnMap }) {
  const live = isLive(event);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>{event.title}</Text>
        {live && (
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
        )}
      </View>

      <View style={styles.cardMeta}>
        <MapPin size={12} color={SLATE} />
        <Text style={styles.cardMetaText} numberOfLines={1}>
          {event.location || 'UMD Campus'}
        </Text>
      </View>

      <View style={styles.cardMeta}>
        <Clock size={12} color={SLATE} />
        <Text style={styles.cardMetaText}>{formatDateTime(event.start_time)}</Text>
      </View>

      <TouchableOpacity style={styles.viewOnMapBtn} onPress={onViewOnMap} activeOpacity={0.75}>
        <Navigation size={13} color={SCOPE_BLUE} />
        <Text style={styles.viewOnMapText}>View on Map</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────
export default function FeedScreen() {
  const { events, loading, error } = useEvents();
  const navigation = useNavigation();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return events;
    const q = query.toLowerCase();
    return events.filter(
      e =>
        e.title.toLowerCase().includes(q) ||
        (e.location || '').toLowerCase().includes(q)
    );
  }, [events, query]);

  function handleViewOnMap(event) {
    navigation.navigate('Map', {
      focusEvent:      event,
      focusTimestamp:  Date.now(),
    });
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Opportunities</Text>
        <Text style={styles.headerSub}>
          {loading ? 'Loading…' : `${filtered.length} event${filtered.length !== 1 ? 's' : ''}`}
        </Text>
      </View>

      {/* ── Search bar ──────────────────────────────────────────────── */}
      <View style={styles.searchRow}>
        <Search size={16} color={SLATE} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search events, locations…"
          placeholderTextColor={SLATE}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {/* ── States ──────────────────────────────────────────────────── */}
      {loading && (
        <ActivityIndicator color={SCOPE_BLUE} style={{ marginTop: 40 }} />
      )}

      {!loading && error && (
        <Text style={styles.errorText}>⚠ {error}</Text>
      )}

      {/* ── List ────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {query ? 'No events match your search.' : 'No upcoming events.'}
            </Text>
          }
          renderItem={({ item }) => (
            <EventCard
              event={item}
              onViewOnMap={() => handleViewOnMap(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: { fontSize: 28, fontWeight: '700', color: INK },
  headerSub:   { fontSize: 13, color: SLATE, marginTop: 2 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  searchIcon:  { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: INK },

  listContent: { paddingHorizontal: 16, paddingBottom: 24 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: INK,
    lineHeight: 21,
  },
  liveBadge: {
    backgroundColor: UMD_RED,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  liveBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },

  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  cardMetaText: { flex: 1, fontSize: 12, color: SLATE },

  viewOnMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: SCOPE_BLUE + '12',
  },
  viewOnMapText: { fontSize: 13, fontWeight: '600', color: SCOPE_BLUE },

  emptyText: { textAlign: 'center', color: SLATE, marginTop: 48, fontSize: 14 },
  errorText: { textAlign: 'center', color: UMD_RED, marginTop: 40, fontSize: 13, paddingHorizontal: 24 },
});
