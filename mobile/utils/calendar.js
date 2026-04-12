/**
 * utils/calendar.js — Add a Scope event to the user's primary Google Calendar.
 *
 * Uses the Google Calendar REST API v3 directly with the on-device access token
 * obtained during Google Sign-In. No backend round-trip needed.
 */

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/**
 * Add an event to the user's primary Google Calendar.
 *
 * @param {object} event  - Scope event object { title, location, start_time, link }
 * @param {string} accessToken - Google OAuth access token with 'calendar' scope
 * @returns {Promise<{ calendarEventId: string }>}
 * @throws {Error} on non-2xx response or network failure
 */
export async function addEventToCalendar(event, accessToken) {
  const startDate = new Date(event.start_time);
  const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // +2 hours

  const body = {
    summary: event.title,
    location: event.location || 'University of Maryland',
    description: event.link || '',
    start: {
      dateTime: startDate.toISOString(),
      timeZone: 'America/New_York',
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: 'America/New_York',
    },
  };

  const res = await fetch(CALENDAR_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Calendar API error ${res.status}: ${detail}`);
  }

  const data = await res.json();
  return { calendarEventId: data.id };
}
