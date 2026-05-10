/**
 * batch-cv-test.mjs
 *
 * Batch CV generation + quality pipeline tester.
 * Uses Replit AI Integrations (OpenAI) — no personal API key needed.
 *
 * Run:  node backend/scripts/batch-cv-test.mjs
 *
 * For each JD type it:
 *   1. Generates a realistic CV via GPT (structured JSON)
 *   2. Runs ALL quality rules (banned phrases, quality gate, style governance,
 *      ATS coverage, round-number saturation, phrase repetition)
 *   3. Prints a clear PASS / FAIL / WARN report per JD
 *   4. Writes a full JSON report to backend/scripts/batch-cv-report.json
 */

import OpenAI from 'openai';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Replit AI Integrations client ───────────────────────────────────────────
const openai = new OpenAI({
    apiKey:  process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ─── JD Fixtures ─────────────────────────────────────────────────────────────
const JD_FIXTURES = [
    {
        id: 'senior-swe',
        label: 'Senior Software Engineer (Tech)',
        jd: `We are looking for a Senior Software Engineer to join our platform team.
You will design and build scalable backend services using Python and Go, deploy on AWS
using Kubernetes and Terraform, and contribute to CI/CD pipeline improvements.
Requirements: 5+ years experience, proficiency in Python, Go, AWS, Kubernetes, Docker,
PostgreSQL, Redis, REST APIs, microservices architecture, Agile/Scrum.
Nice to have: experience with GraphQL, Kafka, or Terraform.`,
    },
    {
        id: 'marketing-manager',
        label: 'Marketing Manager (B2B SaaS)',
        jd: `We are hiring a Marketing Manager to drive demand generation for our B2B SaaS product.
You will own the content calendar, manage paid campaigns on LinkedIn and Google Ads,
run email nurture sequences via HubSpot, and report on pipeline contribution.
Requirements: 4+ years in B2B marketing, experience with HubSpot, Salesforce, Google Analytics,
SEO, content marketing, account-based marketing (ABM), stakeholder management.
KPIs: MQL volume, SQL conversion rate, CAC.`,
    },
    {
        id: 'data-analyst',
        label: 'Data Analyst (Finance/FinTech)',
        jd: `Seeking a Data Analyst to support our FP&A team with financial modelling and reporting.
Responsibilities: build dashboards in Tableau and Power BI, write complex SQL queries against
our Snowflake data warehouse, own the monthly board reporting pack.
Requirements: 3+ years analytics experience, advanced SQL, Python (pandas, numpy), Tableau,
Power BI, Excel modelling, experience with financial data, cross-functional collaboration.`,
    },
    {
        id: 'product-manager',
        label: 'Product Manager (Consumer App)',
        jd: `We need a Product Manager to lead our mobile consumer app roadmap.
You will define the product strategy, write PRDs, run user research sessions, work closely
with design (Figma) and engineering, manage the backlog in Jira, and track OKRs.
Requirements: 4+ years PM experience, consumer mobile apps, user research, data-driven
decision making, Figma, Jira, Agile, cross-functional leadership, A/B testing, growth metrics.`,
    },
    {
        id: 'hr-business-partner',
        label: 'HR Business Partner',
        jd: `We are looking for a HR Business Partner to support our 300-person EMEA organisation.
Responsibilities: partner with business leaders on talent planning, run performance review cycles,
manage employee relations cases, support L&D initiatives, analyse people data in Workday.
Requirements: 5+ years HRBP experience, CIPD Level 5+, Workday, stakeholder management,
employment law knowledge, talent management, coaching, change management.`,
    },
    {
        id: 'academic-researcher',
        label: 'Academic / Research Scientist',
        jd: `Postdoctoral Research Fellow in Computational Biology.
The successful candidate will lead research into single-cell RNA sequencing analysis,
develop novel bioinformatics pipelines using Python and R, publish in peer-reviewed journals,
and present at international conferences. Requirements: PhD in Bioinformatics or related field,
strong Python, R, machine learning, scRNA-seq, CRISPR, statistical modelling, grant writing.`,
    },
    {
        id: 'creative-director',
        label: 'Creative Director (Agency)',
        jd: `Senior Creative Director for a global integrated marketing agency.
You will lead a team of 12 creatives, pitch and win new business, oversee campaign execution
across digital, print, and out-of-home, and maintain brand consistency across all touchpoints.
Requirements: 8+ years creative leadership, strong portfolio, Adobe Creative Suite, Figma,
experience with CPG and financial services clients, new business pitching, team management.`,
    },
    {
        id: 'devops-engineer',
        label: 'DevOps / Platform Engineer',
        jd: `DevOps Engineer to own our cloud infrastructure and developer experience.
Responsibilities: build and maintain IaC with Terraform and Pulumi, manage GKE clusters,
implement observability with Datadog and PagerDuty, improve CI/CD pipelines in GitHub Actions.
Requirements: 4+ years DevOps/SRE, GCP or AWS, Kubernetes, Terraform, Docker, GitHub Actions,
Linux, Bash scripting, SLO/SLA management, incident response, on-call rotation.`,
    },
];

// ─── Profile fixture (the candidate's raw experience — same for all JDs) ─────
const CANDIDATE_PROFILE = {
    name: 'Alex Morgan',
    yearsOfExperience: 7,
    currentRole: 'Senior Engineer / Manager',
    industries: ['Technology', 'Finance', 'Consulting'],
    education: 'BSc Computer Science, University of Manchester (2016); MSc Data Science, UCL (2018)',
    skills: 'Python, SQL, JavaScript, React, AWS, GCP, Docker, Kubernetes, Agile, Scrum, Tableau, Power BI, Figma, HubSpot, Salesforce, Excel, R, TensorFlow',
    pastRoles: [
        { title: 'Senior Software Engineer', company: 'FinTech Co', years: '2021–present', team: 8 },
        { title: 'Data Engineer', company: 'Consulting Ltd', years: '2019–2021', team: 4 },
        { title: 'Junior Developer', company: 'Startup Inc', years: '2018–2019', team: 3 },
    ],
};

// ─── CV Generation via Replit AI ──────────────────────────────────────────────

const CV_SYSTEM_PROMPT = `You are an expert CV writer. Generate a realistic CV in JSON. Be concise.

RULES (the CV will be auto-checked against these):
1. Summary: 65-90 words. Start with candidate VALUE, never "Seeking to" or "Looking to".
2. Each role: exactly 5 bullets, each 10-20 words.
3. Past roles = past tense verbs. Current role = present tense.
4. NEVER use: spearheaded, leveraged, utilized, facilitated, synergy, team player, detail-oriented, results-driven, passionate about, highly motivated, dynamic, innovative solutions, best practices.
5. NEVER use fake verbs: greenfielded, scaffolded, materialized, actioned, ideated, solutioned.
6. NEVER use arrow "→" inside bullets.
7. Max 2 out of 5 bullets per role may contain a number (max 40% metric density).
8. VARY bullet openers: at least 1 bullet per role must NOT start with a verb (use a number, "Across X...", "As the sole...", "With the team...").
9. Skills: exactly 12 skills relevant to the JD.
10. Use only 2 experience roles (most recent 2 from the profile).

Return ONLY valid compact JSON (no markdown, no extra text):
{"name":"string","title":"string","summary":"string","experience":[{"jobTitle":"string","company":"string","startDate":"string","endDate":"string","isCurrent":false,"responsibilities":["b1","b2","b3","b4","b5"]}],"education":[{"degree":"string","institution":"string","year":"string","description":""}],"skills":["s1"]}`;

async function generateCV(jdFixture, profile) {
    const userPrompt = `
CANDIDATE PROFILE:
Name: ${profile.name}
Experience: ${profile.yearsOfExperience} years
Education: ${profile.education}
Skills: ${profile.skills}
Past roles: ${profile.pastRoles.map(r => `${r.title} at ${r.company} (${r.years}), team of ${r.team}`).join('; ')}

JOB DESCRIPTION TO TARGET:
${jdFixture.jd}

Generate a complete, realistic CV tailored to this JD. Follow ALL rules in the system prompt exactly.`;

    const response = await openai.chat.completions.create({
        model: 'gpt-5-mini',
        messages: [
            { role: 'system', content: CV_SYSTEM_PROMPT },
            { role: 'user',   content: userPrompt },
        ],
        max_completion_tokens: 8000,
    });

    const raw = response.choices[0]?.message?.content ?? '';
    // Strip any accidental markdown code fences
    const json = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    return JSON.parse(json);
}

// ─── Quality Rules (ported from frontend — pure JS, no imports needed) ────────

const BANNED_PHRASES = [
    [/\bleveraging\b/gi, 'using'],
    [/\bleveraged\b/gi, 'used'],
    [/\bleverage\b/gi, 'use'],
    [/\bspearheaded\b/gi, 'led'],
    [/\butilized\b/gi, 'used'],
    [/\butilised\b/gi, 'used'],
    [/\bfacilitated\b/gi, 'enabled'],
    [/\bsynergy\b/gi, 'collaboration'],
    [/\binnovative solutions?\b/gi, 'practical solutions'],
    [/\bbest practices?\b/gi, 'proven methods'],
    [/\bpassion for\b/gi, 'focus on'],
    [/\bresults[- ]driven\b/gi, 'delivery-focused'],
    [/\bdetail[- ]oriented\b/gi, 'thorough'],
    [/\bteam player\b/gi, 'collaborator'],
    [/\bgreenfielded\b/gi, 'built'],
    [/\bscaffolded\b/gi, 'established'],
    [/\bmaterialized\b/gi, 'developed'],
    [/\bactioned\b/gi, 'completed'],
    [/\bideated\b/gi, 'developed'],
    [/\bsolutioned\b/gi, 'resolved'],
    [/\bhighly motivated\b/gi, ''],
    [/\bdynamic\s+/gi, ''],
];

const SEEKING_PATTERN   = /\b(seeking to|looking to|aiming to|hoping to|eager to join|excited to contribute)\b/i;
const FAKE_VERB_PATTERN = /\b(greenfielded?|scaffolded?|materialized?|actioned?|ideated?|solutioned?|conceptualized?|operationalized?)\b/i;
const BANNED_OPENER_RX  = /^(spearheaded?|orchestrated?|leveraged?|utilized?|facilitated?|empowered?|championed?)\b/i;
const BUZZWORD_RX       = /\b(highly motivated|results-driven|results-oriented|passionate about|detail-oriented|team player|self-starter|go-getter|dynamic professional)\b/i;
const CHAINED_METRIC_RX = /\b\d+\s*%[^.]{0,60}(?:resulting in|leading to|which led to|driving)\s*\d+\s*%/i;
const EMPTY_METRIC_RX   = /\b(generating|saving|reducing|growing|increasing|cutting|achieving|driving|delivering)\s+in\s+\w/gi;
const ARROW_RX          = /\s*→\s*/;
const METRIC_IN_BULLET  = /\b\d[\d,.]*\s*(%|K|M|B|x|×|\+\s*years?|users?|clients?|employees?|staff|projects?)\b/i;

// Verb clusters for dominance check
const VERB_CLUSTERS = {
    leadership:  /^(?:led|managed|directed|supervised|oversaw|governed|headed|owned|championed|orchestrated|spearheaded)\b/i,
    build:       /^(?:built|developed|created|designed|engineered|architected|launched|deployed|implemented|shipped|published)\b/i,
    growth:      /^(?:increased|grew|expanded|improved|enhanced|boosted|accelerated|scaled|doubled|tripled|raised)\b/i,
    reduce:      /^(?:reduced|cut|streamlined|optimized|optimised|automated|simplified|refactored|eliminated|minimized)\b/i,
    analyze:     /^(?:analyzed|analysed|assessed|evaluated|reviewed|audited|investigated|researched|identified|benchmarked)\b/i,
    communicate: /^(?:presented|communicated|reported|trained|coached|mentored|educated|advised|briefed|collaborated)\b/i,
    deliver:     /^(?:delivered|executed|completed|finished|fulfilled|produced|generated|achieved|hit|exceeded)\b/i,
};

const SCOPE_RX     = /^(across|for|throughout|covering|spanning|serving|supporting)\b/i;
const CONTEXT_RX   = /^(as|after|during|following|while|when|upon|having|given|since|once|before)\b/i;
const TIMEFRAME_RX = /^(?:in\s+(?:q[1-4]|20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december)|over\s+(?:the\s+)?(?:\d+|two|three|four|five|six)|within\s+(?:\d+|one|two|three|four|six|twelve))\b/i;
const COLLAB_RX    = /^(?:with\s+(?:the|a|an|my|our)\s+|partnering\s+with|working\s+alongside|alongside|together\s+with)\b/i;
const OUTCOME_RX   = /^(?:top\s+performer|ranked|awarded|recognised|recognized|promoted|selected|certified)\b/i;
const CURRENCY_RX  = /^(?:[$£€¥₦₹]|\b(?:KES|USD|EUR|GBP|NGN|ZAR)\s)/i;
const NUMBER_WORDS = new Set(['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','twenty','thirty','forty','fifty','hundred','thousand','million','billion']);

function classifyOpener(bullet) {
    const s = bullet.replace(/^[\s•\-*·»"']+/, '').trim();
    if (!s) return 'fragment';
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length <= 5) return 'fragment';
    const first = words[0]?.toLowerCase() ?? '';
    if (/^\d/.test(first) || CURRENCY_RX.test(s) || NUMBER_WORDS.has(first)) return 'number';
    if (CONTEXT_RX.test(s))   return 'context';
    if (TIMEFRAME_RX.test(s)) return 'timeframe';
    if (COLLAB_RX.test(s))    return 'collaboration';
    if (SCOPE_RX.test(s))     return 'scope';
    if (OUTCOME_RX.test(s))   return 'outcome';
    return 'verb';
}

function gatherCVText(cv) {
    const parts = [];
    if (cv.summary) parts.push(cv.summary);
    (cv.experience || []).forEach(e => (e.responsibilities || []).forEach(b => parts.push(b)));
    (cv.education || []).forEach(e => e.description && parts.push(e.description));
    return parts.join(' \n ');
}

function extractJdKeywords(jd) {
    if (!jd) return [];
    const STOPWORDS_LOWER = new Set(['the','and','for','with','has','are','not','but','all','was','can','its','our','you','may','will','also','such','any','a','an','in','of','at','be','to','or','is','it','we','as','on','by','do','if','so','up','from','that','this','they','them','their','have','been','would','could','should','must','your','able','work','role','team','time','year','years','strong','good','great','well','high','more','other','level','based','required','preferred','include','including','manage','support','provide','ensure','develop','create','build','lead','drive','help','use','within','across','between','during','related','using','making']);
    const CURATED = new Set(['python','javascript','typescript','react','nodejs','sql','postgresql','aws','gcp','azure','docker','kubernetes','terraform','git','agile','scrum','tableau','powerbi','salesforce','hubspot','figma','jira','linux','ci/cd','machine learning','deep learning','data science','product management','project management','stakeholder management','cross-functional']);
    const freq = new Map();
    const add = (term, weight = 1) => { const t = term.trim(); if (!t || t.length < 2) return; freq.set(t, (freq.get(t) ?? 0) + weight); };
    for (const m of jd.matchAll(/\b([A-Z]{2,6})(?:[/\-][A-Z]{2,6})?\b/g)) {
        const t = m[0]; if (!['THE','AND','FOR','WITH','HAS','ARE','NOT','BUT','ALL','WAS','CAN','ITS','OR','TO','IN','OF','AT','BE','CV'].includes(t)) add(t, 2);
    }
    const jdLower = jd.toLowerCase();
    for (const term of CURATED) { if (jdLower.includes(term)) add(term, 3); }
    const phraseRx = /(?:experience with|proficiency in|knowledge of|background in|expertise in|skilled in)\s+([A-Za-z][A-Za-z0-9\s\-/]{2,40}?)(?=[,;.\n]|$)/gi;
    for (const m of jd.matchAll(phraseRx)) {
        const raw = m[1].trim().toLowerCase();
        const words = raw.split(/\s+/).filter(w => !STOPWORDS_LOWER.has(w));
        if (words.length > 0 && words.length <= 4) add(words.join(' '), 3);
    }
    const sorted = [...freq.entries()].sort((a,b) => b[1]-a[1]).map(([t]) => t);
    const final = [];
    for (const term of sorted) {
        const tl = term.toLowerCase();
        if (!final.some(f => f.toLowerCase().includes(tl) || tl.includes(f.toLowerCase()))) final.push(term);
        if (final.length >= 25) break;
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

// ─── Main quality checker ─────────────────────────────────────────────────────

function checkCV(cv, jd) {
    const issues = [];   // { severity: 'FAIL'|'WARN', rule, detail }
    const passes = [];   // rule names that passed

    // ── 1. Summary checks ────────────────────────────────────────────────────
    const summary = cv.summary || '';
    const summaryWords = summary.trim().split(/\s+/).filter(Boolean).length;

    if (SEEKING_PATTERN.test(summary)) {
        issues.push({ severity: 'FAIL', rule: 'seeking_opener', detail: 'Summary contains "seeking/looking to…" — must open with candidate value.' });
    } else passes.push('no_seeking_opener');

    if (summaryWords < 60) {
        issues.push({ severity: 'FAIL', rule: 'summary_too_short', detail: `Summary is ${summaryWords} words (min 60).` });
    } else if (summaryWords > 115) {
        issues.push({ severity: 'WARN', rule: 'summary_too_long', detail: `Summary is ${summaryWords} words (max 90 recommended).` });
    } else {
        passes.push('summary_length');
    }

    if (BUZZWORD_RX.test(summary)) {
        issues.push({ severity: 'WARN', rule: 'buzzword_in_summary', detail: 'Summary contains generic buzzwords.' });
    } else passes.push('no_buzzwords_summary');

    // ── 2. Banned phrase scan (full CV text) ─────────────────────────────────
    const fullText = gatherCVText(cv);
    const bannedFound = [];
    for (const [rx, replacement] of BANNED_PHRASES) {
        rx.lastIndex = 0;
        if (rx.test(fullText)) bannedFound.push(rx.source.replace(/\\b/g,'').replace(/\\\\/g,'').replace(/\//g,'').replace(/gi/,'').split('|')[0]);
    }
    if (bannedFound.length > 0) {
        issues.push({ severity: 'WARN', rule: 'banned_phrases', detail: `Banned phrases found: ${bannedFound.slice(0,5).join(', ')}` });
    } else {
        passes.push('no_banned_phrases');
    }

    // ── 3. Fake verb scan ────────────────────────────────────────────────────
    if (FAKE_VERB_PATTERN.test(fullText)) {
        issues.push({ severity: 'WARN', rule: 'fake_verbs', detail: 'Contains AI-invented verbs (greenfielded, scaffolded, materialized, actioned, ideated, solutioned).' });
    } else passes.push('no_fake_verbs');

    // ── 4. Experience bullet checks ──────────────────────────────────────────
    for (const role of (cv.experience || [])) {
        const bullets = (role.responsibilities || []).filter(b => typeof b === 'string' && b.trim());
        const label = `"${role.jobTitle} @ ${role.company}"`;
        if (bullets.length === 0) continue;

        // Arrow separators
        const arrowBullets = bullets.filter(b => ARROW_RX.test(b));
        if (arrowBullets.length > 0) {
            issues.push({ severity: 'WARN', rule: 'arrow_separator', detail: `${label}: ${arrowBullets.length} bullet(s) use "→" as sentence separator.` });
        } else passes.push(`arrow_free:${label}`);

        // Bullet too short
        const stubs = bullets.filter(b => b.trim().split(/\s+/).filter(Boolean).length < 8);
        if (stubs.length > 0) {
            issues.push({ severity: 'FAIL', rule: 'bullet_too_short', detail: `${label}: ${stubs.length} bullet(s) under 8 words.` });
        } else passes.push(`bullet_length:${label}`);

        // Banned opener
        let foundBannedOpener = false;
        for (const b of bullets) {
            const firstWord = b.trim().split(/\s+/)[0] ?? '';
            if (BANNED_OPENER_RX.test(firstWord)) {
                issues.push({ severity: 'WARN', rule: 'banned_opener', detail: `${label}: bullet starts with banned verb "${firstWord}".` });
                foundBannedOpener = true; break;
            }
        }
        if (!foundBannedOpener) passes.push(`no_banned_opener:${label}`);

        // Fake verb in bullet
        let foundFakeVerb = false;
        for (const b of bullets) {
            if (FAKE_VERB_PATTERN.test(b)) {
                issues.push({ severity: 'WARN', rule: 'fake_verb_in_bullet', detail: `${label}: bullet uses AI-invented verb.` });
                foundFakeVerb = true; break;
            }
        }
        if (!foundFakeVerb) passes.push(`no_fake_verb:${label}`);

        // Chained metric
        let foundChained = false;
        for (const b of bullets) {
            if (CHAINED_METRIC_RX.test(b)) {
                issues.push({ severity: 'WARN', rule: 'chained_metric', detail: `${label}: chained causal metric ("X% resulting in Y%") detected.` });
                foundChained = true; break;
            }
        }
        if (!foundChained) passes.push(`no_chained_metric:${label}`);

        // Empty metric placeholder
        let foundEmpty = false;
        for (const b of bullets) {
            EMPTY_METRIC_RX.lastIndex = 0;
            if (EMPTY_METRIC_RX.test(b)) {
                issues.push({ severity: 'FAIL', rule: 'empty_metric_placeholder', detail: `${label}: bullet has empty metric placeholder.` });
                foundEmpty = true; break;
            }
        }
        if (!foundEmpty) passes.push(`no_empty_metric:${label}`);

        // All-metric bullets (>55%)
        const withMetric = bullets.filter(b => METRIC_IN_BULLET.test(b)).length;
        const metricRatio = withMetric / bullets.length;
        if (bullets.length >= 4 && metricRatio > 0.55) {
            issues.push({ severity: 'FAIL', rule: 'all_metrics', detail: `${label}: ${withMetric}/${bullets.length} bullets have metrics (max 55%). Add qualitative bullets.` });
        } else {
            passes.push(`metric_ratio_ok:${label}`);
        }

        // Flat bullet rhythm (3+ consecutive short bullets)
        let maxConsecShort = 0, consecShort = 0;
        for (const b of bullets) {
            if (b.trim().split(/\s+/).filter(Boolean).length < 12) { consecShort++; maxConsecShort = Math.max(maxConsecShort, consecShort); }
            else consecShort = 0;
        }
        if (maxConsecShort >= 3) {
            issues.push({ severity: 'WARN', rule: 'flat_bullet_rhythm', detail: `${label}: ${maxConsecShort} consecutive short bullets (<12 words). Mix bullet lengths.` });
        } else passes.push(`rhythm_ok:${label}`);

        // Opener diversity — >85% verb-led
        const categories = bullets.map(classifyOpener);
        const verbCount = categories.filter(c => c === 'verb').length;
        if (bullets.length >= 4 && verbCount / bullets.length > 0.85) {
            issues.push({ severity: 'WARN', rule: 'all_verb_led', detail: `${label}: ${verbCount}/${bullets.length} bullets (${Math.round(verbCount/bullets.length*100)}%) start with a verb — add number/scope/context openers.` });
        } else passes.push(`opener_diversity:${label}`);

        // Consecutive same-opener monotone (≥3)
        let streak = 1;
        for (let i = 1; i < categories.length; i++) {
            if (categories[i] === categories[i-1]) { streak++; } else streak = 1;
            if (streak >= 3) {
                issues.push({ severity: 'WARN', rule: 'opener_monotone', detail: `${label}: ${streak}+ consecutive "${categories[i]}" openers.` });
                break;
            }
        }

        // Verb cluster dominance (>50% one cluster)
        const clusterCounts = {};
        for (const b of bullets) {
            const s = b.replace(/^[\s•\-*·]+/, '').trim();
            for (const [cluster, rx] of Object.entries(VERB_CLUSTERS)) {
                if (rx.test(s)) { clusterCounts[cluster] = (clusterCounts[cluster] || 0) + 1; break; }
            }
        }
        for (const [cluster, count] of Object.entries(clusterCounts)) {
            if (count / bullets.length > 0.50) {
                issues.push({ severity: 'WARN', rule: 'verb_cluster_dominance', detail: `${label}: "${cluster}" verb cluster: ${count}/${bullets.length} bullets (${Math.round(count/bullets.length*100)}%) — too repetitive.` });
            }
        }

        // Duplicate opener (same first word twice)
        const openerSet = new Set();
        let foundDup = false;
        for (const b of bullets) {
            const first = b.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g,'') ?? '';
            if (!first) continue;
            if (openerSet.has(first)) {
                issues.push({ severity: 'WARN', rule: 'duplicate_opener', detail: `${label}: multiple bullets start with "${first}".` });
                foundDup = true; break;
            }
            openerSet.add(first);
        }
        if (!foundDup) passes.push(`unique_openers:${label}`);
    }

    // ── 5. Round-number saturation ───────────────────────────────────────────
    const numbers = fullText.match(/\b\d+(?:\.\d+)?\s?%?/g) || [];
    if (numbers.length >= 4) {
        const round = numbers.filter(n => { const v = parseFloat(n); return !isNaN(v) && (v % 5 === 0 || v % 10 === 0); }).length;
        const ratio = round / numbers.length;
        if (ratio > 0.6) {
            issues.push({ severity: 'WARN', rule: 'round_number_saturation', detail: `${Math.round(ratio*100)}% of metrics are round numbers (max 60%). Mix in specific numbers like 47%, 3.2x, 11 days.` });
        } else passes.push('number_variety');
    }

    // ── 6. Phrase repetition (4+ word phrases repeated 2+ times) ────────────
    const textLower = fullText.toLowerCase().replace(/[^\w\s]/g, ' ');
    const words = textLower.split(/\s+/).filter(Boolean);
    const STOPWORDS = new Set(['the','and','a','an','of','in','to','for','with','on','at','by','is','was','as','or','this','that','it','be']);
    const phraseCounts = new Map();
    for (let n = 4; n <= 6; n++) {
        for (let i = 0; i + n <= words.length; i++) {
            const window = words.slice(i, i + n);
            const contentWords = window.filter(w => !STOPWORDS.has(w)).length;
            if (contentWords < Math.ceil(n * 0.6)) continue;
            const phrase = window.join(' ');
            phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
        }
    }
    const repeatedPhrases = [...phraseCounts.entries()].filter(([,c]) => c >= 2).sort((a,b) => b[1]-a[1]).map(([p,c]) => `"${p}" ×${c}`);
    if (repeatedPhrases.length > 0) {
        issues.push({ severity: 'WARN', rule: 'phrase_repetition', detail: `${repeatedPhrases.length} repeated phrase(s): ${repeatedPhrases.slice(0,3).join(', ')}` });
    } else passes.push('no_phrase_repetition');

    // ── 7. ATS coverage ──────────────────────────────────────────────────────
    const ats = scoreAtsCoverage(cv, jd);
    if (ats.score < 60) {
        issues.push({ severity: 'FAIL', rule: 'ats_coverage_low', detail: `ATS score ${ats.score}% (min 60%). Missing: ${ats.missing.slice(0,6).join(', ')}` });
    } else if (ats.score < 75) {
        issues.push({ severity: 'WARN', rule: 'ats_coverage_moderate', detail: `ATS score ${ats.score}% (target 75%+). Missing: ${ats.missing.slice(0,4).join(', ')}` });
    } else passes.push(`ats_coverage_${ats.score}pct`);

    const criticalFails = issues.filter(i => i.severity === 'FAIL').length;
    const warns = issues.filter(i => i.severity === 'WARN').length;
    const verdict = criticalFails > 0 ? 'FAIL' : warns > 2 ? 'WARN' : 'PASS';

    return { verdict, issues, passes, ats, criticalFails, warns };
}

// ─── Reporting ────────────────────────────────────────────────────────────────

function printResult(fixture, cv, result, durationMs) {
    const icon = result.verdict === 'PASS' ? '✅' : result.verdict === 'WARN' ? '⚠️ ' : '❌';
    console.log(`\n${icon} [${result.verdict}] ${fixture.label}  (${durationMs}ms)`);
    console.log(`   ATS Coverage: ${result.ats.score}%  |  FAIL rules: ${result.criticalFails}  |  WARN rules: ${result.warns}  |  PASS rules: ${result.passes.length}`);
    if (result.issues.length > 0) {
        for (const issue of result.issues) {
            const prefix = issue.severity === 'FAIL' ? '  ❌ FAIL' : '  ⚠️  WARN';
            console.log(`${prefix} [${issue.rule}] ${issue.detail}`);
        }
    }
    if (result.ats.missing.length > 0) {
        console.log(`   Missing ATS keywords: ${result.ats.missing.slice(0,8).join(', ')}`);
    }
    if (result.ats.found.length > 0) {
        console.log(`   ATS keywords found: ${result.ats.found.slice(0,8).join(', ')}`);
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const fastMode = args.includes('--fast');
    const jdArg = args.find(a => a.startsWith('--jd='))?.split('=')[1];
    let fixtures = JD_FIXTURES;
    if (jdArg) {
        fixtures = JD_FIXTURES.filter(f => f.id === jdArg);
        if (fixtures.length === 0) {
            console.error(`Unknown JD id: "${jdArg}". Valid ids: ${JD_FIXTURES.map(f => f.id).join(', ')}`);
            process.exit(1);
        }
    } else if (fastMode) {
        fixtures = JD_FIXTURES.slice(0, 4);
    }

    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║         ProCV — Batch CV Generation + Quality Test Runner        ║');
    console.log('║         Powered by Replit AI Integrations (no API key needed)    ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    if (fastMode) console.log('\n  ⚡ Fast mode: running first 4 JD types only (use without --fast for all 8)');
    console.log(`\nRunning ${fixtures.length} JD types × 1 CV each\n`);

    const report = { runAt: new Date().toISOString(), results: [] };
    let totalPass = 0, totalWarn = 0, totalFail = 0;

    for (const fixture of fixtures) {
        process.stdout.write(`  Generating CV for: ${fixture.label}... `);
        const t0 = Date.now();
        let cv, result;
        try {
            cv = await generateCV(fixture, CANDIDATE_PROFILE);
            const durationMs = Date.now() - t0;
            process.stdout.write(`done (${durationMs}ms)\n`);
            result = checkCV(cv, fixture.jd);
            printResult(fixture, cv, result, durationMs);
            report.results.push({ fixture: fixture.id, label: fixture.label, verdict: result.verdict, durationMs, ats: result.ats, issues: result.issues, passCount: result.passes.length, cv });
        } catch (err) {
            const durationMs = Date.now() - t0;
            process.stdout.write(`ERROR: ${err.message}\n`);
            report.results.push({ fixture: fixture.id, label: fixture.label, verdict: 'ERROR', error: err.message, durationMs });
        }
        if (!result) { totalFail++; continue; }
        if (result.verdict === 'PASS') totalPass++;
        else if (result.verdict === 'WARN') totalWarn++;
        else totalFail++;

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 200));
    }

    // ── Summary ────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`  ✅ PASS : ${totalPass}`);
    console.log(`  ⚠️  WARN : ${totalWarn}`);
    console.log(`  ❌ FAIL : ${totalFail}`);
    console.log(`  Total  : ${JD_FIXTURES.length}`);

    const avgAts = report.results.filter(r => r.ats).reduce((s, r) => s + r.ats.score, 0) / (report.results.filter(r => r.ats).length || 1);
    console.log(`\n  Average ATS Coverage : ${Math.round(avgAts)}%`);

    const overallVerdict = totalFail > 0 ? '❌ PIPELINE HAS FAILURES' : totalWarn > totalPass ? '⚠️  PIPELINE HAS WARNINGS' : '✅ PIPELINE PASSING';
    console.log(`\n  Overall: ${overallVerdict}`);

    // ── Write JSON report ──────────────────────────────────────────────────
    const reportPath = join(__dirname, 'batch-cv-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n  Full report saved to: backend/scripts/batch-cv-report.json`);
    console.log('═══════════════════════════════════════════════════════════════════\n');

    process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
