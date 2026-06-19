import { UserProfile, CVData, CVPublication, CustomSection } from '../types';

/**
 * Directly converts a UserProfile into CVData without any AI call.
 * Used for the "Use Template" (no-AI) path so users can just pick a template
 * and render their existing data without any API key or JD required.
 * Also used by the JSON import flow in App.tsx to immediately populate all templates.
 *
 * Defensive by design — handles both string and array variants of skills/
 * responsibilities so round-tripping through the JSON export/import flow
 * (where the form stores skills as a textarea string) works correctly.
 */
export function profileToCV(profile: UserProfile): CVData {
  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    if (dateStr.toLowerCase() === 'present') return 'Present';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const formatDateRange = (start: string | undefined, end: string | undefined): string => {
    const s = formatDate(start);
    const e = (end?.toLowerCase() === 'present') ? 'Present' : formatDate(end);
    if (!s && !e) return '';
    if (!s) return e;
    if (!e) return s;
    return `${s} – ${e}`;
  };

  // ── Normalise skills — form stores as textarea string, API stores as array ──
  const rawSkills = (profile as any).skills;
  const normalisedSkills: string[] = Array.isArray(rawSkills)
    ? (rawSkills as string[]).filter(Boolean)
    : typeof rawSkills === 'string' && rawSkills.trim()
      ? rawSkills.split(/[,\n;]/).map((s: string) => s.trim()).filter(Boolean)
      : [];

  const customSections: CustomSection[] = profile.customSections || [];

  // ── Extract certifications from customSections (type='certifications') ──────
  const certSections = customSections.filter(s => s.type === 'certifications');
  const certifications = certSections.length > 0
    ? certSections.flatMap(s =>
        s.items.map(item => ({
          name:   item.title,
          issuer: item.subtitle || undefined,
          year:   item.year    || undefined,
        }))
      ).filter(c => c.name)
    : undefined;

  // ── Extract achievements from customSections (type='achievements'|'awards') ─
  const achieveSections = customSections.filter(s => s.type === 'achievements' || s.type === 'awards');
  const achievements = achieveSections.length > 0
    ? achieveSections.flatMap(s =>
        s.items.map(item => {
          const parts = [item.title];
          if (item.subtitle) parts.push(item.subtitle);
          if (item.year)     parts.push(`(${item.year})`);
          return parts.filter(Boolean).join(' — ');
        })
      ).filter(Boolean)
    : undefined;

  // ── Extract publications from customSections (type='publications') ──────────
  const pubSections = customSections.filter(s => s.type === 'publications');
  const publications: CVPublication[] | undefined = pubSections.length > 0
    ? pubSections.flatMap(s =>
        s.items.map(item => ({
          title:   item.title,
          authors: [],
          journal: item.subtitle || '',
          year:    item.year     || '',
          link:    item.link     || undefined,
        }))
      ).filter(p => p.title)
    : undefined;

  return {
    summary: profile.summary || '',
    skills:  normalisedSkills,
    experience: (profile.workExperience || []).map(exp => ({
      company:          exp.company  || '',
      jobTitle:         exp.jobTitle || '',
      dates:            formatDateRange(exp.startDate, exp.endDate),
      startDate:        exp.startDate || '',
      endDate:          exp.endDate   || '',
      location:         (exp as any).location || '',
      responsibilities: typeof exp.responsibilities === 'string'
        ? (exp.responsibilities as string).split('\n').map(r => r.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)
        : (exp.responsibilities || []),
    })),
    education: (profile.education || []).map(edu => ({
      degree:      edu.degree         || '',
      school:      edu.school         || '',
      year:        edu.graduationYear || '',
      description: (edu as any).description || '',
    })),
    projects: (profile.projects || []).map(p => ({
      name:        p.name        || '',
      description: p.description || '',
      link:        p.link        || '',
    })),
    languages: (profile.languages || []).map(l => ({
      name:        l.name        || '',
      proficiency: l.proficiency || '',
    })),
    references: (profile.references || []).map(r => ({
      name:         r.name         || '',
      title:        r.title        || '',
      company:      r.company      || '',
      email:        r.email        || '',
      phone:        r.phone        || '',
      relationship: r.relationship || '',
    })),
    certifications: certifications?.length ? certifications : undefined,
    achievements:   achievements?.length   ? achievements   : undefined,
    publications:   publications?.length   ? publications   : undefined,
    customSections: profile.customSections || [],
    sectionOrder:   profile.sectionOrder   || [],
  };
}
