import React, { createContext, useContext, useEffect, useState } from 'react';

// Physical device: change to your machine's local IP, e.g. "http://192.168.1.42:8000"
const API_BASE_URL = 'http://10.173.67.106:8000';

const EventsContext = createContext(null);

export function EventsProvider({ children }) {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/events`);
        if (!res.ok) throw new Error(`Backend error: HTTP ${res.status}`);
        const data = await res.json();
        setEvents(data);
        console.log(`Scope: loaded ${data.length} events`);
      } catch (err) {
        console.warn('Scope: fetch failed —', err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <EventsContext.Provider value={{ events, loading, error }}>
      {children}
    </EventsContext.Provider>
  );
}

export function useEvents() {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error('useEvents must be used inside <EventsProvider>');
  return ctx;
}
