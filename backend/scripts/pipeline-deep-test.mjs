#!/usr/bin/env node
/**
 * pipeline-deep-test.mjs
 *
 * True end-to-end pipeline probe for ProCV.
 *
 * What this does:
 *   1. Loads banned phrases + verb pool from the live CF Worker
 *   2. Builds a structured preamble (profile + JD + rules + schema)
 *   3. Calls /api/cv/parallel-sections (Mistral Small 3.1 24B via workers-ai)
 *      — same model the real app uses in production
 *   4. Assembles the raw AI output into a CVData object
 *   5. Runs EVERY quality rule inline:
 *        banned phrases · fake verbs · seeking opener · buzzwords
 *        tense (3rd-person-singular / imperative) · first-person pronouns
 *        preposition openers · metric density · bullet length
 *        opener diversity · verb cluster dominance · phrase repetition
 *        round-number saturation · ATS keyword coverage
 *   6. Prints a full human-readable report:
 *        ✅ PASS  ⚠️ WARN  ❌ FAIL — with exact quotes and locations
 *   7. Dumps the assembled CV text so you can read it in full
 *
 * No API keys needed — the CF Worker uses its own workers-ai budget.
 *
 * Usage:
 *   node backend/scripts/pipeline-deep-test.mjs
 *   node backend/scripts/pipeline-deep-test.mjs --jd=devops
 *   node backend/scripts/pipeline-deep-test.mjs --verbose
 *   node backend/scripts/pipeline-deep-test.mjs --section-dump
 */

const ENGINE_URL  = process.env.VITE_CV_ENGINE_URL || 'https://cv-engine-worker.dripstech.workers.dev';
const VERBOSE     = process.argv.includes('--verbose');
const SECTION_DUMP = process.argv.includes('--section-dump');
const jdArg       = process.argv.find(a => a.startsWith('--jd='))?.split('=')[1];

const BOLD  = s => `\x1b[1m${s}\x1b[0m`;
const DIM   = s => `\x1b[2m${s}\x1b[0m`;
const GREEN = s => `\x1b[32m${s}\x1b[0m`;
const RED   = s => `\x1b[31m${s}\x1b[0m`;
const YEL   = s => `\x1b[33m${s}\x1b[0m`;
const CYAN  = s => `\x1b[36m${s}\x1b[0m`;

// ─── Job descriptions ─────────────────────────────────────────────────────────

const JD_FIXTURES = {
    swe: {
        label: 'Senior Software Engineer — FinTech Platform',
        jd: `We are looking for a Senior Software Engineer to join our payments platform team.
You will design and build scalable backend services in Python and Go, deploy on AWS using
Kubernetes and Terraform, and own CI/CD pipeline reliability. We process £2B+ in annual
payment volume. Requirements: 5+ years, Python, Go, AWS, Kubernetes, Docker, PostgreSQL,
Redis, REST APIs, microservices, Agile/Scrum. Nice to have: GraphQL, Kafka, Terraform.`,
    },
    pm: {
        label: 'Senior Product Manager — Consumer Mobile App',
        jd: `We need a Senior Product Manager to own our consumer mobile app roadmap (4M users).
Define product strategy, write PRDs, run user research, work closely with design (Figma)
and engineering, manage the backlog in Jira, track OKRs, and drive A/B test programmes.
Requirements: 4+ years PM, consumer mobile, user research, Figma, Jira, Agile, A/B testing,
cross-functional leadership, data-driven decision making, growth metrics.`,
    },
    devops: {
        label: 'DevOps / Platform Engineer — Cloud Infrastructure',
        jd: `DevOps Engineer to own our cloud infrastructure and developer experience.
Responsibilities: build and maintain IaC with Terraform and Pulumi, manage GKE clusters,
implement observability with Datadog and PagerDuty, improve CI/CD pipelines in GitHub Actions.
Requirements: 4+ years DevOps/SRE, GCP or AWS, Kubernetes, Terraform, Docker, GitHub Actions,
Linux, Bash scripting, SLO/SLA management, incident response, on-call rotation.`,
    },
    data: {
        label: 'Data Analyst — Finance / FP&A',
        jd: `Seeking a Data Analyst to support our FP&A team with financial modelling and reporting.
Responsibilities: build dashboards in Tableau and Power BI, write complex SQL queries against
our Snowflake data warehouse, own the monthly board reporting pack, support budget planning.
Requirements: 3+ years analytics, advanced SQL, Python (pandas, numpy), Tableau, Power BI,
Excel modelling, financial data, cross-functional collaboration, stakeholder management.`,
    },
};

const fixture = JD_FIXTURES[jdArg] ?? JD_FIXTURES.swe;

// ─── Candidate profile ────────────────────────────────────────────────────────

const PROFILE = {
    name: 'Jordan Clarke',
    title: 'Senior Software Engineer / Tech Lead',
    summary_hint: '7 years in fintech and payments infrastructure; strong Python and Go background.',
    experience: [
        {
            jobTitle: 'Senior Software Engineer',
            company: 'NovaPay Ltd',
            startDate: 'Feb 2021',
            endDate: 'Present',
            isCurrent: true,
            teamSize: 9,
            budget: '£800K annual infra budget',
            context: 'Payments core — owns real-time settlement engine processing £2.1B/yr',
            achievements: [
                'Rebuilt settlement engine in Go; p99 latency dropped from 380ms to 47ms',
                'Led migration from monolith to 12 microservices on Kubernetes; zero-downtime cutover across 3 regions',
                'Reduced AWS spend by 34% by right-sizing EC2 fleet and adopting Graviton2',
                'Mentored 4 junior engineers; 2 promoted to mid-level within 18 months',
                'Designed Kafka-based event-sourcing layer handling 1.2M events/day',
            ],
        },
        {
            jobTitle: 'Software Engineer',
            company: 'Consulting Ltd',
            startDate: 'Sep 2018',
            endDate: 'Jan 2021',
            isCurrent: false,
            teamSize: 4,
            context: 'Full-stack engineering across 6 client projects (retail, insurance, logistics)',
            achievements: [
                'Built REST APIs in Python/Django serving 400K daily active users for a major UK retailer',
                'Designed PostgreSQL schemas for 3 greenfield projects; documented with dbt models',
                'Automated nightly ETL pipeline (Python + Airflow); reduced data lag from 6 hours to 22 minutes',
                'Delivered PCI-DSS scoping and remediation for an insurance client; passed external audit first attempt',
            ],
        },
        {
            jobTitle: 'Junior Developer',
            company: 'StartupInc',
            startDate: 'Jul 2017',
            endDate: 'Aug 2018',
            isCurrent: false,
            teamSize: 3,
            context: 'Early-stage SaaS; wore multiple hats across frontend and backend',
            achievements: [
                'Built React dashboards for internal analytics tools',
                'Contributed to Node.js microservice for user authentication',
            ],
        },
    ],
    education: [
        { degree: 'BSc Computer Science (2:1)', school: 'University of Manchester', year: '2017' },
        { degree: 'AWS Certified Solutions Architect – Associate', school: 'Amazon Web Services', year: '2022' },
    ],
    skills: ['Python', 'Go', 'JavaScript', 'React', 'Node.js', 'AWS', 'GCP', 'Docker',
             'Kubernetes', 'Terraform', 'PostgreSQL', 'Redis', 'Kafka', 'REST APIs',
             'Microservices', 'CI/CD', 'GitHub Actions', 'Datadog', 'Agile', 'SQL'],
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function workerGet(path, params = {}) {
    const u = new URL(path, ENGINE_URL);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const r = await fetch(u.toString(), { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`GET ${path} → HTTP ${r.status}`);
    return r.json();
}

async function workerPost(path, body, timeoutMs = 120000) {
    const r = await fetch(new URL(path, ENGINE_URL).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`POST ${path} → HTTP ${r.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
}

// ─── Build prompt preamble (mirrors what geminiService.ts constructs) ─────────

function buildPreamble(profile, jd, bannedPhrases) {
    const compactProfile = JSON.stringify({
        name: profile.name,
        title: profile.title,
        skills: profile.skills.slice(0, 16),
        experience: profile.experience.map(e => ({
            jobTitle: e.jobTitle,
            company: e.company,
            startDate: e.startDate,
            endDate: e.endDate,
            isCurrent: e.isCurrent,
            teamSize: e.teamSize,
            context: e.context,
            achievements: e.achievements,
        })),
        education: profile.education,
    });

    const topBanned = bannedPhrases.slice(0, 30).join(', ');

    return `=== CANDIDATE PROFILE (SOURCE OF TRUTH — never invent facts not in this block) ===
${compactProfile}

=== JOB DESCRIPTION TO TARGET ===
${jd}

=== ENGINE BRIEF ===
Seniority: Senior / Lead
Field: Software Engineering / Technology
Voice: Direct, data-driven, understated confidence
Mode: Balanced (strong experience match)

=== ABSOLUTE RULES (violations will fail QA) ===
1. NEVER use first-person pronouns: I, I'm, I've, I'd, my, me, we, our, us — zero exceptions.
2. TENSE: Current role (endDate = "Present") → base-form imperative verbs (Lead, Build, Design).
   Past roles → past-tense verbs (Led, Built, Designed). NEVER third-person singular (Leads, Builds).
3. OPENER VARIETY: No 3+ consecutive verb-led bullets. After 1–2 verb openers use a number/context/outcome opener.
4. BANNED OPENERS (auto-flagged): any bullet starting with: by, of, to, with, at, from, for, in, on, across, over, under.
5. BANNED PHRASES (zero tolerance): ${topBanned}
6. METRIC DENSITY: 2–3 of every 5 bullets must contain a specific number or %.
7. BULLET LENGTH: minimum 10 words. Mix short punchy (10–14 words) with fuller (15–22 words).
8. NO invented verbs: greenfielded, scaffolded, materialized, actioned, ideated, solutioned.
9. Summary: minimum 60 words. Opens with candidate's VALUE, never "Seeking to" / "Looking to".
10. Output ONLY valid JSON matching the schema. No markdown, no prose outside schema.`;
}

function buildSchema() {
    return `
=== OUTPUT SCHEMA (return ONLY valid compact JSON — no markdown, no explanation) ===
{
  "summary": "string (60–90 words, candidate value proposition)",
  "skills": ["string (12 skills, JD-relevant, no duplicates)"],
  "experience": [
    {
      "company": "string",
      "jobTitle": "string",
      "dates": "Mon YYYY – Mon YYYY or Present",
      "startDate": "Mon YYYY",
      "endDate": "Mon YYYY or Present",
      "responsibilities": ["string (exactly 5 bullets per role, imperative for current, past-tense for previous)"]
    }
  ],
  "education": [
    { "degree": "string", "school": "string", "year": "YYYY", "description": "" }
  ],
  "languages": []
}`;
}

// ─── Quality rules (full suite) ───────────────────────────────────────────────

const BANNED_PHRASES_LOCAL = [
    [/\bleveraging\b/gi, 'using'],        [/\bleveraged\b/gi, 'used'],
    [/\bleverage\b/gi, 'use'],            [/\bspearheaded\b/gi, 'led'],
    [/\butilized\b/gi, 'used'],           [/\butilised\b/gi, 'used'],
    [/\bfacilitated\b/gi, 'enabled'],     [/\bsynergy\b/gi, 'collaboration'],
    [/\binnovative solutions?\b/gi, ''],  [/\bbest practices?\b/gi, 'proven methods'],
    [/\bpassion for\b/gi, 'focus on'],    [/\bresults[- ]driven\b/gi, 'delivery-focused'],
    [/\bdetail[- ]oriented\b/gi, 'thorough'], [/\bteam player\b/gi, 'collaborator'],
    [/\bgreenfielded\b/gi, 'built'],      [/\bscaffolded\b/gi, 'established'],
    [/\bmaterialized\b/gi, 'developed'],  [/\bactioned\b/gi, 'completed'],
    [/\bideated\b/gi, 'developed'],       [/\bsolutioned\b/gi, 'resolved'],
    [/\bhighly motivated\b/gi, ''],       [/\bdynamic\s+/gi, ''],
    [/\bseamlessly\b/gi, 'efficiently'],  [/\brobust\b/gi, 'reliable'],
    [/\bholistic\b/gi, ''],               [/\bsynergize\b/gi, 'align'],
    [/\bthought leader\b/gi, ''],         [/\bimpactful\b/gi, ''],
    [/\bgroundbreaking\b/gi, ''],         [/\binnovative\b/gi, ''],
];

const SEEKING_PATTERN   = /\b(seeking to|looking to|aiming to|hoping to|eager to join|excited to contribute|in search of)\b/i;
const FAKE_VERB_PATTERN = /\b(greenfielded?|scaffolded?|materialized?|actioned?|ideated?|solutioned?|conceptualized?|operationalized?)\b/i;
const BANNED_OPENER_RX  = /^(spearheaded?|orchestrated?|leveraged?|utilized?|facilitated?|empowered?|championed?)\b/i;
const BUZZWORD_RX       = /\b(highly motivated|results-driven|results-oriented|passionate about|detail-oriented|team player|self-starter|go-getter|dynamic professional|thought leader)\b/i;
const FIRST_PERSON_RX   = /\b(?:I|I'm|I've|I'd|I'll|my|me|myself|we|our|ours|us|ourselves)\b/;
const ARROW_RX          = /\s*→\s*/;
const METRIC_IN_BULLET  = /\b\d[\d,.]*\s*(%|K|M|B|x|×|\+\s*years?|users?|clients?|employees?|staff|projects?|services?|regions?|events?|ms|GB|TB)\b/i;
const CHAINED_METRIC_RX = /\b\d+\s*%[^.]{0,60}(?:resulting in|leading to|which led to|driving)\s*\d+\s*%/i;
const EMPTY_METRIC_RX   = /\b(generat(?:e|es|ed|ing)|sav(?:e|es|ed|ing)|reduc(?:e|es|ed|ing)|increas(?:e|es|ed|ing)|cut(?:s|ting)?|achiev(?:e|es|ed|ing)|driv(?:e|es|n|ing)|deliver(?:s|ed|ing))\s+in\s+\w/gi;
const WEAK_OPENER_RX    = /^(responsible for|was responsible|helped to|assisted with|worked on|tasked with|involved in|participated in|duties included)\b/i;
const TPS_VERBS         = new Set(['generates','delivers','maintains','improves','reduces','coordinates','leads','drives','manages','builds','designs','develops','implements','provides','supports','creates','optimizes','optimises','analyzes','analyses','collaborates','trains','conducts','oversees','streamlines','executes','launches','handles','monitors','evaluates','performs','presents','writes','edits','tests','deploys','resolves','mentors','advises','achieves','reviews','tracks','reports','identifies','communicates','assists','negotiates','forecasts','plans','organizes','organises']);
const STUB_FIRST_WORDS  = new Set(['by','of','to','with','at','from','for','in','on','across','over','under','above','below']);

const SCOPE_RX     = /^(across|for|throughout|covering|spanning|serving|supporting)\b/i;
const CONTEXT_RX   = /^(as|after|during|following|while|when|upon|having|given|since|once|before)\b/i;
const TIMEFRAME_RX = /^(?:in\s+(?:q[1-4]|20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|over\s+(?:the\s+)?(?:\d+|two|three|four|five|six)|within\s+(?:\d+|one|two|three|four|six|twelve))\b/i;
const OUTCOME_RX   = /^(?:top\s+performer|ranked|awarded|recognised|recognized|promoted|selected|certified)\b/i;
const NUMBER_WORDS = new Set(['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','twenty','thirty','forty','fifty','hundred','thousand','million','billion']);

function classifyOpener(bullet) {
    const s = (bullet || '').replace(/^[\s•\-*·»"']+/, '').trim();
    if (!s) return 'fragment';
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length <= 4) return 'fragment';
    const first = words[0]?.toLowerCase() ?? '';
    if (/^\d/.test(first) || NUMBER_WORDS.has(first)) return 'number';
    if (CONTEXT_RX.test(s))   return 'context';
    if (TIMEFRAME_RX.test(s)) return 'timeframe';
    if (OUTCOME_RX.test(s))   return 'outcome';
    if (SCOPE_RX.test(s))     return 'scope';
    return 'verb';
}

const VERB_CLUSTERS = {
    leadership:  /^(?:led|managed|directed|supervised|oversaw|governed|headed|owned)\b/i,
    build:       /^(?:built|developed|created|designed|engineered|architected|launched|deployed|implemented|shipped)\b/i,
    growth:      /^(?:increased|grew|expanded|improved|enhanced|boosted|accelerated|scaled|doubled|tripled)\b/i,
    reduce:      /^(?:reduced|cut|streamlined|optimized|optimised|automated|simplified|refactored|eliminated)\b/i,
    analyze:     /^(?:analyzed|analysed|assessed|evaluated|reviewed|audited|investigated|researched|identified|benchmarked)\b/i,
    deliver:     /^(?:delivered|executed|completed|finished|produced|generated|achieved|hit|exceeded)\b/i,
};

function gatherCVText(cv) {
    const parts = [];
    if (cv.summary) parts.push(cv.summary);
    (cv.experience || []).forEach(e => (e.responsibilities || []).forEach(b => parts.push(b)));
    (cv.education || []).forEach(e => e.description && parts.push(e.description));
    return parts.join('\n');
}

function extractJdKeywords(jd) {
    const STOPWORDS = new Set(['the','and','for','with','has','are','not','but','all','was','can','its','our','you','may','will','also','such','any','a','an','in','of','at','be','to','or','is','it','we','as','on','by','do','if','so','up','from','that','this','they','them','their','have','been','would','could','should','must','your','able','work','role','team','time','year','years','strong','good','great','well','high','more','other','level','based','required','preferred','include','including','manage','support','provide','ensure','develop','create','build','lead','drive','help','use','within','across','between','during','related','using','making']);
    const CURATED = ['python','javascript','typescript','react','nodejs','sql','postgresql','aws','gcp','azure','docker','kubernetes','terraform','git','agile','scrum','tableau','powerbi','salesforce','hubspot','figma','jira','linux','kafka','redis','datadog','github actions','ci/cd','microservices','rest api','go','golang','pulumi'];
    const freq = new Map();
    const add = (term, weight = 1) => { const t = term.trim().toLowerCase(); if (!t || t.length < 2) return; freq.set(t, (freq.get(t) ?? 0) + weight); };
    for (const m of jd.matchAll(/\b([A-Z]{2,6})(?:[/\-][A-Z]{2,6})?\b/g)) {
        if (!['THE','AND','FOR','WITH','OR','TO','IN','OF','AT','BE','CV'].includes(m[0])) add(m[0], 2);
    }
    const jdLower = jd.toLowerCase();
    for (const term of CURATED) { if (jdLower.includes(term)) add(term, 3); }
    const sorted = [...freq.entries()].sort((a,b) => b[1]-a[1]).map(([t]) => t);
    const final = [];
    for (const term of sorted) {
        if (!final.some(f => f.includes(term) || term.includes(f))) final.push(term);
        if (final.length >= 20) break;
    }
    return final;
}

function scoreAtsCoverage(cv, jd) {
    const keywords = extractJdKeywords(jd);
    if (keywords.length === 0) return { score: 100, missing: [], found: [] };
    const cvText = gatherCVText(cv).toLowerCase();
    const found = [], missing = [];
    for (const kw of keywords) {
        const rx = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`, 'i');
        if (rx.test(cvText)) found.push(kw); else missing.push(kw);
    }
    return { score: Math.round((found.length / keywords.length) * 100), found, missing };
}

// ─── Full quality audit ───────────────────────────────────────────────────────

function auditCV(cv, jd) {
    const issues = [];
    const passes = [];

    const flag = (severity, rule, detail, quote = null) => {
        issues.push({ severity, rule, detail, quote });
    };
    const pass = label => passes.push(label);

    // ── Summary ──────────────────────────────────────────────────────────────
    const summary = cv.summary || '';
    const summaryWords = summary.trim().split(/\s+/).filter(Boolean).length;

    if (SEEKING_PATTERN.test(summary)) {
        flag('FAIL', 'seeking_opener', 'Summary opens with "seeking/looking to…" — must open with candidate value.', summary.slice(0, 80));
    } else pass('summary:no_seeking_opener');

    if (summaryWords < 60) {
        flag('FAIL', 'summary_too_short', `Summary is ${summaryWords} words — minimum is 60.`);
    } else if (summaryWords > 115) {
        flag('WARN', 'summary_too_long', `Summary is ${summaryWords} words — recommend ≤90.`);
    } else pass(`summary:length_${summaryWords}w`);

    if (BUZZWORD_RX.test(summary)) {
        const m = summary.match(BUZZWORD_RX);
        flag('WARN', 'buzzword_in_summary', `Summary contains generic buzzword: "${m?.[0]}".`);
    } else pass('summary:no_buzzwords');

    if (FIRST_PERSON_RX.test(summary)) {
        const m = summary.match(FIRST_PERSON_RX);
        flag('FAIL', 'first_person_in_summary', `Summary contains first-person pronoun: "${m?.[0]}".`);
    } else pass('summary:no_first_person');

    // ── Banned phrases (full CV text) ─────────────────────────────────────────
    const fullText = gatherCVText(cv);
    const bannedFound = [];
    for (const [rx] of BANNED_PHRASES_LOCAL) {
        rx.lastIndex = 0;
        const m = rx.exec(fullText);
        if (m) bannedFound.push({ phrase: m[0], context: fullText.slice(Math.max(0, m.index - 20), m.index + 40) });
    }
    if (bannedFound.length > 0) {
        for (const b of bannedFound) {
            flag('WARN', 'banned_phrase', `"${b.phrase}" found.`, `…${b.context}…`);
        }
    } else pass('full_cv:no_banned_phrases');

    if (FAKE_VERB_PATTERN.test(fullText)) {
        const m = fullText.match(FAKE_VERB_PATTERN);
        flag('WARN', 'fake_verb', `AI-invented verb: "${m?.[0]}"`);
    } else pass('full_cv:no_fake_verbs');

    // ── Per-role bullet checks ────────────────────────────────────────────────
    let totalBullets = 0, bulletsWithMetric = 0;
    for (const role of (cv.experience || [])) {
        const bullets = (role.responsibilities || []).filter(b => typeof b === 'string' && b.trim());
        const label = `"${role.jobTitle} @ ${role.company}"`;
        const isCurrent = !role.endDate || /present|current|now|ongoing/i.test(String(role.endDate));
        totalBullets += bullets.length;

        if (bullets.length === 0) {
            flag('FAIL', 'empty_role', `${label}: no bullets generated.`);
            continue;
        }

        // Arrow separators
        const arrowBullets = bullets.filter(b => ARROW_RX.test(b));
        if (arrowBullets.length) flag('WARN', 'arrow_separator', `${label}: ${arrowBullets.length} bullet(s) use →.`, arrowBullets[0]);
        else pass(`${label}:no_arrow`);

        // Bullet length < 8 words
        const stubs = bullets.filter(b => b.trim().split(/\s+/).length < 8);
        if (stubs.length) flag('FAIL', 'bullet_too_short', `${label}: ${stubs.length} bullet(s) under 8 words.`, stubs[0]);
        else pass(`${label}:bullet_length`);

        // Weak opener
        const weakBullet = bullets.find(b => WEAK_OPENER_RX.test(b.trim()));
        if (weakBullet) flag('WARN', 'weak_opener', `${label}: weak opener.`, weakBullet.slice(0, 70));
        else pass(`${label}:no_weak_opener`);

        // Preposition opener
        const prepBullet = bullets.find(b => {
            const first = b.replace(/^[\s•\-*·»"']+/, '').split(/\s+/)[0]?.toLowerCase() ?? '';
            return STUB_FIRST_WORDS.has(first);
        });
        if (prepBullet) {
            const first = prepBullet.replace(/^[\s•\-*·»"']+/, '').split(/\s+/)[0];
            flag('FAIL', 'preposition_opener', `${label}: bullet starts with preposition "${first}".`, prepBullet.slice(0, 70));
        } else pass(`${label}:no_preposition_opener`);

        // First-person pronouns in bullets
        const fpBullet = bullets.find(b => FIRST_PERSON_RX.test(b));
        if (fpBullet) {
            const m = fpBullet.match(FIRST_PERSON_RX);
            flag('FAIL', 'first_person_in_bullet', `${label}: pronoun "${m?.[0]}" in bullet.`, fpBullet.slice(0, 70));
        } else pass(`${label}:no_first_person`);

        // Third-person singular in current role
        if (isCurrent) {
            const tpsBullet = bullets.find(b => {
                const first = b.replace(/^[\s•\-*·»"']+/, '').split(/\s+/)[0]?.toLowerCase() ?? '';
                return TPS_VERBS.has(first);
            });
            if (tpsBullet) {
                const first = tpsBullet.replace(/^[\s•\-*·»"']+/, '').split(/\s+/)[0];
                flag('FAIL', 'tense_3ps_current', `${label} (CURRENT): uses 3rd-person-singular "${first}" — must be base form.`, tpsBullet.slice(0, 70));
            } else pass(`${label}:correct_tense`);
        }

        // Banned opener verb
        const bannedOpenerBullet = bullets.find(b => BANNED_OPENER_RX.test(b.trim().split(/\s+/)[0] ?? ''));
        if (bannedOpenerBullet) {
            flag('WARN', 'banned_opener', `${label}: starts with banned verb.`, bannedOpenerBullet.slice(0, 70));
        } else pass(`${label}:no_banned_opener`);

        // Metric density
        const withMetric = bullets.filter(b => METRIC_IN_BULLET.test(b));
        bulletsWithMetric += withMetric.length;
        const metricRatio = withMetric.length / bullets.length;
        if (bullets.length >= 4 && metricRatio > 0.60) {
            flag('WARN', 'metric_overload', `${label}: ${withMetric.length}/${bullets.length} bullets (${Math.round(metricRatio*100)}%) have metrics — add qualitative context bullets.`);
        } else if (bullets.length >= 4 && metricRatio < 0.30) {
            flag('WARN', 'metric_underload', `${label}: only ${withMetric.length}/${bullets.length} bullets (${Math.round(metricRatio*100)}%) have metrics — aim for 40%.`);
        } else pass(`${label}:metric_density_${Math.round(metricRatio*100)}pct`);

        // Chained metric
        const chainedBullet = bullets.find(b => CHAINED_METRIC_RX.test(b));
        if (chainedBullet) flag('WARN', 'chained_metric', `${label}: chained causal metric ("X% resulting in Y%").`, chainedBullet.slice(0, 80));
        else pass(`${label}:no_chained_metric`);

        // Empty metric placeholder
        const emptyMetricBullet = bullets.find(b => { EMPTY_METRIC_RX.lastIndex = 0; return EMPTY_METRIC_RX.test(b); });
        if (emptyMetricBullet) flag('FAIL', 'empty_metric_placeholder', `${label}: empty metric placeholder.`, emptyMetricBullet.slice(0, 80));
        else pass(`${label}:no_empty_metric`);

        // Opener diversity
        const categories = bullets.map(classifyOpener);
        const verbCount = categories.filter(c => c === 'verb').length;
        if (bullets.length >= 4 && verbCount / bullets.length > 0.85) {
            flag('WARN', 'all_verb_led', `${label}: ${verbCount}/${bullets.length} (${Math.round(verbCount/bullets.length*100)}%) start with a verb — add number/context openers.`);
        } else pass(`${label}:opener_diversity`);

        // Consecutive same opener (monotone ≥ 3)
        let streak = 1;
        for (let i = 1; i < categories.length; i++) {
            if (categories[i] === categories[i-1]) { streak++; } else streak = 1;
            if (streak >= 3) {
                flag('WARN', 'opener_monotone', `${label}: ${streak}+ consecutive "${categories[i]}" openers.`);
                break;
            }
        }

        // Verb cluster dominance
        const clusterCounts = {};
        for (const b of bullets) {
            for (const [cl, rx] of Object.entries(VERB_CLUSTERS)) {
                if (rx.test(b.replace(/^[\s•\-*·]+/, '').trim())) {
                    clusterCounts[cl] = (clusterCounts[cl] || 0) + 1; break;
                }
            }
        }
        for (const [cl, count] of Object.entries(clusterCounts)) {
            if (count / bullets.length > 0.55) {
                flag('WARN', 'verb_cluster_dominance', `${label}: "${cl}" cluster = ${count}/${bullets.length} bullets (${Math.round(count/bullets.length*100)}%).`);
            }
        }

        // Duplicate opening word
        const openers = new Map();
        for (const b of bullets) {
            const w = b.replace(/^[\s•\-*·»"']+/, '').split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g,'') ?? '';
            if (!w) continue;
            openers.set(w, (openers.get(w) || 0) + 1);
        }
        const dupOpeners = [...openers.entries()].filter(([,c]) => c > 1).map(([w,c]) => `"${w}"×${c}`);
        if (dupOpeners.length) flag('WARN', 'duplicate_opener', `${label}: repeated opening word(s): ${dupOpeners.join(', ')}.`);
        else pass(`${label}:unique_openers`);

        // Flat rhythm (3+ consecutive bullets < 12 words)
        let maxShortStreak = 0, curShort = 0;
        for (const b of bullets) {
            if (b.trim().split(/\s+/).length < 12) { curShort++; maxShortStreak = Math.max(maxShortStreak, curShort); }
            else curShort = 0;
        }
        if (maxShortStreak >= 3) flag('WARN', 'flat_rhythm', `${label}: ${maxShortStreak} consecutive short bullets — mix lengths.`);
        else pass(`${label}:rhythm_ok`);
    }

    // ── Global metric density ─────────────────────────────────────────────────
    if (totalBullets >= 4) {
        const densityPct = Math.round((bulletsWithMetric / totalBullets) * 100);
        if (densityPct < 25) {
            flag('FAIL', 'low_global_metric_density', `Only ${bulletsWithMetric}/${totalBullets} bullets (${densityPct}%) contain metrics — minimum 25%.`);
        } else if (densityPct < 40) {
            flag('WARN', 'low_global_metric_density', `${bulletsWithMetric}/${totalBullets} bullets (${densityPct}%) contain metrics — aim for 40%.`);
        } else pass(`global:metric_density_${densityPct}pct`);
    }

    // ── Round-number saturation ───────────────────────────────────────────────
    const numbers = fullText.match(/\b\d+(?:\.\d+)?\s?%?/g) || [];
    if (numbers.length >= 4) {
        const round = numbers.filter(n => { const v = parseFloat(n); return !isNaN(v) && v > 0 && (v % 5 === 0 || v % 10 === 0); }).length;
        const ratio = round / numbers.length;
        if (ratio > 0.65) {
            flag('WARN', 'round_number_saturation', `${Math.round(ratio*100)}% of metrics are round numbers (≥5/10 multiples) — looks fabricated. Mix in specifics like 47%, 3.2x, 22 min.`);
        } else pass(`numbers:variety_${Math.round((1-ratio)*100)}pct_specific`);
    }

    // ── Phrase repetition (4+ word n-grams, 2+ occurrences) ──────────────────
    const textLower = fullText.toLowerCase().replace(/[^\w\s]/g, ' ');
    const words = textLower.split(/\s+/).filter(Boolean);
    const STOPWORDS = new Set(['the','and','a','an','of','in','to','for','with','on','at','by','is','was','as','or','this','that','it','be']);
    const phraseCounts = new Map();
    for (let n = 4; n <= 6; n++) {
        for (let i = 0; i + n <= words.length; i++) {
            const window = words.slice(i, i + n);
            const content = window.filter(w => !STOPWORDS.has(w)).length;
            if (content < Math.ceil(n * 0.55)) continue;
            const phrase = window.join(' ');
            phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
        }
    }
    const repeated = [...phraseCounts.entries()].filter(([,c]) => c >= 2).sort((a,b) => b[1]-a[1]).map(([p,c]) => `"${p}" ×${c}`);
    if (repeated.length > 0) {
        flag('WARN', 'phrase_repetition', `${repeated.length} repeated 4-gram(s): ${repeated.slice(0,4).join(' | ')}`);
    } else pass('full_cv:no_phrase_repetition');

    // ── Skills check ──────────────────────────────────────────────────────────
    const skills = cv.skills || [];
    if (skills.length > 16) flag('WARN', 'skills_too_many', `${skills.length} skills listed — cap at 12–15 for credibility.`);
    else if (skills.length < 6) flag('WARN', 'skills_too_few', `Only ${skills.length} skills listed.`);
    else pass(`skills:count_${skills.length}`);

    // ── ATS coverage ──────────────────────────────────────────────────────────
    const ats = scoreAtsCoverage(cv, jd);
    if (ats.score < 55) {
        flag('FAIL', 'ats_coverage_low', `ATS score ${ats.score}% (min 55%). Missing: ${ats.missing.slice(0,8).join(', ')}`);
    } else if (ats.score < 70) {
        flag('WARN', 'ats_coverage_moderate', `ATS score ${ats.score}% (target 70%+). Missing: ${ats.missing.slice(0,5).join(', ')}`);
    } else pass(`ats_coverage:${ats.score}pct`);

    const criticalFails = issues.filter(i => i.severity === 'FAIL').length;
    const warns = issues.filter(i => i.severity === 'WARN').length;
    const verdict = criticalFails > 0 ? 'FAIL' : warns > 3 ? 'WARN' : 'PASS';
    return { verdict, issues, passes, ats, criticalFails, warns };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log(BOLD('\n╔══════════════════════════════════════════════════════════════════╗'));
    console.log(BOLD('║         ProCV — Deep Pipeline Probe (workers-ai live run)         ║'));
    console.log(BOLD('╚══════════════════════════════════════════════════════════════════╝'));
    console.log(`  Engine: ${CYAN(ENGINE_URL)}`);
    console.log(`  JD    : ${CYAN(fixture.label)}\n`);

    // ── Step 1: Worker connectivity + data ────────────────────────────────────
    console.log(BOLD('━━━ STEP 1: Worker connectivity + data load'));
    let bannedPhrases = [];
    try {
        process.stdout.write('  Fetching banned phrases... ');
        const banned = await workerGet('/api/cv/banned');
        bannedPhrases = banned.banned || [];
        console.log(GREEN(`✓ ${bannedPhrases.length} phrases loaded`));
    } catch (e) {
        console.log(YEL(`⚠ Failed (${e.message}) — using local fallback list`));
        bannedPhrases = BANNED_PHRASES_LOCAL.map(([rx]) => rx.source.replace(/\\b/g,'').split('|')[0]);
    }

    let verbPool = [];
    try {
        process.stdout.write('  Fetching verb pool... ');
        const vp = await workerGet('/api/cv/words', { category: 'technical', tense: 'past', count: '30' });
        verbPool = vp.words || [];
        console.log(GREEN(`✓ ${verbPool.length} verbs: ${verbPool.slice(0,6).join(', ')}…`));
    } catch (e) {
        console.log(YEL(`⚠ Failed (${e.message})`));
    }

    let rhythmStructures = [];
    try {
        process.stdout.write('  Fetching rhythm structures... ');
        const rs = await workerGet('/api/cv/rhythm');
        rhythmStructures = rs.structures || [];
        console.log(GREEN(`✓ ${rhythmStructures.length} structures`));
    } catch (e) {
        console.log(YEL(`⚠ Failed (${e.message})`));
    }

    // ── Step 2: Brief building ────────────────────────────────────────────────
    console.log(BOLD('\n━━━ STEP 2: Brief building'));
    let brief = null;
    try {
        process.stdout.write('  Calling /api/cv/brief... ');
        brief = await workerPost('/api/cv/brief', {
            jd: fixture.jd,
            profile: {
                name: PROFILE.name,
                title: PROFILE.title,
                skills: PROFILE.skills,
                yearsExperience: 7,
            },
        }, 30000);
        console.log(GREEN('✓'));
        if (VERBOSE || true) {
            console.log(DIM(`    seniority : ${brief.seniority ?? 'N/A'}`));
            console.log(DIM(`    field     : ${brief.field ?? 'N/A'}`));
            console.log(DIM(`    voice     : ${brief.voice ?? 'N/A'}`));
            console.log(DIM(`    scenario  : ${brief.scenario ?? 'none'}`));
            if (brief.topKeywords?.length) console.log(DIM(`    keywords  : ${brief.topKeywords.slice(0,8).join(', ')}`));
        }
    } catch (e) {
        console.log(YEL(`⚠ Brief failed (${e.message}) — continuing without`));
    }

    // ── Step 3: Parallel AI generation ───────────────────────────────────────
    console.log(BOLD('\n━━━ STEP 3: AI generation via /api/cv/parallel-sections'));
    console.log(DIM('  Model: @cf/mistralai/mistral-small-3.1-24b-instruct (workers-ai)'));

    const preamble = buildPreamble(PROFILE, fixture.jd, bannedPhrases);
    const schema   = buildSchema();

    // Limit to 2 most recent roles for a concise CV
    const targetRoles = PROFILE.experience.slice(0, 2);

    const sections = [
        {
            name: 'summary_and_skills',
            task: 'cvGenerate',
            instruction: `Generate the summary (60–90 words) and skills list (12 items) for this candidate targeting the JD.

${preamble}

Return JSON: { "summary": "...", "skills": ["..."] }`,
            maxTokens: 500,
            temperature: 0.35,
            json: true,
        },
        ...targetRoles.map((role, i) => ({
            name: `role_${i}`,
            task: 'cvGenerate',
            instruction: `Generate EXACTLY 5 bullet points for this role:
${JSON.stringify(role, null, 2)}

${preamble}

TENSE RULE: ${role.isCurrent ? 'CURRENT ROLE — use BASE-FORM imperative verbs (Lead, Build, Design)' : 'PAST ROLE — use PAST-TENSE verbs (Led, Built, Designed)'}

Return JSON: { "responsibilities": ["bullet1", "bullet2", "bullet3", "bullet4", "bullet5"] }`,
            maxTokens: 700,
            temperature: 0.4,
            json: true,
        })),
        {
            name: 'education',
            task: 'general',
            instruction: `Format this education data:\n${JSON.stringify(PROFILE.education)}\n\nReturn JSON array: [{"degree":"...","school":"...","year":"...","description":""}]`,
            maxTokens: 200,
            temperature: 0.1,
            json: true,
        },
    ];

    const t0 = Date.now();
    let rawSections = null;
    try {
        rawSections = await workerPost('/api/cv/parallel-sections', {
            preamble: '',  // already embedded per-section for isolation
            sections,
        }, 180000);
        const elapsed = Date.now() - t0;
        console.log(GREEN(`  ✓ All sections returned in ${elapsed}ms`));
    } catch (e) {
        console.log(RED(`  ✗ parallel-sections FAILED: ${e.message}`));
        process.exit(1);
    }

    // ── Step 4: Assemble CV ───────────────────────────────────────────────────
    console.log(BOLD('\n━━━ STEP 4: Section assembly + raw AI output'));

    const assembled = {
        summary: '',
        skills: [],
        experience: [],
        education: [],
        languages: [],
    };

    const sectionResults = rawSections?.results ?? {};

    // Section: summary_and_skills
    const ssRaw = sectionResults['summary_and_skills'];
    console.log(`\n  ${BOLD('[summary_and_skills]')}  model=${CYAN(ssRaw?.model ?? '?')}  ms=${ssRaw?.ms ?? '?'}  fallback=${ssRaw?.fellBack ? YEL('YES') : 'no'}`);
    if (ssRaw?.error) console.log(RED(`    ERROR: ${ssRaw.error}`));
    if (SECTION_DUMP) console.log(DIM('    Raw: ' + (ssRaw?.text ?? '').slice(0, 400)));

    if (ssRaw?.text) {
        try {
            const parsed = JSON.parse(ssRaw.text.replace(/^```json\s*/i,'').replace(/\s*```$/,'').trim());
            assembled.summary = parsed.summary ?? '';
            assembled.skills  = Array.isArray(parsed.skills) ? parsed.skills : [];
            console.log(`    ✓ summary: ${assembled.summary.slice(0, 80)}${assembled.summary.length > 80 ? '…' : ''}`);
            console.log(`    ✓ skills (${assembled.skills.length}): ${assembled.skills.slice(0,6).join(', ')}…`);
        } catch (e) {
            console.log(RED(`    ✗ JSON parse failed: ${e.message}`));
            console.log(DIM('    Raw: ' + (ssRaw?.text ?? '').slice(0, 200)));
        }
    }

    // Sections: roles
    for (let i = 0; i < targetRoles.length; i++) {
        const role = targetRoles[i];
        const secKey = `role_${i}`;
        const secRaw = sectionResults[secKey];
        console.log(`\n  ${BOLD(`[${secKey}]`)} "${role.jobTitle} @ ${role.company}"  model=${CYAN(secRaw?.model ?? '?')}  ms=${secRaw?.ms ?? '?'}  fallback=${secRaw?.fellBack ? YEL('YES') : 'no'}`);
        if (secRaw?.error) console.log(RED(`    ERROR: ${secRaw.error}`));
        if (SECTION_DUMP) console.log(DIM('    Raw: ' + (secRaw?.text ?? '').slice(0, 500)));

        let bullets = [];
        if (secRaw?.text) {
            try {
                const parsed = JSON.parse(secRaw.text.replace(/^```json\s*/i,'').replace(/\s*```$/,'').trim());
                bullets = Array.isArray(parsed.responsibilities) ? parsed.responsibilities : [];
                console.log(`    ✓ ${bullets.length} bullets generated:`);
                bullets.forEach((b, bi) => console.log(`       [${bi+1}] ${b.slice(0, 100)}`));
            } catch (e) {
                console.log(RED(`    ✗ JSON parse failed: ${e.message}`));
                console.log(DIM('    Raw: ' + (secRaw?.text ?? '').slice(0, 300)));
            }
        }

        assembled.experience.push({
            jobTitle: role.jobTitle,
            company: role.company,
            dates: `${role.startDate} – ${role.endDate}`,
            startDate: role.startDate,
            endDate: role.endDate,
            responsibilities: bullets,
        });
    }

    // Section: education
    const eduRaw = sectionResults['education'];
    if (eduRaw?.text) {
        try {
            const parsed = JSON.parse(eduRaw.text.replace(/^```json\s*/i,'').replace(/\s*```$/,'').trim());
            assembled.education = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.education) ? parsed.education : PROFILE.education);
        } catch { assembled.education = PROFILE.education; }
    } else {
        assembled.education = PROFILE.education;
    }

    // ── Step 5: Full CV text dump ─────────────────────────────────────────────
    console.log(BOLD('\n━━━ STEP 5: Full assembled CV text'));
    console.log('');
    console.log(BOLD(`${PROFILE.name.toUpperCase()}`) + `  |  ${assembled.experience[0]?.jobTitle ?? ''}`);
    console.log('─'.repeat(70));
    console.log(BOLD('PROFESSIONAL SUMMARY'));
    console.log(assembled.summary || DIM('[empty]'));
    console.log('');
    console.log(BOLD(`SKILLS (${assembled.skills.length})`));
    console.log(assembled.skills.join(' · ') || DIM('[empty]'));
    for (const role of assembled.experience) {
        console.log('');
        console.log(BOLD(`${role.jobTitle.toUpperCase()}  ·  ${role.company}  ·  ${role.dates}`));
        (role.responsibilities || []).forEach((b, i) => {
            console.log(`  ${i+1}. ${b}`);
        });
    }
    console.log('');
    console.log(BOLD('EDUCATION'));
    (assembled.education || []).forEach(e => console.log(`  • ${e.degree} — ${e.school} (${e.year})`));
    console.log('\n' + '─'.repeat(70));

    // ── Step 6: Full quality audit ────────────────────────────────────────────
    console.log(BOLD('\n━━━ STEP 6: Quality audit — every rule'));
    const audit = auditCV(assembled, fixture.jd);

    // Group issues
    const fails = audit.issues.filter(i => i.severity === 'FAIL');
    const warns = audit.issues.filter(i => i.severity === 'WARN');

    if (fails.length === 0 && warns.length === 0) {
        console.log(GREEN('\n  ✅ CLEAN — no issues detected'));
    }

    if (fails.length > 0) {
        console.log(RED(`\n  ❌ CRITICAL FAILS (${fails.length})`));
        for (const f of fails) {
            console.log(RED(`     ❌ [${f.rule}] ${f.detail}`));
            if (f.quote) console.log(DIM(`        → "${f.quote}"`));
        }
    }

    if (warns.length > 0) {
        console.log(YEL(`\n  ⚠️  WARNINGS (${warns.length})`));
        for (const w of warns) {
            console.log(YEL(`     ⚠  [${w.rule}] ${w.detail}`));
            if (w.quote) console.log(DIM(`        → "${w.quote}"`));
        }
    }

    if (audit.passes.length > 0) {
        console.log(GREEN(`\n  ✅ PASSING RULES (${audit.passes.length})`));
        if (VERBOSE) {
            for (const p of audit.passes) console.log(GREEN(`     ✓  ${p}`));
        } else {
            console.log(DIM('     ' + audit.passes.slice(0, 8).join(' · ') + (audit.passes.length > 8 ? ` … +${audit.passes.length - 8} more` : '')));
        }
    }

    // ── Step 7: ATS scoring breakdown ────────────────────────────────────────
    console.log(BOLD('\n━━━ STEP 7: ATS keyword coverage'));
    const ats = audit.ats;
    const atsBar = (score) => {
        const filled = Math.round(score / 5);
        return '█'.repeat(filled) + '░'.repeat(20 - filled) + ` ${score}%`;
    };
    console.log(`\n  Score: ${ats.score >= 70 ? GREEN(atsBar(ats.score)) : ats.score >= 55 ? YEL(atsBar(ats.score)) : RED(atsBar(ats.score))}`);
    if (ats.found.length)   console.log(GREEN(`  Found  (${ats.found.length}): ${ats.found.join(', ')}`));
    if (ats.missing.length) console.log(RED(`  Missing (${ats.missing.length}): ${ats.missing.join(', ')}`));

    // ── Final verdict ─────────────────────────────────────────────────────────
    console.log(BOLD('\n━━━ VERDICT'));
    const icon = audit.verdict === 'PASS' ? GREEN('✅ PASS') : audit.verdict === 'WARN' ? YEL('⚠️  WARN') : RED('❌ FAIL');
    console.log(`\n  ${icon}  |  ❌ ${audit.criticalFails} FAIL  ·  ⚠️  ${audit.warns} WARN  ·  ✅ ${audit.passes.length} PASS`);
    console.log(`  ATS: ${ats.score}%  |  Total bullets: ${assembled.experience.reduce((s,e) => s+(e.responsibilities?.length??0), 0)}`);

    const overallIcon = audit.criticalFails > 0 ? RED('❌ PIPELINE HAS CRITICAL FAILURES')
        : audit.warns > 3 ? YEL('⚠️  PIPELINE HAS WARNINGS — review above')
        : GREEN('✅ PIPELINE PRODUCING ACCEPTABLE OUTPUT');
    console.log(`\n  ${overallIcon}`);

    // What is working vs broken
    console.log(BOLD('\n━━━ DIAGNOSIS SUMMARY'));

    const broken = audit.issues;
    const ruleGroups = {};
    for (const i of broken) {
        const cat = i.rule.split('_')[0];
        if (!ruleGroups[cat]) ruleGroups[cat] = [];
        ruleGroups[cat].push(i);
    }

    if (broken.length === 0) {
        console.log(GREEN('  All monitored rules pass — CV is pipeline-quality.'));
    } else {
        console.log('  What is broken / needs attention:\n');
        for (const [cat, items] of Object.entries(ruleGroups)) {
            const sevIcon = items.some(i => i.severity === 'FAIL') ? RED('❌') : YEL('⚠️ ');
            console.log(`  ${sevIcon} ${BOLD(cat.toUpperCase())} (${items.length} issue${items.length>1?'s':''})`);
            for (const item of items) {
                console.log(`       ${item.severity === 'FAIL' ? RED('FAIL') : YEL('WARN')} ${item.detail}`);
            }
        }
    }

    console.log('\n' + '═'.repeat(70) + '\n');
    process.exit(audit.criticalFails > 0 ? 1 : 0);
}

main().catch(err => { console.error(RED('Fatal: ' + err.message)); if (VERBOSE) console.error(err); process.exit(1); });
