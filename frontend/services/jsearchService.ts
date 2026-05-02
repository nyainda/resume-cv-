/**
 * JSearch Service — RapidAPI JSearch integration
 * Provides real live job listings with rich filters.
 * API docs: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
 */

const BASE_URL = 'https://jsearch.p.rapidapi.com';
const HOST = 'jsearch.p.rapidapi.com';

export interface JSearchFilters {
  query: string;
  country?: string;
  datePosted?: 'all' | 'today' | '3days' | 'week' | 'month';
  employmentTypes?: string[];  // FULLTIME, PARTTIME, CONTRACTOR, INTERN
  remoteOnly?: boolean;
  jobRequirements?: string;    // under_3_years_experience | more_than_3_years_experience | no_experience | no_degree
  page?: number;
  numPages?: number;
}

export interface JSearchJob {
  id: string;
  title: string;
  company: string;
  companyLogo?: string;
  location: string;
  city?: string;
  country?: string;
  isRemote: boolean;
  employmentType: string;
  publisher: string;
  applyLink: string;
  description: string;
  postedAt?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
}

export interface JSearchResult {
  jobs: JSearchJob[];
  total?: number;
}

function mapJob(raw: any): JSearchJob {
  const city = raw.job_city || '';
  const country = raw.job_country || '';
  const state = raw.job_state || '';
  const locationParts = [city, state, country].filter(Boolean);
  const location = locationParts.join(', ') || (raw.job_is_remote ? 'Remote' : 'Location not specified');

  return {
    id: raw.job_id || `jsearch-${Math.random()}`,
    title: raw.job_title || 'Untitled',
    company: raw.employer_name || 'Unknown Company',
    companyLogo: raw.employer_logo || undefined,
    location,
    city: raw.job_city,
    country: raw.job_country,
    isRemote: raw.job_is_remote === true,
    employmentType: raw.job_employment_type || '',
    publisher: raw.job_publisher || 'JSearch',
    applyLink: raw.job_apply_link || '',
    description: raw.job_description || '',
    postedAt: raw.job_posted_at_datetime_utc,
    salaryMin: raw.job_salary_min || undefined,
    salaryMax: raw.job_salary_max || undefined,
    salaryCurrency: raw.job_salary_currency || undefined,
    salaryPeriod: raw.job_salary_period || undefined,
  };
}

export async function searchJobs(
  apiKey: string,
  filters: JSearchFilters
): Promise<JSearchResult> {
  const params = new URLSearchParams();

  const { query, country, datePosted, employmentTypes, remoteOnly, jobRequirements, page, numPages } = filters;

  // Build contextual query
  let fullQuery = query.trim();
  if (country && country !== 'worldwide') {
    fullQuery += ` in ${country}`;
  }
  if (remoteOnly) {
    fullQuery += ' remote';
  }

  params.set('query', fullQuery);
  params.set('page', String(page ?? 1));
  params.set('num_pages', String(numPages ?? 1));

  if (datePosted && datePosted !== 'all') {
    params.set('date_posted', datePosted);
  }
  if (remoteOnly) {
    params.set('remote_jobs_only', 'true');
  }
  if (employmentTypes && employmentTypes.length > 0) {
    params.set('employment_types', employmentTypes.join(','));
  }
  if (jobRequirements) {
    params.set('job_requirements', jobRequirements);
  }

  const url = `${BASE_URL}/search?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': HOST,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    if (res.status === 403) throw new Error('Invalid JSearch API key. Check your RapidAPI credentials.');
    if (res.status === 429) throw new Error('JSearch rate limit reached. Try again in a moment.');
    throw new Error(`JSearch API error: ${res.status}`);
  }

  const data = await res.json();

  if (data.status !== 'OK' && data.status !== 'ok') {
    throw new Error(data.error || 'JSearch returned an unexpected response.');
  }

  const jobs: JSearchJob[] = (data.data || []).map(mapJob);
  return { jobs, total: data.total };
}

// ── Filter option constants ────────────────────────────────────────────────────

export const EMPLOYMENT_TYPES = [
  { value: 'FULLTIME', label: 'Full-time' },
  { value: 'PARTTIME', label: 'Part-time' },
  { value: 'CONTRACTOR', label: 'Contract' },
  { value: 'INTERN', label: 'Internship' },
];

export const DATE_POSTED_OPTIONS = [
  { value: 'all', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '3days', label: 'Last 3 days' },
  { value: 'week', label: 'Last week' },
  { value: 'month', label: 'Last month' },
];

export const EXPERIENCE_LEVELS = [
  { value: '', label: 'Any experience' },
  { value: 'no_experience', label: 'No experience required' },
  { value: 'under_3_years_experience', label: 'Under 3 years' },
  { value: 'more_than_3_years_experience', label: '3+ years' },
  { value: 'no_degree', label: 'No degree required' },
];

export const COUNTRIES = [
  { value: 'worldwide', label: '🌍 Worldwide' },
  { value: 'United States', label: '🇺🇸 United States' },
  { value: 'United Kingdom', label: '🇬🇧 United Kingdom' },
  { value: 'Canada', label: '🇨🇦 Canada' },
  { value: 'Australia', label: '🇦🇺 Australia' },
  { value: 'Germany', label: '🇩🇪 Germany' },
  { value: 'France', label: '🇫🇷 France' },
  { value: 'Netherlands', label: '🇳🇱 Netherlands' },
  { value: 'Switzerland', label: '🇨🇭 Switzerland' },
  { value: 'Sweden', label: '🇸🇪 Sweden' },
  { value: 'Norway', label: '🇳🇴 Norway' },
  { value: 'Denmark', label: '🇩🇰 Denmark' },
  { value: 'Ireland', label: '🇮🇪 Ireland' },
  { value: 'Singapore', label: '🇸🇬 Singapore' },
  { value: 'UAE', label: '🇦🇪 UAE / Dubai' },
  { value: 'Kenya', label: '🇰🇪 Kenya' },
  { value: 'South Africa', label: '🇿🇦 South Africa' },
  { value: 'Nigeria', label: '🇳🇬 Nigeria' },
  { value: 'India', label: '🇮🇳 India' },
  { value: 'New Zealand', label: '🇳🇿 New Zealand' },
  { value: 'Portugal', label: '🇵🇹 Portugal' },
  { value: 'Spain', label: '🇪🇸 Spain' },
  { value: 'Belgium', label: '🇧🇪 Belgium' },
  { value: 'Poland', label: '🇵🇱 Poland' },
];

export const JOB_CATEGORIES = [
  { value: '', label: '🗂 All Categories' },
  { value: 'Software Engineer', label: '💻 Software Engineering' },
  { value: 'Data Scientist', label: '📊 Data Science & AI' },
  { value: 'Product Manager', label: '📦 Product Management' },
  { value: 'UX Designer', label: '🎨 Design & UX' },
  { value: 'Marketing Manager', label: '📣 Marketing' },
  { value: 'Sales Manager', label: '💼 Sales' },
  { value: 'Finance Analyst', label: '💰 Finance & Accounting' },
  { value: 'DevOps Engineer', label: '⚙️ DevOps & Cloud' },
  { value: 'Cybersecurity Analyst', label: '🔐 Cybersecurity' },
  { value: 'Project Manager', label: '🗓 Project Management' },
  { value: 'Business Analyst', label: '📈 Business Analysis' },
  { value: 'Human Resources', label: '👥 HR & Recruiting' },
  { value: 'Legal Counsel', label: '⚖️ Legal' },
  { value: 'Healthcare', label: '🏥 Healthcare' },
  { value: 'Teaching', label: '🏫 Education & Teaching' },
  { value: 'Research Scientist', label: '🔬 Research & Science' },
  { value: 'Content Writer', label: '✍️ Writing & Content' },
  { value: 'Customer Support', label: '🎧 Customer Support' },
  { value: 'Operations Manager', label: '🏭 Operations' },
];

export function formatSalary(job: JSearchJob): string | null {
  if (!job.salaryMin && !job.salaryMax) return null;
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
  const currency = job.salaryCurrency || '';
  const period = job.salaryPeriod === 'YEAR' ? '/yr' : job.salaryPeriod === 'MONTH' ? '/mo' : '';
  if (job.salaryMin && job.salaryMax) {
    return `${currency}${fmt(job.salaryMin)}–${fmt(job.salaryMax)}${period}`;
  }
  const val = job.salaryMin || job.salaryMax!;
  return `${currency}${fmt(val)}${period}`;
}

export function timeAgo(isoDate?: string): string {
  if (!isoDate) return '';
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
