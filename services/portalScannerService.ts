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
  portal?: 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'linkedin' | 'smartrecruiters' | 'icims' | 'jobvite' | 'custom';
  customQuery?: string;
  category: string;
  logo?: string;
}

export const COMPANY_CATEGORIES = [
  'AI & ML',
  'Big Tech',
  'Cloud & DevOps',
  'Finance & Fintech',
  'SaaS & Productivity',
  'Security',
  'Data & Analytics',
  'E-Commerce & Marketplace',
  'Gaming & Media',
  'Automotive & Hardware',
  'Healthcare & Biotech',
  'Crypto & Web3',
  'Social & Consumer',
  'Startups & Unicorns',
] as const;

export type CompanyCategory = typeof COMPANY_CATEGORIES[number];

export const PRESET_COMPANIES: ScanTarget[] = [
  // ── AI & ML ──────────────────────────────────────────────────────────────
  { company: 'Anthropic', portal: 'greenhouse', domain: 'boards.greenhouse.io/anthropic', category: 'AI & ML' },
  { company: 'OpenAI', portal: 'greenhouse', domain: 'openai.com/careers', category: 'AI & ML' },
  { company: 'Mistral AI', portal: 'ashby', domain: 'jobs.ashbyhq.com/mistral', category: 'AI & ML' },
  { company: 'Perplexity', portal: 'ashby', domain: 'jobs.ashbyhq.com/perplexity', category: 'AI & ML' },
  { company: 'ElevenLabs', portal: 'ashby', domain: 'jobs.ashbyhq.com/elevenlabs', category: 'AI & ML' },
  { company: 'Cohere', portal: 'greenhouse', domain: 'boards.greenhouse.io/cohere', category: 'AI & ML' },
  { company: 'Scale AI', portal: 'greenhouse', domain: 'boards.greenhouse.io/scaleai', category: 'AI & ML' },
  { company: 'Hugging Face', portal: 'custom', customQuery: 'jobs site:apply.workable.com/hugging-face', category: 'AI & ML' },
  { company: 'Stability AI', portal: 'custom', customQuery: 'jobs site:stability.ai/careers', category: 'AI & ML' },
  { company: 'Cursor (Anysphere)', portal: 'ashby', domain: 'jobs.ashbyhq.com/anysphere', category: 'AI & ML' },
  { company: 'Weights & Biases', portal: 'lever', domain: 'jobs.lever.co/wandb', category: 'AI & ML' },
  { company: 'AI21 Labs', portal: 'greenhouse', domain: 'boards.greenhouse.io/ai21labs', category: 'AI & ML' },
  { company: 'Adept AI', portal: 'greenhouse', domain: 'boards.greenhouse.io/adeptai', category: 'AI & ML' },
  { company: 'Character AI', portal: 'greenhouse', domain: 'boards.greenhouse.io/characterai', category: 'AI & ML' },
  { company: 'Inflection AI', portal: 'custom', customQuery: 'jobs site:inflection.ai/careers', category: 'AI & ML' },
  { company: 'xAI (Grok)', portal: 'custom', customQuery: 'xAI Grok jobs careers site:x.ai', category: 'AI & ML' },
  { company: 'DeepMind', portal: 'custom', customQuery: 'jobs site:deepmind.com/careers', category: 'AI & ML' },

  // ── Big Tech ─────────────────────────────────────────────────────────────
  { company: 'Google', portal: 'custom', customQuery: 'jobs site:careers.google.com', category: 'Big Tech' },
  { company: 'Meta', portal: 'custom', customQuery: 'jobs site:metacareers.com', category: 'Big Tech' },
  { company: 'Microsoft', portal: 'custom', customQuery: 'jobs site:careers.microsoft.com', category: 'Big Tech' },
  { company: 'Amazon', portal: 'custom', customQuery: 'jobs site:amazon.jobs', category: 'Big Tech' },
  { company: 'Apple', portal: 'custom', customQuery: 'jobs site:jobs.apple.com', category: 'Big Tech' },
  { company: 'Netflix', portal: 'custom', customQuery: 'jobs site:jobs.netflix.com', category: 'Big Tech' },
  { company: 'Salesforce', portal: 'custom', customQuery: 'jobs site:salesforce.com/company/careers', category: 'Big Tech' },
  { company: 'Oracle', portal: 'custom', customQuery: 'jobs site:oracle.com/careers', category: 'Big Tech' },
  { company: 'IBM', portal: 'custom', customQuery: 'jobs site:ibm.com/employment', category: 'Big Tech' },
  { company: 'Intel', portal: 'custom', customQuery: 'jobs site:jobs.intel.com', category: 'Big Tech' },
  { company: 'NVIDIA', portal: 'custom', customQuery: 'jobs site:nvidia.com/en-us/about-nvidia/careers', category: 'Big Tech' },
  { company: 'AMD', portal: 'custom', customQuery: 'jobs site:careers.amd.com', category: 'Big Tech' },
  { company: 'Adobe', portal: 'custom', customQuery: 'jobs site:adobe.com/careers', category: 'Big Tech' },
  { company: 'Spotify', portal: 'custom', customQuery: 'jobs site:lifeatspotify.com', category: 'Big Tech' },
  { company: 'Uber', portal: 'custom', customQuery: 'jobs site:uber.com/us/en/careers', category: 'Big Tech' },
  { company: 'Lyft', portal: 'greenhouse', domain: 'boards.greenhouse.io/lyft', category: 'Big Tech' },
  { company: 'Airbnb', portal: 'greenhouse', domain: 'boards.greenhouse.io/airbnb', category: 'Big Tech' },
  { company: 'Twitter / X', portal: 'custom', customQuery: 'jobs site:careers.x.com OR site:careers.twitter.com', category: 'Big Tech' },

  // ── Cloud & DevOps ───────────────────────────────────────────────────────
  { company: 'Cloudflare', portal: 'greenhouse', domain: 'boards.greenhouse.io/cloudflare', category: 'Cloud & DevOps' },
  { company: 'Vercel', portal: 'ashby', domain: 'jobs.ashbyhq.com/vercel', category: 'Cloud & DevOps' },
  { company: 'HashiCorp', portal: 'greenhouse', domain: 'boards.greenhouse.io/hashicorp', category: 'Cloud & DevOps' },
  { company: 'GitLab', portal: 'greenhouse', domain: 'boards.greenhouse.io/gitlab', category: 'Cloud & DevOps' },
  { company: 'Grafana', portal: 'greenhouse', domain: 'boards.greenhouse.io/grafana', category: 'Cloud & DevOps' },
  { company: 'Replicate', portal: 'lever', domain: 'jobs.lever.co/replicate', category: 'Cloud & DevOps' },
  { company: 'PlanetScale', portal: 'lever', domain: 'jobs.lever.co/planetscale', category: 'Cloud & DevOps' },
  { company: 'Supabase', portal: 'ashby', domain: 'jobs.ashbyhq.com/supabase', category: 'Cloud & DevOps' },
  { company: 'Railway', portal: 'ashby', domain: 'jobs.ashbyhq.com/railway', category: 'Cloud & DevOps' },
  { company: 'Render', portal: 'lever', domain: 'jobs.lever.co/render', category: 'Cloud & DevOps' },
  { company: 'Fly.io', portal: 'ashby', domain: 'jobs.ashbyhq.com/fly-io', category: 'Cloud & DevOps' },
  { company: 'Pulumi', portal: 'greenhouse', domain: 'boards.greenhouse.io/pulumi', category: 'Cloud & DevOps' },
  { company: 'Temporal', portal: 'greenhouse', domain: 'boards.greenhouse.io/temporal', category: 'Cloud & DevOps' },
  { company: 'Neon', portal: 'ashby', domain: 'jobs.ashbyhq.com/neon', category: 'Cloud & DevOps' },

  // ── Finance & Fintech ────────────────────────────────────────────────────
  { company: 'Stripe', portal: 'greenhouse', domain: 'boards.greenhouse.io/stripe', category: 'Finance & Fintech' },
  { company: 'Plaid', portal: 'lever', domain: 'jobs.lever.co/plaid', category: 'Finance & Fintech' },
  { company: 'Brex', portal: 'greenhouse', domain: 'boards.greenhouse.io/brex', category: 'Finance & Fintech' },
  { company: 'Ramp', portal: 'greenhouse', domain: 'boards.greenhouse.io/ramp', category: 'Finance & Fintech' },
  { company: 'Robinhood', portal: 'greenhouse', domain: 'boards.greenhouse.io/robinhood', category: 'Finance & Fintech' },
  { company: 'Chime', portal: 'lever', domain: 'jobs.lever.co/chime', category: 'Finance & Fintech' },
  { company: 'Goldman Sachs', portal: 'custom', customQuery: 'jobs site:goldmansachs.com/careers', category: 'Finance & Fintech' },
  { company: 'JPMorgan Chase', portal: 'custom', customQuery: 'jobs site:jpmorganchase.com/careers', category: 'Finance & Fintech' },
  { company: 'Citadel', portal: 'greenhouse', domain: 'boards.greenhouse.io/citadel', category: 'Finance & Fintech' },
  { company: 'Jane Street', portal: 'custom', customQuery: 'jobs site:janestreet.com/join-jane-street', category: 'Finance & Fintech' },
  { company: 'Two Sigma', portal: 'greenhouse', domain: 'boards.greenhouse.io/twosigma', category: 'Finance & Fintech' },
  { company: 'Bloomberg', portal: 'custom', customQuery: 'jobs site:bloomberg.com/careers', category: 'Finance & Fintech' },
  { company: 'Affirm', portal: 'greenhouse', domain: 'boards.greenhouse.io/affirm', category: 'Finance & Fintech' },
  { company: 'Klarna', portal: 'greenhouse', domain: 'boards.greenhouse.io/klarna', category: 'Finance & Fintech' },
  { company: 'Wise', portal: 'greenhouse', domain: 'boards.greenhouse.io/wise', category: 'Finance & Fintech' },
  { company: 'Revolut', portal: 'greenhouse', domain: 'boards.greenhouse.io/revolut', category: 'Finance & Fintech' },

  // ── SaaS & Productivity ──────────────────────────────────────────────────
  { company: 'Linear', portal: 'ashby', domain: 'jobs.ashbyhq.com/linear', category: 'SaaS & Productivity' },
  { company: 'Notion', portal: 'greenhouse', domain: 'boards.greenhouse.io/notion', category: 'SaaS & Productivity' },
  { company: 'Figma', portal: 'greenhouse', domain: 'boards.greenhouse.io/figma', category: 'SaaS & Productivity' },
  { company: 'Retool', portal: 'greenhouse', domain: 'boards.greenhouse.io/retool', category: 'SaaS & Productivity' },
  { company: 'Atlassian', portal: 'custom', customQuery: 'jobs site:jobs.lever.co/atlassian', category: 'SaaS & Productivity' },
  { company: 'HubSpot', portal: 'greenhouse', domain: 'boards.greenhouse.io/hubspot', category: 'SaaS & Productivity' },
  { company: 'Intercom', portal: 'greenhouse', domain: 'boards.greenhouse.io/intercom', category: 'SaaS & Productivity' },
  { company: 'Zendesk', portal: 'greenhouse', domain: 'boards.greenhouse.io/zendesk', category: 'SaaS & Productivity' },
  { company: 'Twilio', portal: 'greenhouse', domain: 'boards.greenhouse.io/twilio', category: 'SaaS & Productivity' },
  { company: 'Airtable', portal: 'greenhouse', domain: 'boards.greenhouse.io/airtable', category: 'SaaS & Productivity' },
  { company: 'Zapier', portal: 'greenhouse', domain: 'boards.greenhouse.io/zapier', category: 'SaaS & Productivity' },
  { company: 'Monday.com', portal: 'greenhouse', domain: 'boards.greenhouse.io/mondaycom', category: 'SaaS & Productivity' },
  { company: 'Asana', portal: 'greenhouse', domain: 'boards.greenhouse.io/asana', category: 'SaaS & Productivity' },
  { company: 'n8n', portal: 'custom', customQuery: 'jobs n8n site:jobs.lever.co', category: 'SaaS & Productivity' },
  { company: 'Remote.com', portal: 'greenhouse', domain: 'boards.greenhouse.io/remotecom', category: 'SaaS & Productivity' },
  { company: 'Loom', portal: 'greenhouse', domain: 'boards.greenhouse.io/loom', category: 'SaaS & Productivity' },
  { company: 'Miro', portal: 'greenhouse', domain: 'boards.greenhouse.io/miro', category: 'SaaS & Productivity' },
  { company: 'Calendly', portal: 'greenhouse', domain: 'boards.greenhouse.io/calendly', category: 'SaaS & Productivity' },

  // ── Security ─────────────────────────────────────────────────────────────
  { company: 'CrowdStrike', portal: 'greenhouse', domain: 'boards.greenhouse.io/crowdstrike', category: 'Security' },
  { company: 'Palo Alto Networks', portal: 'custom', customQuery: 'jobs site:jobs.paloaltonetworks.com', category: 'Security' },
  { company: 'Snyk', portal: 'greenhouse', domain: 'boards.greenhouse.io/snyk', category: 'Security' },
  { company: 'Wiz', portal: 'greenhouse', domain: 'boards.greenhouse.io/wiz', category: 'Security' },
  { company: 'Orca Security', portal: 'greenhouse', domain: 'boards.greenhouse.io/orcasecurity', category: 'Security' },
  { company: 'Lacework', portal: 'lever', domain: 'jobs.lever.co/lacework', category: 'Security' },
  { company: 'Okta', portal: 'greenhouse', domain: 'boards.greenhouse.io/okta', category: 'Security' },
  { company: '1Password', portal: 'lever', domain: 'jobs.lever.co/1password', category: 'Security' },
  { company: 'Semgrep', portal: 'lever', domain: 'jobs.lever.co/semgrep', category: 'Security' },

  // ── Data & Analytics ─────────────────────────────────────────────────────
  { company: 'Snowflake', portal: 'greenhouse', domain: 'boards.greenhouse.io/snowflake', category: 'Data & Analytics' },
  { company: 'Databricks', portal: 'greenhouse', domain: 'boards.greenhouse.io/databricks', category: 'Data & Analytics' },
  { company: 'Confluent', portal: 'greenhouse', domain: 'boards.greenhouse.io/confluent', category: 'Data & Analytics' },
  { company: 'MongoDB', portal: 'greenhouse', domain: 'boards.greenhouse.io/mongodb', category: 'Data & Analytics' },
  { company: 'Elastic', portal: 'greenhouse', domain: 'boards.greenhouse.io/elastic', category: 'Data & Analytics' },
  { company: 'Datadog', portal: 'greenhouse', domain: 'boards.greenhouse.io/datadog', category: 'Data & Analytics' },
  { company: 'New Relic', portal: 'greenhouse', domain: 'boards.greenhouse.io/newrelic', category: 'Data & Analytics' },
  { company: 'dbt Labs', portal: 'lever', domain: 'jobs.lever.co/dbtlabs', category: 'Data & Analytics' },
  { company: 'Fivetran', portal: 'greenhouse', domain: 'boards.greenhouse.io/fivetran', category: 'Data & Analytics' },
  { company: 'Airbyte', portal: 'greenhouse', domain: 'boards.greenhouse.io/airbyte', category: 'Data & Analytics' },

  // ── E-Commerce & Marketplace ─────────────────────────────────────────────
  { company: 'Shopify', portal: 'custom', customQuery: 'jobs site:shopify.com/careers', category: 'E-Commerce & Marketplace' },
  { company: 'Canva', portal: 'greenhouse', domain: 'boards.greenhouse.io/canva', category: 'E-Commerce & Marketplace' },
  { company: 'DoorDash', portal: 'greenhouse', domain: 'boards.greenhouse.io/doordash', category: 'E-Commerce & Marketplace' },
  { company: 'Instacart', portal: 'greenhouse', domain: 'boards.greenhouse.io/instacart', category: 'E-Commerce & Marketplace' },
  { company: 'Etsy', portal: 'greenhouse', domain: 'boards.greenhouse.io/etsy', category: 'E-Commerce & Marketplace' },
  { company: 'Wayfair', portal: 'greenhouse', domain: 'boards.greenhouse.io/wayfair', category: 'E-Commerce & Marketplace' },
  { company: 'eBay', portal: 'greenhouse', domain: 'boards.greenhouse.io/ebay', category: 'E-Commerce & Marketplace' },
  { company: 'Faire', portal: 'greenhouse', domain: 'boards.greenhouse.io/faire', category: 'E-Commerce & Marketplace' },
  { company: 'Whatnot', portal: 'greenhouse', domain: 'boards.greenhouse.io/whatnot', category: 'E-Commerce & Marketplace' },

  // ── Gaming & Media ───────────────────────────────────────────────────────
  { company: 'Unity', portal: 'greenhouse', domain: 'boards.greenhouse.io/unity', category: 'Gaming & Media' },
  { company: 'Epic Games', portal: 'greenhouse', domain: 'boards.greenhouse.io/epicgames', category: 'Gaming & Media' },
  { company: 'Riot Games', portal: 'greenhouse', domain: 'boards.greenhouse.io/riotgames', category: 'Gaming & Media' },
  { company: 'Discord', portal: 'greenhouse', domain: 'boards.greenhouse.io/discord', category: 'Gaming & Media' },
  { company: 'Twitch', portal: 'greenhouse', domain: 'boards.greenhouse.io/twitch', category: 'Gaming & Media' },
  { company: 'Electronic Arts', portal: 'custom', customQuery: 'jobs site:ea.com/careers', category: 'Gaming & Media' },
  { company: 'Roblox', portal: 'greenhouse', domain: 'boards.greenhouse.io/roblox', category: 'Gaming & Media' },
  { company: 'Bungie', portal: 'greenhouse', domain: 'boards.greenhouse.io/bungie', category: 'Gaming & Media' },

  // ── Automotive & Hardware ────────────────────────────────────────────────
  { company: 'Tesla', portal: 'custom', customQuery: 'jobs site:tesla.com/careers', category: 'Automotive & Hardware' },
  { company: 'Rivian', portal: 'greenhouse', domain: 'boards.greenhouse.io/rivian', category: 'Automotive & Hardware' },
  { company: 'Waymo', portal: 'greenhouse', domain: 'boards.greenhouse.io/waymo', category: 'Automotive & Hardware' },
  { company: 'Cruise', portal: 'greenhouse', domain: 'boards.greenhouse.io/cruise', category: 'Automotive & Hardware' },
  { company: 'Lucid Motors', portal: 'greenhouse', domain: 'boards.greenhouse.io/lucidmotors', category: 'Automotive & Hardware' },
  { company: 'Anduril', portal: 'lever', domain: 'jobs.lever.co/anduril', category: 'Automotive & Hardware' },
  { company: 'SpaceX', portal: 'custom', customQuery: 'jobs site:spacex.com/careers', category: 'Automotive & Hardware' },

  // ── Healthcare & Biotech ─────────────────────────────────────────────────
  { company: 'Veeva', portal: 'greenhouse', domain: 'boards.greenhouse.io/veeva', category: 'Healthcare & Biotech' },
  { company: 'Tempus', portal: 'greenhouse', domain: 'boards.greenhouse.io/tempus', category: 'Healthcare & Biotech' },
  { company: 'Ginkgo Bioworks', portal: 'greenhouse', domain: 'boards.greenhouse.io/ginkgobioworks', category: 'Healthcare & Biotech' },
  { company: 'Recursion', portal: 'greenhouse', domain: 'boards.greenhouse.io/recursion', category: 'Healthcare & Biotech' },
  { company: 'Color Health', portal: 'greenhouse', domain: 'boards.greenhouse.io/colorhealth', category: 'Healthcare & Biotech' },
  { company: 'Noom', portal: 'greenhouse', domain: 'boards.greenhouse.io/noom', category: 'Healthcare & Biotech' },

  // ── Crypto & Web3 ────────────────────────────────────────────────────────
  { company: 'Coinbase', portal: 'greenhouse', domain: 'boards.greenhouse.io/coinbase', category: 'Crypto & Web3' },
  { company: 'Ripple', portal: 'greenhouse', domain: 'boards.greenhouse.io/ripple', category: 'Crypto & Web3' },
  { company: 'Alchemy', portal: 'greenhouse', domain: 'boards.greenhouse.io/alchemy', category: 'Crypto & Web3' },
  { company: 'Chainalysis', portal: 'greenhouse', domain: 'boards.greenhouse.io/chainalysis', category: 'Crypto & Web3' },
  { company: 'OpenSea', portal: 'greenhouse', domain: 'boards.greenhouse.io/opensea', category: 'Crypto & Web3' },

  // ── Social & Consumer ────────────────────────────────────────────────────
  { company: 'Reddit', portal: 'greenhouse', domain: 'boards.greenhouse.io/reddit', category: 'Social & Consumer' },
  { company: 'Pinterest', portal: 'greenhouse', domain: 'boards.greenhouse.io/pinterest', category: 'Social & Consumer' },
  { company: 'Snap', portal: 'greenhouse', domain: 'boards.greenhouse.io/snap', category: 'Social & Consumer' },
  { company: 'LinkedIn', portal: 'custom', customQuery: 'jobs site:linkedin.com/jobs site:careers.linkedin.com', category: 'Social & Consumer' },
  { company: 'TikTok / ByteDance', portal: 'custom', customQuery: 'jobs site:careers.tiktok.com', category: 'Social & Consumer' },
  { company: 'Bumble', portal: 'greenhouse', domain: 'boards.greenhouse.io/bumble', category: 'Social & Consumer' },
  { company: 'Duolingo', portal: 'greenhouse', domain: 'boards.greenhouse.io/duolingo', category: 'Social & Consumer' },

  // ── Startups & Unicorns ──────────────────────────────────────────────────
  { company: 'Harvey AI', portal: 'greenhouse', domain: 'boards.greenhouse.io/harvey', category: 'Startups & Unicorns' },
  { company: 'Glean', portal: 'greenhouse', domain: 'boards.greenhouse.io/glean', category: 'Startups & Unicorns' },
  { company: 'Vanta', portal: 'greenhouse', domain: 'boards.greenhouse.io/vanta', category: 'Startups & Unicorns' },
  { company: 'Rippling', portal: 'greenhouse', domain: 'boards.greenhouse.io/rippling', category: 'Startups & Unicorns' },
  { company: 'Deel', portal: 'greenhouse', domain: 'boards.greenhouse.io/deel', category: 'Startups & Unicorns' },
  { company: 'Lattice', portal: 'greenhouse', domain: 'boards.greenhouse.io/lattice', category: 'Startups & Unicorns' },
  { company: 'Gusto', portal: 'greenhouse', domain: 'boards.greenhouse.io/gusto', category: 'Startups & Unicorns' },
  { company: 'Webflow', portal: 'greenhouse', domain: 'boards.greenhouse.io/webflow', category: 'Startups & Unicorns' },
  { company: 'Liveblocks', portal: 'ashby', domain: 'jobs.ashbyhq.com/liveblocks', category: 'Startups & Unicorns' },
  { company: 'PostHog', portal: 'ashby', domain: 'jobs.ashbyhq.com/posthog', category: 'Startups & Unicorns' },
  { company: 'Cal.com', portal: 'custom', customQuery: 'jobs site:cal.com/careers', category: 'Startups & Unicorns' },
];

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
    snippet: r.content.slice(0, 220),
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
    } catch { }
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
    snippet: r.content.slice(0, 220),
    source: 'custom',
    dateFound: new Date().toISOString().split('T')[0],
  }));
}

function extractLocation(text: string): string | null {
  const patterns = [
    /\b(Remote|Hybrid|On-?site)\b/i,
    /\b([A-Z][a-z]+,\s*[A-Z]{2})\b/,
    /\b(New York|San Francisco|London|Berlin|Austin|Seattle|Toronto|Amsterdam|Paris|Singapore|Dublin)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
