import { CATEGORIES, categorizeEvent } from './categories';

export const KEYWORDS_STORAGE_KEY = '@scope_user_keywords';

/**
 * Related terms for common student keywords.
 * When a user keyword matches a key here, its synonyms are also checked
 * against the event title at reduced weight (+25 vs +50 for exact match).
 */
const EXPANSIONS = {
  'internship':       ['intern', 'co-op', 'coop', 'career fair', 'job fair', 'recruiting', 'recruitment', 'hire', 'hiring', 'employer', 'employment'],
  'research':         ['lab', 'laboratory', 'thesis', 'dissertation', 'experiment', 'faculty', 'phd', 'reu', 'undergraduate research', 'principal investigator'],
  'hackathon':        ['hack', 'sprint', 'datathon', 'buildathon', 'designathon', 'coding competition', 'coding challenge'],
  'python':           ['programming', 'coding', 'software', 'developer', 'code', 'script', 'jupyter', 'pandas', 'flask', 'django'],
  'machine learning': ['ml', 'ai', 'artificial intelligence', 'deep learning', 'neural network', 'data science', 'nlp', 'computer vision'],
  'data science':     ['data', 'analytics', 'machine learning', 'statistics', 'visualization', 'tableau', 'sql', 'pandas'],
  'cybersecurity':    ['security', 'ctf', 'capture the flag', 'penetration', 'infosec', 'red team', 'blue team', 'vulnerability'],
  'networking':       ['mixer', 'professional development', 'alumni', 'industry', 'career', 'connect', 'panel', 'info session'],
  'startup':          ['entrepreneur', 'entrepreneurship', 'venture', 'founder', 'pitch', 'innovation', 'incubator'],
  'design':           ['ux', 'ui', 'figma', 'product design', 'creative', 'prototyping', 'user experience'],
  'web':              ['frontend', 'backend', 'fullstack', 'react', 'node', 'javascript', 'html', 'css', 'api'],
  'cloud':            ['aws', 'azure', 'gcp', 'devops', 'kubernetes', 'docker', 'deployment', 'infrastructure'],
  'finance':          ['fintech', 'investment', 'trading', 'stock', 'banking', 'accounting', 'economics', 'quant'],
  'consulting':       ['case', 'strategy', 'business', 'mckinsey', 'deloitte', 'accenture'],
  'interview':        ['technical interview', 'leetcode', 'behavioral', 'system design', 'whiteboard', 'prep'],
  'club':             ['org', 'organization', 'association', 'society', 'chapter', 'team', 'community'],
  'scholarship':      ['fellowship', 'grant', 'award', 'funding', 'stipend'],
  'graduate school':  ['grad school', 'phd', 'masters', 'gre', 'applications', 'admissions'],
  'volunteering':     ['volunteer', 'service', 'community service', 'outreach', 'nonprofit'],
};

/**
 * Category affinity — which categories a keyword is conceptually related to.
 * Matching affinity adds +20 per category, on top of normal scoring.
 */
const CATEGORY_AFFINITY = {
  'internship':       ['career'],
  'research':         ['academic', 'tech'],
  'hackathon':        ['tech'],
  'python':           ['tech'],
  'machine learning': ['tech', 'academic'],
  'data science':     ['tech', 'academic'],
  'cybersecurity':    ['tech'],
  'networking':       ['career', 'social'],
  'startup':          ['tech', 'career'],
  'design':           ['tech'],
  'web':              ['tech'],
  'cloud':            ['tech'],
  'finance':          ['career'],
  'consulting':       ['career'],
  'interview':        ['career', 'tech'],
  'club':             ['social'],
  'scholarship':      ['academic'],
  'graduate school':  ['academic'],
  'volunteering':     ['social'],
};

export function calculateScore(event, userKeywords) {
  if (!userKeywords || userKeywords.length === 0) return 0;

  const title       = (event.title       || '').toLowerCase();
  const description = (event.description || '').toLowerCase();
  const cat         = categorizeEvent(event);
  const catLabel    = CATEGORIES[cat].label.toLowerCase();

  let score = 0;

  for (const kw of userKeywords) {
    const kwLower = kw.toLowerCase().trim();
    if (!kwLower) continue;

    // Exact match in title
    if (title.includes(kwLower))       score += 50;
    // Exact match in description
    if (description.includes(kwLower)) score += 15;
    // Category label match
    if (catLabel.includes(kwLower))    score += 30;

    // Synonym expansion — find best matching expansion key
    const expansionKey = Object.keys(EXPANSIONS).find(k =>
      k === kwLower || kwLower.includes(k) || k.includes(kwLower)
    );
    if (expansionKey) {
      const synonyms = EXPANSIONS[expansionKey];
      for (const syn of synonyms) {
        if (title.includes(syn)) {
          score += 25;
          break; // one synonym match per keyword is enough
        }
      }
      // Category affinity
      const affinityCategories = CATEGORY_AFFINITY[expansionKey] || [];
      if (affinityCategories.includes(cat)) {
        score += 20;
      }
    }
  }

  if (score === 0) return 0;

  if (event.source === 'terplink') score *= 1.5;

  const diffMs = new Date(event.start_time).getTime() - Date.now();
  if (diffMs >= 0 && diffMs <= 2 * 60 * 60 * 1000) score *= 2.0;

  return Math.min(Math.round(score), 100);
}
