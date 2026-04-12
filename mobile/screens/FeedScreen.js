import React, { useRef, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowUpDown, CalendarPlus, Clock, ExternalLink,
  MapPin, Navigation, Search, X,
} from 'lucide-react-native';
import { useEvents } from '../contexts/EventsContext';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORIES, categorizeEvent } from '../utils/categories';

// ─── Constants ─────────────────────────────────────────────────────────────
const { height: SCREEN_H } = Dimensions.get('window');
const SCOPE_BLUE = '#007AFF';
const INK        = '#0F172A';
const SLATE      = '#64748B';
const BG         = '#F2F2F7';
const UMD_RED    = '#E21833';

// ─── Helpers ───────────────────────────────────────────────────────────────
function isLive(event) {
  const now = Date.now(), start = new Date(event.start_time).getTime();
  return now >= start && now <= start + 2 * 60 * 60 * 1000;
}

function formatDateTime(isoString) {
  const d = new Date(isoString);
  return (
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

function formatFullDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });
}

function relativeTime(isoString) {
  const diffMs  = new Date(isoString).getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < -30) return null;
  if (diffMin < 0)   return 'Started';
  if (diffMin < 60)  return `Starts in ${diffMin}m`;
  const hrs = Math.floor(diffMin / 60);
  if (hrs < 24)      return `Starts in ${hrs}h`;
  return `Starts in ${Math.floor(hrs / 24)}d`;
}

function ctaLabel(source) {
  if (source === 'discord') return 'View on Discord';
  if (source === 'cs_news') return 'Read Article';
  return 'View on TerpLink';
}

function sourceName(source) {
  if (source === 'terplink') return 'TerpLink';
  if (source === 'cs_news')  return 'CS Department';
  if (source === 'discord')  return 'Discord';
  return 'Unknown';
}

function sourceShort(source) {
  if (source === 'terplink') return 'TL';
  if (source === 'cs_news')  return 'CS';
  if (source === 'discord')  return 'DC';
  return '??';
}

function matchedKeywords(event, userKeywords) {
  const text = [(event.title || ''), (event.location || '')].join(' ').toLowerCase();
  return userKeywords.filter(kw => text.includes(kw.toLowerCase()));
}

// ─── Calendar helper ──────────────────────────────────────────────────────
async function addToGoogleCalendar(event, accessToken) {
  const start = new Date(event.start_time);
  const end   = new Date(start.getTime() + 60 * 60 * 1000); // assume 1h duration

  const body = {
    summary:  event.title,
    location: event.location || 'UMD Campus',
    start: { dateTime: start.toISOString(), timeZone: 'America/New_York' },
    end:   { dateTime: end.toISOString(),   timeZone: 'America/New_York' },
  };

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Tier 1: Top Pick (80–100) ─────────────────────────────────────────────
function TopPickCard({ event }) {
  const live     = isLive(event);
  const cat      = categorizeEvent(event);
  const catColor = CATEGORIES[cat].color;
  const catLabel = CATEGORIES[cat].label;

  return (
    <View style={styles.topCard}>
      <View style={[styles.topCardAccent, { backgroundColor: SCOPE_BLUE }]} />
      <View style={styles.topCardContent}>
        <View style={styles.topCardTopRow}>
          <View style={[styles.catTag, { backgroundColor: catColor + '22' }]}>
            <Text style={[styles.catTagText, { color: catColor }]}>{catLabel}</Text>
          </View>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.topCardTitle} numberOfLines={2}>{event.title}</Text>
          {live && <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>LIVE</Text></View>}
        </View>
        <View style={styles.metaRow}>
          <MapPin size={11} color={SLATE} />
          <Text style={styles.metaText} numberOfLines={1}>{event.location || 'UMD Campus'}</Text>
        </View>
        <View style={styles.metaRow}>
          <Clock size={11} color={SLATE} />
          <Text style={styles.metaText}>{formatDateTime(event.start_time)}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Tier 2: Strong Match (50–79) ──────────────────────────────────────────
function StrongMatchCard({ event }) {
  const live     = isLive(event);
  const cat      = categorizeEvent(event);
  const catColor = CATEGORIES[cat].color;
  const catLabel = CATEGORIES[cat].label;

  return (
    <View style={styles.strongCard}>
      <View style={[styles.banner, { backgroundColor: catColor }]}>
        <Text style={styles.bannerText}>{catLabel}</Text>
      </View>
      <View style={styles.strongCardBody}>
        <View style={styles.titleRow}>
          <Text style={styles.strongTitle} numberOfLines={2}>{event.title}</Text>
          {live && <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>LIVE</Text></View>}
        </View>
        <View style={styles.metaRow}>
          <MapPin size={11} color={SLATE} />
          <Text style={styles.metaText} numberOfLines={1}>{event.location || 'UMD Campus'}</Text>
        </View>
        <View style={styles.metaRow}>
          <Clock size={11} color={SLATE} />
          <Text style={styles.metaText}>{formatDateTime(event.start_time)}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Tier 3: Compact (< 50) ────────────────────────────────────────────────
function CompactCard({ event }) {
  const cat      = categorizeEvent(event);
  const catColor = CATEGORIES[cat].color;

  return (
    <View style={styles.compactCard}>
      <View style={[styles.compactDot, { backgroundColor: catColor }]} />
      <View style={styles.compactBody}>
        <Text style={styles.compactTitle} numberOfLines={1}>{event.title}</Text>
        <View style={styles.compactMetaRow}>
          <MapPin size={10} color={SLATE} />
          <Text style={styles.compactMeta} numberOfLines={1}>
            {event.location || 'UMD Campus'}
            {'  ·  '}
            {formatTime(event.start_time)}
          </Text>
        </View>
      </View>
      <Text style={styles.compactSource}>{sourceShort(event.source)}</Text>
    </View>
  );
}

// ─── Event Detail Popup ────────────────────────────────────────────────────
function EventPopup({ event, userKeywords, accessToken, onClose, onViewOnMap, scaleAnim, opacityAnim }) {
  const live      = isLive(event);
  const cat       = categorizeEvent(event);
  const catColor  = CATEGORIES[cat].color;
  const catLabel  = CATEGORIES[cat].label;
  const relTime   = relativeTime(event.start_time);
  const matched   = matchedKeywords(event, userKeywords);
  const [calAdded, setCalAdded] = useState(false);

  async function handleAddToCalendar() {
    try {
      await addToGoogleCalendar(event, accessToken);
      setCalAdded(true);
    } catch (e) {
      Alert.alert('Could not add to calendar', e.message);
    }
  }

  return (
    <View pointerEvents="box-none" style={styles.popupWrapper}>
      <Animated.View style={[
        styles.popup,
        { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
      ]}>
        {/* Banner */}
        <View style={[styles.popupBanner, { backgroundColor: catColor }]}>
          <Text style={styles.popupBannerLabel}>{catLabel}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <X size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>

        {/* Scrollable body */}
        <ScrollView
          style={styles.popupBody}
          contentContainerStyle={styles.popupBodyContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Live badge row */}
          {live && (
            <View style={styles.popupBadgeRow}>
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            </View>
          )}

          {/* Title */}
          <Text style={styles.popupTitle}>{event.title}</Text>

          {/* Date */}
          <View style={styles.popupInfoRow}>
            <View style={styles.popupInfoIcon}>
              <Calendar size={14} color={SCOPE_BLUE} />
            </View>
            <Text style={styles.popupInfoText}>{formatFullDate(event.start_time)}</Text>
          </View>

          {/* Time */}
          <View style={styles.popupInfoRow}>
            <View style={styles.popupInfoIcon}>
              <Clock size={14} color={SCOPE_BLUE} />
            </View>
            <Text style={styles.popupInfoText}>
              {formatTime(event.start_time)}
              {relTime ? `  ·  ${relTime}` : ''}
            </Text>
          </View>

          {/* Location */}
          <View style={styles.popupInfoRow}>
            <View style={styles.popupInfoIcon}>
              <MapPin size={14} color={SCOPE_BLUE} />
            </View>
            <Text style={styles.popupInfoText}>{event.location || 'UMD Campus'}</Text>
          </View>

          {/* Source */}
          <View style={styles.popupInfoRow}>
            <View style={styles.popupInfoIcon}>
              <ExternalLink size={14} color={SLATE} />
            </View>
            <Text style={[styles.popupInfoText, { color: SLATE }]}>
              {'Sourced from '}
              <Text style={{ fontWeight: '600', color: INK }}>{sourceName(event.source)}</Text>
            </Text>
          </View>

          {/* Matched keywords */}
          {matched.length > 0 && (
            <View style={styles.matchedRow}>
              <Text style={styles.matchedLabel}>Matched: </Text>
              {matched.map(kw => (
                <View key={kw} style={[styles.matchedPill, { backgroundColor: catColor + '20' }]}>
                  <Text style={[styles.matchedPillText, { color: catColor }]}>{kw}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Action buttons */}
        <View style={styles.popupActions}>
          <View style={styles.popupActionsRow}>
            <TouchableOpacity style={styles.popupMapBtn} onPress={onViewOnMap} activeOpacity={0.8}>
              <Navigation size={15} color="#fff" />
              <Text style={styles.popupMapBtnText}>View on Map</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.popupLinkBtn}
              onPress={() => Linking.openURL(event.link).catch(() => {})}
              activeOpacity={0.8}
            >
              <ExternalLink size={15} color={SCOPE_BLUE} />
              <Text style={styles.popupLinkBtnText}>{ctaLabel(event.source)}</Text>
            </TouchableOpacity>
          </View>
          {accessToken && (
            <TouchableOpacity
              style={[styles.popupCalBtn, calAdded && styles.popupCalBtnDone]}
              onPress={handleAddToCalendar}
              activeOpacity={0.8}
              disabled={calAdded}
            >
              <CalendarPlus size={15} color={calAdded ? '#34C759' : SCOPE_BLUE} />
              <Text style={[styles.popupCalBtnText, calAdded && styles.popupCalBtnTextDone]}>
                {calAdded ? 'Added to Calendar' : 'Add to Google Calendar'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────
export default function FeedScreen() {
  const { events, loading, refreshing, error, refresh, userKeywords } = useEvents();
  const { accessToken } = useAuth();
  const navigation = useNavigation();
  const [query,         setQuery]         = useState('');
  const [sortBy,        setSortBy]        = useState('priority');
  const [selectedEvent, setSelectedEvent] = useState(null);

  const scaleAnim   = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  function openPopup(event) {
    scaleAnim.setValue(0.85);
    opacityAnim.setValue(0);
    setSelectedEvent(event);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1, useNativeDriver: true, tension: 110, friction: 8,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1, duration: 140, useNativeDriver: true,
      }),
    ]).start();
  }

  function closePopup() {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.85, duration: 180, useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0, duration: 150, useNativeDriver: true,
      }),
    ]).start(() => setSelectedEvent(null));
  }

  function handleViewOnMap(event) {
    closePopup();
    // Small delay so popup closes before navigating
    setTimeout(() => {
      navigation.navigate('Map', {
        focusEvent:     event,
        focusTimestamp: Date.now(),
      });
    }, 200);
  }

  const sorted = useMemo(() => {
    const q = query.toLowerCase().trim();
    const filtered = q
      ? events.filter(
          e => e.title.toLowerCase().includes(q) ||
               (e.location || '').toLowerCase().includes(q)
        )
      : events;
    const list = [...filtered];
    if (sortBy === 'priority') return list.sort((a, b) => b.priorityScore - a.priorityScore);
    return list.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  }, [events, query, sortBy]);

  function renderItem({ item }) {
    const open = () => openPopup(item);
    if (item.priorityScore >= 80) {
      return (
        <TouchableOpacity onPress={open} activeOpacity={0.88}>
          <TopPickCard event={item} />
        </TouchableOpacity>
      );
    }
    if (item.priorityScore >= 50) {
      return (
        <TouchableOpacity onPress={open} activeOpacity={0.88}>
          <StrongMatchCard event={item} />
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity onPress={open} activeOpacity={0.88}>
        <CompactCard event={item} />
      </TouchableOpacity>
    );
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

      {loading && <View style={{ marginTop: 40, alignItems: 'center' }}>
        <Text style={{ color: SLATE }}>Loading…</Text>
      </View>}
      {!loading && error && <Text style={styles.errorText}>⚠ {error}</Text>}

      {/* ── List ────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <FlatList
          data={sorted}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={SCOPE_BLUE} />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {query ? 'No events match your search.' : 'No upcoming events.'}
            </Text>
          }
          renderItem={renderItem}
        />
      )}

      {/* ── Detail popup ────────────────────────────────────────────── */}
      <Modal
        visible={!!selectedEvent}
        transparent
        animationType="none"
        onRequestClose={closePopup}
      >
        <TouchableWithoutFeedback onPress={closePopup}>
          <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]} />
        </TouchableWithoutFeedback>

        {selectedEvent && (
          <EventPopup
            event={selectedEvent}
            userKeywords={userKeywords}
            accessToken={accessToken}
            onClose={closePopup}
            onViewOnMap={() => handleViewOnMap(selectedEvent)}
            scaleAnim={scaleAnim}
            opacityAnim={opacityAnim}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  headerTitle: { fontSize: 28, fontWeight: '700', color: INK },
  headerSub:   { fontSize: 13, color: SLATE, marginTop: 2 },

  sortBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: SCOPE_BLUE, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  sortBtnActive:     { backgroundColor: SCOPE_BLUE },
  sortBtnText:       { fontSize: 12, fontWeight: '600', color: SCOPE_BLUE },
  sortBtnTextActive: { color: '#fff' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    marginHorizontal: 16, marginVertical: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  searchIcon:  { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: INK },

  listContent: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 4 },
  emptyText:   { textAlign: 'center', color: SLATE, marginTop: 48, fontSize: 14 },
  errorText:   { textAlign: 'center', color: UMD_RED, marginTop: 40, fontSize: 13, paddingHorizontal: 24 },

  // ── Shared card internals ───────────────────────────────────────────────
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  metaText: { flex: 1, fontSize: 12, color: SLATE },
  liveBadge: {
    backgroundColor: UMD_RED, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start',
  },
  liveBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },

  // ── Tier 1 ─────────────────────────────────────────────────────────────
  topCard: {
    flexDirection: 'row', backgroundColor: '#F0F7FF',
    borderRadius: 16, overflow: 'hidden', marginBottom: 12,
    shadowColor: SCOPE_BLUE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12, shadowRadius: 10, elevation: 4,
  },
  topCardAccent:  { width: 4 },
  topCardContent: { flex: 1, padding: 14 },
  topCardTopRow:  {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  catTag:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  catTagText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  topScorePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: SCOPE_BLUE + '18', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  topScoreText: { fontSize: 13, fontWeight: '700', color: SCOPE_BLUE },
  topCardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: INK, lineHeight: 22 },

  // ── Tier 2 ─────────────────────────────────────────────────────────────
  strongCard: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    marginBottom: 12, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  banner: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8,
  },
  bannerText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: '#fff' },
  strongScorePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
  strongScoreText: { fontSize: 10, fontWeight: '700', color: SCOPE_BLUE },
  strongCardBody:  { padding: 14 },
  strongTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: INK, lineHeight: 21 },

  // ── Tier 3 ─────────────────────────────────────────────────────────────
  compactCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 14,
    marginBottom: 6, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  compactDot:     { width: 8, height: 8, borderRadius: 4, marginRight: 12, flexShrink: 0 },
  compactBody:    { flex: 1 },
  compactTitle:   { fontSize: 13, fontWeight: '600', color: INK, marginBottom: 3 },
  compactMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  compactMeta:    { flex: 1, fontSize: 11, color: SLATE },
  compactSource:  { fontSize: 10, fontWeight: '700', color: SLATE + '88', marginLeft: 10 },

  // ── Popup ──────────────────────────────────────────────────────────────
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,20,40,0.55)',
  },
  popupWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  popup: {
    width: '84%',
    maxHeight: SCREEN_H * 0.78,
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 32, elevation: 20,
  },
  popupBanner: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  popupBannerLabel: {
    fontSize: 12, fontWeight: '700', color: '#fff',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  popupBody:        { flexShrink: 1 },
  popupBodyContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },

  popupBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  popupScorePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: SCOPE_BLUE + '15', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  popupScoreText: { fontSize: 14, fontWeight: '700', color: SCOPE_BLUE },

  popupTitle: {
    fontSize: 20, fontWeight: '700', color: INK,
    lineHeight: 28, marginBottom: 18,
  },

  popupInfoRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 12, marginBottom: 12,
  },
  popupInfoIcon: { width: 22, alignItems: 'center', marginTop: 1 },
  popupInfoText: { flex: 1, fontSize: 14, color: INK, lineHeight: 20 },

  matchedRow: {
    flexDirection: 'row', alignItems: 'center',
    flexWrap: 'wrap', gap: 6, marginTop: 6, marginBottom: 4,
  },
  matchedLabel:    { fontSize: 12, color: SLATE, fontWeight: '500' },
  matchedPill: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  matchedPillText: { fontSize: 11, fontWeight: '600' },

  popupActions: {
    gap: 8,
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  popupActionsRow: { flexDirection: 'row', gap: 10 },
  popupMapBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 7,
    backgroundColor: SCOPE_BLUE, borderRadius: 14, paddingVertical: 13,
  },
  popupMapBtnText:  { fontSize: 14, fontWeight: '600', color: '#fff' },
  popupLinkBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 7,
    borderWidth: 1.5, borderColor: SCOPE_BLUE,
    borderRadius: 14, paddingVertical: 13,
  },
  popupLinkBtnText: { fontSize: 14, fontWeight: '600', color: SCOPE_BLUE },
  popupCalBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 7,
    borderWidth: 1.5, borderColor: SCOPE_BLUE,
    borderRadius: 14, paddingVertical: 11,
  },
  popupCalBtnDone:     { borderColor: '#34C759' },
  popupCalBtnText:     { fontSize: 13, fontWeight: '600', color: SCOPE_BLUE },
  popupCalBtnTextDone: { color: '#34C759' },
});
