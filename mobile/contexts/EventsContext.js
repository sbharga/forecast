import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateScore, KEYWORDS_STORAGE_KEY } from '../utils/scoring';

// Physical device: change to your machine's local IP
const API_BASE_URL = 'http://10.173.67.106:8000';

const DEFAULT_KEYWORDS = ['Internship', 'Research', 'Hackathon', 'Python'];

const EventsContext = createContext(null);

export function EventsProvider({ children }) {
  const [rawEvents,       setRawEvents]       = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [userKeywords,    setUserKeywordsRaw] = useState(DEFAULT_KEYWORDS);
  const [loadingKeywords, setLoadingKeywords] = useState(true);

  // ── Load persisted keywords on mount ────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(KEYWORDS_STORAGE_KEY)
      .then(stored => {
        if (stored) setUserKeywordsRaw(JSON.parse(stored));
      })
      .catch(() => {})
      .finally(() => setLoadingKeywords(false));
  }, []);

  // ── Fetch events on mount ────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/events`);
        if (!res.ok) throw new Error(`Backend error: HTTP ${res.status}`);
        const data = await res.json();
        setRawEvents(data);
        console.log(`Scope: loaded ${data.length} events`);
      } catch (err) {
        console.warn('Scope: fetch failed —', err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Persist keywords whenever they change ───────────────────────────────
  function setUserKeywords(kws) {
    setUserKeywordsRaw(kws);
    AsyncStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(kws)).catch(() => {});
  }

  // ── Attach priorityScore to every event ─────────────────────────────────
  // Recomputes automatically whenever rawEvents or userKeywords change.
  const events = useMemo(
    () => rawEvents.map(e => ({ ...e, priorityScore: calculateScore(e, userKeywords) })),
    [rawEvents, userKeywords]
  );

  return (
    <EventsContext.Provider
      value={{ events, loading, error, userKeywords, setUserKeywords, loadingKeywords }}
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
