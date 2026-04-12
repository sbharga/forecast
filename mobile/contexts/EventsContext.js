import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { calculateScore, KEYWORDS_STORAGE_KEY } from '../utils/scoring';

const API_PORT = '8000';

function trimTrailingSlash(url) {
  return url.replace(/\/+$/, '');
}

function getApiBaseUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configuredUrl) return trimTrailingSlash(configuredUrl);

  const expoHostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    null;

  const host = expoHostUri?.split(':')[0];
  if (host) return `http://${host}:${API_PORT}`;

  return `http://localhost:${API_PORT}`;
}

const API_BASE_URL = getApiBaseUrl();

async function fetchWithRetry(url, { retries = 3, delayMs = 1500 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Forecast: fetch start ${attempt}/${retries} -> ${url}`);
      return await fetch(url);
    } catch (err) {
      lastErr = err;
      console.warn(`Forecast: fetch attempt ${attempt}/${retries} failed — ${err.message}`);
      if (attempt < retries) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

const DEFAULT_KEYWORDS = ['Tech'];
// Bump this when scoring logic changes to invalidate stale cached scores
const CACHE_VERSION = 'v4';
const EVENTS_CACHE_KEY = `@scope_events_cache_${CACHE_VERSION}`;
const EVENTS_CACHE_TIMESTAMP_KEY = `@scope_events_cache_timestamp_${CACHE_VERSION}`;

const EventsContext = createContext(null);

function buildEventsUrl(since, keywords) {
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  if (keywords && keywords.length > 0) params.set('keywords', keywords.join(','));
  const qs = params.toString();
  return `${API_BASE_URL}/api/events${qs ? `?${qs}` : ''}`;
}

export function EventsProvider({ children }) {
  const [rawEvents,       setRawEvents]       = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [error,           setError]           = useState(null);
  const [userKeywords,    setUserKeywordsRaw] = useState(DEFAULT_KEYWORDS);
  const [loadingKeywords, setLoadingKeywords] = useState(true);

  const lastFetchedAt = useRef(null);

  // ── Load persisted keywords on mount ──────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(KEYWORDS_STORAGE_KEY)
      .then(stored => { if (stored) setUserKeywordsRaw(JSON.parse(stored)); })
      .catch(() => {})
      .finally(() => setLoadingKeywords(false));
  }, []);

  // ── Startup: show cache instantly, then full fetch once keywords load ──
  useEffect(() => {
    if (loadingKeywords) return;

    (async () => {
      console.log(`Forecast: using API base URL ${API_BASE_URL}`);

      // 1. Show cached events immediately
      try {
        const [cachedRaw, cachedTimestamp] = await Promise.all([
          AsyncStorage.getItem(EVENTS_CACHE_KEY),
          AsyncStorage.getItem(EVENTS_CACHE_TIMESTAMP_KEY),
        ]);
        if (cachedRaw) {
          setRawEvents(JSON.parse(cachedRaw));
          lastFetchedAt.current = cachedTimestamp || null;
          setLoading(false);
          console.log(`Forecast: loaded ${JSON.parse(cachedRaw).length} events from cache`);
        }
      } catch (_) {}

      // 2. Full fetch with current keywords so server scores everything
      try {
        const fetchedAt = new Date().toISOString();
        const eventsUrl = buildEventsUrl(null, userKeywords);
        const requestStartedAt = Date.now();
        const res = await fetchWithRetry(eventsUrl);
        console.log(
          `Forecast: fetch response ${res.status} ${res.statusText || ''} in ${Date.now() - requestStartedAt}ms`
        );
        if (!res.ok) throw new Error(`Backend error: HTTP ${res.status}`);
        const parseStartedAt = Date.now();
        const data = await res.json();
        console.log(`Forecast: parsed ${data.length} events in ${Date.now() - parseStartedAt}ms`);

        setRawEvents(data);
        AsyncStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(data)).catch(() => {});
        AsyncStorage.setItem(EVENTS_CACHE_TIMESTAMP_KEY, fetchedAt).catch(() => {});

        lastFetchedAt.current = fetchedAt;
        setError(null);
        console.log(`Forecast: fetched ${data.length} events from network`);
      } catch (err) {
        console.warn('Forecast: network fetch failed —', err.message);
        setRawEvents(prev => {
          if (prev.length === 0) setError(err.message);
          return prev;
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadingKeywords]); // runs once after keywords are loaded from storage

  // ── Re-fetch when keywords change (after initial load) ────────────────
  const isFirstLoad = useRef(true);
  useEffect(() => {
    if (loadingKeywords) return;
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }

    (async () => {
      try {
        const fetchedAt = new Date().toISOString();
        const url = buildEventsUrl(null, userKeywords);
        console.log(`Forecast: re-fetching with updated keywords`);
        const res = await fetchWithRetry(url);
        if (!res.ok) return;
        const data = await res.json();
        setRawEvents(data);
        AsyncStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(data)).catch(() => {});
        AsyncStorage.setItem(EVENTS_CACHE_TIMESTAMP_KEY, fetchedAt).catch(() => {});
        lastFetchedAt.current = fetchedAt;
        console.log(`Forecast: re-scored ${data.length} events for new keywords`);
      } catch (_) {}
    })();
  }, [userKeywords]);

  // ── Pull-to-refresh ───────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const since = lastFetchedAt.current;
      const fetchedAt = new Date().toISOString();
      const url = buildEventsUrl(since, userKeywords);

      console.log(`Forecast: refresh start -> ${url}`);
      const requestStartedAt = Date.now();
      const res = await fetchWithRetry(url);
      console.log(
        `Forecast: refresh response ${res.status} ${res.statusText || ''} in ${Date.now() - requestStartedAt}ms`
      );
      if (!res.ok) throw new Error(`Backend error: HTTP ${res.status}`);
      const delta = await res.json();
      console.log(`Forecast: refresh parsed ${delta.length} events`);

      if (delta.length > 0) {
        setRawEvents(prev => {
          const updated = new Map(prev.map(e => [e.id, e]));
          for (const e of delta) updated.set(e.id, e);
          const result = Array.from(updated.values());
          AsyncStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(result)).catch(() => {});
          AsyncStorage.setItem(EVENTS_CACHE_TIMESTAMP_KEY, fetchedAt).catch(() => {});
          return result;
        });
        console.log(`Forecast: merged ${delta.length} updated events`);
      }

      lastFetchedAt.current = fetchedAt;
      setError(null);
    } catch (err) {
      console.warn('Forecast: refresh failed —', err.message);
    } finally {
      setRefreshing(false);
    }
  }, [userKeywords]);

  // ── Persist keywords on change ────────────────────────────────────────
  function setUserKeywords(kws) {
    setUserKeywordsRaw(kws);
    AsyncStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(kws)).catch(() => {});
  }

  // ── Combine server semantic score + client keyword score ──────────────
  // keyword_score: exact match, synonyms, category affinity (fast, client-side)
  // semantic_score: cosine similarity from fastembed (server-side, nuanced)
  // final priorityScore = max of both so neither system can suppress the other
  const events = useMemo(
    () => rawEvents.map(e => {
      const keywordScore  = calculateScore(e, userKeywords);
      const semanticScore = e.semantic_score ?? 0;
      return { ...e, priorityScore: Math.max(keywordScore, semanticScore) };
    }),
    [rawEvents, userKeywords]
  );

  return (
    <EventsContext.Provider
      value={{
        events, loading, refreshing, error, refresh,
        userKeywords, setUserKeywords, loadingKeywords,
      }}
    >
      {children}
    </EventsContext.Provider>
  );
}

export function useEvents() {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error('useEvents must be used inside <EventsProvider>');
  return ctx;
}
