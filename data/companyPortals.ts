export type PortalIndustry =
    | 'Tech'
    | 'Finance'
    | 'Consulting'
    | 'FinTech'
    | 'E-Commerce'
    | 'Healthcare'
    | 'Media'
    | 'Remote-First'
    | 'NGO & Aid'
    | 'Africa'
    | 'Energy'
    | 'Startup';

export interface CompanyPortal {
    id: string;
    name: string;
    domain: string;
    careersUrl: string;
    industry: PortalIndustry;
    size: 'startup' | 'mid-size' | 'enterprise';
    ats?: string;
    remote?: boolean;
    globalHiring?: boolean;
    tagline: string;
    color: string;
}

export const COMPANY_PORTALS: CompanyPortal[] = [

    // ── BIG TECH ──────────────────────────────────────────────────────────────
    { id: 'google', name: 'Google', domain: 'careers.google.com', careersUrl: 'https://careers.google.com', industry: 'Tech', size: 'enterprise', ats: 'Custom', remote: true, globalHiring: true, tagline: 'Search, Cloud, AI', color: '#4285F4' },
    { id: 'meta', name: 'Meta', domain: 'metacareers.com', careersUrl: 'https://www.metacareers.com', industry: 'Tech', size: 'enterprise', ats: 'Custom', remote: true, globalHiring: true, tagline: 'Facebook, Instagram, WhatsApp', color: '#0082FB' },
    { id: 'apple', name: 'Apple', domain: 'apple.com/careers', careersUrl: 'https://www.apple.com/careers', industry: 'Tech', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Consumer electronics & software', color: '#555555' },
    { id: 'microsoft', name: 'Microsoft', domain: 'jobs.microsoft.com', careersUrl: 'https://careers.microsoft.com', industry: 'Tech', size: 'enterprise', ats: 'Custom', remote: true, globalHiring: true, tagline: 'Cloud, Azure, Office 365', color: '#0078D4' },
    { id: 'amazon', name: 'Amazon', domain: 'amazon.jobs', careersUrl: 'https://www.amazon.jobs', industry: 'Tech', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: true, tagline: 'E-commerce, AWS, logistics', color: '#FF9900' },
    { id: 'netflix', name: 'Netflix', domain: 'jobs.netflix.com', careersUrl: 'https://jobs.netflix.com', industry: 'Media', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Streaming entertainment', color: '#E50914' },
    { id: 'nvidia', name: 'NVIDIA', domain: 'nvidia.com/careers', careersUrl: 'https://www.nvidia.com/en-us/about-nvidia/careers', industry: 'Tech', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'GPUs, AI chips, gaming', color: '#76B900' },
    { id: 'intel', name: 'Intel', domain: 'intel.com/careers', careersUrl: 'https://www.intel.com/content/www/us/en/jobs/jobs-at-intel.html', industry: 'Tech', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Semiconductors & processors', color: '#0071C5' },
    { id: 'ibm', name: 'IBM', domain: 'ibm.com/employment', careersUrl: 'https://www.ibm.com/employment', industry: 'Tech', size: 'enterprise', ats: 'Kenexa', remote: true, globalHiring: true, tagline: 'AI, quantum & cloud consulting', color: '#006699' },
    { id: 'oracle', name: 'Oracle', domain: 'oracle.com/careers', careersUrl: 'https://www.oracle.com/careers', industry: 'Tech', size: 'enterprise', ats: 'Taleo', remote: false, globalHiring: true, tagline: 'Database, cloud & ERP', color: '#C74634' },
    { id: 'salesforce', name: 'Salesforce', domain: 'salesforce.com/careers', careersUrl: 'https://www.salesforce.com/company/careers', industry: 'Tech', size: 'enterprise', ats: 'Workday', remote: true, globalHiring: true, tagline: 'CRM & enterprise cloud', color: '#00A1E0' },
    { id: 'adobe', name: 'Adobe', domain: 'adobe.com/careers', careersUrl: 'https://www.adobe.com/careers.html', industry: 'Tech', size: 'enterprise', ats: 'Workday', remote: true, globalHiring: true, tagline: 'Creative & marketing software', color: '#FF0000' },
    { id: 'uber', name: 'Uber', domain: 'uber.com/careers', careersUrl: 'https://www.uber.com/us/en/careers', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: false, globalHiring: true, tagline: 'Ride-sharing & delivery', color: '#000000' },
    { id: 'airbnb', name: 'Airbnb', domain: 'careers.airbnb.com', careersUrl: 'https://careers.airbnb.com', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Short-term rental marketplace', color: '#FF5A5F' },
    { id: 'spotify', name: 'Spotify', domain: 'lifeatspotify.com', careersUrl: 'https://www.lifeatspotify.com/jobs', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Music streaming platform', color: '#1DB954' },
    { id: 'linkedin', name: 'LinkedIn', domain: 'careers.linkedin.com', careersUrl: 'https://careers.linkedin.com', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Professional networking platform', color: '#0A66C2' },
    { id: 'twitter', name: 'X (Twitter)', domain: 'careers.x.com', careersUrl: 'https://careers.x.com', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Social media platform', color: '#000000' },
    { id: 'snap', name: 'Snap', domain: 'careers.snap.com', careersUrl: 'https://careers.snap.com', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: false, globalHiring: true, tagline: 'Snapchat & AR experiences', color: '#FFFC00' },
    { id: 'palantir', name: 'Palantir', domain: 'palantir.com/careers', careersUrl: 'https://www.palantir.com/careers', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: false, globalHiring: true, tagline: 'Data analytics & AI platforms', color: '#101113' },
    { id: 'twilio', name: 'Twilio', domain: 'twilio.com/careers', careersUrl: 'https://www.twilio.com/en-us/company/jobs', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Cloud communications APIs', color: '#F22F46' },
    { id: 'atlassian', name: 'Atlassian', domain: 'atlassian.com/company/careers', careersUrl: 'https://www.atlassian.com/company/careers', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Jira, Confluence, Trello', color: '#0052CC' },
    { id: 'okta', name: 'Okta', domain: 'okta.com/company/careers', careersUrl: 'https://www.okta.com/company/careers', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Identity & access management', color: '#007DC1' },
    { id: 'cloudflare', name: 'Cloudflare', domain: 'cloudflare.com/careers', careersUrl: 'https://www.cloudflare.com/careers/jobs', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Internet security & performance', color: '#F38020' },
    { id: 'datadog', name: 'Datadog', domain: 'datadoghq.com/careers', careersUrl: 'https://www.datadoghq.com/careers', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Cloud monitoring & analytics', color: '#632CA6' },
    { id: 'mongodb', name: 'MongoDB', domain: 'mongodb.com/careers', careersUrl: 'https://www.mongodb.com/careers', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'NoSQL database platform', color: '#00ED64' },
    { id: 'hashicorp', name: 'HashiCorp', domain: 'hashicorp.com/jobs', careersUrl: 'https://www.hashicorp.com/jobs', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Infrastructure automation tools', color: '#7B42BC' },
    { id: 'confluent', name: 'Confluent', domain: 'confluent.io/careers', careersUrl: 'https://www.confluent.io/careers', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Data streaming with Apache Kafka', color: '#CC0000' },
    { id: 'snowflake', name: 'Snowflake', domain: 'snowflake.com/careers', careersUrl: 'https://careers.snowflake.com', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Cloud data warehouse', color: '#29B5E8' },
    { id: 'databricks', name: 'Databricks', domain: 'databricks.com/company/careers', careersUrl: 'https://www.databricks.com/company/careers', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Unified analytics platform', color: '#FF3621' },
    { id: 'gitlab', name: 'GitLab', domain: 'about.gitlab.com/jobs', careersUrl: 'https://about.gitlab.com/jobs', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'DevOps platform — 100% remote', color: '#FC6D26' },
    { id: 'github', name: 'GitHub', domain: 'github.com/about/careers', careersUrl: 'https://github.com/about/careers', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Code hosting & collaboration', color: '#24292F' },
    { id: 'vercel', name: 'Vercel', domain: 'vercel.com/careers', careersUrl: 'https://vercel.com/careers', industry: 'Tech', size: 'mid-size', ats: 'Ashby', remote: true, globalHiring: true, tagline: 'Frontend deployment platform', color: '#000000' },
    { id: 'figma', name: 'Figma', domain: 'figma.com/careers', careersUrl: 'https://www.figma.com/careers', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: false, globalHiring: true, tagline: 'Collaborative design tool', color: '#F24E1E' },
    { id: 'notion', name: 'Notion', domain: 'notion.so/careers', careersUrl: 'https://www.notion.so/careers', industry: 'Tech', size: 'mid-size', ats: 'Lever', remote: true, globalHiring: true, tagline: 'All-in-one workspace', color: '#000000' },
    { id: 'slack', name: 'Slack', domain: 'slack.com/careers', careersUrl: 'https://slack.com/careers', industry: 'Tech', size: 'enterprise', ats: 'Workday', remote: true, globalHiring: true, tagline: 'Team messaging platform', color: '#4A154B' },
    { id: 'zoom', name: 'Zoom', domain: 'zoom.us/careers', careersUrl: 'https://careers.zoom.us', industry: 'Tech', size: 'enterprise', ats: 'Workday', remote: true, globalHiring: true, tagline: 'Video communications platform', color: '#2D8CFF' },
    { id: 'hubspot', name: 'HubSpot', domain: 'hubspot.com/careers', careersUrl: 'https://www.hubspot.com/careers', industry: 'Tech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'CRM & inbound marketing', color: '#FF7A59' },

    // ── FINTECH ──────────────────────────────────────────────────────────────
    { id: 'stripe', name: 'Stripe', domain: 'stripe.com/jobs', careersUrl: 'https://stripe.com/jobs', industry: 'FinTech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Online payments infrastructure', color: '#635BFF' },
    { id: 'square', name: 'Block (Square)', domain: 'block.xyz/careers', careersUrl: 'https://www.block.xyz/careers', industry: 'FinTech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Payments, Bitcoin, Cash App', color: '#3E9A41' },
    { id: 'robinhood', name: 'Robinhood', domain: 'careers.robinhood.com', careersUrl: 'https://careers.robinhood.com', industry: 'FinTech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: false, tagline: 'Commission-free stock trading', color: '#00C805' },
    { id: 'plaid', name: 'Plaid', domain: 'plaid.com/careers', careersUrl: 'https://plaid.com/careers', industry: 'FinTech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Banking data connectivity API', color: '#0A85EA' },
    { id: 'coinbase', name: 'Coinbase', domain: 'coinbase.com/careers', careersUrl: 'https://www.coinbase.com/careers', industry: 'FinTech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Cryptocurrency exchange platform', color: '#1652F0' },
    { id: 'chime', name: 'Chime', domain: 'chime.com/careers', careersUrl: 'https://www.chime.com/careers', industry: 'FinTech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: false, tagline: 'Mobile banking, no hidden fees', color: '#005BB3' },
    { id: 'klarna', name: 'Klarna', domain: 'careers.klarna.com', careersUrl: 'https://careers.klarna.com', industry: 'FinTech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Buy now pay later platform', color: '#FFB3C7' },
    { id: 'wise', name: 'Wise', domain: 'wise.com/careers', careersUrl: 'https://www.wise.com/careers', industry: 'FinTech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'International money transfers', color: '#9FE870' },
    { id: 'revolut', name: 'Revolut', domain: 'revolut.com/careers', careersUrl: 'https://www.revolut.com/careers', industry: 'FinTech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Global digital banking app', color: '#0075EB' },
    { id: 'brex', name: 'Brex', domain: 'brex.com/careers', careersUrl: 'https://www.brex.com/careers', industry: 'FinTech', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Corporate cards & expense mgmt', color: '#F26522' },
    { id: 'ripple', name: 'Ripple', domain: 'ripple.com/company/careers', careersUrl: 'https://ripple.com/company/careers', industry: 'FinTech', size: 'mid-size', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Blockchain payments network', color: '#00AAE4' },

    // ── FINANCE & BANKING ────────────────────────────────────────────────────
    { id: 'jpmorgan', name: 'JPMorgan Chase', domain: 'jpmorgan.com/careers', careersUrl: 'https://careers.jpmorgan.com', industry: 'Finance', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Global investment banking', color: '#2F6FAD' },
    { id: 'goldman', name: 'Goldman Sachs', domain: 'goldmansachs.com/careers', careersUrl: 'https://www.goldmansachs.com/careers', industry: 'Finance', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: true, tagline: 'Investment banking & securities', color: '#5A84C8' },
    { id: 'blackrock', name: 'BlackRock', domain: 'blackrock.com/careers', careersUrl: 'https://careers.blackrock.com', industry: 'Finance', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: "World's largest asset manager", color: '#000000' },
    { id: 'morgan_stanley', name: 'Morgan Stanley', domain: 'morganstanley.com/careers', careersUrl: 'https://www.morganstanley.com/careers', industry: 'Finance', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Wealth management & trading', color: '#008080' },
    { id: 'citi', name: 'Citi', domain: 'citigroup.com/careers', careersUrl: 'https://jobs.citi.com', industry: 'Finance', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Global banking & financial services', color: '#003B70' },
    { id: 'boa', name: 'Bank of America', domain: 'bankofamerica.com/careers', careersUrl: 'https://careers.bankofamerica.com', industry: 'Finance', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Consumer & commercial banking', color: '#E31837' },
    { id: 'wells_fargo', name: 'Wells Fargo', domain: 'wellsfargo.com/careers', careersUrl: 'https://www.wellsfargojobs.com', industry: 'Finance', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: false, tagline: 'Banking, mortgage & investments', color: '#D71E28' },
    { id: 'hsbc', name: 'HSBC', domain: 'hsbc.com/careers', careersUrl: 'https://www.hsbc.com/careers', industry: 'Finance', size: 'enterprise', ats: 'SuccessFactors', remote: false, globalHiring: true, tagline: 'International banking group', color: '#DB0011' },
    { id: 'barclays', name: 'Barclays', domain: 'barclays.com/careers', careersUrl: 'https://home.barclays/careers', industry: 'Finance', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'UK-based global bank', color: '#00AEEF' },
    { id: 'ubs', name: 'UBS', domain: 'ubs.com/careers', careersUrl: 'https://www.ubs.com/global/en/careers.html', industry: 'Finance', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Swiss wealth management', color: '#E60000' },
    { id: 'visa_corp', name: 'Visa', domain: 'visa.com/careers', careersUrl: 'https://www.visa.com/careers', industry: 'Finance', size: 'enterprise', ats: 'Workday', remote: true, globalHiring: true, tagline: 'Global payments technology', color: '#1A1F71' },
    { id: 'mastercard', name: 'Mastercard', domain: 'mastercard.com/careers', careersUrl: 'https://careers.mastercard.com', industry: 'Finance', size: 'enterprise', ats: 'Workday', remote: true, globalHiring: true, tagline: 'Payment processing network', color: '#EB001B' },
    { id: 'bloomberg', name: 'Bloomberg', domain: 'bloomberg.com/careers', careersUrl: 'https://www.bloomberg.com/careers', industry: 'Finance', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: true, tagline: 'Financial data & media company', color: '#000000' },
    { id: 'blackstone', name: 'Blackstone', domain: 'blackstone.com/careers', careersUrl: 'https://www.blackstone.com/careers', industry: 'Finance', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Private equity & real estate', color: '#0D1117' },

    // ── CONSULTING ──────────────────────────────────────────────────────────
    { id: 'mckinsey', name: 'McKinsey & Co.', domain: 'mckinsey.com/careers', careersUrl: 'https://www.mckinsey.com/careers', industry: 'Consulting', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: true, tagline: 'Strategy consulting, top-tier', color: '#00609A' },
    { id: 'bcg', name: 'Boston Consulting Group', domain: 'bcg.com/careers', careersUrl: 'https://www.bcg.com/careers', industry: 'Consulting', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: true, tagline: 'Strategy & transformation consulting', color: '#00A36C' },
    { id: 'bain', name: 'Bain & Company', domain: 'bain.com/careers', careersUrl: 'https://www.bain.com/careers', industry: 'Consulting', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: true, tagline: 'Management consulting firm', color: '#CC0000' },
    { id: 'deloitte', name: 'Deloitte', domain: 'deloitte.com/careers', careersUrl: 'https://www2.deloitte.com/global/en/careers.html', industry: 'Consulting', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Audit, consulting & advisory', color: '#86BC25' },
    { id: 'pwc', name: 'PwC', domain: 'pwc.com/careers', careersUrl: 'https://www.pwc.com/gx/en/careers.html', industry: 'Consulting', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Assurance, tax & advisory', color: '#D04A02' },
    { id: 'ey', name: 'EY (Ernst & Young)', domain: 'ey.com/careers', careersUrl: 'https://www.ey.com/en_gl/careers', industry: 'Consulting', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Assurance & business advisory', color: '#FFE600' },
    { id: 'kpmg', name: 'KPMG', domain: 'kpmg.com/careers', careersUrl: 'https://www.kpmg.com/xx/en/home/careers.html', industry: 'Consulting', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Audit, tax & advisory services', color: '#0091DA' },
    { id: 'accenture', name: 'Accenture', domain: 'accenture.com/careers', careersUrl: 'https://www.accenture.com/us-en/careers', industry: 'Consulting', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Tech & management consulting', color: '#A100FF' },
    { id: 'boozallen', name: 'Booz Allen Hamilton', domain: 'boozallen.com/careers', careersUrl: 'https://www.boozallen.com/careers.html', industry: 'Consulting', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: false, tagline: 'US government consulting & tech', color: '#0071BC' },
    { id: 'oliver_wyman', name: 'Oliver Wyman', domain: 'oliverwyman.com/careers', careersUrl: 'https://www.oliverwyman.com/careers.html', industry: 'Consulting', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Financial services consulting', color: '#C41F3E' },

    // ── E-COMMERCE & RETAIL ───────────────────────────────────────────────────
    { id: 'shopify', name: 'Shopify', domain: 'shopify.com/careers', careersUrl: 'https://www.shopify.com/careers', industry: 'E-Commerce', size: 'enterprise', ats: 'Custom', remote: true, globalHiring: true, tagline: 'E-commerce platform for all', color: '#95BF47' },
    { id: 'ebay', name: 'eBay', domain: 'ebayinc.com/careers', careersUrl: 'https://www.ebayinc.com/careers', industry: 'E-Commerce', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Online marketplace & auctions', color: '#E53238' },
    { id: 'etsy', name: 'Etsy', domain: 'etsy.com/careers', careersUrl: 'https://www.etsy.com/careers', industry: 'E-Commerce', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Handmade & vintage marketplace', color: '#F56400' },
    { id: 'wayfair', name: 'Wayfair', domain: 'wayfair.com/careers', careersUrl: 'https://www.wayfair.com/careers', industry: 'E-Commerce', size: 'enterprise', ats: 'Greenhouse', remote: false, globalHiring: false, tagline: 'Online home goods retailer', color: '#7F187F' },
    { id: 'zalando', name: 'Zalando', domain: 'zalando.com/careers', careersUrl: 'https://jobs.zalando.com', industry: 'E-Commerce', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'European fashion e-commerce', color: '#FF6900' },
    { id: 'booking', name: 'Booking.com', domain: 'booking.com/careers', careersUrl: 'https://careers.booking.com', industry: 'E-Commerce', size: 'enterprise', ats: 'Greenhouse', remote: false, globalHiring: true, tagline: 'Online travel & accommodation', color: '#003580' },
    { id: 'doordash', name: 'DoorDash', domain: 'careers.doordash.com', careersUrl: 'https://careers.doordash.com', industry: 'E-Commerce', size: 'enterprise', ats: 'Greenhouse', remote: false, globalHiring: false, tagline: 'Food delivery marketplace', color: '#FF3008' },
    { id: 'instacart', name: 'Instacart', domain: 'instacart.com/careers', careersUrl: 'https://careers.instacart.com', industry: 'E-Commerce', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: false, tagline: 'Grocery delivery platform', color: '#43B02A' },

    // ── HEALTHCARE & PHARMA ──────────────────────────────────────────────────
    { id: 'jnj', name: 'Johnson & Johnson', domain: 'jnj.com/careers', careersUrl: 'https://www.jnj.com/latest-news/careers', industry: 'Healthcare', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Medical devices, pharma & consumer', color: '#CC0000' },
    { id: 'pfizer', name: 'Pfizer', domain: 'pfizer.com/careers', careersUrl: 'https://www.pfizer.com/science/careers', industry: 'Healthcare', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Global pharmaceutical company', color: '#0077C8' },
    { id: 'roche', name: 'Roche', domain: 'roche.com/careers', careersUrl: 'https://www.roche.com/careers.htm', industry: 'Healthcare', size: 'enterprise', ats: 'SuccessFactors', remote: false, globalHiring: true, tagline: 'Diagnostics & pharmaceuticals', color: '#D1232A' },
    { id: 'novartis', name: 'Novartis', domain: 'novartis.com/careers', careersUrl: 'https://www.novartis.com/careers', industry: 'Healthcare', size: 'enterprise', ats: 'SuccessFactors', remote: false, globalHiring: true, tagline: 'Swiss pharma & biotech giant', color: '#E40046' },
    { id: 'unitedhealth', name: 'UnitedHealth Group', domain: 'careers.unitedhealthgroup.com', careersUrl: 'https://careers.unitedhealthgroup.com', industry: 'Healthcare', size: 'enterprise', ats: 'Workday', remote: true, globalHiring: false, tagline: 'Health insurance & care services', color: '#196ECF' },
    { id: 'abbott', name: 'Abbott', domain: 'abbott.com/careers', careersUrl: 'https://www.abbott.com/careers.html', industry: 'Healthcare', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Medical devices & diagnostics', color: '#0064A0' },
    { id: 'medtronic', name: 'Medtronic', domain: 'medtronic.com/careers', careersUrl: 'https://jobs.medtronic.com', industry: 'Healthcare', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Medical technology leader', color: '#003DA5' },
    { id: 'moderna', name: 'Moderna', domain: 'modernatx.com/careers', careersUrl: 'https://www.modernatx.com/careers', industry: 'Healthcare', size: 'enterprise', ats: 'Greenhouse', remote: false, globalHiring: true, tagline: 'mRNA therapeutics & vaccines', color: '#005EB8' },

    // ── MEDIA & ENTERTAINMENT ────────────────────────────────────────────────
    { id: 'disney', name: 'The Walt Disney Co.', domain: 'careers.disney.com', careersUrl: 'https://careers.disney.com', industry: 'Media', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Entertainment, theme parks, streaming', color: '#006DB7' },
    { id: 'warner', name: 'Warner Bros. Discovery', domain: 'wbd.com/careers', careersUrl: 'https://careers.wbd.com', industry: 'Media', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Film, TV & HBO streaming', color: '#002FA7' },
    { id: 'nytimes', name: 'The New York Times', domain: 'nytco.com/careers', careersUrl: 'https://www.nytco.com/careers', industry: 'Media', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Journalism & digital media', color: '#000000' },
    { id: 'bbc', name: 'BBC', domain: 'bbc.com/careers', careersUrl: 'https://www.bbc.com/careers', industry: 'Media', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: true, tagline: 'UK public broadcaster', color: '#BB1919' },
    { id: 'twitch', name: 'Twitch', domain: 'twitch.tv/jobs', careersUrl: 'https://www.twitch.tv/jobs', industry: 'Media', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Live streaming platform (Amazon)', color: '#9146FF' },

    // ── REMOTE-FIRST ─────────────────────────────────────────────────────────
    { id: 'automattic', name: 'Automattic', domain: 'automattic.com/work-with-us', careersUrl: 'https://automattic.com/work-with-us', industry: 'Remote-First', size: 'enterprise', ats: 'Custom', remote: true, globalHiring: true, tagline: 'WordPress.com — 100% remote', color: '#21759B' },
    { id: 'basecamp', name: '37signals (Basecamp)', domain: '37signals.com/jobs', careersUrl: 'https://37signals.com/jobs', industry: 'Remote-First', size: 'mid-size', ats: 'Custom', remote: true, globalHiring: true, tagline: 'Project management tools, remote-first', color: '#1CC25E' },
    { id: 'buffer', name: 'Buffer', domain: 'buffer.com/journey', careersUrl: 'https://buffer.com/journey', industry: 'Remote-First', size: 'startup', ats: 'Custom', remote: true, globalHiring: true, tagline: 'Social media scheduling, transparent', color: '#168EEA' },
    { id: 'doist', name: 'Doist', domain: 'doist.com/jobs', careersUrl: 'https://doist.com/jobs', industry: 'Remote-First', size: 'startup', ats: 'Custom', remote: true, globalHiring: true, tagline: 'Todoist & Twist — async-first', color: '#DB4035' },
    { id: 'zapier', name: 'Zapier', domain: 'zapier.com/jobs', careersUrl: 'https://zapier.com/jobs', industry: 'Remote-First', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'No-code automation platform', color: '#FF4A00' },
    { id: 'hotjar', name: 'Hotjar', domain: 'hotjar.com/careers', careersUrl: 'https://www.hotjar.com/careers', industry: 'Remote-First', size: 'mid-size', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'User behavior analytics', color: '#FD3A5C' },
    { id: 'close', name: 'Close', domain: 'close.com/careers', careersUrl: 'https://close.com/careers', industry: 'Remote-First', size: 'startup', ats: 'Ashby', remote: true, globalHiring: true, tagline: 'Sales CRM — fully remote', color: '#4E5FE4' },
    { id: 'whereby', name: 'Whereby', domain: 'whereby.com/careers', careersUrl: 'https://whereby.com/careers', industry: 'Remote-First', size: 'startup', ats: 'Custom', remote: true, globalHiring: true, tagline: 'Video meetings without installs', color: '#6AF19A' },
    { id: 'deel', name: 'Deel', domain: 'deel.com/careers', careersUrl: 'https://www.deel.com/careers', industry: 'Remote-First', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Global payroll & HR for remote teams', color: '#15C39A' },

    // ── NGO & INTERNATIONAL AID ───────────────────────────────────────────────
    { id: 'un', name: 'United Nations', domain: 'careers.un.org', careersUrl: 'https://careers.un.org', industry: 'NGO & Aid', size: 'enterprise', ats: 'Inspira', remote: false, globalHiring: true, tagline: 'Global peace & development org', color: '#009EDB' },
    { id: 'worldbank', name: 'World Bank Group', domain: 'worldbank.org/careers', careersUrl: 'https://www.worldbank.org/en/about/careers', industry: 'NGO & Aid', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Development finance institution', color: '#009FDA' },
    { id: 'who', name: 'WHO', domain: 'who.int/careers', careersUrl: 'https://www.who.int/careers', industry: 'NGO & Aid', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: true, tagline: 'World Health Organization', color: '#0090DA' },
    { id: 'usaid', name: 'USAID', domain: 'usaid.gov/careers', careersUrl: 'https://www.usaid.gov/careers', industry: 'NGO & Aid', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: true, tagline: 'US foreign development aid agency', color: '#002868' },
    { id: 'msf', name: 'MSF (Doctors Without Borders)', domain: 'msf.org/careers', careersUrl: 'https://www.msf.org/careers', industry: 'NGO & Aid', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: true, tagline: 'Emergency humanitarian medical aid', color: '#E2001A' },
    { id: 'oxfam', name: 'Oxfam', domain: 'oxfam.org/careers', careersUrl: 'https://www.oxfam.org/en/jobs', industry: 'NGO & Aid', size: 'enterprise', ats: 'Custom', remote: true, globalHiring: true, tagline: 'International poverty & justice NGO', color: '#E70052' },
    { id: 'save_children', name: "Save the Children", domain: 'savethechildren.net/careers', careersUrl: 'https://www.savethechildren.net/careers', industry: 'NGO & Aid', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: true, tagline: "Children's rights & development", color: '#E2231A' },
    { id: 'unicef', name: 'UNICEF', domain: 'unicef.org/careers', careersUrl: 'https://www.unicef.org/careers', industry: 'NGO & Aid', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: true, tagline: "UN children's fund", color: '#00AEEF' },

    // ── AFRICA & EMERGING MARKETS ────────────────────────────────────────────
    { id: 'safaricom', name: 'Safaricom', domain: 'safaricom.co.ke/careers', careersUrl: 'https://www.safaricom.co.ke/careers', industry: 'Africa', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: false, tagline: 'Kenya telecoms & M-Pesa', color: '#00B140' },
    { id: 'andela', name: 'Andela', domain: 'andela.com/careers', careersUrl: 'https://andela.com/careers', industry: 'Africa', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'African tech talent network', color: '#46B6AC' },
    { id: 'equity_bank', name: 'Equity Bank', domain: 'equitybank.co.ke/careers', careersUrl: 'https://www.equitybank.co.ke/careers', industry: 'Africa', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: false, tagline: 'Pan-African banking group', color: '#D01F2F' },
    { id: 'flutterwave', name: 'Flutterwave', domain: 'flutterwave.com/careers', careersUrl: 'https://flutterwave.com/us/careers', industry: 'Africa', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'African payments infrastructure', color: '#F5A623' },
    { id: 'paystack', name: 'Paystack', domain: 'paystack.com/careers', careersUrl: 'https://paystack.com/careers', industry: 'Africa', size: 'mid-size', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'Stripe-owned African payments', color: '#00C3F7' },
    { id: 'jumia', name: 'Jumia', domain: 'jumia.com.ng/careers', careersUrl: 'https://www.jumia.com.ng/careers', industry: 'Africa', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: true, tagline: "Africa's largest e-commerce platform", color: '#F68B1E' },
    { id: 'mtn', name: 'MTN Group', domain: 'mtn.com/careers', careersUrl: 'https://www.mtn.com/careers', industry: 'Africa', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Pan-African telecom operator', color: '#FFCC00' },
    { id: 'kcb', name: 'KCB Bank', domain: 'kcbgroup.com/careers', careersUrl: 'https://kcbgroup.com/careers', industry: 'Africa', size: 'enterprise', ats: 'Custom', remote: false, globalHiring: false, tagline: "Kenya's largest commercial bank", color: '#006B3F' },

    // ── ENERGY & SUSTAINABILITY ───────────────────────────────────────────────
    { id: 'tesla', name: 'Tesla', domain: 'tesla.com/careers', careersUrl: 'https://www.tesla.com/careers', industry: 'Energy', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'EVs, solar & energy storage', color: '#E82127' },
    { id: 'bp', name: 'bp', domain: 'bp.com/careers', careersUrl: 'https://www.bp.com/en/global/corporate/careers.html', industry: 'Energy', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Energy transition & oil/gas', color: '#009900' },
    { id: 'shell', name: 'Shell', domain: 'shell.com/careers', careersUrl: 'https://www.shell.com/careers.html', industry: 'Energy', size: 'enterprise', ats: 'Workday', remote: false, globalHiring: true, tagline: 'Energy & petrochemicals', color: '#FFD500' },
    { id: 'siemens_energy', name: 'Siemens Energy', domain: 'siemens-energy.com/careers', careersUrl: 'https://www.siemens-energy.com/global/en/company/jobs.html', industry: 'Energy', size: 'enterprise', ats: 'SuccessFactors', remote: false, globalHiring: true, tagline: 'Clean energy technology leader', color: '#009999' },
    { id: 'vestas', name: 'Vestas', domain: 'vestas.com/careers', careersUrl: 'https://careers.vestas.com', industry: 'Energy', size: 'enterprise', ats: 'SuccessFactors', remote: false, globalHiring: true, tagline: 'Wind energy manufacturer', color: '#008037' },

    // ── HIGH-GROWTH STARTUPS ──────────────────────────────────────────────────
    { id: 'openai', name: 'OpenAI', domain: 'openai.com/careers', careersUrl: 'https://openai.com/careers', industry: 'Startup', size: 'enterprise', ats: 'Greenhouse', remote: false, globalHiring: true, tagline: 'ChatGPT, GPT-4, AI safety', color: '#10A37F' },
    { id: 'anthropic', name: 'Anthropic', domain: 'anthropic.com/careers', careersUrl: 'https://www.anthropic.com/careers', industry: 'Startup', size: 'mid-size', ats: 'Greenhouse', remote: false, globalHiring: true, tagline: 'Claude AI, AI safety research', color: '#C9572B' },
    { id: 'mistral', name: 'Mistral AI', domain: 'mistral.ai/careers', careersUrl: 'https://mistral.ai/careers', industry: 'Startup', size: 'startup', ats: 'Custom', remote: true, globalHiring: true, tagline: 'European open-source AI models', color: '#FF7000' },
    { id: 'groq_co', name: 'Groq', domain: 'groq.com/careers', careersUrl: 'https://groq.com/careers', industry: 'Startup', size: 'mid-size', ats: 'Greenhouse', remote: false, globalHiring: true, tagline: 'AI inference chips & platform', color: '#F54E42' },
    { id: 'anduril', name: 'Anduril', domain: 'anduril.com/careers', careersUrl: 'https://www.anduril.com/careers', industry: 'Startup', size: 'enterprise', ats: 'Greenhouse', remote: false, globalHiring: false, tagline: 'Defense technology company', color: '#101B28' },
    { id: 'scale', name: 'Scale AI', domain: 'scale.com/careers', careersUrl: 'https://scale.com/careers', industry: 'Startup', size: 'enterprise', ats: 'Greenhouse', remote: false, globalHiring: true, tagline: 'AI training data platform', color: '#FF6C37' },
    { id: 'airtable', name: 'Airtable', domain: 'airtable.com/careers', careersUrl: 'https://airtable.com/careers', industry: 'Startup', size: 'enterprise', ats: 'Greenhouse', remote: true, globalHiring: true, tagline: 'No-code database platform', color: '#FCB400' },
    { id: 'linear', name: 'Linear', domain: 'linear.app/careers', careersUrl: 'https://linear.app/careers', industry: 'Startup', size: 'startup', ats: 'Custom', remote: true, globalHiring: true, tagline: 'Issue tracking for modern teams', color: '#5E6AD2' },
];

export const PORTAL_INDUSTRIES: PortalIndustry[] = [
    'Tech', 'FinTech', 'Finance', 'Consulting', 'E-Commerce',
    'Healthcare', 'Media', 'Remote-First', 'NGO & Aid', 'Africa', 'Energy', 'Startup',
];

export const ATS_SYSTEMS = ['Greenhouse', 'Lever', 'Workday', 'Ashby', 'Taleo', 'Custom'];

export const INDUSTRY_EMOJI: Record<PortalIndustry, string> = {
    Tech: '💻', FinTech: '💳', Finance: '🏦', Consulting: '📊',
    'E-Commerce': '🛒', Healthcare: '🏥', Media: '🎬',
    'Remote-First': '🌍', 'NGO & Aid': '🤝', Africa: '🌍', Energy: '⚡', Startup: '🚀',
};
