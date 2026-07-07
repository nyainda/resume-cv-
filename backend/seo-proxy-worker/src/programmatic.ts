/**
 * programmatic.ts — Server-rendered SEO pages for job-title landing pages.
 *
 * URL pattern: /cv-templates/[job-slug]
 * Example:     /cv-templates/software-engineer
 *              /cv-templates/nurse
 *              /cv-templates/marketing-manager
 *
 * These pages are fully rendered HTML — no JS required for Google to index them.
 * They link back into the main app with ?field=<slug> to pre-select the profession.
 *
 * Why this works for SEO:
 *   Long-tail keyword traffic ("nurse CV template", "software engineer resume UK")
 *   has high purchase intent. These pages intercept that traffic and convert
 *   via a single CTA. Each page is unique, indexable, and unfurls perfectly on
 *   LinkedIn/WhatsApp/X because the worker injects full OG tags per page.
 */

import { buildJsonLd } from './meta';

interface JobPageData {
  /** Human-readable job title shown on the page */
  title: string;
  /** App field slug for deep-link: ?field=<slug> */
  fieldSlug: string;
  /** Short role description (1-2 sentences) */
  description: string;
  /** 3-4 ATS keywords critical for this role */
  keywords: string[];
  /** 3 specific CV tips for this role */
  tips: [string, string, string];
  /** Common alt titles (shown as "Also known as:") */
  altTitles: string[];
  /** FAQ pairs specific to this role */
  faq: Array<{ q: string; a: string }>;
}

// ── Job title data ─────────────────────────────────────────────────────────────

const JOB_PAGES: Record<string, JobPageData> = {
  'software-engineer': {
    title: 'Software Engineer',
    fieldSlug: 'tech',
    description: 'Software engineers design, build, and maintain systems that power the modern world. A strong CV must showcase technical depth, measurable impact, and system-level thinking — not just a list of languages.',
    keywords: ['Python', 'System Design', 'API Development', 'Agile', 'CI/CD', 'Cloud (AWS/GCP/Azure)'],
    tips: [
      'Lead every bullet with a strong action verb and quantify the result — "Reduced API latency by 40% by migrating to gRPC" beats "Worked on API optimisation".',
      'List languages and frameworks under a dedicated Skills section, not buried in job descriptions — ATS systems scan for exact-match keywords.',
      'For senior roles, include at least one example of architectural decision-making or cross-team technical leadership per position.',
    ],
    altTitles: ['Developer', 'Programmer', 'Software Developer', 'Backend Engineer', 'Full-Stack Developer'],
    faq: [
      { q: 'How long should a software engineer CV be?', a: 'One page for under 5 years of experience; two pages maximum for senior roles. Recruiters spend an average of 7 seconds on a first scan — brevity and clarity win.' },
      { q: 'Should I include side projects?', a: 'Yes, especially if they demonstrate skills your employment history doesn\'t. Include the tech stack, a one-line description, and a GitHub link. Prioritise projects with real users or measurable traction.' },
      { q: 'How do I pass ATS as a software engineer?', a: 'Mirror the exact language in the job description — if they say "TypeScript" not "JavaScript", use "TypeScript". ProCV\'s ATS scanner identifies exact keyword gaps before you submit.' },
    ],
  },

  'frontend-developer': {
    title: 'Frontend Developer',
    fieldSlug: 'frontend_web',
    description: 'Frontend developers craft the interfaces users interact with every day. Your CV needs to balance technical credibility (frameworks, tooling) with evidence of user-centric thinking and measurable performance improvements.',
    keywords: ['React', 'TypeScript', 'CSS/Tailwind', 'Core Web Vitals', 'Accessibility (WCAG)', 'Figma'],
    tips: [
      'Quantify performance impact: "Improved Lighthouse score from 62 → 95, reducing bounce rate by 18%" is far stronger than "optimised frontend performance".',
      'Mention accessibility (WCAG compliance) — it\'s increasingly a hiring requirement and differentiates you from candidates who treat it as an afterthought.',
      'List component libraries you\'ve built or contributed to — it signals architectural thinking beyond just consuming frameworks.',
    ],
    altTitles: ['UI Developer', 'React Developer', 'Vue Developer', 'Web Developer', 'JavaScript Developer'],
    faq: [
      { q: 'Should I include a portfolio link on my CV?', a: 'Absolutely — place it prominently near your name and contact details. Make sure it loads fast, works on mobile, and the first project showcases your strongest work.' },
      { q: 'How important is design knowledge for a frontend CV?', a: 'Mention Figma or design system experience if you have it. Companies increasingly want frontend developers who can collaborate directly with designers, skipping handoff friction.' },
      { q: 'Should I list every framework I\'ve ever touched?', a: 'No. Group by proficiency: Expert (daily use), Proficient (recent projects), Familiar (can contribute). Listing 20 frameworks signals a lack of depth.' },
    ],
  },

  'data-scientist': {
    title: 'Data Scientist',
    fieldSlug: 'data_analytics',
    description: 'Data scientists extract insight from complexity and translate it into business decisions. Your CV must demonstrate statistical rigour, programming fluency, and — critically — business impact from your models.',
    keywords: ['Python', 'Machine Learning', 'SQL', 'Statistical Modelling', 'A/B Testing', 'Data Visualisation'],
    tips: [
      'Every model you built should have a business outcome attached: "Churn prediction model that reduced customer loss by $2.1M annually" — not just "built churn prediction model".',
      'List Kaggle competitions, published papers, or open-source contributions — they signal drive and credibility that job experience alone can\'t always show.',
      'Separate "Tools" (Python, R, Spark) from "Methods" (regression, NLP, time-series) in your skills section — both categories matter to hiring managers.',
    ],
    altTitles: ['ML Engineer', 'Data Analyst', 'Research Scientist', 'Analytics Engineer', 'Applied Scientist'],
    faq: [
      { q: 'Should a data scientist CV include code?', a: 'Link to your GitHub or a portfolio with annotated notebooks. Don\'t paste code into the CV itself — it wastes space and is impossible to read in most formats.' },
      { q: 'How do I show impact if my work was internal / confidential?', a: 'Use percentages and relative numbers: "Improved model accuracy by 12 percentage points" without revealing the proprietary domain. Reviewers understand NDA constraints.' },
      { q: 'Is a PhD necessary for data science roles?', a: 'Not for most industry roles, but research-heavy positions (DeepMind, Google Brain) typically require it. Your CV should lead with impact regardless — a strong portfolio often outweighs academic credentials.' },
    ],
  },

  'product-manager': {
    title: 'Product Manager',
    fieldSlug: 'product_mgmt',
    description: 'Product managers sit at the intersection of user needs, business goals, and technical execution. Your CV should tell a story of shipped products, measurable outcomes, and cross-functional influence — not just feature lists.',
    keywords: ['Product Roadmap', 'OKRs / KPIs', 'User Research', 'A/B Testing', 'Stakeholder Management', 'Agile / Scrum'],
    tips: [
      'Frame every role around outcomes: "Grew DAU from 120K → 800K in 18 months" is a PM CV bullet. "Managed product roadmap" is not.',
      'Show discovery alongside delivery — mention user research, customer interviews, or data analysis that shaped a decision, not just the decision itself.',
      'Include a one-line product summary at the top of each role: "Led B2B SaaS payments product (ARR $14M, 3 engineers, 1 designer)".',
    ],
    altTitles: ['Product Owner', 'Senior PM', 'Group Product Manager', 'Head of Product', 'Associate PM'],
    faq: [
      { q: 'Should a PM CV be one page or two?', a: 'Two pages is acceptable for senior PMs with 8+ years. Junior and mid-level PMs should target one page — ruthless prioritisation is literally the job.' },
      { q: 'How do I show leadership without direct reports?', a: 'Describe the scope of cross-functional teams you drove: "Aligned engineering (8), design (2), legal, and marketing across 3 time zones to ship X in 6 weeks".' },
      { q: 'What metrics matter most on a PM CV?', a: 'Revenue impact, user growth, retention/churn, conversion rate, and NPS. Always anchor metrics to a baseline — a 20% improvement means nothing without a starting point.' },
    ],
  },

  'marketing-manager': {
    title: 'Marketing Manager',
    fieldSlug: 'marketing',
    description: 'Marketing managers drive brand awareness and revenue growth through strategy, campaigns, and data. Your CV should lead with commercial impact — CAC, ROI, pipeline generated — not just activities.',
    keywords: ['Growth Marketing', 'SEO / SEM', 'CRM (HubSpot / Salesforce)', 'Campaign ROI', 'Demand Generation', 'Brand Strategy'],
    tips: [
      'Lead with the number, not the activity: "Generated £2.4M pipeline through outbound ABM campaign" vs "Ran ABM campaigns".',
      'Show channel breadth but depth in your primary channel — state which channels drove the most impact, not just which ones you touched.',
      'Mention any martech stack you\'ve owned — HubSpot, Marketo, Klaviyo, GA4 — ATS systems scan for these specifically.',
    ],
    altTitles: ['Digital Marketing Manager', 'Growth Manager', 'Head of Marketing', 'Brand Manager', 'Performance Marketing Manager'],
    faq: [
      { q: 'How do I quantify brand marketing on a CV?', a: 'Use share-of-voice, brand recall survey scores, share of branded search, or press coverage reach. If you genuinely can\'t measure it, describe the strategic context and qualitative signals instead.' },
      { q: 'Should I list every tool I\'ve used?', a: 'List tools you\'d be comfortable being tested on in an interview. Group by category: Analytics (GA4, Mixpanel), Automation (HubSpot, Marketo), Design (Figma, Canva).' },
      { q: 'How important is agency vs in-house experience?', a: 'Both have value. Agency experience signals speed, multi-client exposure, and pitching skills. In-house signals depth, ownership, and business context. Frame the strengths of whichever you have.' },
    ],
  },

  'nurse': {
    title: 'Nurse',
    fieldSlug: 'healthcare',
    description: 'Nursing CVs must communicate clinical competence, patient care quality, and professional registration clearly and quickly. Recruiters and hiring managers in healthcare scan for specific wards, specialisms, and qualifications first.',
    keywords: ['NMC Registration', 'Patient Assessment', 'Medicines Administration', 'Ward Specialism', 'Electronic Patient Records', 'Safeguarding'],
    tips: [
      'List your NMC PIN (UK) or state licence prominently — near the top, not buried in education. Employers check this before reading anything else.',
      'Specify your ward and patient cohort for each role: "Adult oncology, 28-bed ward, 1:4 nurse-patient ratio during nights" gives far more context than "Staff Nurse".',
      'Include mandatory training completion dates: Manual Handling, Basic Life Support, Safeguarding Levels. These are often pass/fail requirements before interview.',
    ],
    altTitles: ['Staff Nurse', 'RN', 'Registered Nurse', 'Band 5 Nurse', 'Community Nurse', 'Practice Nurse'],
    faq: [
      { q: 'How do I format a nurse CV for NHS jobs?', a: 'NHS Jobs parsing works best with clear headers (Personal Statement, Education, Employment, Skills), dates in DD/MM/YYYY format, and all qualifications listed with awarding institution and year.' },
      { q: 'Should I include all placements from my nursing degree?', a: 'List placements in a condensed table: Ward | Specialism | Hours. Once you have 2+ years of post-registration experience, condense placements to a single line.' },
      { q: 'How long should a nurse CV be?', a: 'Two pages is standard for experienced nurses. Band 7+ and specialist nurses can extend to three pages if all content is directly relevant.' },
    ],
  },

  'financial-analyst': {
    title: 'Financial Analyst',
    fieldSlug: 'finance',
    description: 'Financial analysts translate numbers into decisions. Your CV needs to demonstrate both technical rigour (modelling, forecasting) and commercial acumen — understanding what the numbers mean for the business.',
    keywords: ['Financial Modelling', 'DCF / LBO', 'Excel / VBA', 'SQL', 'FP&A', 'Variance Analysis'],
    tips: [
      'Quantify every model: "Built 3-statement LBO model for $240M PE acquisition" beats "Built financial models". Include deal size or AUM where possible.',
      'Include your CFA level if you\'re a charterholder or candidate — it\'s a pass/fail filter at many firms, so place it prominently.',
      'State your tool stack: Excel / Power BI / Tableau / Python / SQL — hiring managers match your tools against their stack before reading bullets.',
    ],
    altTitles: ['Finance Analyst', 'FP&A Analyst', 'Investment Analyst', 'Equity Analyst', 'Business Analyst'],
    faq: [
      { q: 'Should I include GPA on a finance CV?', a: 'Include it if 3.5+ (US) or First / 2:1 (UK). If you graduated more than 5 years ago, omit GPA but keep the degree and institution.' },
      { q: 'How do I show deal or transaction experience?', a: 'List each transaction on a separate line under the role: "Advised on £80M Series C — led financial due diligence and IM drafting". If under NDA, describe deal type and size range without naming the company.' },
      { q: 'Is a one-page rule enforced in finance?', a: 'In investment banking, yes — one page for analysts is a firm rule at most banks. In corporate finance and FP&A, two pages is acceptable for 5+ years of experience.' },
    ],
  },

  'teacher': {
    title: 'Teacher',
    fieldSlug: 'education',
    description: 'Teaching CVs need to demonstrate subject expertise, classroom management, and measurable pupil progress. Schools shortlist on qualifications and safeguarding compliance first — then on evidence of pupil outcomes.',
    keywords: ['QTS', 'Curriculum Planning', 'Differentiation', 'Pupil Premium', 'Safeguarding (Level 2)', 'Ofsted Standards'],
    tips: [
      'State your QTS, subject specialism, and key stage clearly in your opening profile — these are the three filters used at shortlisting.',
      'Use pupil outcomes data: "92% of Year 11 cohort achieved Grade 4+ in English Language (vs 78% national average)" — this is what heads of department want to see.',
      'Include your DBS certificate date. For supply or international teaching, specify Enhanced DBS with Children\'s Barred List check.',
    ],
    altTitles: ['Primary Teacher', 'Secondary Teacher', 'Classroom Teacher', 'NQT', 'ECT', 'PGCE Graduate'],
    faq: [
      { q: 'How long should a teacher CV be?', a: 'Two pages. Personal statement (10 lines max), Education, QTS and training, Employment (most recent first), and a Skills/Interests section. Most teaching application forms supplement the CV — keep it tight.' },
      { q: 'Should I include every school placement?', a: 'Yes during your NQT / ECT year. Once you have 3+ years of permanent experience, consolidate placements to a single line: "School placements: [School A], [School B] (2019-2021)".' },
      { q: 'Do I need to include safeguarding training dates?', a: 'Yes — Level 2 or equivalent, with the date of last renewal. Schools are legally required to verify this at hiring, so missing it causes delays.' },
    ],
  },

  'accountant': {
    title: 'Accountant',
    fieldSlug: 'finance',
    description: 'Accountants are trusted with the financial integrity of organisations. Your CV must signal professional qualification, technical accuracy, and increasingly, digital accounting literacy alongside traditional skills.',
    keywords: ['ACA / ACCA / CIMA', 'Financial Reporting (IFRS/GAAP)', 'Month-End Close', 'ERP Systems (SAP/Oracle)', 'Tax Compliance', 'Audit'],
    tips: [
      'Lead with your qualification status: "ACA Qualified (ICAEW, 2022)" or "ACCA Part-Qualified (P3 remaining)" — recruiters filter on this immediately.',
      'Name the ERP and accounting software you\'ve used: SAP, Oracle NetSuite, Xero, QuickBooks, Sage — these are ATS keyword targets.',
      'Show process improvement: "Reduced month-end close from 8 days to 4 days by automating reconciliation workflow" — it signals commercial value beyond compliance.',
    ],
    altTitles: ['Management Accountant', 'Financial Accountant', 'Tax Accountant', 'Group Accountant', 'Assistant Accountant'],
    faq: [
      { q: 'Should I include all my ACCA/ACA exam results?', a: 'Summarise: "ACA qualified — all 15 exams passed on first attempt" or list the date and overall grade. Individual module scores are unnecessary unless exceptional.' },
      { q: 'How do I write an accountant CV with no industry experience?', a: 'Lead with your professional training contract, the clients or sectors you\'ve served, and any secondments. Highlight the breadth of work: "Audit clients across retail, manufacturing, and financial services".' },
      { q: 'Is a one-page accountant CV realistic?', a: 'For newly qualified (0-3 years): yes. For qualified with 5+ years: two pages is standard and expected. For Finance Director / CFO level: two to three pages.' },
    ],
  },

  'project-manager': {
    title: 'Project Manager',
    fieldSlug: 'operations',
    description: 'Project managers deliver outcomes under constraints of scope, time, and budget. Your CV must demonstrate delivery track record — projects shipped on time and on budget — alongside stakeholder management and methodology.',
    keywords: ['PMP / PRINCE2', 'Agile / Scrum / Waterfall', 'Risk & Issue Management', 'Stakeholder Communication', 'Budget Management', 'MS Project / Jira'],
    tips: [
      'Every project bullet needs three things: what was delivered, the scale (budget, team size, duration), and the outcome. "Delivered £3.2M ERP implementation 2 weeks ahead of schedule across 4 sites (12-month programme)".',
      'List your certifications prominently — PMP, PRINCE2 Practitioner, Agile PMQ — they\'re often minimum requirements, not differentiators.',
      'If you\'ve used project management software (Jira, MS Project, Asana, Monday.com), name them — ATS systems frequently filter for these.',
    ],
    altTitles: ['Programme Manager', 'Delivery Manager', 'Scrum Master', 'PMO Analyst', 'Change Manager'],
    faq: [
      { q: 'How do I show PM experience without a PM title?', a: 'Include a "Key Projects" section listing projects you managed informally — even if your title was Analyst or Coordinator. Describe scope, stakeholders, timeline, and outcome.' },
      { q: 'Should I list every methodology I know?', a: 'Focus on what\'s relevant to the role. Most job specs specify Agile or Waterfall — match your methodology framing to theirs and mention the others briefly.' },
      { q: 'What\'s the ideal length for a PM CV?', a: 'Two pages for most PM roles. Programme and portfolio-level leaders can justify three pages if projects are diverse and large-scale.' },
    ],
  },

  'lawyer': {
    title: 'Lawyer',
    fieldSlug: 'legal',
    description: 'Legal CVs must be precise, well-structured, and error-free — anything less signals exactly the wrong things to a law firm. Focus on deal / case experience, practice area, and jurisdiction expertise.',
    keywords: ['Practice Area (e.g. M&A, Litigation)', 'Jurisdiction', 'Deal Size / Case Value', 'Admission / Bar Qualification', 'Due Diligence', 'Client Advisory'],
    tips: [
      'Structure deal / case experience in a transaction list format under each role: deal type, value, client sector, your role. Law firms read these faster than prose bullets.',
      'State your admission and jurisdiction immediately: "Solicitor (England & Wales, 2021)" or "Called to the Bar of New York (2019)" — it\'s the first filter at any firm.',
      'Never list experience you can\'t discuss in interview. Privilege and NDA constraints are understood — describe deal type and size range without naming the counterparty.',
    ],
    altTitles: ['Solicitor', 'Associate', 'Barrister', 'Legal Counsel', 'In-House Counsel', 'Paralegal'],
    faq: [
      { q: 'Should a lawyer CV have a personal statement?', a: 'In the UK, yes — a 3-4 line opening statement framing your practice area, level, and what you\'re looking for is expected. US law firms typically skip the summary and lead with Education.' },
      { q: 'How do I handle gaps for bar study / LPC / BPTC?', a: 'List it as a study period with the qualification being pursued: "LPC (Merit), BPP Law School, 2020-2021". Gaps for professional training are universally understood in law.' },
      { q: 'Can I include pro bono work?', a: 'Absolutely — especially for junior lawyers. It demonstrates commercial awareness, client skills, and community commitment. Treat it like a substantive role with the same level of detail.' },
    ],
  },

  'hr-manager': {
    title: 'HR Manager',
    fieldSlug: 'hr',
    description: 'HR managers balance people strategy, compliance, and commercial delivery. Your CV should demonstrate business partnering capability, employment law knowledge, and measurable impact on workforce metrics — not just administrative HR.',
    keywords: ['CIPD Qualified', 'Employee Relations', 'HRIS (Workday / SAP SuccessFactors)', 'Talent Acquisition', 'Employment Law', 'Change Management'],
    tips: [
      'Quantify your scale: "HRBP for 1,200-person UK business across 6 sites" gives far more context than "Senior HRBP". Include headcount, geography, and business unit.',
      'Show ER case outcomes: "Managed 47 ER cases in 12 months including TUPE, redundancy, and disciplinary — zero Employment Tribunal claims" — this is what senior leaders care about.',
      'List your CIPD level and year of qualification prominently. CIPD Level 7 is the target for strategic HR roles; Level 5 for operational/generalist positions.',
    ],
    altTitles: ['Human Resources Manager', 'HRBP', 'HR Business Partner', 'People Manager', 'Head of People'],
    faq: [
      { q: 'Should I include GDPR knowledge on an HR CV?', a: 'Yes — data privacy is a core HR responsibility. Mention any specific GDPR compliance work, subject access requests you\'ve managed, or privacy impact assessments.' },
      { q: 'How do I show strategic HR experience?', a: 'Lead with business outcomes, not HR activities: "Designed and implemented new performance framework that improved 90-day retention by 31%" tells the story of strategic contribution.' },
      { q: 'How long should an HR CV be?', a: 'Two pages for HR Manager and HRBP level. Head of People / HR Director: up to three pages if experience spans different industries or business scales.' },
    ],
  },
};

// ── URL helpers ────────────────────────────────────────────────────────────────

/** Return the JobPageData for a URL slug, or null if not found */
export function getJobPage(slug: string): JobPageData | null {
  return JOB_PAGES[slug] ?? null;
}

/** All registered job slugs — used for sitemap generation */
export const JOB_SLUGS = Object.keys(JOB_PAGES);

/** Build the canonical URL for a job page */
export function jobPageUrl(slug: string, baseUrl: string): string {
  return `${baseUrl}/cv-templates/${slug}`;
}

// ── HTML renderer ──────────────────────────────────────────────────────────────

/** Render a full HTML page for a job title. Pure HTML — no React, no JS required. */
export function renderJobPage(slug: string, data: JobPageData, baseUrl: string, countryCode: string): string {
  const canonical = jobPageUrl(slug, baseUrl);
  const appUrl    = `${baseUrl}/?field=${encodeURIComponent(data.fieldSlug)}`;
  const ogImage   = `${baseUrl}/og-image.png`;

  const jsonLd = buildJsonLd(baseUrl);
  const howToJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to Write a ${data.title} CV`,
    description: `Step-by-step guide to writing a professional ${data.title} CV that passes ATS screening and gets interviews.`,
    step: data.tips.map((tip, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: `Step ${i + 1}`,
      text: tip,
    })),
    tool: [{ '@type': 'HowToTool', name: 'ProCV AI CV Builder' }],
  });
  const faqJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: data.faq.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  });

  const pageTitle = `${data.title} CV Template & Examples | ProCV`;
  const metaDesc  = `${data.description.slice(0, 155).trim()}…`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(metaDesc)}" />
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
  <link rel="canonical" href="${esc(canonical)}" />

  <!-- Open Graph -->
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="ProCV" />
  <meta property="og:title" content="${esc(pageTitle)}" />
  <meta property="og:description" content="${esc(metaDesc)}" />
  <meta property="og:url" content="${esc(canonical)}" />
  <meta property="og:image" content="${esc(ogImage)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(pageTitle)}" />
  <meta name="twitter:description" content="${esc(metaDesc)}" />
  <meta name="twitter:image" content="${esc(ogImage)}" />

  <script type="application/ld+json">${jsonLd}</script>
  <script type="application/ld+json">${howToJsonLd}</script>
  <script type="application/ld+json">${faqJsonLd}</script>

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="icon" href="${baseUrl}/icon-192.png" />

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --navy: #1B2B4B; --gold: #C9A84C; --off-white: #F8F7F4; --text: #1a1a2e; --sub: #4a5568; --border: #e2e8f0; --card: #fff; }
    body { font-family: 'DM Sans', sans-serif; background: var(--off-white); color: var(--text); line-height: 1.65; }

    /* Nav */
    nav { background: var(--navy); padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
    .nav-brand { color: #fff; font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 700; text-decoration: none; }
    .nav-brand span { color: var(--gold); }
    .nav-cta { background: var(--gold); color: var(--navy); font-weight: 700; font-size: 14px; padding: 8px 18px; border-radius: 6px; text-decoration: none; white-space: nowrap; }
    .nav-cta:hover { opacity: 0.9; }

    /* Hero */
    .hero { background: linear-gradient(135deg, var(--navy) 0%, #2d4a7a 100%); color: #fff; padding: 64px 24px 56px; text-align: center; }
    .hero-tag { display: inline-block; background: rgba(201,168,76,0.2); color: var(--gold); font-size: 13px; font-weight: 600; padding: 4px 12px; border-radius: 20px; margin-bottom: 16px; letter-spacing: 0.05em; text-transform: uppercase; }
    .hero h1 { font-family: 'Playfair Display', serif; font-size: clamp(28px, 5vw, 48px); font-weight: 800; margin-bottom: 16px; line-height: 1.2; }
    .hero h1 span { color: var(--gold); }
    .hero p { font-size: 17px; color: rgba(255,255,255,0.85); max-width: 640px; margin: 0 auto 32px; }
    .hero-cta { display: inline-block; background: var(--gold); color: var(--navy); font-weight: 700; font-size: 17px; padding: 14px 32px; border-radius: 8px; text-decoration: none; }
    .hero-cta:hover { opacity: 0.9; }
    .hero-sub { margin-top: 14px; font-size: 13px; color: rgba(255,255,255,0.55); }

    /* Content */
    .container { max-width: 860px; margin: 0 auto; padding: 0 20px; }
    .section { padding: 52px 0; border-bottom: 1px solid var(--border); }
    .section:last-child { border-bottom: none; }
    h2 { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 700; color: var(--navy); margin-bottom: 20px; }
    h3 { font-size: 17px; font-weight: 600; color: var(--navy); margin-bottom: 8px; }

    /* Keywords */
    .keywords { display: flex; flex-wrap: wrap; gap: 8px; }
    .kw { background: #EEF2FF; color: #3730a3; font-size: 13px; font-weight: 600; padding: 5px 12px; border-radius: 20px; }

    /* Tips */
    .tips { display: flex; flex-direction: column; gap: 16px; }
    .tip { display: flex; gap: 14px; align-items: flex-start; background: var(--card); border: 1px solid var(--border); border-left: 4px solid var(--gold); border-radius: 8px; padding: 16px 18px; }
    .tip-num { background: var(--gold); color: var(--navy); font-weight: 800; font-size: 14px; min-width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
    .tip p { font-size: 15px; color: var(--sub); }

    /* FAQ */
    .faq { display: flex; flex-direction: column; gap: 16px; }
    .faq-item { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; }
    .faq-q { font-weight: 600; color: var(--navy); margin-bottom: 8px; font-size: 15px; }
    .faq-a { color: var(--sub); font-size: 14px; line-height: 1.7; }

    /* Alt titles */
    .alts { display: flex; flex-wrap: wrap; gap: 8px; }
    .alt { background: #F1F5F9; color: var(--sub); font-size: 13px; padding: 5px 12px; border-radius: 20px; }

    /* CTA section */
    .cta-section { background: var(--navy); color: #fff; padding: 56px 24px; text-align: center; }
    .cta-section h2 { color: #fff; font-family: 'Playfair Display', serif; font-size: 30px; margin-bottom: 12px; }
    .cta-section p { color: rgba(255,255,255,0.75); font-size: 16px; margin-bottom: 28px; max-width: 540px; margin-left: auto; margin-right: auto; }
    .cta-btn { display: inline-block; background: var(--gold); color: var(--navy); font-weight: 700; font-size: 17px; padding: 14px 36px; border-radius: 8px; text-decoration: none; }
    .cta-sub { margin-top: 12px; font-size: 13px; color: rgba(255,255,255,0.45); }

    /* Footer */
    footer { background: #0f1a2e; color: rgba(255,255,255,0.45); text-align: center; font-size: 13px; padding: 24px; }
    footer a { color: var(--gold); text-decoration: none; }
  </style>
</head>
<body>

  <nav>
    <a href="${baseUrl}" class="nav-brand">Pro<span>CV</span></a>
    <a href="${appUrl}" class="nav-cta">Build My ${esc(data.title)} CV →</a>
  </nav>

  <div class="hero">
    <div class="hero-tag">Free AI CV Builder</div>
    <h1>${esc(data.title)} <span>CV Template</span></h1>
    <p>${esc(data.description)}</p>
    <a href="${appUrl}" class="hero-cta">Build My ${esc(data.title)} CV — Free</a>
    <p class="hero-sub">No credit card · ATS-optimised · 35+ templates · Ready in minutes</p>
  </div>

  <div class="container">

    <div class="section">
      <h2>Critical Keywords for ${esc(data.title)} CVs</h2>
      <p style="margin-bottom:16px;color:var(--sub);font-size:15px;">ATS systems filter applications against these terms before a human ever reads your CV. ProCV automatically pins missing keywords into your generated output.</p>
      <div class="keywords">
        ${data.keywords.map(k => `<span class="kw">${esc(k)}</span>`).join('')}
      </div>
    </div>

    <div class="section">
      <h2>3 CV Tips That Get ${esc(data.title)}s Interviews</h2>
      <div class="tips">
        ${data.tips.map((tip, i) => `
        <div class="tip">
          <div class="tip-num">${i + 1}</div>
          <p>${esc(tip)}</p>
        </div>`).join('')}
      </div>
    </div>

    <div class="section">
      <h2>Frequently Asked Questions</h2>
      <div class="faq">
        ${data.faq.map(f => `
        <div class="faq-item">
          <div class="faq-q">${esc(f.q)}</div>
          <div class="faq-a">${esc(f.a)}</div>
        </div>`).join('')}
      </div>
    </div>

    <div class="section">
      <h2>Also Known As</h2>
      <p style="margin-bottom:14px;color:var(--sub);font-size:15px;">The same role goes by different names depending on the employer, country, and seniority level. ProCV recognises all of these and tailors your CV accordingly.</p>
      <div class="alts">
        ${data.altTitles.map(t => `<span class="alt">${esc(t)}</span>`).join('')}
      </div>
    </div>

  </div>

  <div class="cta-section">
    <h2>Build Your ${esc(data.title)} CV Now</h2>
    <p>ProCV's AI reads your experience, researches the current market for your role, and writes a tailored, ATS-optimised CV in minutes — with cover letter and interview preparation included.</p>
    <a href="${appUrl}" class="cta-btn">Get Started Free →</a>
    <p class="cta-sub">Trusted by professionals in 35+ countries</p>
  </div>

  <footer>
    <p>© ${new Date().getFullYear()} <a href="${baseUrl}">ProCV</a> · <a href="${baseUrl}">Home</a> · <a href="${baseUrl}/cv-templates">All Templates</a></p>
  </footer>

</body>
</html>`;
}

/** Index page listing all job template pages */
export function renderIndexPage(baseUrl: string): string {
  const groups: Record<string, Array<[string, JobPageData]>> = {
    'Technology': [],
    'Business & Finance': [],
    'Healthcare & Education': [],
    'Other': [],
  };
  const map: Record<string, string> = {
    'software-engineer': 'Technology', 'frontend-developer': 'Technology', 'data-scientist': 'Technology',
    'product-manager': 'Technology',
    'marketing-manager': 'Business & Finance', 'financial-analyst': 'Business & Finance',
    'accountant': 'Business & Finance', 'project-manager': 'Business & Finance',
    'lawyer': 'Business & Finance', 'hr-manager': 'Business & Finance',
    'nurse': 'Healthcare & Education', 'teacher': 'Healthcare & Education',
  };
  Object.entries(JOB_PAGES).forEach(([slug, data]) => {
    const grp = map[slug] ?? 'Other';
    groups[grp].push([slug, data]);
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>CV Templates by Job Title | ProCV</title>
  <meta name="description" content="Free AI-generated CV templates for every profession — Software Engineer, Nurse, Teacher, Lawyer, Accountant and more. ATS-optimised and ready in minutes." />
  <link rel="canonical" href="${baseUrl}/cv-templates" />
  <meta property="og:title" content="CV Templates by Job Title | ProCV" />
  <meta property="og:description" content="Free ATS-optimised CV templates for every profession." />
  <meta property="og:image" content="${baseUrl}/og-image.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet" />
  <link rel="icon" href="${baseUrl}/icon-192.png" />
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    :root{--navy:#1B2B4B;--gold:#C9A84C;--off-white:#F8F7F4}
    body{font-family:'DM Sans',sans-serif;background:var(--off-white);color:#1a1a2e}
    nav{background:var(--navy);padding:14px 24px;display:flex;align-items:center;justify-content:space-between}
    .brand{color:#fff;font-family:'Playfair Display',serif;font-size:22px;font-weight:700;text-decoration:none}
    .brand span{color:var(--gold)}
    .hero{background:linear-gradient(135deg,var(--navy) 0%,#2d4a7a 100%);color:#fff;padding:56px 24px;text-align:center}
    .hero h1{font-family:'Playfair Display',serif;font-size:clamp(26px,4vw,42px);margin-bottom:12px}
    .hero p{color:rgba(255,255,255,0.8);font-size:16px;max-width:560px;margin:0 auto}
    .container{max-width:900px;margin:0 auto;padding:48px 20px}
    h2{font-family:'Playfair Display',serif;color:var(--navy);font-size:22px;margin-bottom:20px;padding-bottom:8px;border-bottom:2px solid var(--gold)}
    .group{margin-bottom:40px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
    .card{display:block;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px;text-decoration:none;color:inherit;transition:box-shadow 0.2s,transform 0.2s}
    .card:hover{box-shadow:0 4px 20px rgba(0,0,0,0.1);transform:translateY(-2px)}
    .card-title{font-weight:700;font-size:15px;color:var(--navy);margin-bottom:4px}
    .card-sub{font-size:13px;color:#718096}
    footer{background:#0f1a2e;color:rgba(255,255,255,0.4);text-align:center;font-size:13px;padding:20px}
    footer a{color:var(--gold);text-decoration:none}
  </style>
</head>
<body>
  <nav><a href="${baseUrl}" class="brand">Pro<span>CV</span></a></nav>
  <div class="hero">
    <h1>CV Templates by Job Title</h1>
    <p>ATS-optimised templates with expert tips for every profession — built by ProCV's AI in minutes.</p>
  </div>
  <div class="container">
    ${Object.entries(groups).filter(([,items]) => items.length > 0).map(([grp, items]) => `
    <div class="group">
      <h2>${esc(grp)}</h2>
      <div class="grid">
        ${items.map(([slug, data]) => `
        <a href="${baseUrl}/cv-templates/${slug}" class="card">
          <div class="card-title">${esc(data.title)}</div>
          <div class="card-sub">${esc(data.altTitles.slice(0,2).join(' · '))}</div>
        </a>`).join('')}
      </div>
    </div>`).join('')}
  </div>
  <footer><p>© ${new Date().getFullYear()} <a href="${baseUrl}">ProCV</a></p></footer>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
