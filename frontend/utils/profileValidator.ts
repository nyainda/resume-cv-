/**
 * validateAndNormaliseProfile
 *
 * Accepts an unknown JSON value (from a paste or file upload) and normalises it
 * into a well-shaped UserProfile, tolerating a wide variety of field-naming
 * conventions (camelCase, snake_case, common synonyms, nested wrappers, etc.).
 *
 * Kept in its own module so it can be imported by components without triggering
 * Vite Fast Refresh invalidation on the mixed-export WordImportPanel file.
 */
import { UserProfile } from '../types';

export function validateAndNormaliseProfile(raw: unknown): UserProfile {
    if (!raw || typeof raw !== 'object') throw new Error('Not a valid JSON object.');
    let obj = raw as Record<string, unknown>;

    // ── 1. Unwrap common top-level wrappers ───────────────────────────────────
    // Handles exports like {"profile":{...}}, {"cv":{...}}, {"data":{...}},
    // {"resume":{...}}, {"user":{...}}, {"output":{...}}.
    for (const wrapKey of ['profile', 'cv', 'resume', 'data', 'user', 'output', 'result']) {
        const wrapped = obj[wrapKey];
        if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) {
            const inner = wrapped as Record<string, unknown>;
            // Only unwrap if the inner object looks like a profile (has personalInfo, name, etc.)
            if (inner.personalInfo || inner.workExperience || inner.experience || inner.name) {
                obj = inner;
                break;
            }
        }
    }

    // ── 2. Helpers ────────────────────────────────────────────────────────────
    const coerceStr = (v: unknown): string => {
        if (typeof v === 'string') return v;
        if (typeof v === 'number') return String(v);
        return '';
    };
    const coerceId = (v: unknown, fallback: string): string =>
        typeof v === 'string' && v ? v : fallback;

    // Pick first truthy value from a list of keys in an object
    const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => {
        for (const k of keys) {
            if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
        }
        return undefined;
    };
    const pickStr = (o: Record<string, unknown>, ...keys: string[]): string =>
        coerceStr(pick(o, ...keys));

    // Coerce responsibilities: string | string[] → single joined string
    const coerceResponsibilities = (v: unknown): string => {
        if (typeof v === 'string') return v;
        if (Array.isArray(v)) return v.map(s => coerceStr(s)).filter(Boolean).join('\n');
        return '';
    };

    // Coerce a skill entry: string | { name: string } | { skill: string } → string
    const coerceSkill = (s: unknown): string => {
        if (typeof s === 'string') return s;
        if (s && typeof s === 'object') {
            const so = s as Record<string, unknown>;
            return coerceStr(pick(so, 'name', 'skill', 'label', 'title') ?? '');
        }
        return '';
    };

    // ── 3. Locate personalInfo ────────────────────────────────────────────────
    // Support both nested personalInfo object and flat top-level name/email fields.
    let pi: Record<string, unknown> = {};
    if (obj.personalInfo && typeof obj.personalInfo === 'object') {
        pi = obj.personalInfo as Record<string, unknown>;
    } else if (obj.personal_info && typeof obj.personal_info === 'object') {
        pi = obj.personal_info as Record<string, unknown>;
    } else if (obj.contact && typeof obj.contact === 'object') {
        pi = obj.contact as Record<string, unknown>;
    } else if (coerceStr(obj.name) || coerceStr(obj.email)) {
        // Flat structure — top-level fields ARE the personalInfo
        pi = obj;
    }

    // Require at least a name or email to consider this a valid profile
    const fullName = pickStr(pi, 'name', 'fullName', 'full_name') ||
        [coerceStr(pi.firstName || pi.first_name), coerceStr(pi.lastName || pi.last_name)]
            .filter(Boolean).join(' ');
    if (!fullName && !pickStr(pi, 'email')) {
        throw new Error(
            'Could not find a name or email in this JSON. ' +
            'Make sure the file includes a "personalInfo" object (or top-level "name"/"email" fields).'
        );
    }

    // ── 4. Locate workExperience ──────────────────────────────────────────────
    // Accepts: workExperience, work_experience, experience, jobs, positions, employment
    const rawExp: unknown[] = (
        Array.isArray(obj.workExperience)   ? obj.workExperience  :
        Array.isArray(obj.work_experience)  ? obj.work_experience :
        Array.isArray(obj.experience)       ? obj.experience      :
        Array.isArray(obj.jobs)             ? obj.jobs            :
        Array.isArray(obj.positions)        ? obj.positions       :
        Array.isArray(obj.employment)       ? obj.employment      :
        []
    );

    // ── 5. Locate skills ──────────────────────────────────────────────────────
    const rawSkills: unknown[] = (
        Array.isArray(obj.skills)          ? obj.skills          :
        Array.isArray(obj.skill_set)       ? obj.skill_set       :
        Array.isArray(obj.technical_skills)? obj.technical_skills:
        []
    );

    // ── 6. Build the profile ──────────────────────────────────────────────────
    const profile: UserProfile = {
        personalInfo: {
            name:     fullName || pickStr(pi, 'email'),
            email:    pickStr(pi, 'email'),
            phone:    pickStr(pi, 'phone', 'telephone', 'mobile', 'cell'),
            location: pickStr(pi, 'location', 'address', 'city', 'country'),
            linkedin: pickStr(pi, 'linkedin', 'linkedIn', 'linkedinUrl', 'linkedin_url'),
            website:  pickStr(pi, 'website', 'portfolio', 'url', 'portfolioUrl', 'portfolio_url'),
            github:   pickStr(pi, 'github', 'githubUrl', 'github_url'),
            photo:    typeof pi.photo === 'string' ? pi.photo : undefined,
        },

        summary: coerceStr(
            pick(obj, 'summary', 'professionalSummary', 'professional_summary',
                 'about', 'bio', 'objective', 'profile')
        ),

        workExperience: rawExp.map((we, i) => {
            const w = (we || {}) as Record<string, unknown>;
            return {
                id:    coerceId(w.id, `we_${i}`),
                company:   pickStr(w, 'company', 'employer', 'organization', 'organisation'),
                jobTitle:  pickStr(w, 'jobTitle', 'job_title', 'title', 'position',
                                      'role', 'designation', 'roleTitle'),
                startDate: pickStr(w, 'startDate', 'start_date', 'from', 'start'),
                endDate:   pickStr(w, 'endDate', 'end_date', 'to', 'end', 'until'),
                responsibilities: coerceResponsibilities(
                    pick(w, 'responsibilities', 'description', 'duties',
                             'achievements', 'bullets', 'tasks', 'details')
                ),
            };
        }),

        education: Array.isArray(obj.education)
            ? (obj.education as unknown[]).map((ed, i) => {
                const e = (ed || {}) as Record<string, unknown>;
                return {
                    id:             coerceId(e.id, `edu_${i}`),
                    degree:         pickStr(e, 'degree', 'qualification', 'award',
                                              'program', 'field', 'fieldOfStudy'),
                    school:         pickStr(e, 'school', 'institution', 'university',
                                              'college', 'name'),
                    graduationYear: pickStr(e, 'graduationYear', 'graduation_year',
                                              'year', 'endDate', 'end_date', 'to'),
                };
            })
            : [],

        skills: rawSkills.map(coerceSkill).filter(Boolean),

        projects: (() => {
            const rawProj: unknown[] =
                Array.isArray(obj.projects) ? obj.projects :
                Array.isArray(obj.portfolio) ? obj.portfolio : [];
            return rawProj.map((pr, i) => {
                const p = (pr || {}) as Record<string, unknown>;
                return {
                    id:          coerceId(p.id, `proj_${i}`),
                    name:        pickStr(p, 'name', 'title', 'projectName', 'project_name'),
                    description: pickStr(p, 'description', 'summary', 'details', 'about'),
                    link:        pickStr(p, 'link', 'url', 'github', 'repo', 'demoUrl', 'demo_url'),
                };
            });
        })(),

        languages: Array.isArray(obj.languages)
            ? (obj.languages as unknown[]).map((la, i) => {
                const l = (la || {}) as Record<string, unknown>;
                return {
                    id:          coerceId(l.id, `lang_${i}`),
                    name:        pickStr(l, 'name', 'language'),
                    proficiency: pickStr(l, 'proficiency', 'level', 'fluency'),
                };
            })
            : [],

        references: Array.isArray(obj.references)
            ? (obj.references as unknown[]).map((re, i) => {
                const r = (re || {}) as Record<string, unknown>;
                return {
                    id:           coerceId(r.id, `ref_${i}`),
                    name:         pickStr(r, 'name', 'fullName', 'full_name'),
                    title:        pickStr(r, 'title', 'jobTitle', 'job_title', 'position'),
                    company:      pickStr(r, 'company', 'organization', 'employer'),
                    email:        pickStr(r, 'email'),
                    phone:        pickStr(r, 'phone', 'telephone'),
                    relationship: pickStr(r, 'relationship', 'relation', 'connection'),
                };
            })
            : undefined,

        // ── Optional extras ──────────────────────────────────────────────────
        customSections: Array.isArray(obj.customSections) ? obj.customSections as any : undefined,
        sectionOrder:   Array.isArray(obj.sectionOrder)   ? obj.sectionOrder   as any : undefined,
    };

    // ── Promote flat certifications / achievements / publications into customSections ──
    // Many JSON exports have these as top-level arrays alongside workExperience.
    // We convert them into the CustomSection format so profileToCV can map them
    // into CVData.certifications / CVData.achievements / CVData.publications.
    const extraSections: import('../types').CustomSection[] = [...(profile.customSections || [])];

    const rawCerts: unknown[] =
        Array.isArray(obj.certifications)   ? obj.certifications  :
        Array.isArray(obj.licenses)         ? obj.licenses        :
        Array.isArray(obj.licences)         ? obj.licences        : [];

    const rawAwards: unknown[] = [
        ...(Array.isArray(obj.awards)        ? obj.awards        : []),
        ...(Array.isArray(obj.achievements)  ? obj.achievements  : []),
        ...(Array.isArray(obj.honors)        ? obj.honors        : []),
        ...(Array.isArray(obj.honours)       ? obj.honours       : []),
    ];

    const rawPubs: unknown[] =
        Array.isArray(obj.publications) ? obj.publications :
        Array.isArray(obj.papers)       ? obj.papers       : [];

    const rawVolunteer: unknown[] =
        Array.isArray(obj.volunteer)         ? obj.volunteer       :
        Array.isArray(obj.volunteering)      ? obj.volunteering    :
        Array.isArray(obj.volunteerWork)     ? obj.volunteerWork   : [];

    if (rawCerts.length > 0) {
        extraSections.push({
            id:    'import_certs',
            type:  'certifications',
            label: 'Certifications',
            items: rawCerts.map((c, i) => {
                if (typeof c === 'string') return { id: `cert_${i}`, title: c };
                const co = (c || {}) as Record<string, unknown>;
                return {
                    id:       `cert_${i}`,
                    title:    pickStr(co, 'name', 'title', 'certification', 'cert', 'credential'),
                    subtitle: pickStr(co, 'issuer', 'organization', 'organisation', 'provider', 'by', 'institute'),
                    year:     pickStr(co, 'year', 'date', 'issued', 'issueDate', 'issue_date', 'validFrom'),
                };
            }).filter(item => item.title),
        });
    }

    if (rawAwards.length > 0) {
        extraSections.push({
            id:    'import_awards',
            type:  'achievements',
            label: 'Awards & Achievements',
            items: rawAwards.map((a, i) => {
                if (typeof a === 'string') return { id: `award_${i}`, title: a };
                const ao = (a || {}) as Record<string, unknown>;
                return {
                    id:          `award_${i}`,
                    title:       pickStr(ao, 'title', 'name', 'award', 'achievement'),
                    subtitle:    pickStr(ao, 'issuer', 'organization', 'organisation', 'company', 'awarder'),
                    year:        pickStr(ao, 'year', 'date', 'received'),
                    description: pickStr(ao, 'description', 'summary', 'detail'),
                };
            }).filter(item => item.title),
        });
    }

    if (rawPubs.length > 0) {
        extraSections.push({
            id:    'import_pubs',
            type:  'publications',
            label: 'Publications',
            items: rawPubs.map((p, i) => {
                if (typeof p === 'string') return { id: `pub_${i}`, title: p };
                const po = (p || {}) as Record<string, unknown>;
                const authors = Array.isArray(po.authors) ? (po.authors as unknown[]).map(coerceStr).filter(Boolean).join(', ') : '';
                return {
                    id:          `pub_${i}`,
                    title:       pickStr(po, 'name', 'title', 'paper'),
                    subtitle:    authors || pickStr(po, 'journal', 'publisher', 'conference', 'venue', 'publication'),
                    year:        pickStr(po, 'year', 'date', 'publishedAt', 'published_at'),
                    link:        pickStr(po, 'link', 'url', 'doi'),
                    description: pickStr(po, 'description', 'summary', 'abstract'),
                };
            }).filter(item => item.title),
        });
    }

    if (rawVolunteer.length > 0) {
        extraSections.push({
            id:    'import_volunteer',
            type:  'volunteer',
            label: 'Volunteer Work',
            items: rawVolunteer.map((v, i) => {
                if (typeof v === 'string') return { id: `vol_${i}`, title: v };
                const vo = (v || {}) as Record<string, unknown>;
                return {
                    id:          `vol_${i}`,
                    title:       pickStr(vo, 'role', 'position', 'title', 'jobTitle', 'job_title'),
                    subtitle:    pickStr(vo, 'organization', 'organisation', 'company', 'employer'),
                    year:        pickStr(vo, 'startDate', 'start_date', 'year', 'date'),
                    description: coerceResponsibilities(pick(vo, 'description', 'responsibilities', 'duties', 'summary')),
                };
            }).filter(item => item.title),
        });
    }

    if (extraSections.length > 0) {
        profile.customSections = extraSections;
    }

    return profile;
}
