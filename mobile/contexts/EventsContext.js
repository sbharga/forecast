import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateScore, KEYWORDS_STORAGE_KEY } from '../utils/scoring';

const API_BASE_URL = 'http://10.173.67.106:8000';
const DEFAULT_KEYWORDS = ['Internship', 'Research', 'Hackathon', 'Python'];

const EventsContext = createContext(null);

export function EventsProvider({ children }) {
  const [rawEvents,        setRawEvents]       = useState([]);
  const [loading,          setLoading]         = useState(true);
  const [refreshing,       setRefreshing]      = useState(false);
  const [error,            setError]           = useState(null);
  const [userKeywords,     setUserKeywordsRaw] = useState(DEFAULT_KEYWORDS);
  const [loadingKeywords,  setLoadingKeywords] = useState(true);

  // Tracks the timestamp of the last successful fetch for delta syncs
  const lastFetchedAt = useRef(null);

  // ── Load persisted keywords on mount ──────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(KEYWORDS_STORAGE_KEY)
      .then(stored => { if (stored) setUserKeywordsRaw(JSON.parse(stored)); })
      .catch(() => {})
      .finally(() => setLoadingKeywords(false));
  }, []);

  // ── Full load on mount ────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const fetchedAt = new Date().toISOString();
        const res = await fetch(`${API_BASE_URL}/api/events`);
        if (!res.ok) throw new Error(`Backend error: HTTP ${res.status}`);
        const data = await res.json();
        setRawEvents(data);
        lastFetchedAt.current = fetchedAt;
        console.log(`Scope: loaded ${data.length} events`);
      } catch (err) {
        console.warn('Scope: fetch failed —', err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Delta refresh — merges only new/updated events ───────────────────
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const since = lastFetchedAt.current;
      const fetchedAt = new Date().toISOString();
      const url = since
        ? `${API_BASE_URL}/api/events?since=${encodeURIComponent(since)}`
        : `${API_BASE_URL}/api/events`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Backend error: HTTP ${res.status}`);
      const delta = await res.json();

      if (delta.length > 0) {
        setRawEvents(prev => {
          const updated = new Map(prev.map(e => [e.id, e]));
          for (const e of delta) updated.set(e.id, e);
          return Array.from(updated.values());
        });
        console.log(`Scope: merged ${delta.length} updated events`);
      }

      lastFetchedAt.current = fetchedAt;
      setError(null);
    } catch (err) {
      console.warn('Scope: refresh failed —', err.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // ── Persist keywords whenever they change ────────────────────────────
  function setUserKeywords(kws) {
    setUserKeywordsRaw(kws);
    AsyncStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(kws)).catch(() => {});
  }

  // ── Attach priorityScore to every event ──────────────────────────────
  const events = useMemo(
    () => rawEvents.map(e => ({ ...e, priorityScore: calculateScore(e, userKeywords) })),
    [rawEvents, userKeywords]
  );

  return (
    <EventsContext.Provider
      value={{ events, loading, refreshing, error, refresh, userKeywords, setUserKeywords, loadingKeywords }}
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
