export interface PortalJob {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  snippet: string;
  source: string;
  dateFound: string;
}

export interface ScanTarget {
  company: string;
  domain?: string;
  portal?: 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'linkedin' | 'custom';
  customQuery?: string;
}

export const PRESET_COMPANIES: ScanTarget[] = [
  { company: 'Anthropic', portal: 'greenhouse', domain: 'boards.greenhouse.io/anthropic' },
  { company: 'OpenAI', portal: 'greenhouse', domain: 'openai.com/careers' },
  { company: 'Google', portal: 'custom', customQuery: 'jobs site:careers.google.com' },
  { company: 'Meta', portal: 'custom', customQuery: 'jobs site:metacareers.com' },
  { company: 'Stripe', portal: 'greenhouse', domain: 'boards.greenhouse.io/stripe' },
  { company: 'Linear', portal: 'ashby', domain: 'jobs.ashbyhq.com/linear' },
  { company: 'Vercel', portal: 'ashby', domain: 'jobs.ashbyhq.com/vercel' },
  { company: 'Cloudflare', portal: 'greenhouse', domain: 'boards.greenhouse.io/cloudflare' },
  { company: 'Notion', portal: 'greenhouse', domain: 'boards.greenhouse.io/notion' },
  { company: 'Figma', portal: 'greenhouse', domain: 'boards.greenhouse.io/figma' },
  { company: 'Retool', portal: 'greenhouse', domain: 'boards.greenhouse.io/retool' },
  { company: 'ElevenLabs', portal: 'ashby', domain: 'jobs.ashbyhq.com/elevenlabs' },
  { company: 'Mistral AI', portal: 'ashby', domain: 'jobs.ashbyhq.com/mistral' },
  { company: 'Perplexity', portal: 'ashby', domain: 'jobs.ashbyhq.com/perplexity' },
  { company: 'Cursor', portal: 'ashby', domain: 'jobs.ashbyhq.com/anysphere' },
  { company: 'Replicate', portal: 'lever', domain: 'jobs.lever.co/replicate' },
  { company: 'Hugging Face', portal: 'lever', domain: 'apply.workable.com/hugging-face' },
  { company: 'Scale AI', portal: 'greenhouse', domain: 'boards.greenhouse.io/scaleai' },
  { company: 'Cohere', portal: 'greenhouse', domain: 'boards.greenhouse.io/cohere' },
  { company: 'Stability AI', portal: 'custom', customQuery: 'jobs site:stability.ai/careers' },
  { company: 'Shopify', portal: 'custom', customQuery: 'jobs site:shopify.com/careers' },
  { company: 'Airbnb', portal: 'greenhouse', domain: 'boards.greenhouse.io/airbnb' },
  { company: 'Spotify', portal: 'custom', customQuery: 'jobs site:lifeatspotify.com' },
  { company: 'Canva', portal: 'greenhouse', domain: 'boards.greenhouse.io/canva' },
  { company: 'Atlassian', portal: 'custom', customQuery: 'jobs site:jobs.lever.co/atlassian' },
  { company: 'HashiCorp', portal: 'greenhouse', domain: 'boards.greenhouse.io/hashicorp' },
  { company: 'Grafana', portal: 'greenhouse', domain: 'boards.greenhouse.io/grafana' },
  { company: 'n8n', portal: 'custom', customQuery: 'jobs n8n site:jobs.lever.co' },
  { company: 'Remote.com', portal: 'greenhouse', domain: 'boards.greenhouse.io/remotecom' },
  { company: 'GitLab', portal: 'greenhouse', domain: 'boards.greenhouse.io/gitlab' },
];

function getTavilyKey(): string {
  try {
    const raw = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings') || '{}';
    const s = JSON.parse(raw);
    if (s.tavilyApiKey) return s.tavilyApiKey.replace(/^"|"$/g, '');
  } catch {}
  throw new Error('Tavily API key not set. Please add it in Settings.');
}

function buildSearchQuery(target: ScanTarget, role: string): string {
  if (target.customQuery) return `${target.customQuery} "${role}"`;
  if (target.domain) return `site:${target.domain} "${role}"`;
  return `${target.company} jobs "${role}"`;
}

export async function scanCompany(
  target: ScanTarget,
  role: string,
  tavilyKey: string
): Promise<PortalJob[]> {
  const query = buildSearchQuery(target, role);

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: tavilyKey,
      query,
      search_depth: 'basic',
      max_results: 5,
      include_domains: target.domain ? [target.domain.split('/')[0]] : [],
    }),
  });

  if (!res.ok) throw new Error(`Tavily error: ${res.status}`);
  const data = await res.json() as { results: Array<{ title: string; url: string; content: string; published_date?: string }> };

  return (data.results || []).map((r, i) => ({
    id: `${target.company}-${i}-${Date.now()}`,
    title: r.title.replace(/\s*[-|–].*$/, '').trim(),
    company: target.company,
    location: extractLocation(r.content) || 'Remote / On-site',
    url: r.url,
    snippet: r.content.slice(0, 200),
    source: target.portal || 'web',
    dateFound: new Date().toISOString().split('T')[0],
  }));
}

export async function scanMultipleCompanies(
  targets: ScanTarget[],
  role: string,
  tavilyKey: string,
  onProgress?: (company: string, done: number, total: number) => void
): Promise<PortalJob[]> {
  const results: PortalJob[] = [];
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    onProgress?.(target.company, i, targets.length);
    try {
      const jobs = await scanCompany(target, role, tavilyKey);
      results.push(...jobs);
    } catch {
    }
    if (i < targets.length - 1) await sleep(300);
  }
  return results;
}

export async function scanCustomUrl(url: string, role: string, tavilyKey: string): Promise<PortalJob[]> {
  const domain = new URL(url).hostname;
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: tavilyKey,
      query: `"${role}" jobs`,
      search_depth: 'basic',
      max_results: 8,
      include_domains: [domain],
    }),
  });

  if (!res.ok) throw new Error(`Tavily error: ${res.status}`);
  const data = await res.json() as { results: Array<{ title: string; url: string; content: string }> };

  return (data.results || []).map((r, i) => ({
    id: `custom-${i}-${Date.now()}`,
    title: r.title.replace(/\s*[-|–].*$/, '').trim(),
    company: domain.replace(/^www\./, ''),
    location: extractLocation(r.content) || 'Check listing',
    url: r.url,
    snippet: r.content.slice(0, 200),
    source: 'custom',
    dateFound: new Date().toISOString().split('T')[0],
  }));
}

function extractLocation(text: string): string | null {
  const patterns = [
    /\b(Remote|Hybrid|On-?site)\b/i,
    /\b([A-Z][a-z]+,\s*[A-Z]{2})\b/,
    /\b(New York|San Francisco|London|Berlin|Austin|Seattle|Toronto|Amsterdam)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
