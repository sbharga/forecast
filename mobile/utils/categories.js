/**
 * Event category definitions and classifier.
 *
 * Each category has:
 *   color  — marker bubble / banner background
 *   label  — human-readable name
 */

export const CATEGORIES = {
  career:   { label: 'Career',     color: '#FF9500' }, // orange
  tech:     { label: 'Tech',       color: '#007AFF' }, // blue
  academic: { label: 'Academic',   color: '#F59E0B' }, // amber
  social:   { label: 'Social',     color: '#34C759' }, // green
  news:     { label: 'Newsletter', color: '#FF2D55' }, // pink/red
  discord:  { label: 'Discord',    color: '#7C3AED' }, // purple
  other:    { label: 'Other',      color: '#06B6D4' }, // cyan
};

// Keywords that map to a category (checked in order)
const RULES = [
  {
    category: 'discord',
    sources: ['discord'],
  },
  {
    category: 'news',
    sources: ['cs_news'],
  },
  {
    category: 'career',
    keywords: ['career', 'internship', 'job', 'recrui', 'networking', 'resume', 'interview',
               'hire', 'hiring', 'employer', 'industry', 'professional development', 'co-op'],
  },
  {
    category: 'tech',
    keywords: ['hackathon', 'coding', 'programming', 'software', 'tech', 'ai', 'machine learning',
               'data science', 'workshop', 'demo', 'open source', 'cybersecurity', 'cloud',
               'python', 'javascript', 'web dev'],
  },
  {
    category: 'academic',
    keywords: ['research', 'lecture', 'seminar', 'colloquium', 'symposium', 'thesis',
               'dissertation', 'academic', 'professor', 'faculty', 'conference',
               'journal', 'paper', 'presentation'],
  },
  {
    category: 'social',
    keywords: ['social', 'mixer', 'party', 'game', 'fun', 'celebration', 'welcome', 'meet',
               'picnic', 'cookout', 'trivia', 'open house', 'club', 'org', 'community',
               'bible', 'faith', 'worship', 'prayer', 'ministry', 'chapel', 'religious', 'church'],
  },
];

/**
 * Classify an event into one of the CATEGORIES keys.
 * @param {{ title: string, source?: string }} event
 * @returns {keyof CATEGORIES}
 */
export function categorizeEvent(event) {
  const title  = (event.title  || '').toLowerCase();
  const source = (event.source || '').toLowerCase();

  for (const rule of RULES) {
    // Source-based rule (highest priority for newsletter)
    if (rule.sources && rule.sources.includes(source)) {
      return rule.category;
    }
    // Keyword-based rule
    if (rule.keywords && rule.keywords.some(kw => title.includes(kw))) {
      return rule.category;
    }
  }

  return 'other';
}
