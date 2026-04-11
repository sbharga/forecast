import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ArrowUpDown, Clock, MapPin, Navigation, Search, Zap } from 'lucide-react-native';
import { useEvents } from '../contexts/EventsContext';
import { CATEGORIES, categorizeEvent } from '../utils/categories';

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
  const end   = start + 2 * 60 * 60 * 1000;
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

// ─── Top Pick Card (horizontal carousel) ──────────────────────────────────
function TopPickCard({ event, onViewOnMap }) {
  const cat      = categorizeEvent(event);
  const catColor = CATEGORIES[cat].color;
  const catLabel = CATEGORIES[cat].label;

  return (
    <View style={styles.topPickCard}>
      <View style={[styles.topPickBanner, { backgroundColor: catColor + '18', borderLeftColor: catColor }]}>
        <Text style={[styles.topPickBannerText, { color: catColor }]}>{catLabel}</Text>
        <View style={[styles.scorePill, { backgroundColor: catColor + '22' }]}>
          <Zap size={9} color={catColor} />
          <Text style={[styles.scorePillText, { color: catColor }]}>{event.priorityScore}</Text>
        </View>
      </View>
      <View style={styles.topPickBody}>
        <Text style={styles.topPickTitle} numberOfLines={2}>{event.title}</Text>
        <View style={styles.topPickMeta}>
          <Clock size={11} color={SLATE} />
          <Text style={styles.topPickMetaText}>{formatDateTime(event.start_time)}</Text>
        </View>
        <TouchableOpacity style={styles.topPickMapBtn} onPress={onViewOnMap} activeOpacity={0.75}>
          <Navigation size={11} color={SCOPE_BLUE} />
          <Text style={styles.topPickMapBtnText}>View on Map</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Event Card ────────────────────────────────────────────────────────────
function EventCard({ event, onViewOnMap }) {
  const live     = isLive(event);
  const cat      = categorizeEvent(event);
  const catColor = CATEGORIES[cat].color;
  const catLabel = CATEGORIES[cat].label;

  return (
    <View style={styles.card}>
      {/* Category banner strip */}
      <View style={[styles.categoryBanner, { backgroundColor: catColor + '18', borderLeftColor: catColor }]}>
        <Text style={[styles.categoryBannerText, { color: catColor }]}>{catLabel}</Text>
        {event.priorityScore > 0 && (
          <View style={[styles.scorePill, { backgroundColor: catColor + '22' }]}>
            <Zap size={9} color={catColor} />
            <Text style={[styles.scorePillText, { color: catColor }]}>{event.priorityScore}</Text>
          </View>
        )}
      </View>

      <View style={[styles.cardHeader, { marginTop: 10 }]}>
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
  const { events, loading, error, userKeywords } = useEvents();
  const navigation = useNavigation();
  const [query,  setQuery]  = useState('');
  const [sortBy, setSortBy] = useState('priority'); // 'priority' | 'time'

  // Top 3 highest-scored events (only shown when user has keywords)
  const topPicks = useMemo(() => {
    if (userKeywords.length === 0) return [];
    return [...events]
      .filter(e => e.priorityScore > 0)
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 3);
  }, [events, userKeywords]);

  const showTopPicks = topPicks.length > 0;

  // Text-filtered + sorted list
  const sorted = useMemo(() => {
    const q = query.toLowerCase().trim();
    const filtered = q
      ? events.filter(
          e =>
            e.title.toLowerCase().includes(q) ||
            (e.location || '').toLowerCase().includes(q)
        )
      : events;

    const list = [...filtered];
    if (sortBy === 'priority') return list.sort((a, b) => b.priorityScore - a.priorityScore);
    return list.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  }, [events, query, sortBy]);

  function handleViewOnMap(event) {
    navigation.navigate('Map', {
      focusEvent:     event,
      focusTimestamp: Date.now(),
    });
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Opportunities</Text>
          <Text style={styles.headerSub}>
            {loading ? 'Loading…' : `${sorted.length} event${sorted.length !== 1 ? 's' : ''}`}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.sortBtn, sortBy === 'time' && styles.sortBtnActive]}
          onPress={() => setSortBy(s => s === 'priority' ? 'time' : 'priority')}
          activeOpacity={0.75}
        >
          <ArrowUpDown size={13} color={sortBy === 'time' ? '#fff' : SCOPE_BLUE} />
          <Text style={[styles.sortBtnText, sortBy === 'time' && styles.sortBtnTextActive]}>
            {sortBy === 'priority' ? 'By Priority' : 'By Time'}
          </Text>
        </TouchableOpacity>
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

      {/* ── Top Picks carousel ──────────────────────────────────────── */}
      {!loading && !error && showTopPicks && (
        <View style={styles.topPicksSection}>
          <Text style={styles.topPicksHeader}>TOP PICKS FOR YOU</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topPicksScroll}
          >
            {topPicks.map(event => (
              <TopPickCard
                key={event.id}
                event={event}
                onViewOnMap={() => handleViewOnMap(event)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Main list ───────────────────────────────────────────────── */}
      {!loading && !error && (
        <FlatList
          data={sorted}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: { fontSize: 28, fontWeight: '700', color: INK },
  headerSub:   { fontSize: 13, color: SLATE, marginTop: 2 },

  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderColor: SCOPE_BLUE,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sortBtnActive:    { backgroundColor: SCOPE_BLUE },
  sortBtnText:      { fontSize: 12, fontWeight: '600', color: SCOPE_BLUE },
  sortBtnTextActive:{ color: '#fff' },

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

  // ── Top Picks ─────────────────────────────────────────────────────────
  topPicksSection: { marginBottom: 4 },
  topPicksHeader: {
    fontSize: 11, fontWeight: '700', color: SLATE,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginLeft: 20, marginBottom: 10,
  },
  topPicksScroll: { paddingHorizontal: 16, gap: 12 },

  topPickCard: {
    width: 220,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  topPickBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  topPickBannerText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  topPickBody:       { padding: 12 },
  topPickTitle:      { fontSize: 14, fontWeight: '600', color: INK, lineHeight: 19, marginBottom: 8 },
  topPickMeta:       { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  topPickMetaText:   { fontSize: 11, color: SLATE, flex: 1 },
  topPickMapBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, backgroundColor: SCOPE_BLUE + '12',
  },
  topPickMapBtnText: { fontSize: 11, fontWeight: '600', color: SCOPE_BLUE },

  scorePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3,
  },
  scorePillText: { fontSize: 10, fontWeight: '700' },

  // ── Main list ─────────────────────────────────────────────────────────
  listContent: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 4 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },

  categoryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 3,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginHorizontal: -16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  categoryBannerText: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase',
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
