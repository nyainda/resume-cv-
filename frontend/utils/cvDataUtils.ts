import type {
  CVData,
  CVExperience,
  CVProject,
  CVPublication,
  UserProfile,
  WorkExperience,
  Education,
} from '../types';

/**
 * Ensure every array field in CVData is a proper array — never undefined.
 * Apply to any CVData arriving from an external source (D1, Drive, JSON import,
 * Word import, AI generation, etc.) before storing or rendering it.
 *
 * Required fields (`summary`, `skills`, `experience`, `education`) are always
 * present in the output. Optional fields are included only when present in the
 * source object.
 */
export function normalizeCVData(raw: unknown): CVData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;

  function toStrArr(v: unknown): string[] {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
    return [];
  }

  function toArr<T>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
  }

  const experience: CVExperience[] = toArr<CVExperience>(d.experience).map((e) => ({
    ...e,
    responsibilities: Array.isArray(e.responsibilities)
      ? e.responsibilities
      : typeof e.responsibilities === 'string'
        ? (e.responsibilities as string).split('\n').filter(Boolean)
        : [],
  }));

  const projects: CVProject[] | undefined =
    d.projects !== undefined
      ? toArr<CVProject>(d.projects).map((p) => ({
          ...p,
          bullets:      Array.isArray(p.bullets)      ? p.bullets      : [],
          technologies: Array.isArray(p.technologies) ? p.technologies : [],
        }))
      : undefined;

  const publications =
    d.publications !== undefined
      ? toArr<CVPublication>(d.publications).map((p) => ({
          ...p,
          authors: Array.isArray(p.authors) ? p.authors : [],
        }))
      : undefined;

  return {
    summary:   typeof d.summary === 'string' ? d.summary : '',
    skills:    toStrArr(d.skills),
    experience,
    education: toArr(d.education),
    ...(projects       !== undefined && { projects }),
    ...(d.languages    !== undefined && { languages:       toArr(d.languages)    }),
    ...(publications   !== undefined && { publications }),
    ...(d.references   !== undefined && { references:      toArr(d.references)   }),
    ...(d.certifications !== undefined && { certifications: toArr(d.certifications) }),
    ...(d.achievements !== undefined && { achievements:    toStrArr(d.achievements) }),
    ...(d.customSections !== undefined && { customSections: toArr(d.customSections) }),
    ...(d.sectionOrder   !== undefined && { sectionOrder:   toArr(d.sectionOrder)   }),
    ...(typeof d.accentColor  === 'string' && { accentColor:  d.accentColor  }),
    ...(typeof d.fontPairing  === 'string' && { fontPairing:  d.fontPairing  }),
    ...(typeof d.fontScale    === 'number' && { fontScale:    d.fontScale    }),
    ...(d._trace !== undefined             && { _trace: d._trace as CVData['_trace'] }),
  };
}

/**
 * Ensure every array field on a UserProfile is a proper array — never undefined.
 * Critical for profiles arriving from D1 restore, Drive restore, or old localStorage
 * where optional fields may simply be absent.
 *
 * Note: WorkExperience.responsibilities is a plain string in the profile form
 * (it's only converted to string[] when profileToCV() builds a CVExperience).
 */
export function normalizeUserProfile(raw: unknown): UserProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;

  function toArr<T>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
  }

  const rawPI = p.personalInfo && typeof p.personalInfo === 'object'
    ? p.personalInfo as Record<string, unknown>
    : {};

  const personalInfo: UserProfile['personalInfo'] = {
    name:     typeof rawPI.name     === 'string' ? rawPI.name     : '',
    email:    typeof rawPI.email    === 'string' ? rawPI.email    : '',
    phone:    typeof rawPI.phone    === 'string' ? rawPI.phone    : '',
    location: typeof rawPI.location === 'string' ? rawPI.location : '',
    linkedin: typeof rawPI.linkedin === 'string' ? rawPI.linkedin : '',
    website:  typeof rawPI.website  === 'string' ? rawPI.website  : '',
    github:   typeof rawPI.github   === 'string' ? rawPI.github   : '',
    ...(typeof rawPI.photo === 'string' && { photo: rawPI.photo }),
  };

  const workExperience: WorkExperience[] = toArr<WorkExperience>(p.workExperience).map((e) => ({
    id:              typeof e.id       === 'string' ? e.id       : '',
    company:         typeof e.company  === 'string' ? e.company  : '',
    jobTitle:        typeof e.jobTitle === 'string' ? e.jobTitle : '',
    startDate:       typeof e.startDate === 'string' ? e.startDate : '',
    endDate:         typeof e.endDate  === 'string' ? e.endDate  : '',
    responsibilities: typeof e.responsibilities === 'string' ? e.responsibilities : '',
    ...(typeof e.pointCount === 'number' && { pointCount: e.pointCount }),
  }));

  const education: Education[] = toArr<Education>(p.education).map((e) => ({
    id:             typeof e.id             === 'string' ? e.id             : '',
    degree:         typeof e.degree         === 'string' ? e.degree         : '',
    school:         typeof e.school         === 'string' ? e.school         : '',
    graduationYear: typeof e.graduationYear === 'string' ? e.graduationYear : '',
  }));

  return {
    personalInfo,
    summary:        typeof p.summary === 'string' ? p.summary : '',
    workExperience,
    education,
    skills:         Array.isArray(p.skills) ? (p.skills as string[]) : [],
    ...(p.projects       !== undefined && { projects:       toArr(p.projects)       }),
    ...(p.languages      !== undefined && { languages:      toArr(p.languages)      }),
    ...(p.references     !== undefined && { references:     toArr(p.references)     }),
    ...(p.customSections !== undefined && { customSections: toArr(p.customSections) }),
    ...(p.sectionOrder   !== undefined && { sectionOrder:   toArr(p.sectionOrder)   }),
    ...(typeof p.preferredField === 'string' && { preferredField: p.preferredField }),
  };
}

/**
 * Format an education year/date field for display.
 * Handles ISO strings ("2022-09-01" → "Sep 2022"), plain years ("2022" → "2022"),
 * and already-formatted strings ("Sep 2022" → "Sep 2022").
 * Safe to call on any edu.year / edu.startYear value regardless of source.
 */
export function formatEduDate(d?: string): string {
  if (!d) return '';
  if (d.toLowerCase() === 'present') return 'Present';
  // ISO date: YYYY-MM-DD or YYYY-MM
  const iso = d.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (iso) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const month = months[parseInt(iso[2], 10) - 1];
    return month ? `${month} ${iso[1]}` : iso[1];
  }
  // Plain 4-digit year or already formatted — return as-is
  return d;
}

/**
 * Build a formatted date range string from two edu date fields.
 * e.g. ("2020-09-01", "2022-06-01") → "Sep 2020 – Jun 2022"
 */
export function formatEduDateRange(startYear?: string, year?: string): string {
  const start = formatEduDate(startYear);
  const end   = formatEduDate(year);
  if (start && end && start !== end) return `${start} – ${end}`;
  if (end)   return end;
  if (start) return start;
  return '';
}

/**
 * Format a work-experience date field (ISO string, plain year, or "Present")
 * into a short human-readable string like "Jan 2020" or "Present".
 */
function formatExpDate(d?: string): string {
  if (!d) return '';
  if (d.toLowerCase() === 'present') return 'Present';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d; // already formatted, e.g. "Jan 2020"
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Build a formatted date range string from work-experience startDate/endDate.
 * e.g. ("2020-01-01", "Present") → "Jan 2020 – Present"
 * e.g. ("2018-06-01", "2022-03-01") → "Jun 2018 – Mar 2022"
 *
 * Use this as a fallback when the AI omits the `dates` display field but
 * still returns ISO `startDate`/`endDate` for sorting.
 */
export function formatExpDateRange(startDate?: string, endDate?: string): string {
  const s = formatExpDate(startDate);
  const e = formatExpDate(endDate);
  if (!s && !e) return '';
  if (!s) return e;
  if (!e) return s;
  if (s === e) return s;
  return `${s} – ${e}`;
}
