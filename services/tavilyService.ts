
// ─── Tavily AI Search Service ─────────────────────────────────────────────────
// Free tier: 1,000 API credits/month. Every fetch() call = 1 credit.
// Budget strategy:
//   • Cache search results 1 hour in localStorage (avoids re-searches)
//   • Background refresh at most once per hour per saved search
//   • URL fetch = 1 credit (raw_content)
//   • Company research = 1 credit (optional, can be skipped)
//   • Usage counter saved in localStorage, resets each calendar month

import { ScrapedJob } from '../types';

const TAVILY_URL = 'https://api.tavily.com/search';
const CACHE_KEY = 'tavily_cache_v2';
const USAGE_KEY = 'tavily_usage_v2';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in ms
const FREE_LIMIT = 1000;

// ─── Platform Domain Lists ─────────────────────────────────────────────────────

export const PLATFORMS = {

    // 🌍 Remote worldwide (quality platforms only)
    remote: [
        'remote.co', 'remoteok.com', 'weworkremotely.com', 'remotejobs.com',
        'flexjobs.com', 'jobspresso.co', 'nodesk.co', 'justremote.co',
        'dynamitejobs.com', 'remotemore.com', 'outsourcely.com',
        'himalayas.app', 'remotive.com', 'remotehub.com', 'powertofly.com',
        'workingnomads.com', 'getremote.com', 'remote.io', 'turing.com',
        'toptal.com', 'gun.io', 'upstack.co', 'arc.dev', 'andela.com',
        'crossover.com', 'lemon.io', 'talent.io', 'wellfound.com',
        'angel.co', 'greenhouse.io', 'lever.co', 'workable.com',
    ] as string[],

    // 🇰🇪 Kenya & East Africa — job boards + major company career pages
    kenya: [
        'brightermonday.co.ke', 'myjobmag.co.ke', 'fuzu.com',
        'jobwebkenya.com', 'pigiame.co.ke', 'nafasi.co.ke',
        'careerpoint.ke', 'africajobsearch.com',
        'myjobmag.com',
        'ngocareers.com',
        'devnetjobs.org',
        'reliefweb.int',
        'un.org',
        'worldbank.org',
        'afdb.org',
        'linkedin.com',
        'indeed.co.ke',
        // Major Kenyan company career pages
        'safaricom.co.ke',       // Safaricom
        'equitybank.co.ke',      // Equity Bank
        'kcbgroup.com',          // KCB Bank
        'co-opbank.co.ke',       // Co-operative Bank
        'kplc.co.ke',            // Kenya Power
        'standardmedia.co.ke',   // Standard Media
        'nation.africa',         // Nation Media
        'twiga.com',             // Twiga Foods
        'mpesa.com',             // M-Pesa
        'craft-silicon.com',     // Craft Silicon
        'cellulant.io',          // Cellulant
        'andela.com',            // Andela (Nairobi office)
        'google.com',            // Google Kenya
        'microsoft.com',         // Microsoft Kenya
        'ibm.com',               // IBM Kenya
        'deloitte.com',          // Deloitte East Africa
        'kpmg.com',              // KPMG Kenya
        'pwc.com',               // PwC Kenya
        'unilever.com',          // Unilever Kenya
        'diageo.com',            // East African Breweries
    ] as string[],

    // 🛂 Visa-sponsored
    visa: [
        'linkedin.com', 'indeed.com', 'glassdoor.com',
        'workpermit.com', 'immigrationboards.com',
        'euworkers.eu',
        'eures.europa.eu',
        'stepstone.de',
        'xing.com',
        'arbeitsagentur.de',
        'workopolis.com',
        'jobbank.gc.ca',
        'seek.com.au',
        'careerone.com.au',
        'myjob.mu',
        'bayt.com',
        'gulftalent.com',
        'naukrigulf.com',
        'mycareersfuture.gov.sg',
        'jobsdb.com',
        'cvlibrary.co.uk',
        'reed.co.uk',
        'totaljobs.com',
        'ziprecruiter.com',
        'monster.com',
    ] as string[],

    // 🎓 Scholarships & Fellowships
    scholarships: [
        'scholarshipportal.com', 'opportunitydesk.org', 'scholars4dev.com',
        'afterschoolafrica.com', 'youthop.com', 'scholarship.com',
        'scholarships.com', 'chevening.org', 'daad.de',
        'commonwealthscholarships.ac.uk', 'fulbright.org',
        'aucegypt.edu',
        'masterandmore.eu',
        'erasmus.eu',
        'studyabroad.com',
        'topuniversities.com',
        'findamasters.com',
        'jobs.ac.uk',
        'euraxess.ec.europa.eu',
        'mariecuriealumni.eu',
        'grantforward.com',
        'fundsforngos.org',
        'worldbank.org',
        'unfoundation.org',
    ] as string[],

    // 🌐 General global
    global: [
        'linkedin.com', 'indeed.com', 'glassdoor.com', 'monster.com',
        'ziprecruiter.com', 'simplyhired.com', 'careerbuilder.com',
        'dice.com', 'wellfound.com', 'angel.co', 'greenhouse.io',
        'lever.co', 'workable.com', 'careers.google.com', 'amazon.jobs',
        'jobs.microsoft.com', 'metacareers.com', 'apple.com',
        'netflix.com', 'uber.com', 'airbnb.com', 'stripe.com',
        'shopify.com', 'hubspot.com', 'salesforce.com',
        'reed.co.uk', 'totaljobs.com', 'seek.com.au', 'jobbank.gc.ca',
        'bayt.com', 'naukri.com',
    ] as string[],
};

// ─── Trusted domain set (allowlist) ───────────────────────────────────────────
const TRUSTED_DOMAINS = new Set<string>([
    ...PLATFORMS.remote,
    ...PLATFORMS.kenya,
    ...PLATFORMS.visa,
    ...PLATFORMS.scholarships,
    ...PLATFORMS.global,
]);

// ─── Known scam & low-quality domains ─────────────────────────────────────────
const SCAM_DOMAINS = new Set([
    'craigslist.org', 'backpage.com', 'oodle.com',
    'jooble.org', 'trovit.com', // aggregators with lots of spam
    'neuvoo.com', 'jobisland.com', 'careerjet.com', // low-quality aggregators
    'jobrapido.com',
]);

// Scam text patterns in job titles / snippets
const SCAM_PATTERNS = [
    /earn \$\d{3,}[\w\s]*(?:week|day|hour)/i,
    /work from home.{0,20}unlimited/i,
    /no experience.{0,10}required.{0,30}earn/i,
    /multi.?level marketing/i,
    /network marketing/i,
    /guaranteed income/i,
    /make money fast/i,
    /\$\d{4,}.{0,10}per.{0,10}day/i,
    /typing jobs/i,
    /data entry.{0,30}\$\d{3,}/i,
    /investment opportunity/i,
    /get rich/i,
    /pyramid/i,
];

// ─── Listing/Index page detector ──────────────────────────────────────────────
// These patterns detect aggregate listing pages like "Latest Jobs Page 269"
// instead of individual job posts. We skip these.
const LISTING_PAGE_PATTERNS = [
    /page \d+/i,                       // "Page 269"
    /latest .{0,20} jobs/i,            // "Latest Engineering Jobs"
    /find .{0,20} jobs/i,              // "Find current jobs"
    /search and apply/i,               // "Search and apply"
    /\d+ jobs? found/i,                // "245 jobs found"
    /\d+ open positions/i,             // "50 open positions"
    /browse .{0,15} jobs/i,            // "Browse all jobs"
    /job listings/i,                   // "Job Listings"
    /all jobs/i,                       // "All Jobs"
    /jobs near you/i,                  // "Jobs near you"
    /top \d+ .{0,10} jobs/i,           // "Top 100 Engineering Jobs"
    /vacancies? \d{4}/i,               // "Vacancies 2025"
    /career opportunities/i,           // "Career opportunities" (generic landing)
    /jobs? categor/i,                  // "Job categories"
    /jobs? search results/i,           // "Job Search Results"
];

const isListingPage = (title: string, snippet: string): boolean => {
    const text = `${title} ${snippet}`;
    return LISTING_PAGE_PATTERNS.some(p => p.test(text));
};

const isScam = (title: string, snippet: string): boolean => {
    const text = `${title} ${snippet}`;
    return SCAM_PATTERNS.some(p => p.test(text));
};

// Allow any domain that isn't a known scam site.
// Individual job posts on company career pages are perfectly valid.
const isNotScamDomain = (url: string): boolean => {
    try {
        const hostname = new URL(url).hostname.replace('www.', '');
        if (SCAM_DOMAINS.has(hostname)) return false;
        return true;
    } catch {
        return false;
    }
};

// ─── Source label ──────────────────────────────────────────────────────────────
const SOURCE_LABELS: Record<string, string> = {
    'linkedin.com': 'LinkedIn', 'indeed.com': 'Indeed',
    'glassdoor.com': 'Glassdoor', 'reed.co.uk': 'Reed',
    'totaljobs.com': 'TotalJobs', 'monster.com': 'Monster',
    'workable.com': 'Workable', 'lever.co': 'Lever',
    'greenhouse.io': 'Greenhouse', 'careers.google.com': 'Google',
    'amazon.jobs': 'Amazon', 'jobs.microsoft.com': 'Microsoft',
    'metacareers.com': 'Meta', 'apple.com': 'Apple',
    'remote.co': 'Remote.co', 'remoteok.com': 'RemoteOK',
    'weworkremotely.com': 'WWR', 'flexjobs.com': 'FlexJobs',
    'himalayas.app': 'Himalayas', 'remotive.com': 'Remotive',
    'wellfound.com': 'Wellfound', 'angel.co': 'AngelList',
    'brightermonday.co.ke': 'BrighterMonday', 'myjobmag.co.ke': 'MyJobMag',
    'fuzu.com': 'Fuzu', 'jobwebkenya.com': 'JobWebKenya',
    'reliefweb.int': 'ReliefWeb', 'un.org': 'UN Careers',
    'worldbank.org': 'World Bank', 'ngocareers.com': 'NGO Careers',
    'scholarshipportal.com': 'ScholarshipPortal',
    'opportunitydesk.org': 'OpportunityDesk',
    'scholars4dev.com': 'Scholars4Dev', 'afterschoolafrica.com': 'AfterSchool Africa',
    'chevening.org': 'Chevening', 'daad.de': 'DAAD',
    'fulbright.org': 'Fulbright', 'seek.com.au': 'SEEK',
    'jobbank.gc.ca': 'Canada Job Bank', 'eures.europa.eu': 'EURES',
    'stepstone.de': 'StepStone', 'bayt.com': 'Bayt',
    'gulftalent.com': 'GulfTalent', 'workopolis.com': 'Workopolis',
};

const getSourceLabel = (url: string): string => {
    try {
        const hostname = new URL(url).hostname.replace('www.', '');
        for (const [domain, label] of Object.entries(SOURCE_LABELS)) {
            if (hostname.includes(domain)) return label;
        }
        return hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);
    } catch {
        return 'Web';
    }
};

// ─── Parse job title/company from page title ───────────────────────────────────
const parseJobMeta = (title: string, url: string): { title: string; company: string } => {
    const seps = [' at ', ' - ', ' | ', ' @ ', ' · ', ' – '];
    for (const sep of seps) {
        if (title.includes(sep)) {
            const parts = title.split(sep);
            const company = parts[1]?.split('|')[0]?.split('-')[0]?.split('–')[0]?.trim() || 'Unknown Company';
            return { title: parts[0].trim(), company };
        }
    }
    // Try extracting from URL path
    try {
        const path = new URL(url).pathname;
        const slug = path.split('/').filter(Boolean).pop() || '';
        if (slug) return { title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), company: 'Unknown Company' };
    } catch { /* ignore */ }
    return { title: title.trim(), company: 'Unknown Company' };
};

// ─── API Usage Tracking ────────────────────────────────────────────────────────

interface UsageData { count: number; month: string; }

const getMonth = () => new Date().toISOString().slice(0, 7); // "2025-03"

export const getUsage = (): UsageData => {
    try {
        const raw = localStorage.getItem(USAGE_KEY);
        if (!raw) return { count: 0, month: getMonth() };
        const data: UsageData = JSON.parse(raw);
        if (data.month !== getMonth()) return { count: 0, month: getMonth() }; // reset each month
        return data;
    } catch { return { count: 0, month: getMonth() }; }
};

export const getRemainingCalls = () => Math.max(0, FREE_LIMIT - getUsage().count);

const trackCall = () => {
    const usage = getUsage();
    localStorage.setItem(USAGE_KEY, JSON.stringify({ count: usage.count + 1, month: getMonth() }));
};

// ─── Cache ─────────────────────────────────────────────────────────────────────

interface CacheStore { [key: string]: { results: any[]; ts: number } }

const getCache = (): CacheStore => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
};

const readCache = (key: string): any[] | null => {
    const store = getCache();
    const entry = store[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) return null; // expired
    return entry.results;
};

const writeCache = (key: string, results: any[]) => {
    const store = getCache();
    store[key] = { results, ts: Date.now() };
    // Keep cache small (max 20 entries)
    const keys = Object.keys(store);
    if (keys.length > 20) {
        const oldest = keys.sort((a, b) => store[a].ts - store[b].ts)[0];
        delete store[oldest];
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); } catch { /* storage full */ }
};

export const getCacheAge = (key: string): number | null => {
    const store = getCache();
    const entry = store[key];
    if (!entry) return null;
    const ageMs = Date.now() - entry.ts;
    if (ageMs > CACHE_TTL) return null;
    return Math.round(ageMs / 60000); // age in minutes
};

// ─── Background Refresh Scheduler ─────────────────────────────────────────────
const REFRESH_KEY = 'tavily_refresh';

export const shouldRefresh = (queryKey: string): boolean => {
    try {
        const raw = localStorage.getItem(REFRESH_KEY);
        const store = raw ? JSON.parse(raw) : {};
        const last = store[queryKey] || 0;
        return Date.now() - last > CACHE_TTL;
    } catch { return true; }
};

export const markRefreshed = (queryKey: string) => {
    try {
        const raw = localStorage.getItem(REFRESH_KEY);
        const store = raw ? JSON.parse(raw) : {};
        store[queryKey] = Date.now();
        localStorage.setItem(REFRESH_KEY, JSON.stringify(store));
    } catch { /* ignore */ }
};

// ─── Tavily API Core ───────────────────────────────────────────────────────────

const tavilyPost = async (apiKey: string, body: object): Promise<any> => {
    if (getRemainingCalls() <= 0) throw new Error('Monthly Tavily limit reached (1,000 calls). Resets next month.');
    trackCall();
    const res = await fetch(TAVILY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, ...body }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || `Tavily error ${res.status}: check your API key`);
    }
    return res.json();
};

// ─── Query Builders ────────────────────────────────────────────────────────────

export type JobCategory = 'remote' | 'kenya' | 'visa' | 'scholarships' | 'global';

const buildQuery = (
    category: JobCategory,
    role: string,
    options: { location?: string; visaCountry?: string; scholarshipLevel?: string }
): { query: string; domains: string[] } => {

    const year = '2025';

    // Queries are crafted to return INDIVIDUAL job postings, not listing pages.
    // Key technique: use "hiring" + specific role terms + exclude generic listing terms.
    switch (category) {

        case 'remote':
            return {
                query: `"${role}" hiring remote position description responsibilities requirements ${year}`,
                domains: PLATFORMS.remote,
            };

        case 'kenya':
            return {
                query: `"${role}" hiring Kenya OR Nairobi job description responsibilities requirements ${year}`,
                domains: PLATFORMS.kenya,
            };

        case 'visa': {
            const country = options.visaCountry || 'UK';
            return {
                query: `"${role}" hiring "visa sponsorship" OR "work permit" ${country} job description requirements ${year}`,
                domains: PLATFORMS.visa,
            };
        }

        case 'scholarships': {
            const level = options.scholarshipLevel || 'Masters';
            return {
                query: `"${role || 'scholarship'}" ${level} fully-funded application deadline eligibility requirements ${year}`,
                domains: PLATFORMS.scholarships,
            };
        }

        default: // global
            return {
                query: `"${role}" hiring job description responsibilities requirements ${options.location || ''} ${year}`,
                domains: PLATFORMS.global,
            };
    }
};

// ─── Map Tavily result → ScrapedJob ───────────────────────────────────────────

const mapResult = (
    r: any,
    i: number,
    category: JobCategory,
    options: { location?: string; visaCountry?: string }
): ScrapedJob | null => {
    // Block scam domains
    if (!isNotScamDomain(r.url)) return null;
    const { title, company } = parseJobMeta(r.title || '', r.url);
    const snippet = (r.content || '').slice(0, 350);
    // Skip scam posts
    if (isScam(title, snippet)) return null;
    // Skip listing/index/aggregate pages — we only want individual job posts
    if (isListingPage(title, snippet)) return null;

    return {
        id: `job-${Date.now()}-${i}`,
        title,
        company,
        location: category === 'kenya' ? 'Kenya' : options.location || (category === 'remote' ? 'Remote' : options.visaCountry || ''),
        snippet,
        jobDescription: snippet,
        url: r.url,
        source: getSourceLabel(r.url),
        dateFound: new Date().toISOString(),
        status: 'queued',
    };
};

// ─── 1. Search Jobs by Category ────────────────────────────────────────────────

export const searchJobsByCategory = async (
    category: JobCategory,
    role: string,
    apiKey: string,
    options: { location?: string; visaCountry?: string; scholarshipLevel?: string } = {}
): Promise<{ jobs: ScrapedJob[]; fromCache: boolean; cacheAge: number | null }> => {

    const { query, domains } = buildQuery(category, role, options);
    const cacheKey = `${category}::${query}`;
    const cached = readCache(cacheKey);
    const age = getCacheAge(cacheKey);

    if (cached) {
        return { jobs: cached, fromCache: true, cacheAge: age };
    }

    const data = await tavilyPost(apiKey, {
        query,
        search_depth: 'advanced',       // deeper search finds individual posts better
        include_answer: false,
        include_raw_content: false,
        max_results: 20,                 // request more since listing-page filter removes many
        include_domains: domains.slice(0, 5), // Fewer domains = Tavily searches more broadly within them
    });

    const jobs = (data.results || [])
        .map((r: any, i: number) => mapResult(r, i, category, options))
        .filter(Boolean) as ScrapedJob[];

    writeCache(cacheKey, jobs);
    markRefreshed(cacheKey);

    return { jobs, fromCache: false, cacheAge: null };
};

// ─── 2. Fetch Full JD from a Job URL ──────────────────────────────────────────

export const fetchJobFromUrl = async (
    url: string,
    apiKey: string
): Promise<{ title: string; company: string; jobDescription: string }> => {

    // Validate it's a real URL
    let hostname: string;
    try { hostname = new URL(url).hostname.replace('www.', ''); }
    catch { throw new Error('Please enter a valid job URL (starting with https://)'); }

    const cacheKey = `url::${url}`;
    const cached = readCache(cacheKey);
    if (cached && cached.length > 0) return cached[0];

    const data = await tavilyPost(apiKey, {
        query: `job description requirements responsibilities ${url}`,
        search_depth: 'advanced',
        include_raw_content: true,
        max_results: 1,
        include_domains: [hostname],
    });

    const result = data.results?.[0];
    if (!result) throw new Error('Could not extract job information from that URL. Try copying the JD manually.');

    const rawText = (result.raw_content || result.content || '').replace(/\s{3,}/g, '\n\n').slice(0, 6000);
    const { title, company } = parseJobMeta(result.title || '', url);

    const output = { title, company, jobDescription: rawText };
    writeCache(cacheKey, [output]);
    return output;
};

// ─── 3. Fetch full JD for a queued job ────────────────────────────────────────

export const fetchJobDescription = async (
    url: string,
    jobTitle: string,
    apiKey: string
): Promise<string> => {
    const cacheKey = `jd::${url}`;
    const cached = readCache(cacheKey);
    if (cached && cached[0]) return cached[0];

    let hostname: string;
    try { hostname = new URL(url).hostname.replace('www.', ''); }
    catch { return ''; }

    const data = await tavilyPost(apiKey, {
        query: `${jobTitle} job description requirements responsibilities`,
        search_depth: 'advanced',
        include_raw_content: true,
        max_results: 1,
        include_domains: [hostname],
    });

    const text = (data.results?.[0]?.raw_content || data.results?.[0]?.content || '')
        .replace(/\s{3,}/g, '\n\n').slice(0, 6000);

    if (text) writeCache(cacheKey, [text]);
    return text;
};

// ─── 4. Company Research (for richer CV prompts) ──────────────────────────────

export const researchCompany = async (
    company: string,
    jobTitle: string,
    apiKey: string
): Promise<string> => {
    const cacheKey = `company::${company}::${jobTitle}`;
    const cached = readCache(cacheKey);
    if (cached && cached[0]) return cached[0];

    const data = await tavilyPost(apiKey, {
        query: `${company} company culture values mission what they look for ${jobTitle} hiring 2025`,
        search_depth: 'advanced',
        include_answer: true,
        max_results: 3,
        exclude_domains: ['wikipedia.org'],
    });

    const answer = data.answer ? `SUMMARY: ${data.answer}\n\n` : '';
    const snippets = (data.results || [])
        .map((r: any) => `[${getSourceLabel(r.url)}]: ${r.content?.slice(0, 400) || ''}`)
        .join('\n\n');
    const result = `${answer}${snippets}`.trim();

    if (result) writeCache(cacheKey, [result]);
    return result;
};

// ─── Export constants needed by UI ────────────────────────────────────────────
// (PLATFORMS, TRUSTED_DOMAINS, SCAM_DOMAINS already exported above)
