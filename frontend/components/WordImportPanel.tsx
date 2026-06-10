import React, { useState, useCallback, useRef, useEffect } from 'react';
import { UserProfile } from '../types';
import { extractTextFromDocx, extractTextFromArrayBuffer, parseWordTextToProfile } from '../services/wordImportService';
import { downloadSharedFile, getSharedFileMetadata, getSavedSyncUrl, saveSyncUrl, clearSyncUrl } from '../services/oneDriveService';
import { Button } from './ui/Button';
import { RefreshCw, CheckCircle, AlertCircle, Download } from './icons';

const WordIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <polyline points="10 9 9 9 8 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

const UploadIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
);

const LinkIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
);

const OneDriveIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 48 48" fill="currentColor">
        <path d="M27.3 13.7a13.5 13.5 0 0 1 19 12.3c0 .4 0 .8-.1 1.2A9 9 0 0 1 45 36H27a9 9 0 0 1-9-9 9 9 0 0 1 9.3-9.3z" fill="#0078d4" />
        <path d="M20.3 16.8A10.5 10.5 0 0 0 10 27a10.5 10.5 0 0 0 .5 3.2A8 8 0 0 0 11 46H33a9 9 0 0 0 1.8-17.8 13.5 13.5 0 0 0-14.5-11.4z" fill="#1490df" />
        <path d="M10.5 30.2A8 8 0 0 0 11 46h22a9 9 0 0 0 1.8-17.8A13.7 13.7 0 0 1 27.3 36H18a8 8 0 0 1-7.5-5.8z" fill="#28a8e0" />
    </svg>
);

interface WordImportPanelProps {
    apiKeySet: boolean;
    openSettings: () => void;
    onProfileImported: (profile: UserProfile) => void;
    onJsonImported?: (profile: UserProfile) => void;
}

type ImportStep = 'idle' | 'extracting' | 'parsing' | 'preview' | 'done' | 'error';
type PanelMode = 'upload' | 'onedrive' | 'json';

function formatRelativeTime(date: Date): string {
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 5) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
}

const JsonIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="10" y2="13" />
        <line x1="14" y1="13" x2="16" y2="13" />
        <line x1="11" y1="10" x2="11" y2="16" />
        <line x1="13" y1="10" x2="13" y2="16" />
    </svg>
);

const WordImportPanel: React.FC<WordImportPanelProps> = ({ apiKeySet, openSettings, onProfileImported, onJsonImported }) => {
    const [mode, setMode] = useState<PanelMode>('upload');

    return (
        <div className="space-y-4">
            <div className="flex rounded-xl overflow-hidden border border-zinc-200 dark:border-neutral-700 p-0.5 bg-zinc-100 dark:bg-neutral-800 gap-0.5">
                <button
                    onClick={() => setMode('upload')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all ${mode === 'upload'
                        ? 'bg-white dark:bg-neutral-700 shadow text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                >
                    <UploadIcon className="h-4 w-4" />
                    Upload File
                </button>
                <button
                    onClick={() => setMode('onedrive')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all ${mode === 'onedrive'
                        ? 'bg-white dark:bg-neutral-700 shadow text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                >
                    <LinkIcon className="h-4 w-4" />
                    Word Online Sync
                </button>
                <button
                    onClick={() => setMode('json')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all ${mode === 'json'
                        ? 'bg-white dark:bg-neutral-700 shadow text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                >
                    <JsonIcon className="h-4 w-4" />
                    Import JSON
                </button>
            </div>

            {mode === 'upload' && (
                <UploadMode apiKeySet={apiKeySet} openSettings={openSettings} onProfileImported={onProfileImported} />
            )}
            {mode === 'onedrive' && (
                <OneDriveMode apiKeySet={apiKeySet} openSettings={openSettings} onProfileImported={onProfileImported} />
            )}
            {mode === 'json' && (
                <JsonImportMode onProfileImported={onProfileImported} onJsonImported={onJsonImported} />
            )}
        </div>
    );
};

// ── JSON Import ───────────────────────────────────────────────────────────────

interface JsonImportModeProps {
    onProfileImported: (profile: UserProfile) => void;
    onJsonImported?: (profile: UserProfile) => void;
}

function validateAndNormaliseProfile(raw: unknown): UserProfile {
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

    return profile;
}

const JsonImportMode: React.FC<JsonImportModeProps> = ({ onProfileImported, onJsonImported }) => {
    const [text, setText] = useState('');
    const [step, setStep] = useState<'idle' | 'preview' | 'done' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [parsedProfile, setParsedProfile] = useState<UserProfile | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const parseJson = useCallback((json: string) => {
        setError(null);
        try {
            const raw = JSON.parse(json);
            const profile = validateAndNormaliseProfile(raw);
            setParsedProfile(profile);
            setStep('preview');
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Could not parse JSON.';
            setError(msg);
            setStep('error');
        }
    }, []);

    const handleFile = useCallback((file: File) => {
        if (!file.name.match(/\.json$/i)) {
            setError('Please drop a .json file.');
            setStep('error');
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target?.result;
            if (typeof content === 'string') {
                setText(content);
                parseJson(content);
            }
        };
        reader.readAsText(file);
    }, [parseJson]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) { handleFile(file); return; }
        const dropped = e.dataTransfer.getData('text/plain');
        if (dropped) { setText(dropped); parseJson(dropped); }
    }, [handleFile, parseJson]);

    const handleApply = useCallback(() => {
        if (!parsedProfile) return;
        if (onJsonImported) {
            onJsonImported(parsedProfile);
        } else {
            onProfileImported(parsedProfile);
        }
        setStep('done');
    }, [parsedProfile, onProfileImported, onJsonImported]);

    const reset = () => {
        setText(''); setStep('idle'); setError(null); setParsedProfile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-violet-50/60 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800/40">
                <div className="p-2.5 bg-violet-600 rounded-xl flex-shrink-0">
                    <JsonIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Import ProCV JSON</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Paste the JSON output from the ProCV master prompt — or drop a <strong>.json</strong> file. No AI processing needed; the data is mapped directly.
                    </p>
                </div>
            </div>

            {(step === 'idle' || step === 'error') && (
                <>
                    {/* Drop zone + textarea */}
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        className={`relative rounded-2xl border-2 border-dashed transition-all ${isDragging
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                            : 'border-zinc-300 dark:border-neutral-600'
                        }`}
                    >
                        <textarea
                            value={text}
                            onChange={e => setText(e.target.value)}
                            placeholder={'Paste your ProCV JSON here…\n\nOr drop a .json file onto this area.'}
                            rows={10}
                            className="w-full bg-transparent resize-none rounded-2xl px-4 py-3 text-xs font-mono text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400 dark:focus:ring-violet-600"
                            spellCheck={false}
                        />
                        {isDragging && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-violet-50/80 dark:bg-violet-900/40 pointer-events-none">
                                <p className="text-sm font-semibold text-violet-600 dark:text-violet-300">Drop .json file here</p>
                            </div>
                        )}
                    </div>

                    {/* File pick alternative */}
                    <div className="flex items-center gap-3">
                        <input ref={fileInputRef} type="file" accept=".json" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="hidden" />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                        >
                            Browse for a .json file instead
                        </button>
                        <span className="text-zinc-300 dark:text-neutral-600">·</span>
                        <button
                            onClick={() => parseJson(text)}
                            disabled={!text.trim()}
                            className="ml-auto px-4 py-1.5 text-sm font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white transition-colors"
                        >
                            Parse JSON
                        </button>
                    </div>

                    {step === 'error' && error && (
                        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
                        </div>
                    )}
                </>
            )}

            {step === 'preview' && parsedProfile && (
                <ProfilePreview
                    parsedProfile={parsedProfile}
                    onApply={handleApply}
                    onReset={reset}
                    applyLabel="Import to My Profile"
                    resetLabel="Edit JSON"
                />
            )}

            {step === 'done' && <DoneState onReset={reset} resetLabel="Import Another JSON" />}
        </div>
    );
};

const UploadMode: React.FC<WordImportPanelProps> = ({ apiKeySet, openSettings, onProfileImported }) => {
    const [step, setStep] = useState<ImportStep>('idle');
    const [error, setError] = useState<string | null>(null);
    const [parsedProfile, setParsedProfile] = useState<UserProfile | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFile = useCallback(async (file: File) => {
        if (!file) return;
        if (!file.name.match(/\.docx?$/i)) {
            setError('Please upload a .docx file. .doc files are not supported — save as .docx first.');
            setStep('error');
            return;
        }
        if (!apiKeySet) { openSettings(); return; }
        setError(null);
        setStep('extracting');
        try {
            const text = await extractTextFromDocx(file);
            setStep('parsing');
            const profile = await parseWordTextToProfile(text);
            setParsedProfile(profile);
            setStep('preview');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to parse the Word document.');
            setStep('error');
        }
    }, [apiKeySet, openSettings]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    }, [processFile]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    }, [processFile]);

    const handleApply = useCallback(() => {
        if (!parsedProfile) return;
        onProfileImported(parsedProfile);
        setStep('done');
    }, [parsedProfile, onProfileImported]);

    const reset = () => {
        setStep('idle'); setError(null); setParsedProfile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40">
                <div className="p-2.5 bg-blue-600 rounded-xl flex-shrink-0">
                    <WordIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Import from Word Document</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Upload your existing CV as a <strong>.docx</strong> file. Our AI will extract your information and import it into your profile.
                    </p>
                </div>
            </div>

            {(step === 'idle' || step === 'error') && (
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${isDragging
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-zinc-300 dark:border-neutral-600 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-900/10'
                        }`}
                >
                    <input ref={fileInputRef} type="file" accept=".docx" onChange={handleFileChange} className="hidden" />
                    <UploadIcon className="h-10 w-10 mx-auto mb-3 text-blue-400" />
                    <p className="font-bold text-zinc-700 dark:text-zinc-300">Drop your .docx file here</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">or click to browse</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-3">Microsoft Word (.docx) • Max 10MB</p>
                </div>
            )}

            {step === 'error' && error && (
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
                </div>
            )}

            {(step === 'extracting' || step === 'parsing') && <ParseLoadingState step={step} />}

            {step === 'preview' && parsedProfile && (
                <ProfilePreview parsedProfile={parsedProfile} onApply={handleApply} onReset={reset}
                    applyLabel="Import to My Profile" resetLabel="Try Another File" />
            )}

            {step === 'done' && <DoneState onReset={reset} resetLabel="Import Another File" />}
        </div>
    );
};

const OneDriveMode: React.FC<WordImportPanelProps> = ({ apiKeySet, openSettings, onProfileImported }) => {
    const [urlInput, setUrlInput] = useState('');
    const [savedUrl, setSavedUrl] = useState<string | null>(getSavedSyncUrl);
    const [fileName, setFileName] = useState<string | null>(null);
    const [step, setStep] = useState<ImportStep>('idle');
    const [error, setError] = useState<string | null>(null);
    const [parsedProfile, setParsedProfile] = useState<UserProfile | null>(null);
    const [liveSync, setLiveSync] = useState(false);
    const [lastSynced, setLastSynced] = useState<Date | null>(null);
    const [lastETag, setLastETag] = useState<string | null>(null);
    const [relativeTime, setRelativeTime] = useState('');
    const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isSyncingRef = useRef(false);

    useEffect(() => {
        if (!lastSynced) return;
        setRelativeTime(formatRelativeTime(lastSynced));
        const t = setInterval(() => setRelativeTime(formatRelativeTime(lastSynced)), 15000);
        return () => clearInterval(t);
    }, [lastSynced]);

    const runSync = useCallback(async (url: string, checkChanged = false) => {
        if (!apiKeySet) { openSettings(); return; }
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        setError(null);

        try {
            if (checkChanged) {
                try {
                    const meta = await getSharedFileMetadata(url);
                    if (meta.eTag && meta.eTag === lastETag) {
                        isSyncingRef.current = false;
                        return;
                    }
                    if (meta.eTag) setLastETag(meta.eTag);
                    if (meta.name) setFileName(meta.name);
                } catch {
                    // metadata fetch failed — proceed to full download
                }
            }

            setStep('extracting');
            const buffer = await downloadSharedFile(url);
            setStep('parsing');
            const text = await extractTextFromArrayBuffer(buffer);
            const profile = await parseWordTextToProfile(text);
            setParsedProfile(profile);
            setLastSynced(new Date());
            setStep('preview');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Sync failed. Check the sharing link and try again.');
            setStep('error');
        } finally {
            isSyncingRef.current = false;
        }
    }, [apiKeySet, openSettings, lastETag]);

    const handleConnect = useCallback(async () => {
        const url = urlInput.trim();
        if (!url) return;
        if (!url.startsWith('http')) {
            setError('Please paste a valid sharing link (Google Docs, OneDrive, or Word Online) starting with https://');
            return;
        }
        saveSyncUrl(url);
        setSavedUrl(url);
        setUrlInput('');
        setStep('idle');
        setParsedProfile(null);
        setLastSynced(null);
        setLastETag(null);
        setFileName(null);

        try {
            const meta = await getSharedFileMetadata(url);
            if (meta.name) setFileName(meta.name);
            if (meta.eTag) setLastETag(meta.eTag);
        } catch { }

        await runSync(url, false);
    }, [urlInput, runSync]);

    const handleDisconnect = useCallback(() => {
        clearSyncUrl();
        setSavedUrl(null);
        setFileName(null);
        setParsedProfile(null);
        setStep('idle');
        setError(null);
        setLastSynced(null);
        setLiveSync(false);
    }, []);

    useEffect(() => {
        if (!liveSync || !savedUrl) {
            if (syncIntervalRef.current) { clearInterval(syncIntervalRef.current); syncIntervalRef.current = null; }
            return;
        }
        syncIntervalRef.current = setInterval(() => {
            if (savedUrl) runSync(savedUrl, true);
        }, 30000);
        return () => {
            if (syncIntervalRef.current) { clearInterval(syncIntervalRef.current); syncIntervalRef.current = null; }
        };
    }, [liveSync, savedUrl, runSync]);

    const handleApply = useCallback(() => {
        if (!parsedProfile) return;
        onProfileImported(parsedProfile);
        setStep('done');
    }, [parsedProfile, onProfileImported]);

    const resetPreview = () => {
        setStep(savedUrl ? 'idle' : 'idle');
        setParsedProfile(null);
    };

    return (
        <div className="space-y-4">
            {/* Supported sources chips */}
            {!savedUrl && (
                <div className="flex flex-wrap gap-2">
                    {[
                        { label: 'Google Docs', color: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40' },
                        { label: 'Word Online (1drv.ms)', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40' },
                        { label: 'OneDrive (onedrive.live.com)', color: 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-800/40' },
                    ].map(s => (
                        <span key={s.label} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${s.color}`}>{s.label}</span>
                    ))}
                </div>
            )}

            {/* Step-by-step guide — shown when no URL saved */}
            {!savedUrl && (
                <div className="rounded-2xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-hidden">
                    <div className="px-4 py-3 border-b border-zinc-100 dark:border-neutral-700">
                        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">How to get the sharing link</p>
                    </div>
                    <div className="p-4 space-y-4">
                        {/* Google Docs */}
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-green-600 dark:text-green-400 mb-2">Google Docs</p>
                            <div className="space-y-2 pl-1">
                                <p className="text-xs text-zinc-600 dark:text-zinc-300">Open your CV in Google Docs → click <strong>Share</strong> (top-right) → change to <strong>"Anyone with the link"</strong> → <strong>Copy link</strong>. Paste the <code className="bg-zinc-100 dark:bg-neutral-700 px-1 rounded text-[10px]">docs.google.com/…</code> link below.</p>
                            </div>
                        </div>
                        <div className="border-t border-zinc-100 dark:border-neutral-700" />
                        {/* OneDrive / Word Online */}
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-2">OneDrive / Word Online</p>
                            <div className="space-y-2 pl-1">
                                <p className="text-xs text-zinc-600 dark:text-zinc-300">Open your .docx in Word Online → click <strong>Share</strong> → set to <strong>"Anyone with the link can view"</strong> → <strong>Copy</strong>. Paste the <code className="bg-zinc-100 dark:bg-neutral-700 px-1 rounded text-[10px]">1drv.ms/…</code> or <code className="bg-zinc-100 dark:bg-neutral-700 px-1 rounded text-[10px]">onedrive.live.com/…</code> link below.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Connected file info */}
            {savedUrl && step !== 'done' && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40">
                    <div className="p-1.5 bg-blue-600 rounded-lg flex-shrink-0">
                        <WordIcon className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                            {fileName || (savedUrl?.includes('docs.google.com') ? 'Google Document' : 'Word document')}
                        </p>
                        <p className="text-xs text-zinc-400">
                            {lastSynced ? `Last synced: ${relativeTime}` : 'Connected via sharing link'}
                        </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {(step === 'preview' || step === 'idle') && savedUrl && (
                            <button
                                onClick={() => runSync(savedUrl, false)}
                                className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
                                title="Sync now"
                            >
                                <RefreshCw className="h-4 w-4" />
                            </button>
                        )}
                        <button
                            onClick={handleDisconnect}
                            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-neutral-700 text-zinc-400 transition-colors"
                            title="Disconnect"
                        >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* URL input — show when no URL, or when disconnected */}
            {!savedUrl && (
                <div className="space-y-2">
                    <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Paste your sharing link</label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                            <input
                                type="url"
                                value={urlInput}
                                onChange={e => { setUrlInput(e.target.value); setError(null); }}
                                onKeyDown={e => e.key === 'Enter' && handleConnect()}
                                placeholder="https://docs.google.com/… or https://1drv.ms/…"
                                className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <Button
                            onClick={handleConnect}
                            disabled={!urlInput.trim() || step === 'extracting' || step === 'parsing'}
                            className="bg-blue-600 hover:bg-blue-700 text-white border-0 rounded-xl px-4 shrink-0 disabled:opacity-50"
                        >
                            Connect
                        </Button>
                    </div>
                    <p className="text-xs text-zinc-400">
                        The link must be set to <strong>"Anyone with the link can view"</strong> — private links won't work.
                    </p>
                </div>
            )}

            {/* Error */}
            {step === 'error' && error && (
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm space-y-2">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span className="whitespace-pre-line">{error}</span>
                    </div>
                    <button onClick={() => { setStep('idle'); setError(null); }} className="text-xs underline text-rose-500 hover:text-rose-700">Try again</button>
                </div>
            )}

            {/* Loading */}
            {(step === 'extracting' || step === 'parsing') && <ParseLoadingState step={step} />}

            {/* Live sync toggle — show when connected and preview is ready */}
            {savedUrl && step === 'preview' && (
                <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
                    <div>
                        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Live Sync</p>
                        <p className="text-xs text-zinc-400 mt-0.5">Auto-checks for changes every 30 seconds</p>
                    </div>
                    <button
                        onClick={() => setLiveSync(v => !v)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${liveSync ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-neutral-600'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${liveSync ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
            )}

            {liveSync && step === 'preview' && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2">
                    <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    Live sync active — checks for changes every 30 seconds. Edit in Word Online and your profile updates here.
                </div>
            )}

            {/* Preview */}
            {step === 'preview' && parsedProfile && (
                <ProfilePreview
                    parsedProfile={parsedProfile}
                    onApply={handleApply}
                    onReset={resetPreview}
                    applyLabel="Import to My Profile"
                    resetLabel="Cancel"
                />
            )}

            {step === 'done' && (
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <CheckCircle className="h-8 w-8 text-emerald-500" />
                    </div>
                    <div>
                        <p className="font-bold text-xl text-zinc-800 dark:text-zinc-200">Profile Imported!</p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                            Head to the CV Generator to apply a template. The sync link is saved — come back anytime to re-sync.
                        </p>
                    </div>
                    {savedUrl && (
                        <Button onClick={() => { setStep('preview'); setParsedProfile(parsedProfile); }} className="rounded-xl border border-zinc-200 dark:border-neutral-700 px-5">
                            Back to Preview
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};

const ParseLoadingState: React.FC<{ step: 'extracting' | 'parsing' }> = ({ step }) => (
    <div className="flex flex-col items-center gap-4 py-12">
        <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <WordIcon className="h-8 w-8 text-blue-500" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-violet-600 rounded-full flex items-center justify-center">
                <RefreshCw className="h-3.5 w-3.5 text-white animate-spin" />
            </div>
        </div>
        <div className="text-center">
            <p className="font-bold text-zinc-800 dark:text-zinc-200">
                {step === 'extracting' ? 'Downloading your Word document…' : 'AI is extracting your profile data…'}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                {step === 'extracting' ? 'Fetching via sharing link' : 'This takes about 10–20 seconds'}
            </p>
        </div>
        <div className="flex gap-1.5">
            {(['extracting', 'parsing'] as const).map((s, i) => (
                <div key={s} className={`h-1.5 rounded-full transition-all ${step === s ? 'w-8 bg-blue-500' : i < (['extracting', 'parsing'] as const).indexOf(step) ? 'w-4 bg-blue-300' : 'w-4 bg-zinc-200 dark:bg-neutral-700'}`} />
            ))}
        </div>
    </div>
);

interface ProfilePreviewProps {
    parsedProfile: UserProfile;
    onApply: () => void;
    onReset: () => void;
    applyLabel: string;
    resetLabel: string;
}

const ProfilePreview: React.FC<ProfilePreviewProps> = ({ parsedProfile, onApply, onReset, applyLabel, resetLabel }) => (
    <div className="space-y-4">
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
            <CheckCircle className="h-4 w-4" /> Profile extracted successfully! Review below, then click "{applyLabel}".
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
                { label: 'Work Roles', count: parsedProfile.workExperience.length, color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300' },
                { label: 'Education', count: parsedProfile.education.length, color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
                { label: 'Skills', count: parsedProfile.skills.length, color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
                { label: 'Projects', count: parsedProfile.projects?.length || 0, color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
            ].map(item => (
                <div key={item.label} className={`${item.color} rounded-xl p-3 text-center`}>
                    <div className="text-2xl font-black">{item.count}</div>
                    <div className="text-xs font-semibold mt-0.5">{item.label}</div>
                </div>
            ))}
        </div>

        <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Extracted Data Preview</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {parsedProfile.personalInfo.name && (
                    <div><span className="text-zinc-400 text-xs">Name</span><br /><span className="font-semibold">{parsedProfile.personalInfo.name}</span></div>
                )}
                {parsedProfile.personalInfo.email && (
                    <div><span className="text-zinc-400 text-xs">Email</span><br /><span className="font-semibold">{parsedProfile.personalInfo.email}</span></div>
                )}
                {parsedProfile.personalInfo.phone && (
                    <div><span className="text-zinc-400 text-xs">Phone</span><br /><span className="font-semibold">{parsedProfile.personalInfo.phone}</span></div>
                )}
                {parsedProfile.personalInfo.location && (
                    <div><span className="text-zinc-400 text-xs">Location</span><br /><span className="font-semibold">{parsedProfile.personalInfo.location}</span></div>
                )}
            </div>
            {parsedProfile.workExperience.length > 0 && (
                <div>
                    <span className="text-zinc-400 text-xs">Latest Role</span><br />
                    <span className="font-semibold text-sm">{parsedProfile.workExperience[0].jobTitle}</span>
                    <span className="text-zinc-500 text-xs"> @ {parsedProfile.workExperience[0].company}</span>
                </div>
            )}
            {parsedProfile.skills.length > 0 && (
                <div>
                    <span className="text-zinc-400 text-xs block mb-1.5">Skills Preview</span>
                    <div className="flex flex-wrap gap-1">
                        {parsedProfile.skills.slice(0, 12).map(s => (
                            <span key={s} className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-neutral-700 rounded-full text-zinc-600 dark:text-zinc-400">{s}</span>
                        ))}
                        {parsedProfile.skills.length > 12 && (
                            <span className="text-xs text-zinc-400">+{parsedProfile.skills.length - 12} more</span>
                        )}
                    </div>
                </div>
            )}
        </div>

        <div className="flex flex-wrap gap-3">
            <Button onClick={onApply} className="bg-blue-600 hover:bg-blue-700 text-white border-0 rounded-xl px-6 shadow shadow-blue-500/20">
                <Download className="h-4 w-4 mr-2" /> {applyLabel}
            </Button>
            <Button onClick={onReset} className="rounded-xl border border-zinc-200 dark:border-neutral-700 px-5">
                {resetLabel}
            </Button>
        </div>
    </div>
);

const DoneState: React.FC<{ onReset: () => void; resetLabel: string }> = ({ onReset, resetLabel }) => (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-emerald-500" />
        </div>
        <div>
            <p className="font-bold text-xl text-zinc-800 dark:text-zinc-200">Profile Imported!</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Your data is now in your profile. Head to the CV Generator to apply a template.</p>
        </div>
        <Button onClick={onReset} className="rounded-xl border border-zinc-200 dark:border-neutral-700 px-5">
            {resetLabel}
        </Button>
    </div>
);

export default WordImportPanel;
