import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

// ── Constants ──────────────────────────────────────────────────────────────
const API_PORT    = '8000';
const SCOPE_BLUE  = '#007AFF';
const BG          = '#F2F2F7';
const SURFACE     = '#FFFFFF';
const LABEL       = '#1C1C1E';
const SLATE       = '#8E8E93';
const RED         = '#FF3B30';

const SOURCE_COLORS = {
  discord: '#7C3AED',
  gmail:   '#EA4335',
  cs_news: '#FF2D55',
};

const SOURCE_LABELS = {
  discord: 'DC',
  gmail:   'GM',
  cs_news: 'CS',
};

// ── Helpers ────────────────────────────────────────────────────────────────
function getApiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const host = (Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost || '')
    .split(':')[0];
  return host ? `http://${host}:${API_PORT}` : `http://localhost:${API_PORT}`;
}

const API_BASE_URL = getApiBaseUrl();

function formatCountdown(isoString) {
  const now  = Date.now();
  const then = new Date(isoString).getTime();
  const diff = then - now;

  if (diff <= 0) return 'Passed';

  const totalMins  = Math.floor(diff / 60000);
  const totalHours = Math.floor(totalMins / 60);
  const days       = Math.floor(totalHours / 24);
  const hours      = totalHours % 24;
  const mins       = totalMins % 60;

  if (days > 0)  return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function isUrgent(isoString) {
  const diff = new Date(isoString).getTime() - Date.now();
  return diff > 0 && diff < 24 * 60 * 60 * 1000;
}

// ── DeadlineRow ────────────────────────────────────────────────────────────
function DeadlineRow({ item }) {
  const color     = SOURCE_COLORS[item.source] || SLATE;
  const abbrev    = SOURCE_LABELS[item.source] || '??';
  const countdown = formatCountdown(item.deadline_time);
  const urgent    = isUrgent(item.deadline_time);

  function handlePress() {
    if (item.link) Linking.openURL(item.link).catch(() => {});
  }

  return (
    <TouchableOpacity style={styles.row} onPress={handlePress} activeOpacity={0.7}>
      <View style={[styles.sourceBadge, { backgroundColor: color }]}>
        <Text style={styles.sourceBadgeText}>{abbrev}</Text>
      </View>
      <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={[styles.countdown, urgent && styles.countdownUrgent]}>{countdown}</Text>
    </TouchableOpacity>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────
export default function DeadlinesScreen() {
  const [deadlines,  setDeadlines]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState(null);
  const timerRef = useRef(null);

  async function fetchDeadlines() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/deadlines`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDeadlines(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchDeadlines();
    // Re-render countdowns every minute so they stay live
    timerRef.current = setInterval(() => setDeadlines(d => [...d]), 60000);
    return () => clearInterval(timerRef.current);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDeadlines();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Deadlines</Text>
        {deadlines.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{deadlines.length}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.statusText}>Loading…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>⚠ {error}</Text>
        </View>
      ) : deadlines.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.statusText}>No upcoming deadlines.</Text>
          <Text style={styles.subText}>
            Deadlines are extracted from Discord messages and Gmail.
          </Text>
        </View>
      ) : (
        <FlatList
          data={deadlines}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => <DeadlineRow item={item} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SCOPE_BLUE} />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: BG },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: LABEL, flex: 1 },
  countBadge:  { backgroundColor: SCOPE_BLUE, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  countBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  separator:   { height: StyleSheet.hairlineWidth, backgroundColor: '#D1D1D6' },

  row: {
    flexDirection:  'row',
    alignItems:     'center',
    backgroundColor: SURFACE,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginVertical: 3,
    gap: 10,
  },
  sourceBadge: {
    width: 32, height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  rowTitle:        { flex: 1, fontSize: 15, fontWeight: '600', color: LABEL },
  countdown:       { fontSize: 13, fontWeight: '600', color: SLATE },
  countdownUrgent: { color: RED },

  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  statusText: { fontSize: 16, color: SLATE, textAlign: 'center' },
  subText:    { fontSize: 13, color: SLATE, textAlign: 'center', marginTop: 8 },
  errorText:  { fontSize: 15, color: RED, textAlign: 'center' },
});
