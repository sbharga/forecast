import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle2, Circle, Plus, X } from 'lucide-react-native';
import { useEvents } from '../contexts/EventsContext';
import { useAuth } from '../contexts/AuthContext';

// ─── Theme ─────────────────────────────────────────────────────────────────
const SCOPE_BLUE = '#007AFF';
const INK        = '#0F172A';
const SLATE      = '#64748B';
const BG         = '#F2F2F7';
const GREEN      = '#34C759';

// Static sources (non-Gmail)
const STATIC_SOURCES = [
  { id: 'terplink', label: 'TerpLink',    detail: 'Syncing events',    connected: true  },
  { id: 'cs_news',  label: 'UMD CS News', detail: 'RSS feed active',   connected: true  },
  { id: 'discord',  label: 'Discord',     detail: 'Bot temporarily disabled', connected: false },
];

// ─── Screen ────────────────────────────────────────────────────────────────
export default function IntelScreen() {
  const { userKeywords: keywords, setUserKeywords: setKeywords } = useEvents();
  const { user, signIn, signOut } = useAuth();
  const [input, setInput] = useState('');

  function addKeyword() {
    const kw = input.trim();
    if (!kw) return;
    if (keywords.map(k => k.toLowerCase()).includes(kw.toLowerCase())) {
      Alert.alert('Already added', `"${kw}" is already in your list.`);
      return;
    }
    setKeywords(prev => [...prev, kw]);
    setInput('');
  }

  function removeKeyword(kw) {
    setKeywords(prev => prev.filter(k => k !== kw));
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <Text style={styles.pageTitle}>Intel</Text>
        <Text style={styles.pageSub}>Personalise your opportunity feed</Text>

        {/* ── Keywords ──────────────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>KEYWORDS OF INTEREST</Text>
        <View style={styles.card}>
          {/* Chip cloud */}
          <View style={styles.chipWrap}>
            {keywords.map(kw => (
              <View key={kw} style={styles.chip}>
                <Text style={styles.chipText}>{kw}</Text>
                <TouchableOpacity
                  onPress={() => removeKeyword(kw)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={12} color={SCOPE_BLUE} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Add input */}
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              placeholder="Add a keyword…"
              placeholderTextColor={SLATE}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={addKeyword}
              returnKeyType="done"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.addBtn, !input.trim() && styles.addBtnDisabled]}
              onPress={addKeyword}
              disabled={!input.trim()}
              activeOpacity={0.75}
            >
              <Plus size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Connected sources ──────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>CONNECTED SOURCES</Text>
        <View style={styles.card}>
          {STATIC_SOURCES.map((src, i) => (
            <View
              key={src.id}
              style={[styles.sourceRow, styles.sourceRowBorder]}
            >
              <View style={styles.sourceLeft}>
                {src.connected
                  ? <CheckCircle2 size={20} color={GREEN} />
                  : <Circle       size={20} color={SLATE} />
                }
                <View style={styles.sourceText}>
                  <Text style={styles.sourceLabel}>{src.label}</Text>
                  <Text style={styles.sourceDetail}>{src.detail}</Text>
                </View>
              </View>
              {!src.connected && (
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonText}>Soon</Text>
                </View>
              )}
            </View>
          ))}

          {/* Gmail row — auth-aware */}
          <View style={styles.sourceRow}>
            <View style={styles.sourceLeft}>
              {user
                ? <CheckCircle2 size={20} color={GREEN} />
                : <Circle       size={20} color={SLATE} />
              }
              <View style={styles.sourceText}>
                <Text style={styles.sourceLabel}>Gmail</Text>
                <Text style={styles.sourceDetail}>
                  {user ? user.email : 'Not connected'}
                </Text>
              </View>
            </View>
            {user ? (
              <TouchableOpacity onPress={signOut} style={styles.disconnectBtn} activeOpacity={0.7}>
                <Text style={styles.disconnectBtnText}>Disconnect</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={signIn} style={styles.connectBtn} activeOpacity={0.7}>
                <Text style={styles.connectBtnText}>Connect</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Tip ───────────────────────────────────────────────────── */}
        <Text style={styles.tip}>
          Keywords will be used to highlight matching events in your Feed once Discord and Gmail workers are connected.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG },
  content: { padding: 20, paddingBottom: 40 },

  pageTitle: { fontSize: 28, fontWeight: '700', color: INK },
  pageSub:   { fontSize: 13, color: SLATE, marginTop: 2, marginBottom: 24 },

  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: SLATE,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 8, marginLeft: 4,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },

  // ── Keyword chips ─────────────────────────────────────────────────────
  chipWrap: {
    flexDirection: 'row', flexWrap: 'wrap',
    padding: 14, gap: 8,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: SCOPE_BLUE + '14',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: SCOPE_BLUE },

  addRow: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E5EA',
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
  },
  addInput:         { flex: 1, fontSize: 15, color: INK, paddingVertical: 4 },
  addBtn:           { width: 34, height: 34, borderRadius: 17, backgroundColor: SCOPE_BLUE, alignItems: 'center', justifyContent: 'center' },
  addBtnDisabled:   { backgroundColor: SLATE + '60' },

  // ── Sources ───────────────────────────────────────────────────────────
  sourceRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  sourceRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  sourceLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sourceText:    {},
  sourceLabel:   { fontSize: 15, fontWeight: '500', color: INK },
  sourceDetail:  { fontSize: 12, color: SLATE, marginTop: 1 },
  comingSoonBadge: {
    backgroundColor: SLATE + '18',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  comingSoonText: { fontSize: 11, fontWeight: '600', color: SLATE },

  connectBtn: {
    backgroundColor: SCOPE_BLUE,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  connectBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  disconnectBtn: {
    backgroundColor: SLATE + '18',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  disconnectBtnText: { fontSize: 13, fontWeight: '600', color: SLATE },

  tip: {
    fontSize: 12, color: SLATE, lineHeight: 18,
    textAlign: 'center', paddingHorizontal: 8,
  },
});
