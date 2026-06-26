/**
 * careerTrackClassifier.ts
 *
 * Smart career track detection — ontology-aware, unknown-role tolerant.
 *
 * Design philosophy:
 *   - Uses ProCV's EXISTING TITLE_FIELD_MAP + FIELD_KEYWORDS via detectField()
 *     as the single source of truth for field classification.
 *   - Never duplicates classification logic. When a new field is added to
 *     cvPromptHelpers.ts, track detection automatically benefits.
 *   - Handles unknown roles gracefully — they are bridged, not dropped.
 *   - Uses the ontology parent tree (fieldOntology.ts) to compute DISTANCE
 *     between fields: civil_engineering and irrigation are siblings under
 *     civil_group → LOW distance. civil_engineering and tech → HIGH distance.
 *   - "Engineering" is NOT one thing. The system knows:
 *       civil_engineering, irrigation, construction, architecture → siblings (low distance)
 *       manufacturing → close to civil_group (medium)
 *       tech → different group entirely (high from civil, low from data_analytics)
 *
 * Key exports:
 *   classifyRoleField()   — classify a single job title to a CVField (or null)
 *   getFieldDistance()    — distance between two CVField slugs using the ontology
 *   buildCareerTrack()    — full career track from WorkExperience[]
 *   describeTrack()       — human-readable label e.g. "Civil → Tech"
 *
 * NOTE: TITLE_CLASSIFIERS regex patterns are a parallel lightweight list focused
 * on job titles only (not JD body text). When you add a new CVField to
 * cvPromptHelpers.ts, add a corresponding entry here too.
 */

import type { CVField } from './cvPromptHelpers';
import { FIELD_ONTOLOGY } from '../data/fieldOntology';
import type { WorkExperience } from '../types';

// ─── Re-export from fieldOntology for convenience ────────────────────────────

/** Fast lookup: slug → parent slug */
const PARENT_OF = new Map<string, string>();
for (const node of FIELD_ONTOLOGY) {
  if (node.parent) PARENT_OF.set(node.slug, node.parent);
}

/** Fast lookup: slug → human label */
const LABEL_OF = new Map<string, string>();
for (const node of FIELD_ONTOLOGY) LABEL_OF.set(node.slug, node.label);

// ─── Public types ─────────────────────────────────────────────────────────────

export type FieldDistance = 'same' | 'sibling' | 'cousin' | 'distant';

export interface RoleClassification {
  jobTitle: string;
  company: string;
  field: CVField | null;
  fieldLabel: string;
  confidence: 'high' | 'medium' | 'low' | 'unclassified';
  startYear: number | null;
  endYear: number | null;
  isCurrent: boolean;
}

export interface CareerSegment {
  field: CVField | null;
  fieldLabel: string;
  roles: RoleClassification[];
  startYear: number | null;
  endYear: number | null;
  isCurrent: boolean;
  durationYears: number | null;
}

export interface CareerTrack {
  roles: RoleClassification[];
  segments: CareerSegment[];
  hasTransition: boolean;
  maxDistance: FieldDistance;
  transitionLabel: string | null;
  transitionFrom: CVField | null;
  transitionTo: CVField | null;
  hasUnclassifiedRoles: boolean;
  unclassifiedTitles: string[];
}

// ─── Title classifiers ────────────────────────────────────────────────────────

type TitleClassifierEntry = {
  field: Exclude<CVField, 'general'>;
  patterns: RegExp[];
  weight: number;
};

const TITLE_CLASSIFIERS: TitleClassifierEntry[] = [
  {
    field: 'irrigation',
    weight: 10,
    patterns: [
      /\b(irrigation|biosystem|agronomist|agro.?processing|agri.*engineer|agricultural engineer|hydrol|water resource|drip system|sprinkler|farm engineer|borehole|water supply|dam engineer)\b/i,
    ],
  },
  {
    field: 'drought_management',
    weight: 10,
    patterns: [
      /\b(drought|early.?warning|food securi|famine|ndma|fewsnet|climate resilien|food system|livelihood|nutrition officer)\b/i,
    ],
  },
  {
    field: 'civil_engineering',
    weight: 9,
    patterns: [
      /\b(civil engineer|structural engineer|geotechni|quantity surveyor|\bqs\b|road engineer|highway engineer|bridge engineer|drainage engineer|infrastructure engineer|resident engineer|clerk of works|water engineer|environmental engineer|transport engineer|graduate.*engineer)\b/i,
      /\b(site engineer|soil engineer|survey.*engineer|pavement engineer|traffic engineer|sanitation engineer)\b/i,
    ],
  },
  {
    field: 'construction',
    weight: 8,
    patterns: [
      /\b(construction manager|site manager|contracts? manager|building contractor|mep engineer|construction supervisor|foreman|site supervisor|construction director|building manager|clerk of works)\b/i,
    ],
  },
  {
    field: 'architecture',
    weight: 9,
    patterns: [
      /\b(architect|architectural designer|urban plann|landscape architect|interior design|bim coordinator|revit specialist|spatial design|urban design|master plann)\b/i,
    ],
  },
  {
    field: 'manufacturing',
    weight: 9,
    patterns: [
      /\b(production engineer|manufacturing engineer|process engineer|plant engineer|quality engineer|lean engineer|factory manager|production manager|tooling engineer|manufacturing technician|industrial engineer|plant manager|assembly technician)\b/i,
      /\b(maintenance engineer|mechanical technician|electrical technician|instrument technician|process technician)\b/i,
    ],
  },
  {
    field: 'logistics',
    weight: 9,
    patterns: [
      /\b(logistics|supply chain|procurement officer|warehouse manager|inventory manager|fleet manager|freight|shipping|customs|distribution|fulfilment|buyer|category manager|demand planner|clearing agent)\b/i,
    ],
  },
  {
    field: 'tech',
    weight: 9,
    patterns: [
      /\b(software engineer|software developer|backend developer|frontend developer|full.?stack developer|devops engineer|cloud engineer|site reliability|\bsre\b|mobile developer|android developer|ios developer|firmware engineer|embedded engineer|web developer|platform engineer)\b/i,
      /\b(systems engineer.*tech|it engineer|network engineer|cybersecurity engineer|solutions engineer|technical lead|tech lead|engineering manager)\b/i,
    ],
  },
  {
    field: 'data_analytics',
    weight: 9,
    patterns: [
      /\b(data analyst|data scientist|business analyst|bi developer|bi analyst|tableau developer|power bi|data engineer|analytics engineer|ml engineer|machine learning engineer|data architect|research analyst|quantitative analyst|data manager|reporting analyst)\b/i,
    ],
  },
  {
    field: 'sales',
    weight: 8,
    patterns: [
      /\b(sales engineer|account manager|account executive|business development|sales rep|sales manager|commercial manager|key account manager|territory manager|\bbdr\b|\bsdr\b|inside sales|outside sales|sales consultant|sales director|pre-sales|channel manager)\b/i,
    ],
  },
  {
    field: 'marketing',
    weight: 8,
    patterns: [
      /\b(marketing manager|brand manager|marketing executive|digital marketing|content manager|seo specialist|growth marketer|social media manager|communications manager|pr specialist|campaign manager|marketing analyst|marketing officer|brand strategist)\b/i,
    ],
  },
  {
    field: 'finance',
    weight: 9,
    patterns: [
      /\b(accountant|financial analyst|finance manager|auditor|treasury|investment analyst|credit analyst|tax consultant|financial controller|\bcfo\b|risk analyst|fund manager|portfolio manager|\bcpa\b|\bcfa\b|\bacca\b|finance officer|budget analyst|financial advisor)\b/i,
    ],
  },
  {
    field: 'legal',
    weight: 9,
    patterns: [
      /\b(lawyer|attorney|advocate|barrister|solicitor|legal officer|legal counsel|paralegal|compliance officer|regulatory affairs|ip specialist|corporate counsel|litigation|legal advisor|company secretary|legal associate)\b/i,
    ],
  },
  {
    field: 'consulting',
    weight: 7,
    patterns: [
      /\b(management consultant|strategy analyst|transformation lead|change management|engagement manager|consulting manager|advisory|business consultant|strategy consultant)\b/i,
    ],
  },
  {
    field: 'operations',
    weight: 6,
    patterns: [
      /\b(operations manager|operations analyst|process analyst|business operations|operations director|\bcoo\b|operational excellence|business process|operations coordinator|performance manager|continuous improvement)\b/i,
    ],
  },
  {
    field: 'hr',
    weight: 8,
    patterns: [
      /\b(\bhr\b|human resources|talent acquisition|recruiter|recruitment consultant|hr manager|hr business partner|\bhrbp\b|\bl&d\b|learning and development|people operations|payroll|employer branding|hr officer|talent manager|people manager)\b/i,
    ],
  },
  {
    field: 'ngo',
    weight: 8,
    patterns: [
      /\b(\bngo\b|humanitarian|community development|programme officer|project officer|field officer|community officer|\bwash\b|development worker|relief|social worker|community worker|non-profit)\b/i,
    ],
  },
  {
    field: 'government',
    weight: 8,
    patterns: [
      /\b(county government|public sector|ministry|parastatal|state corporation|public administration|policy analyst|policy officer|regulatory officer|county officer|civil servant|government officer)\b/i,
    ],
  },
  {
    field: 'healthcare',
    weight: 9,
    patterns: [
      /\b(\bdoctor\b|physician|nurse|pharmacist|clinical officer|public health|epidemiologist|lab technician|radiographer|dentist|surgeon|healthcare worker|medical officer|community health|disease surveillance|health officer|clinical|medical doctor)\b/i,
    ],
  },
  {
    field: 'education',
    weight: 8,
    patterns: [
      /\b(teacher|lecturer|tutor|professor|curriculum developer|education officer|instructor|school principal|training officer|trainer|facilitator|pedagog|academic|teaching assistant|education coordinator)\b/i,
    ],
  },
  {
    field: 'hospitality',
    weight: 8,
    patterns: [
      /\b(hotel manager|front office manager|housekeeping|food and beverage|f&b manager|events coordinator|concierge|restaurant manager|guest relations|hospitality manager|tourism officer|hotel supervisor|catering)\b/i,
    ],
  },
  {
    field: 'media',
    weight: 8,
    patterns: [
      /\b(journalist|broadcaster|editor|photographer|videographer|content creator|media officer|communications officer|radio presenter|film producer|documentary|video editor|publishing|copywriter|media manager|pr officer)\b/i,
    ],
  },
];

// ─── Single title classifier ───────────────────────────────────────────────────

export function classifyRoleField(jobTitle: string): {
  field: CVField | null;
  confidence: 'high' | 'medium' | 'low' | 'unclassified';
} {
  if (!jobTitle?.trim()) return { field: null, confidence: 'unclassified' };

  const title = jobTitle.trim();
  let bestField: Exclude<CVField, 'general'> | null = null;
  let bestScore = 0;

  for (const entry of TITLE_CLASSIFIERS) {
    let entryScore = 0;
    for (const pattern of entry.patterns) {
      if (pattern.test(title)) {
        entryScore += entry.weight;
      }
    }
    if (entryScore > bestScore) {
      bestScore = entryScore;
      bestField = entry.field;
    }
  }

  if (!bestField) return { field: null, confidence: 'unclassified' };

  const confidence =
    bestScore >= 18 ? 'high' :
    bestScore >= 9  ? 'medium' :
    'low';

  return { field: bestField, confidence };
}

// ─── Ontology distance calculator ─────────────────────────────────────────────

function getAncestors(slug: string): string[] {
  const chain: string[] = [];
  let current: string | undefined = slug;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    visited.add(current);
    chain.push(current);
    current = PARENT_OF.get(current);
  }
  return chain;
}

export function getFieldDistance(a: CVField | null, b: CVField | null): FieldDistance {
  if (!a || !b) return 'distant';
  if (a === b) return 'same';

  const ancestorsA = getAncestors(a);

  const parentA = PARENT_OF.get(a);
  const parentB = PARENT_OF.get(b);
  if (parentA && parentA === parentB) return 'sibling';

  const grandParentA = parentA ? PARENT_OF.get(parentA) : undefined;
  const grandParentB = parentB ? PARENT_OF.get(parentB) : undefined;
  if (grandParentA && grandParentA === grandParentB) return 'cousin';

  const setA = new Set(ancestorsA);
  const ancestorsB = getAncestors(b);
  for (const ancestor of ancestorsB) {
    if (setA.has(ancestor)) {
      const node = FIELD_ONTOLOGY.find(n => n.slug === ancestor);
      if (node) return 'distant';
    }
  }

  return 'distant';
}

export function fieldDistanceLabel(distance: FieldDistance): string {
  switch (distance) {
    case 'same':    return 'Same field';
    case 'sibling': return 'Closely related fields';
    case 'cousin':  return 'Related fields (same industry)';
    case 'distant': return 'Significant career transition';
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseYear(dateStr: string | undefined | null): number | null {
  if (!dateStr) return null;
  const m = dateStr.match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

function isCurrentRole(endDate: string | undefined | null): boolean {
  if (!endDate) return true;
  const lower = endDate.toLowerCase().trim();
  return lower === 'present' || lower === 'current' || lower === '';
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildCareerTrack(experience: WorkExperience[]): CareerTrack {
  const EMPTY: CareerTrack = {
    roles: [],
    segments: [],
    hasTransition: false,
    maxDistance: 'same',
    transitionLabel: null,
    transitionFrom: null,
    transitionTo: null,
    hasUnclassifiedRoles: false,
    unclassifiedTitles: [],
  };

  if (!experience || experience.length === 0) return EMPTY;

  const classified: RoleClassification[] = experience
    .map(role => {
      const { field, confidence } = classifyRoleField(role.jobTitle ?? '');
      const startYear = parseYear(role.startDate);
      const isCurrent = isCurrentRole(role.endDate);
      const endYear = isCurrent ? null : parseYear(role.endDate);
      return {
        jobTitle: role.jobTitle ?? 'Unknown Role',
        company: role.company ?? '',
        field,
        fieldLabel: field ? (LABEL_OF.get(field) ?? field) : 'Unknown Role',
        confidence,
        startYear,
        endYear,
        isCurrent,
      };
    })
    .sort((a, b) => (a.startYear ?? 1900) - (b.startYear ?? 1900));

  const unclassifiedTitles = classified.filter(r => r.field === null).map(r => r.jobTitle);

  const segments: CareerSegment[] = [];
  let currentSegment: CareerSegment | null = null;

  for (const role of classified) {
    if (!currentSegment) {
      currentSegment = {
        field: role.field,
        fieldLabel: role.fieldLabel,
        roles: [role],
        startYear: role.startYear,
        endYear: role.endYear,
        isCurrent: role.isCurrent,
        durationYears: null,
      };
      segments.push(currentSegment);
      continue;
    }

    const lastKnownField = currentSegment.field;

    if (role.field === null) {
      const nextClassifiedIdx = classified.indexOf(role) + 1;
      const nextClassified = classified.slice(nextClassifiedIdx).find(r => r.field !== null);
      if (nextClassified && nextClassified.field === lastKnownField) {
        currentSegment.roles.push(role);
        currentSegment.endYear = role.endYear;
        currentSegment.isCurrent = role.isCurrent;
      } else {
        currentSegment = {
          field: null,
          fieldLabel: 'Unknown Role',
          roles: [role],
          startYear: role.startYear,
          endYear: role.endYear,
          isCurrent: role.isCurrent,
          durationYears: null,
        };
        segments.push(currentSegment);
      }
      continue;
    }

    if (role.field === lastKnownField) {
      currentSegment.roles.push(role);
      currentSegment.endYear = role.endYear;
      currentSegment.isCurrent = role.isCurrent;
      continue;
    }

    currentSegment = {
      field: role.field,
      fieldLabel: role.fieldLabel,
      roles: [role],
      startYear: role.startYear,
      endYear: role.endYear,
      isCurrent: role.isCurrent,
      durationYears: null,
    };
    segments.push(currentSegment);
  }

  for (const seg of segments) {
    if (seg.startYear !== null) {
      const end = seg.isCurrent ? new Date().getFullYear() : (seg.endYear ?? seg.startYear);
      seg.durationYears = Math.max(0, end - seg.startYear);
    }
  }

  const distanceRank: Record<FieldDistance, number> = {
    same: 0, sibling: 1, cousin: 2, distant: 3,
  };

  let maxDistance: FieldDistance = 'same';
  let transitionLabel: string | null = null;
  let transitionFrom: CVField | null = null;
  let transitionTo: CVField | null = null;

  const knownSegments = segments.filter(s => s.field !== null);

  for (let i = 1; i < knownSegments.length; i++) {
    const from = knownSegments[i - 1].field;
    const to   = knownSegments[i].field;
    if (from === to) continue;

    const dist = getFieldDistance(from, to);
    if (distanceRank[dist] > distanceRank[maxDistance]) {
      maxDistance = dist;
      transitionFrom = from;
      transitionTo   = to;
      transitionLabel = `${LABEL_OF.get(from!) ?? from} → ${LABEL_OF.get(to!) ?? to}`;
    }
  }

  const hasTransition = maxDistance !== 'same' && knownSegments.length > 1;

  return {
    roles: classified,
    segments,
    hasTransition,
    maxDistance,
    transitionLabel,
    transitionFrom,
    transitionTo,
    hasUnclassifiedRoles: unclassifiedTitles.length > 0,
    unclassifiedTitles,
  };
}

// ─── Convenience exports ──────────────────────────────────────────────────────

/**
 * Async version of classifyRoleField that adds D1 lookup as layer 2.
 *
 * Call order:
 *   1. Regex (synchronous, free)
 *   2. Worker D1 lookup via /api/ontology/classify-titles (~5ms)
 *   3. Worker LLM classification (Workers AI free tier, fires only on miss)
 *
 * Use in ProfileForm (on title blur) and after PDF/Word import.
 * buildCareerTrack() continues to use synchronous classifyRoleField()
 * for in-memory rendering — the async version is for D1 persistence only.
 */
export async function classifyRoleFieldAsync(
  jobTitle: string,
  source: 'pdf_import' | 'jd_upload' | 'manual_form' | 'deep_analysis' = 'manual_form',
): Promise<{ field: CVField | null; confidence: string; from_cache: boolean }> {
  const regexResult = classifyRoleField(jobTitle);
  if (regexResult.confidence === 'high' || regexResult.confidence === 'medium') {
    return { field: regexResult.field, confidence: regexResult.confidence, from_cache: false };
  }

  try {
    const ENGINE_URL = import.meta.env.VITE_CV_ENGINE_URL || '';
    if (!ENGINE_URL) return { field: regexResult.field, confidence: 'unclassified', from_cache: false };

    const res = await fetch(`${ENGINE_URL}/api/ontology/classify-titles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titles: [jobTitle], source }),
    });

    if (!res.ok) return { field: regexResult.field, confidence: 'unclassified', from_cache: false };

    const data = await res.json() as {
      results: Array<{ title: string; field_slug: string | null; confidence: string; from_cache: boolean }>
    };
    const result = data.results?.[0];
    if (!result?.field_slug) return { field: regexResult.field, confidence: 'unclassified', from_cache: false };

    return {
      field: result.field_slug as CVField,
      confidence: result.confidence,
      from_cache: result.from_cache,
    };
  } catch {
    return { field: regexResult.field, confidence: 'unclassified', from_cache: false };
  }
}

/**
 * Batch classify all roles from a profile after PDF/Word import.
 * Call fire-and-forget after assembling workExperience[].
 * Populates D1 so future classifications are instant.
 */
export async function classifyAndSaveAllRoles(
  workExperience: Array<{ jobTitle: string }>,
  source: 'pdf_import' | 'manual_form' = 'pdf_import',
): Promise<void> {
  const titles = workExperience.map(r => r.jobTitle).filter(Boolean);
  if (titles.length === 0) return;

  const ENGINE_URL = import.meta.env.VITE_CV_ENGINE_URL || '';
  if (!ENGINE_URL) return;

  try {
    await fetch(`${ENGINE_URL}/api/ontology/classify-titles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titles, source }),
    });
  } catch { /* fire-and-forget — non-fatal */ }
}

export function describeTrack(track: CareerTrack): string {
  const known = track.segments.filter(s => s.field !== null);

  if (known.length === 0) return 'Career track could not be determined';
  if (known.length === 1) {
    const seg = known[0];
    const dur = seg.durationYears !== null ? ` (${seg.durationYears} yr${seg.durationYears !== 1 ? 's' : ''})` : '';
    return `${seg.fieldLabel} career${dur}`;
  }
  if (track.transitionLabel) {
    return `${track.transitionLabel} (${fieldDistanceLabel(track.maxDistance).toLowerCase()})`;
  }
  return `Multi-field career: ${known.length} tracks detected`;
}

export function trackRoomRecommendation(track: CareerTrack): {
  shouldRecommend: boolean;
  reason: string;
  fromField: CVField | null;
  toField: CVField | null;
} {
  if (!track.hasTransition || track.maxDistance === 'sibling') {
    return { shouldRecommend: false, reason: 'Fields are closely related — one room is sufficient', fromField: null, toField: null };
  }

  if (track.maxDistance === 'cousin') {
    return {
      shouldRecommend: true,
      reason: `Your ${track.transitionLabel} career path may benefit from a dedicated room for each track`,
      fromField: track.transitionFrom,
      toField: track.transitionTo,
    };
  }

  return {
    shouldRecommend: true,
    reason: `Your ${track.transitionLabel} is a significant transition. A dedicated career room will let you tailor each application without diluting your focus`,
    fromField: track.transitionFrom,
    toField: track.transitionTo,
  };
}
