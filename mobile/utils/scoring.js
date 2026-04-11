import { CATEGORIES, categorizeEvent } from './categories';

export const KEYWORDS_STORAGE_KEY = '@scope_user_keywords';

/**
 * Compute a priority score (0–100) for an event given the user's keywords.
 *
 * Scoring matrix:
 *   Title match:       +50 pts per matching keyword
 *   Description match: +15 pts per matching keyword (field absent → 0)
 *   Category match:    +30 pts per matching keyword against category label
 *
 * Multipliers (applied to accumulated base score):
 *   TerpLink source:   × 1.5  (verified/structured events)
 *   Urgency (< 2h):   × 2.0  (starts within next 2 hours)
 *
 * Final score is capped at 100.
 */
export function calculateScore(event, userKeywords) {
  if (!userKeywords || userKeywords.length === 0) return 0;

  const normalizedKws = userKeywords.map(k => k.toLowerCase());
  const title         = (event.title       || '').toLowerCase();
  const description   = (event.description || '').toLowerCase();
  const cat           = categorizeEvent(event);
  const catLabel      = CATEGORIES[cat].label.toLowerCase();

  let score = 0;

  for (const kw of normalizedKws) {
    if (title.includes(kw))       score += 50;
    if (description.includes(kw)) score += 15;
    if (catLabel.includes(kw))    score += 30;
  }

  if (score === 0) return 0;

  // Source multiplier
  if (event.source === 'terplink') score *= 1.5;

  // Urgency multiplier
  const diffMs = new Date(event.start_time).getTime() - Date.now();
  if (diffMs >= 0 && diffMs <= 2 * 60 * 60 * 1000) score *= 2.0;

  return Math.min(Math.round(score), 100);
}
