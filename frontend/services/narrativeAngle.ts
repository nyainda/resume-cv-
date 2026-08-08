/**
 * Fit-aware narrative selection for CV generation.
 *
 * This is deliberately deterministic in its scoring and uses the existing
 * lightweight LRU rotation only to break ties between suitable framings.
 * It chooses framing; it never creates or changes candidate facts.
 */

import type { UserProfile, CVData } from '../types';
import type { NarrativeAngle } from './cvExamplesClient';
import { getUserPrefix } from './storage/userStorageNamespace';

export const ALL_NARRATIVE_ANGLES: NarrativeAngle[] = ['impact', 'process', 'people', 'growth'];

const ANGLE_DEFINITIONS: Record<NarrativeAngle, {
  name: string;
  description: string;
  summaryFocus: string;
  bulletBias: string;
}> = {
  impact: {
    name: 'Impact',
    description: 'Lead with quantified outcomes and business results. Every role is told through what changed because of this person.',
    summaryFocus: 'open with the strongest measurable result delivered, then prove it with a second achievement',
    bulletBias: 'lead with the outcome when strong data exists rather than always opening with an action verb',
  },
  process: {
    name: 'Process',
    description: 'Lead with systems, methods, and how work was done. Emphasise the HOW over the WHAT.',
    summaryFocus: 'open with the signature working method or system this person is known for building or improving',
    bulletBias: 'show the mechanism and method behind the result where the source supports it',
  },
  people: {
    name: 'People',
    description: 'Lead with collaboration, influence, and team impact. Emphasise who was worked with and who was developed.',
    summaryFocus: 'open with the leadership or collaboration style and the team or stakeholder scale operated at',
    bulletBias: 'anchor bullets in team size, stakeholder scope, or mentorship outcomes where genuine data exists',
  },
  growth: {
    name: 'Growth',
    description: 'Lead with progression, expanding scope, and learning trajectory. Show momentum over time.',
    summaryFocus: 'open with the arc of expanding responsibility and demonstrated trajectory',
    bulletBias: 'show before-and-after scope or progression only where it is supported by the source',
  },
};

const PROFILE_SIGNALS: Record<NarrativeAngle, string[]> = {
  impact: [
    'increased', 'decreased', 'reduced', 'improved', 'grew', 'growth', 'revenue',
    'profit', 'savings', 'saved', 'conversion', 'roi', 'delivered', 'quota',
    'target', 'kpi', 'metric', 'percent', '%', 'outcome', 'result', 'impact',
    'performance', 'boosted', 'lifted', 'efficiency',
  ],
  people: [
    'team', 'teams', 'mentored', 'mentor', 'coached', 'stakeholder', 'client',
    'customer', 'cross-functional', 'cross functional', 'collaborat', 'leadership',
    'supervise', 'headcount', 'partnered', 'liaised', 'workshop',
  ],
  process: [
    'system', 'systems', 'process', 'workflow', 'automation', 'automated',
    'framework', 'method', 'methodology', 'pipeline', 'infrastructure',
    'implementation', 'implemented', 'operational', 'operations', 'redesigned',
    'streamlined', 'standardized', 'platform',
  ],
  growth: [
    'promoted', 'promotion', 'progressed', 'progression', 'expanded scope',
    'increasing responsibility', 'career', 'from junior', 'to senior', 'grew into',
    'took on', 'assumed responsibility', 'broader remit', 'scale', 'first hire',
    'founding',
  ],
};

const JD_SIGNALS: Record<NarrativeAngle, string[]> = {
  impact: ['results-driven', 'outcomes', 'metrics', 'kpi', 'revenue', 'growth', 'quota', 'targets', 'performance', 'roi', 'deliver', 'impact', 'commercial'],
  people: ['stakeholder', 'leadership', 'team lead', 'people manager', 'cross-functional', 'collaboration', 'mentor', 'coach', 'client-facing', 'relationship', 'influence'],
  process: ['process improvement', 'operations', 'systems', 'automation', 'workflow', 'implementation', 'methodology', 'framework', 'scalable', 'infrastructure', 'devops', 'platform'],
  growth: ['career growth', 'development path', 'progression', 'learning', 'expanding', 'ownership', 'high potential', 'stretch'],
};

const ACADEMIC_SIGNALS: Record<NarrativeAngle, string[]> = {
  impact: ['publication', 'cited', 'grant', 'award', 'finding', 'result', 'outcome', 'discovery'],
  people: ['supervisor', 'collaborat', 'lab', 'cohort', 'mentor', 'teaching', 'students'],
  process: ['method', 'methodology', 'protocol', 'experiment', 'analysis', 'model', 'framework'],
  growth: ['thesis', 'dissertation', 'phd', 'postdoc', 'trajectory', 'research agenda', 'fellowship'],
};

const MIN_FIT_SCORE = 2;
const JD_WEIGHT = 2;
const HISTORY_PREFIX = 'cv:angleHistory:';

export interface AngleScorecard {
  scores: Record<NarrativeAngle, number>;
  ranked: NarrativeAngle[];
  hasEvidence: boolean;
}

export interface SelectAngleOptions {
  profile?: UserProfile;
  profileText?: string;
  jd?: string;
  purpose?: 'job' | 'academic' | 'general';
  slotId?: string;
  historyKey?: string;
  historyOverride?: NarrativeAngle[];
  preferDifferent?: boolean;
  avoidAngle?: NarrativeAngle;
}

export interface SelectAngleResult {
  angle: NarrativeAngle;
  scores: Record<NarrativeAngle, number>;
  pool: NarrativeAngle[];
  mode: 'fit-top2' | 'lru-fallback';
  historyKey: string;
}

function countKeywordHits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((count, keyword) => {
    if (!keyword) return count;
    let from = 0;
    let hits = 0;
    const needle = keyword.toLowerCase();
    while ((from = lower.indexOf(needle, from)) !== -1) {
      hits += 1;
      from += needle.length;
    }
    return count + hits;
  }, 0);
}

export function gatherProfileSignalText(profile: UserProfile): string {
  const parts: string[] = [];
  if (profile.summary) parts.push(profile.summary);
  if (profile.personalInfo?.title) parts.push(profile.personalInfo.title);
  for (const exp of profile.workExperience || []) {
    parts.push(exp.jobTitle || '', exp.company || '');
    if (Array.isArray(exp.responsibilities)) parts.push(exp.responsibilities.join(' '));
    else if (exp.responsibilities) parts.push(String(exp.responsibilities));
  }
  parts.push(...(profile.skills || []).map(skill => typeof skill === 'string' ? skill : String((skill as any)?.name || '')));
  for (const project of profile.projects || []) {
    parts.push(project.name || '', project.description || '');
  }
  for (const education of profile.education || []) {
    parts.push(education.degree || '', (education as any).fieldOfStudy || '', (education as any).description || '');
  }
  return parts.filter(Boolean).join(' \n ');
}

export function scoreNarrativeAngles(
  profileText: string,
  jdText = '',
  purpose: 'job' | 'academic' | 'general' = 'general',
): AngleScorecard {
  const scores = {} as Record<NarrativeAngle, number>;
  for (const angle of ALL_NARRATIVE_ANGLES) {
    let score = countKeywordHits(profileText, PROFILE_SIGNALS[angle]);
    score += countKeywordHits(jdText, JD_SIGNALS[angle]) * JD_WEIGHT;
    if (purpose === 'academic') {
      score += countKeywordHits(`${profileText} ${jdText}`, ACADEMIC_SIGNALS[angle]);
    }
    scores[angle] = score;
  }
  const ranked = [...ALL_NARRATIVE_ANGLES].sort((a, b) => scores[b] - scores[a] || a.localeCompare(b));
  return { scores, ranked, hasEvidence: scores[ranked[0]] >= MIN_FIT_SCORE };
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 8);
}

export function buildAngleHistoryKey(opts: {
  slotId?: string;
  purpose?: string;
  jd?: string;
}): string {
  const slot = (opts.slotId || 'default').slice(0, 64);
  const purpose = opts.purpose || 'general';
  const normalizedJd = (opts.jd || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const jdPart = normalizedJd.length > 40 ? shortHash(normalizedJd) : 'noj';
  return `${getUserPrefix()}${HISTORY_PREFIX}${slot}:${purpose}:${jdPart}`;
}

function readHistory(historyKey: string): NarrativeAngle[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(historyKey) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((angle): angle is NarrativeAngle => ALL_NARRATIVE_ANGLES.includes(angle as NarrativeAngle))
      : [];
  } catch {
    return [];
  }
}

export function recordAngleUsed(angle: NarrativeAngle, historyKey: string): void {
  try {
    const history = readHistory(historyKey);
    const updated = [...history.filter(item => item !== angle), angle].slice(-8);
    localStorage.setItem(historyKey, JSON.stringify(updated));
  } catch {
    // localStorage may be unavailable in private browsing or non-browser tests.
  }
}

function pickLeastRecent(pool: NarrativeAngle[], history: NarrativeAngle[]): NarrativeAngle {
  const ranked = pool
    .map(angle => ({ angle, recency: history.lastIndexOf(angle) === -1 ? 0 : history.lastIndexOf(angle) + 1 }))
    .sort((a, b) => a.recency - b.recency);
  const oldest = ranked.filter(item => item.recency === ranked[0].recency);
  return oldest[Math.floor(Math.random() * oldest.length)].angle;
}

export function selectFreshAngleDetailed(opts: SelectAngleOptions = {}): SelectAngleResult {
  const purpose = opts.purpose || 'general';
  const jd = opts.jd || '';
  const profileText = opts.profileText ?? (opts.profile ? gatherProfileSignalText(opts.profile) : '');
  const card = scoreNarrativeAngles(profileText, jd, purpose);
  const historyKey = opts.historyKey || buildAngleHistoryKey({ slotId: opts.slotId, purpose, jd });
  const history = opts.historyOverride || readHistory(historyKey);

  let pool: NarrativeAngle[];
  let mode: SelectAngleResult['mode'];
  if (card.hasEvidence) {
    const topScore = card.scores[card.ranked[0]];
    const suitable = card.ranked.filter(angle =>
      card.scores[angle] >= Math.max(1, topScore * 0.35),
    ).slice(0, 2);
    pool = suitable.length > 0 ? suitable : [...ALL_NARRATIVE_ANGLES];
    mode = suitable.length > 0 ? 'fit-top2' : 'lru-fallback';
  } else {
    pool = [...ALL_NARRATIVE_ANGLES];
    mode = 'lru-fallback';
  }

  let effectivePool = pool;
  const avoid = opts.avoidAngle || (opts.preferDifferent ? history[history.length - 1] : undefined);
  if (avoid && effectivePool.length > 1 && effectivePool.includes(avoid)) {
    effectivePool = effectivePool.filter(angle => angle !== avoid);
  }
  return {
    angle: pickLeastRecent(effectivePool, history),
    scores: card.scores,
    pool,
    mode,
    historyKey,
  };
}

export function selectFreshAngle(opts: SelectAngleOptions | NarrativeAngle[] = {}): NarrativeAngle {
  return selectFreshAngleDetailed(Array.isArray(opts) ? { historyOverride: opts } : opts).angle;
}

export function buildNarrativeAngleBlock(angle: NarrativeAngle): string {
  const definition = ANGLE_DEFINITIONS[angle];
  return `**NARRATIVE ANGLE — ${definition.name.toUpperCase()}**: ${definition.description}
- Summary focus: ${definition.summaryFocus}.
- Bullet framing bias: ${definition.bulletBias}.
- CRITICAL: this angle affects framing and emphasis ONLY. Facts, metrics, company names, dates must never change.`;
}

const VERIFY_SIGNALS: Record<NarrativeAngle, RegExp[]> = {
  impact: [/\b\d+\s*%/, /\b(?:increased|reduced|grew|saved|delivered|cut|boosted)\b/i, /\b(?:revenue|profit|roi|conversion|quota|kpi)\b/i],
  people: [/\b(?:team|teams|mentored|coached|stakeholder|client|cross-functional|collaborat)\b/i, /\b\d+[-\s]?(?:person|member|people)\b/i],
  process: [/\b(?:system|workflow|process|automat|framework|pipeline|implement|streamlin|redesign)\b/i, /\b(?:by\s+\w+ing|through\s+\w+ing)\b/i],
  growth: [/\b(?:promoted|progress|expanded scope|ownership|trajectory|from\s+\w+\s+to)\b/i, /\b(?:over\s+\d+\s+(?:months|years)|within\s+\d+)\b/i],
};

export interface AngleVerifyResult {
  angle: NarrativeAngle;
  matched: boolean;
  hitCount: number;
  detail: string;
}

export function verifyNarrativeAngle(cv: CVData, angle: NarrativeAngle): AngleVerifyResult {
  const text = [
    cv.summary || '',
    ...(cv.experience || []).flatMap(role => Array.isArray(role.responsibilities) ? role.responsibilities : [String(role.responsibilities || '')]),
  ].join(' ');
  const hitCount = VERIFY_SIGNALS[angle].filter(pattern => pattern.test(text)).length;
  const matched = hitCount > 0;
  return {
    angle,
    matched,
    hitCount,
    detail: matched
      ? `Angle "${angle}" left a ${hitCount}-signal footprint in the generated CV.`
      : `Angle "${angle}" left no measurable signal footprint in the generated CV.`,
  };
}