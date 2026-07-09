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

  // ── Technology (expanded) ──────────────────────────────────────────────────

  'devops-engineer': {
    title: 'DevOps Engineer',
    fieldSlug: 'tech',
    description: 'DevOps engineers bridge development and operations, building the automation pipelines and infrastructure that ship software reliably at scale. Your CV must show both deep technical competence and measurable reliability improvements.',
    keywords: ['Kubernetes / Docker', 'CI/CD (GitHub Actions / Jenkins)', 'Terraform / IaC', 'AWS / GCP / Azure', 'Observability (Prometheus / Grafana)', 'Site Reliability'],
    tips: [
      'Quantify reliability impact: "Reduced deployment frequency from weekly to 40 deploys/day while maintaining 99.97% uptime" is the defining DevOps CV bullet.',
      'Name your full toolchain clearly — cloud provider, container orchestration, IaC tool, CI/CD platform, and monitoring stack. ATS systems match these terms exactly.',
      'Show incident response ownership: on-call rotation responsibility, MTTR improvements, and any post-mortem processes you introduced differentiate engineers from operators.',
    ],
    altTitles: ['Site Reliability Engineer', 'SRE', 'Platform Engineer', 'Infrastructure Engineer', 'Cloud Engineer'],
    faq: [
      { q: 'Should a DevOps CV focus on infrastructure or software?', a: 'Both — but weight toward your target role. SRE/platform roles want more software depth; infrastructure/ops roles want more systems and cloud experience. Tailor your bullets accordingly.' },
      { q: 'How do I show on-call experience on a CV?', a: 'Include a line like "Primary on-call rotation, 8-person team — average MTTR 23 minutes (reduced from 67 minutes)" to show both responsibility and measurable improvement.' },
      { q: 'Are certifications important for DevOps roles?', a: 'CKA (Kubernetes), AWS Solutions Architect, and HashiCorp Terraform Associate are widely respected. List them with the year earned — cloud certifications expire, so currency matters.' },
    ],
  },

  'ux-designer': {
    title: 'UX Designer',
    fieldSlug: 'design',
    description: 'UX designers shape how people experience products. Your CV must demonstrate research rigour, design process, and measurable impact on user satisfaction and business metrics — not just a gallery of polished mockups.',
    keywords: ['User Research', 'Figma / Sketch', 'Usability Testing', 'Information Architecture', 'Accessibility (WCAG)', 'Design Systems'],
    tips: [
      'Lead every project with the problem and outcome, not the deliverable: "Reduced checkout drop-off by 31% by redesigning the payment flow after usability testing with 12 participants" beats a screenshot.',
      'Show your process breadth: mention research methods (interviews, card sorting, A/B testing), prototyping fidelity (lo-fi to hi-fi), and how findings shaped final decisions.',
      'Include a portfolio link near your name — curate it to 3-4 strong case studies, each showing problem → research → iteration → outcome. One great case study beats ten polished screens.',
    ],
    altTitles: ['User Experience Designer', 'Product Designer', 'Interaction Designer', 'UI/UX Designer', 'Experience Designer'],
    faq: [
      { q: 'Should a UX CV include a portfolio link?', a: 'Yes — it is as important as the CV itself. Place it next to your name and email. Make sure it is password-protected only if you send the password with every application; public is better.' },
      { q: 'How do I show UX experience without a formal UX title?', a: '"Led user research and redesigned onboarding flow" from a product or marketing role is valid UX experience. Use a "Selected Projects" section to highlight it.' },
      { q: 'Should I list every design tool on my CV?', a: 'List tools you use daily (Figma, Miro, Maze) and note others briefly. Hiring managers care far more about your process and outcomes than whether you know Axure vs Balsamiq.' },
    ],
  },

  'data-engineer': {
    title: 'Data Engineer',
    fieldSlug: 'data_analytics',
    description: 'Data engineers build and maintain the infrastructure that makes data useful. Your CV must demonstrate pipeline reliability, data quality practices, and the scale of systems you have designed and operated.',
    keywords: ['Apache Spark / Flink', 'SQL / dbt', 'Airflow / Prefect', 'Data Warehousing (Snowflake / BigQuery)', 'Python', 'ETL / ELT Pipelines'],
    tips: [
      'Show scale: "Designed ETL pipeline processing 4.2TB daily across 300+ data sources with 99.9% SLA adherence" gives hiring managers the context they need immediately.',
      'Mention data quality frameworks — Great Expectations, dbt tests, custom validation — data reliability is increasingly the measure of a strong data engineer.',
      'Include both ingestion and consumption layers: show you understand the full data lifecycle from source systems to BI tools and ML feature stores.',
    ],
    altTitles: ['Analytics Engineer', 'Big Data Engineer', 'ETL Developer', 'Data Platform Engineer', 'Data Infrastructure Engineer'],
    faq: [
      { q: 'What is the difference between a data engineer and a data scientist CV?', a: 'Data engineers emphasise pipeline reliability, infrastructure, and data quality. Data scientists emphasise modelling, analysis, and business insight. Tailor your bullets to the engineering aspects of your work.' },
      { q: 'Should I include cloud certifications?', a: 'Yes — AWS Data Analytics Specialty, GCP Professional Data Engineer, or Snowflake SnowPro Core are strong signals. Place them in a Certifications section close to your skills.' },
      { q: 'How do I quantify data engineering impact?', a: 'Focus on pipeline scale (data volume, source count), reliability (uptime, SLA), and cost savings from optimisation. "Reduced Redshift costs by 38% through query optimisation" is an excellent template.' },
    ],
  },

  'cybersecurity-analyst': {
    title: 'Cybersecurity Analyst',
    fieldSlug: 'tech',
    description: 'Cybersecurity analysts protect organisations from threats by monitoring, detecting, and responding to incidents. Your CV must demonstrate technical depth, threat knowledge, and the business impact of your security work.',
    keywords: ['SIEM (Splunk / Microsoft Sentinel)', 'Threat Intelligence', 'Incident Response', 'Vulnerability Management', 'MITRE ATT&CK', 'ISO 27001 / SOC 2'],
    tips: [
      'Quantify threat impact: "Identified and contained a credential stuffing campaign targeting 14,000 accounts — zero confirmed breaches" demonstrates analytical skill and business protection in one sentence.',
      'List your certifications prominently: CompTIA Security+, CEH, CISSP, CISM, or SC-200 are pass/fail filters at many organisations. Place them near the top.',
      'Name your toolchain: SIEM platform, EDR solution, ticketing system, and threat intelligence feeds. Specificity matters to hiring managers who know what they need.',
    ],
    altTitles: ['Information Security Analyst', 'SOC Analyst', 'Security Operations Analyst', 'Threat Analyst', 'Infosec Analyst'],
    faq: [
      { q: 'Should I include CTF wins on a cybersecurity CV?', a: 'Yes — Capture The Flag competitions demonstrate practical skills beyond formal experience. Include platform (HackTheBox, TryHackMe), rank or top percentile, and any notable achievements.' },
      { q: 'How do I handle classified or NDA-bound security work?', a: 'Describe scope in general terms: "Performed red team engagement for a FTSE 50 financial institution" without revealing the client or specific vulnerabilities. Clearance level is worth stating explicitly.' },
      { q: 'Is a degree required for cybersecurity roles?', a: 'Not universally. Strong certifications (CISSP, OSCP, CEH) plus practical experience (SOC work, bug bounties, CTFs) are increasingly valued over degrees. Lead with whichever is strongest.' },
    ],
  },

  'machine-learning-engineer': {
    title: 'Machine Learning Engineer',
    fieldSlug: 'data_analytics',
    description: 'ML engineers take models from experiment to production. Your CV must demonstrate both the mathematical understanding to build models and the engineering discipline to ship and maintain them reliably at scale.',
    keywords: ['PyTorch / TensorFlow', 'MLOps / MLflow', 'Feature Engineering', 'Model Serving (FastAPI / TorchServe)', 'Python', 'Distributed Training'],
    tips: [
      'Show the full ML lifecycle: "Designed, trained, and deployed a real-time recommendation model serving 8M daily requests with P99 latency < 50ms" demonstrates engineering depth beyond research.',
      'Separate research publications and Kaggle achievements from production deployments — both matter but signal different things to different employers.',
      'Quantify model improvement with baseline and business outcome: "3.2pp uplift in CTR generated $1.4M incremental annual revenue" rather than just accuracy metrics.',
    ],
    altTitles: ['ML Engineer', 'AI Engineer', 'Applied ML Engineer', 'Research Engineer', 'Deep Learning Engineer'],
    faq: [
      { q: 'Should an ML engineer CV look more like a software engineer or data scientist CV?', a: 'Closer to a software engineer. Emphasise production systems, scalability, and latency alongside model performance. Hiring managers want to know you can ship, not just experiment.' },
      { q: 'How important is a publication record for industry ML roles?', a: 'For most industry roles, not essential — strong production systems matter more. For research labs (DeepMind, Meta AI, Google Brain), publications and conference presentations are significant.' },
      { q: 'What skills should I prioritise on an ML engineer CV?', a: 'Production deployment (FastAPI, Docker, Kubernetes), experiment tracking (MLflow, Weights & Biases), and cloud ML services (SageMaker, Vertex AI) alongside your core modelling frameworks.' },
    ],
  },

  'qa-engineer': {
    title: 'QA Engineer',
    fieldSlug: 'tech',
    description: 'QA engineers protect software quality through systematic testing, automation, and process discipline. Your CV must demonstrate both testing strategy breadth and measurable quality improvements delivered.',
    keywords: ['Test Automation (Selenium / Playwright / Cypress)', 'API Testing (Postman / RestAssured)', 'CI/CD Integration', 'BDD / TDD', 'Performance Testing (JMeter / k6)', 'JIRA / TestRail'],
    tips: [
      'Quantify coverage and defect impact: "Automated 850 regression tests covering 78% of critical user journeys — reduced release cycle from 3 weeks to 4 days" is a standout QA CV bullet.',
      'Show shift-left thinking: mention how you integrated quality earlier in the development process, not just tested at the end. Shift-left is a senior-level competency.',
      'List automation frameworks separately from manual testing skills — hiring managers frequently search for specific frameworks (Cypress, Playwright, Selenium) before reading anything else.',
    ],
    altTitles: ['Software Tester', 'Test Engineer', 'Automation Engineer', 'SDET', 'Quality Analyst'],
    faq: [
      { q: 'Is manual testing experience worth including?', a: 'Yes, especially for complex domains (healthcare, finance, regulated industries) where human judgement is irreplaceable. Frame it strategically: exploratory, risk-based, or accessibility testing.' },
      { q: 'How do I transition from manual to automation QA on my CV?', a: 'Create a "Personal Projects" section showing automation frameworks you have built independently. Certifications (ISTQB, Cypress, Selenium) also help bridge the gap.' },
      { q: 'Should a QA CV include bug statistics?', a: 'Yes — "Identified 240+ defects in pre-production, preventing 14 critical issues from reaching live" shows thoroughness and business value. Avoid raw numbers without context.' },
    ],
  },

  'cloud-architect': {
    title: 'Cloud Architect',
    fieldSlug: 'tech',
    description: 'Cloud architects design the infrastructure strategies that organisations run their businesses on. Your CV must demonstrate deep cloud expertise, architectural decision-making at scale, and the ability to translate business requirements into resilient, cost-effective infrastructure.',
    keywords: ['AWS / GCP / Azure', 'Architecture Patterns (microservices, serverless)', 'Infrastructure as Code (Terraform / CDK)', 'Cost Optimisation', 'Security Architecture', 'Multi-cloud Strategy'],
    tips: [
      'Lead with the scale of systems you have designed: "Architected multi-region AWS platform serving 12M monthly active users — 99.99% SLA, $2.1M annual infra cost across 3 continents".',
      'Show architectural decisions with trade-off reasoning: hiring managers want to know you can evaluate options, not just implement one pattern. Describe the alternatives you considered.',
      'List certifications prominently: AWS Solutions Architect Professional, GCP Professional Cloud Architect, or Azure Solutions Architect Expert are strong differentiators at the senior level.',
    ],
    altTitles: ['Solutions Architect', 'Enterprise Architect', 'Infrastructure Architect', 'Technical Architect', 'AWS Architect'],
    faq: [
      { q: 'How do I show cloud cost optimisation on a CV?', a: 'Quantify savings with context: "Reduced monthly AWS spend by 41% ($180K/year) through reserved instance strategy and right-sizing" — include the baseline cost so the saving is meaningful.' },
      { q: 'Should I specialise in one cloud or show multi-cloud experience?', a: 'Most roles want depth in one primary cloud (AWS most common, Azure in enterprise, GCP in data/ML). Multi-cloud experience is a bonus — lead with your deepest platform.' },
      { q: 'Is a cloud architect role suitable without a software engineering background?', a: 'Yes — strong infrastructure and systems backgrounds are common paths. But architects who have written application code tend to design more pragmatic systems. Show both if you have it.' },
    ],
  },

  'backend-developer': {
    title: 'Backend Developer',
    fieldSlug: 'tech',
    description: 'Backend developers build the systems, APIs, and data pipelines that power applications. Your CV must convey technical depth in your primary language, systems thinking at scale, and a track record of building reliable, high-performance services.',
    keywords: ['API Design (REST / GraphQL)', 'Databases (PostgreSQL / MongoDB / Redis)', 'Microservices / Event-Driven Architecture', 'Docker / Kubernetes', 'Node.js / Python / Java / Go', 'Performance Optimisation'],
    tips: [
      'Quantify system scale: "Designed and maintained REST API serving 180M requests/day — P99 latency 34ms at peak load" gives engineering managers the technical context they need.',
      'Show database expertise: query optimisation, index strategy, schema design, and caching layer experience (Redis, Memcached) are highly valued beyond basic SQL skills.',
      'Demonstrate architectural contribution: describe API contract decisions, service boundary design, or event-driven system design — show you think beyond implementation to architecture.',
    ],
    altTitles: ['Server-Side Developer', 'API Developer', 'Node.js Developer', 'Python Developer', 'Java Developer', 'Go Developer'],
    faq: [
      { q: 'Should I focus on one language or show versatility?', a: 'Lead with your primary language and framework (Python + FastAPI, Node.js + NestJS, Java + Spring Boot) and note secondary languages briefly. Hiring managers hire for depth in their stack.' },
      { q: 'How do I show system design skills on a backend CV?', a: '"Migrated monolithic service to event-driven microservices using Kafka — reduced deployment coupling and enabled independent scaling across 8 services". Process and rationale matter as much as the outcome.' },
      { q: 'Are system design interviews covered by the CV?', a: 'The CV gets you to interview. But seeding your CV with system-scale numbers and architectural decisions primes the interviewer to ask those questions, which plays to your strengths.' },
    ],
  },

  'network-engineer': {
    title: 'Network Engineer',
    fieldSlug: 'tech',
    description: 'Network engineers design, implement, and maintain the communications infrastructure organisations run on. Your CV must convey technical depth across networking protocols, vendor platforms, and the security principles now inseparable from modern network design.',
    keywords: ['CCNP / CCIE', 'BGP / OSPF / MPLS', 'SD-WAN', 'Network Security (Firewall / Zero Trust)', 'Cloud Networking (AWS / Azure VNet)', 'Wireshark / NetFlow Analysis'],
    tips: [
      'State Cisco (CCNP, CCIE), Juniper (JNCIP, JNCIE), or relevant vendor certifications prominently — they are the primary technical filter for network engineering roles.',
      'Describe infrastructure scale: "Managed enterprise WAN spanning 47 sites across 12 countries — BGP, MPLS, and SD-WAN overlay — 99.98% uptime over 24 months".',
      'Show security integration: modern network engineers must understand zero-trust architecture, firewall policy, and microsegmentation — include this experience if you have it.',
    ],
    altTitles: ['Network Architect', 'Network Infrastructure Engineer', 'Senior Network Engineer', 'WAN Engineer', 'Cloud Networking Engineer'],
    faq: [
      { q: 'Is CCNA / CCNP still the gold standard for network engineering?', a: 'Cisco certifications remain the most widely recognised globally. However, cloud networking skills (AWS, Azure, GCP networking) are increasingly co-equal, especially for enterprises moving to hybrid architectures.' },
      { q: 'How do I show network security experience on a networking CV?', a: 'Describe the security stack you manage: Palo Alto, Fortinet, CheckPoint, Cisco ASA/FTD — and include any zero-trust or ZTNA project work. Security and networking are converging rapidly.' },
      { q: 'Should I separate routing/switching from cloud networking?', a: 'Yes — use distinct skill categories: Traditional Networking (protocols, hardware), Cloud Networking (VPC, VNet, SD-WAN), and Security. Readers quickly identify depth in each area.' },
    ],
  },

  // ── Healthcare (expanded) ──────────────────────────────────────────────────

  'nurse-practitioner': {
    title: 'Nurse Practitioner',
    fieldSlug: 'healthcare',
    description: 'Nurse practitioners combine advanced clinical skills with autonomous practice, diagnosing and treating patients independently. Your CV must clearly convey your prescribing authority, specialism, and measurable patient outcomes.',
    keywords: ['NMC Advanced Practice', 'Non-Medical Prescribing (V300)', 'Clinical Assessment', 'Patient Management', 'Advanced Practice Specialism', 'Electronic Health Records'],
    tips: [
      'State your advanced practice registration, prescribing qualification (V300), and specialist certification in the first section — these are non-negotiable filters for NP roles.',
      'Document patient volume and case complexity: "Managing caseload of 350 patients across complex multi-morbidity clinics" demonstrates scope better than a job title alone.',
      'Highlight protocol development, service redesign, or clinical audit leadership — NP roles increasingly require evidence of system-level contribution beyond direct patient care.',
    ],
    altTitles: ['Advanced Nurse Practitioner', 'ANP', 'Clinical Nurse Specialist', 'NP', 'Advanced Practice Nurse'],
    faq: [
      { q: 'How do I show prescribing authority on my CV?', a: 'List "Non-Medical Prescriber (V300) — [date qualified]" prominently in your qualifications section. Also note the formulary scope — broad or condition-specific — and any controlled drug prescribing experience.' },
      { q: 'Should an NP CV differ from a staff nurse CV?', a: 'Significantly. Lead with autonomous practice, diagnostic reasoning, and patient caseload. De-emphasise task-based care and emphasise clinical decision-making, referral pathways, and service responsibility.' },
      { q: 'How long should a nurse practitioner CV be?', a: 'Two to three pages. NP roles require evidence of clinical competence, qualifications, CPD, and service contribution — one page is too compressed to convey advanced practice credibly.' },
    ],
  },

  'doctor': {
    title: 'Doctor / GP',
    fieldSlug: 'healthcare',
    description: 'Medical CVs follow strict conventions around registration, postgraduate training, publications, and clinical audit. Every section has a defined purpose — deviation signals unfamiliarity with the system.',
    keywords: ['GMC Registration', 'Specialty Training (ST Grade)', 'Clinical Audit', 'ALS / ATLS Certified', 'Prescribing', 'Multi-disciplinary Teamwork'],
    tips: [
      'Follow the standard UK medical CV structure: Personal Details, GMC Number, Medical Qualifications, Training Posts, Teaching, Research, Audit, Publications, Management. This order is expected.',
      'For each training post, include: trust name, specialty, grade, and start/end dates in a consistent format — NHS jobs systems parse these precisely.',
      'Clinical audit is often a shortlisting criterion — include the audit cycle stage reached, the standard audited against, and any changes implemented as a result.',
    ],
    altTitles: ['General Practitioner', 'GP Partner', 'Foundation Doctor', 'Specialty Registrar', 'Consultant', 'Junior Doctor'],
    faq: [
      { q: 'How long should a medical CV be?', a: 'UK medical CVs are typically 4-8 pages for a registrar, longer for consultants with publication and committee history. Unlike business CVs, comprehensiveness is valued — but every section must be genuinely populated.' },
      { q: 'Should I include my GMC number on my CV?', a: 'Yes — include it prominently near the top. Hiring trusts verify registration before shortlisting, so a missing number causes administrative delays.' },
      { q: 'How should I handle gaps in my training on a medical CV?', a: 'Account for all time from medical school graduation. Approved research periods, academic fellowships, and career breaks for personal reasons are all acceptable — leave no unexplained gap.' },
    ],
  },

  'pharmacist': {
    title: 'Pharmacist',
    fieldSlug: 'healthcare',
    description: 'Pharmacist CVs must demonstrate GPhC registration, clinical competence, and — increasingly — advanced clinical pharmacy skills. Employers scan for specialism, prescribing authority, and evidence of patient-centred practice.',
    keywords: ['GPhC Registration', 'Independent Prescribing', 'Clinical Pharmacy', 'Medicines Optimisation', 'Medication Reviews', 'Pharmacy Systems (SystemOne / EMIS)'],
    tips: [
      'State your GPhC number and independent prescribing qualification in your opening summary — these are shortlisting filters. Add prescribing scope if limited to a clinical area.',
      'Quantify clinical impact: "Conducted 340 medication reviews annually, identifying 87 clinically significant interactions and reducing polypharmacy in 12% of patients reviewed".',
      'Include dispensary volume and accuracy record for community roles: "Dispensed 4,500+ items weekly with zero dispensing errors over a 3-year period".',
    ],
    altTitles: ['Clinical Pharmacist', 'Community Pharmacist', 'Hospital Pharmacist', 'PCN Pharmacist', 'Independent Prescriber Pharmacist'],
    faq: [
      { q: 'Is independent prescribing necessary for NHS pharmacist roles?', a: 'Not for all roles, but increasingly required for Primary Care Network (PCN) positions and strongly preferred for clinical pharmacy specialist roles. It is worth obtaining early in your career.' },
      { q: 'Should I include MPharm degree classifications on my CV?', a: 'Yes — include your degree classification (First, 2:1) and any prizes or distinctions. If you graduated more than 10 years ago, condense to degree name and institution only.' },
      { q: 'How long should a pharmacist CV be?', a: 'One to two pages for community roles; two pages for clinical/hospital positions with research, publications, or teaching responsibilities.' },
    ],
  },

  'physiotherapist': {
    title: 'Physiotherapist',
    fieldSlug: 'healthcare',
    description: 'Physiotherapy CVs need to convey HCPC registration, clinical specialism, and measurable patient outcomes. Employers want to see your caseload scope, therapeutic approaches, and progression within specialist areas.',
    keywords: ['HCPC Registration', 'MSK / Neurological / Respiratory Specialism', 'Manual Therapy', 'Exercise Prescription', 'Patient Assessment & Rehabilitation', 'Outcome Measures (PSFS / EQ-5D)'],
    tips: [
      'State your HCPC registration number and any postgraduate clinical qualifications (MACP, specialist interest areas) near the top — these are the first things employers check.',
      'Describe caseload complexity: "MSK outpatient clinic — 28 patients per week across acute and chronic presentations including post-surgical, sports, and occupational injuries".',
      'Include outcome measurement: "Maintained PSFS improvement of ≥2 points in 84% of patients across 6-session programmes" demonstrates evidence-based practice.',
    ],
    altTitles: ['Physical Therapist', 'Chartered Physiotherapist', 'MSK Physiotherapist', 'Sports Physiotherapist', 'Neurological Physiotherapist'],
    faq: [
      { q: 'Should I list every CPD course on my physiotherapy CV?', a: 'No — be selective. List postgraduate certificates, specialist clinical training, and courses directly relevant to your target role. A CPD summary line covers the rest.' },
      { q: 'How do I show private practice experience on an NHS application?', a: 'Translate it directly: caseload size, referral sources, case complexity, and outcome data. NHS employers value private practice experience — especially autonomous practice and business skills.' },
      { q: 'How important is research experience for senior physio roles?', a: 'For Band 7+ and clinical specialist positions, audit participation and service evaluation are often expected. Publications are a differentiator but rarely a requirement outside academic roles.' },
    ],
  },

  'dentist': {
    title: 'Dentist',
    fieldSlug: 'healthcare',
    description: 'Dental CVs must convey GDC registration, clinical scope, and — for NHS roles — NHS performer number and UDA delivery. The sector distinguishes clearly between NHS, mixed, and private practice, each with different evaluation criteria.',
    keywords: ['GDC Registration', 'NHS Performer Number', 'UDA Delivery', 'Dental Implants / Oral Surgery', 'Sedation Qualified', 'Digital Dentistry (iTero / CBCT)'],
    tips: [
      'State your GDC number and registration status immediately after contact details — mandatory for any clinical dental role. Add your NHS performer number for NHS or mixed practice applications.',
      'Specify your UDA delivery history for NHS roles: "Consistently delivered 5,400-5,800 UDAs annually against a contract of 5,200 — zero NHS treatment banding challenges in 3 years".',
      'List advanced skills and equipment proficiency: implant placement, IV sedation, Invisalign, iTero scanning, CBCT interpretation. Private practice employers filter heavily on enhanced clinical skills.',
    ],
    altTitles: ['General Dental Practitioner', 'GDP', 'Dental Surgeon', 'Associate Dentist', 'Dental Foundation Trainee', 'Specialist Dentist'],
    faq: [
      { q: 'Should I include DCT / DF1 training on a dental CV?', a: 'Yes — dental foundation and core training are important early-career credentials. State the training practice, educational supervisor, and any ARFTS pass outcomes.' },
      { q: 'How do I present private vs NHS experience on a dental CV?', a: 'Be explicit about the practice model for each role: "100% NHS", "Mixed (70:30 NHS/private)", or "100% private — patient fee income £380K/year". Different employers look for different profiles.' },
      { q: 'Is an NHS performer number transferable?', a: 'Your NHS performer number is linked to you, not the practice. If you have held one, include it. New performers should note this clearly and state the expected ICB area.' },
    ],
  },

  'paramedic': {
    title: 'Paramedic',
    fieldSlug: 'healthcare',
    description: 'Paramedic CVs require HCPC registration, operational ambulance service context, and evidence of advanced clinical competence. With extended roles in urgent care and primary care, the scope of paramedic practice is widening rapidly.',
    keywords: ['HCPC Registration', 'JRCALC Clinical Guidelines', 'Advanced Life Support', 'ECG Interpretation', 'IV Access & Drug Administration', 'Urgent Treatment Centre (UTC)'],
    tips: [
      'State your HCPC registration number, operational role (EMT, Paramedic, Advanced Paramedic), and any specialist qualifications (MERIT, BASICS, HEMS).',
      'Describe your clinical context: "Emergency ambulance paramedic — 12-hour shifts, average 8-10 patient contacts, mixed urban/rural patch. Red 1 and Red 2 response including pre-hospital critical care."',
      'Show scope expansion: any UTC, GP practice, or clinical assessment centre experience demonstrates the breadth modern paramedic practice requires for career progression.',
    ],
    altTitles: ['Advanced Paramedic', 'Emergency Paramedic', 'Specialist Paramedic', 'Clinical Team Leader', 'HEMS Paramedic'],
    faq: [
      { q: 'How do I show clinical decision-making on a paramedic CV?', a: 'Describe the complexity of presentations you routinely manage: "Regular management of STEMI, stroke, poly-trauma, and paediatric emergencies — competent in RSI and chest decompression".' },
      { q: 'Should I include vehicle qualifications?', a: 'Blue light driving, LGV licence, or IRV qualifications are worth including — they expand your operational utility. List them in a licences/qualifications section near the top.' },
      { q: 'How do I show progression from technician to paramedic?', a: 'Show the qualification pathway clearly: EMT → student paramedic → registered paramedic → any post-registration advanced programmes. The progression narrative demonstrates commitment and professional development.' },
    ],
  },

  'occupational-therapist': {
    title: 'Occupational Therapist',
    fieldSlug: 'healthcare',
    description: 'OT CVs must demonstrate HCPC registration, specialism, and measurable impact on patients\' functional independence and quality of life. Employers want to see your assessment frameworks, caseload scope, and evidence-based practice.',
    keywords: ['HCPC Registration', 'Functional Assessment (AMPS / COPM)', 'Equipment Prescription', 'Mental Health / Physical Rehabilitation', 'Home Adaptations (DFG)', 'Sensory Integration'],
    tips: [
      'Lead with HCPC registration number and any postgraduate qualifications or specialist certifications near the top — registration is a legal requirement that is checked immediately.',
      'Describe your specialism and caseload: "Community OT — mixed adult and older adult caseload of 35 active clients; 60% complex physical rehabilitation, 40% mental health and cognitive assessment".',
      'Quantify functional outcome: "Reduced hospital discharge delays by 28% through streamlined functional assessment and equipment prescription — average time to safe discharge cut from 4.2 to 3.1 days".',
    ],
    altTitles: ['OT', 'Senior Occupational Therapist', 'Community OT', 'Mental Health OT', 'Paediatric OT', 'Specialist OT'],
    faq: [
      { q: 'Should I list every OT assessment tool I use?', a: 'List the primary assessment frameworks relevant to your specialism: MOHOST, AMPS, COPM, ACE-III, MoCA. A skills section entry works well — detailed explanation wastes space better used for clinical outcomes.' },
      { q: 'How do I show OT leadership without a management title?', a: 'Student supervision, practice educator roles, service development projects, and clinical audit leadership all demonstrate contribution beyond direct practice. Describe the scope and outcome.' },
      { q: 'Is a MSc OT worth mentioning for senior roles?', a: 'Absolutely — postgraduate qualifications (MSc, PGCert, specialist practice certification) are valued for Band 7+ roles. Include the awarding institution, year, and dissertation topic if relevant to your clinical area.' },
    ],
  },

  'midwife': {
    title: 'Midwife',
    fieldSlug: 'healthcare',
    description: 'Midwifery CVs must convey NMC registration, delivery suite competence, and the clinical scope of your autonomous practice. Employers scan first for registration status, band, and any enhanced skills before reading further.',
    keywords: ['NMC Registration', 'Intrapartum Care', 'Antenatal & Postnatal Assessment', 'CTG Interpretation', 'Neonatal Resuscitation', 'Caseload Midwifery'],
    tips: [
      'State your NMC PIN and registration status at the top — it is checked before the CV is read. Add your band and any enhanced practice qualifications (mentorship, IV drug administration, perineal suturing).',
      'Describe caseload and delivery setting: "Community caseload midwife — managing 40 antenatal and postnatal women per month across a rural patch, including high-risk alongside low-risk women".',
      'Include annual birth statistics for delivery suite roles: "2,500 births annually, 1:1 intrapartum care, active second stage management, team water birth competency".',
    ],
    altTitles: ['Community Midwife', 'Band 6 Midwife', 'Caseload Midwife', 'Specialist Midwife', 'Student Midwife', 'Newly Qualified Midwife'],
    faq: [
      { q: 'Should I include my preceptorship year on a midwifery CV?', a: 'Yes — note the trust, mentor, and any specific clinical areas covered. Once you have 2+ years of post-registration experience, condense to a line: "Preceptorship completed [Trust], [Year]".' },
      { q: 'How do I handle a gap from midwifery practice on my CV?', a: 'Account for the gap and note any maintained CPD: NMC revalidation evidence, study days, or simulation training. For returnees, mention any Return to Practice programme you have completed or enrolled in.' },
      { q: 'How important is continuity of care experience?', a: 'Very — NHS England\'s Long Term Plan prioritises continuity of carer models. Caseload midwifery or named midwife experience is increasingly valued for community and innovative service models.' },
    ],
  },

  'software-architect': {
    title: 'Software Architect',
    fieldSlug: 'tech',
    description: 'Software architects define the structural foundation of systems — making decisions that shape scalability, maintainability, and cost for years ahead. Your CV must demonstrate both technical depth and the cross-team influence to drive architectural change.',
    keywords: ['System Design', 'Microservices / Event-Driven Architecture', 'API Governance', 'Cloud-Native (AWS / GCP / Azure)', 'Architecture Decision Records (ADRs)', 'Technical Leadership'],
    tips: [
      'Frame architectural decisions with the trade-off: "Chose event-driven architecture over REST for the payments pipeline — reduced coupling across 12 services and cut P99 latency by 38%". Trade-off reasoning is the architect\'s core skill.',
      'Show influence across teams: "Authored and socialised 6 ADRs adopted across 4 engineering squads — reduced uncoordinated tech debt by an estimated 30 person-weeks annually".',
      'Distinguish between systems you designed and systems you joined. Describe the legacy state, the target architecture, and your specific role in the transition for each major system.',
    ],
    altTitles: ['Principal Engineer', 'Lead Architect', 'Solutions Architect', 'Enterprise Architect', 'Distinguished Engineer'],
    faq: [
      { q: 'How do I show architectural experience without an "Architect" title?', a: 'Describe the decisions: API design ownership, service decomposition choices, data modelling decisions, tech stack selection. "Led architecture for X" from a Senior Engineer or Tech Lead role is legitimate and understood.' },
      { q: 'Should a software architect CV include code samples?', a: 'No in the CV itself. Link to a GitHub profile showing non-trivial projects, design documents, or published ADRs. Architecture is demonstrated through decisions and outcomes, not syntax.' },
      { q: 'How senior must I be to call myself a software architect?', a: 'Generally 8-12+ years of engineering experience with clear evidence of system-level design decisions and cross-team technical leadership. The title varies by company size — at startups, senior engineers often perform architectural roles.' },
    ],
  },

  'change-manager': {
    title: 'Change Manager',
    fieldSlug: 'operations',
    description: 'Change managers lead organisations through transformation — from technology implementations to cultural shifts. Your CV must demonstrate structured change methodology, stakeholder mobilisation, and measurable adoption outcomes beyond project delivery.',
    keywords: ['Prosci ADKAR / Kotter', 'Stakeholder Engagement', 'Change Impact Assessment', 'Training & Communications', 'Resistance Management', 'Business Readiness'],
    tips: [
      'Anchor change outcomes in adoption, not delivery: "ERP implementation across 3,200 users — 94% active adoption at 90 days, 8% above target; 6-month productivity dip contained to 3 weeks vs. 12-week baseline".',
      'Show methodology: name the framework you applied (ADKAR, Kotter, McKinsey 7-S) and describe how you adapted it — rote methodology application is table stakes; adaptation signals maturity.',
      'Quantify resistance: "Identified 4 high-resistance stakeholder groups through impact assessment — designed targeted engagement interventions; reduced escalations by 67% vs. comparable prior programme".',
    ],
    altTitles: ['Organisational Change Manager', 'OCM Lead', 'Transformation Manager', 'Change & Adoption Lead', 'Business Change Manager'],
    faq: [
      { q: 'Is Prosci certification necessary for change management roles?', a: 'Prosci ADKAR is the most widely recognised framework globally. Certification signals structured methodology knowledge and is required or preferred at many large organisations and consultancies. APMG Change Management certification is an alternative.' },
      { q: 'How do I show change management experience embedded in a project role?', a: 'Create a "Change Leadership" skills section and describe the change-specific activities: stakeholder analysis, communications design, training delivery, resistance management. The embedded experience is valid — be explicit about the change dimension.' },
      { q: 'How long should a change manager CV be?', a: 'Two pages for mid-to-senior roles. Show programme scope (budget, users impacted, duration, geography) for each major engagement. Change management is inherently contextual — the scale and complexity of your programmes defines your credibility.' },
    ],
  },

  // ── Engineering ────────────────────────────────────────────────────────────

  'radiographer': {
    title: 'Radiographer',
    fieldSlug: 'healthcare',
    description: 'Radiography CVs must convey HCPC registration, imaging modality expertise, and the clinical context of your practice. Employers scan for registration status, scanner competencies, and any advanced or specialist reporting qualifications.',
    keywords: ['HCPC Registration', 'CT / MRI / X-ray / Ultrasound', 'IRMER Compliance', 'Image Acquisition & Quality', 'Patient Positioning', 'RPS / IR(ME)R Roles'],
    tips: [
      'State your HCPC registration number and primary modality specialism immediately — "Diagnostic Radiographer, CT and MRI specialist, Band 6" — before any other detail.',
      'Describe scanner models and software: "Siemens SOMATOM Force CT — 400+ contrast-enhanced examinations per month; GE Signa Pioneer 3T MRI — competent in cardiac, neurological, and MSK protocols".',
      'Include any advanced or reporting qualifications: "Advanced Practitioner in Plain Film Reporting — fracture, chest, and abdominal reporting under consultant supervision; 3,200 reports issued over 18 months".',
    ],
    altTitles: ['Diagnostic Radiographer', 'Therapeutic Radiographer', 'CT Radiographer', 'MRI Radiographer', 'Advanced Practitioner (Radiology)'],
    faq: [
      { q: 'Should I list every modality I have trained on?', a: 'List modalities you are competent to work unsupervised: plain film, CT, MRI, fluoroscopy, ultrasound, nuclear medicine. Note any that you are in supervised practice for — employers value honesty about scope.' },
      { q: 'How do I show progression from Band 5 to Band 6 on a radiography CV?', a: 'Describe the extended scope that justified the Band 6 appointment: advanced modality competence, reporting qualification, student supervision, protocol development, or on-call responsibility. The band change needs a clear clinical rationale.' },
      { q: 'Is a postgraduate reporting qualification worth pursuing early?', a: 'Yes — plain film reporting, CT colonography, and MRI reporting qualifications are increasingly requested for Band 6 and 7 roles. They demonstrate extended scope and improve both employability and banding prospects.' },
    ],
  },

  'civil-engineer': {
    title: 'Civil Engineer',
    fieldSlug: 'engineering',
    description: 'Civil engineers design and deliver the infrastructure that societies depend on. Your CV must demonstrate technical rigour, project delivery track record, and the professional registration that marks career progression.',
    keywords: ['CEng / IEng (ICE)', 'AutoCAD / Civil 3D', 'Structural Analysis', 'Project Delivery (NEC3/4)', 'CEEQUAL / BIM Level 2', 'Ground Investigation'],
    tips: [
      'State your professional registration level (MICE, CEng, IEng) and membership grade prominently — this is the primary professional filter in civil engineering hiring.',
      'Quantify project scale: "Delivered £14M highway improvement scheme — 3.2km single carriageway to dual, 4 structures, on programme and 2% under budget (12-month programme)".',
      'Show software depth alongside design experience: AutoCAD, Civil 3D, MicroDrainage, STAAD, PLAXIS — name the specific packages relevant to your specialism.',
    ],
    altTitles: ['Structural Engineer', 'Highway Engineer', 'Geotechnical Engineer', 'Water Engineer', 'Transport Engineer'],
    faq: [
      { q: 'How important is professional registration for civil engineering roles?', a: 'Essential for career progression. MICE membership and CEng status are expected within 5-8 years of graduation. Many senior roles and framework contracts explicitly require CEng.' },
      { q: 'Should I include CAD drawings or project photos in my CV?', a: 'No — keep the CV to text. A separate portfolio or project summary sheet works well for interview. Describe project scope, your specific role, and outcome in bullet form.' },
      { q: 'How do I show graduate civil engineering experience effectively?', a: 'Focus on technical learning breadth (geotechnical, structural, hydraulic, highway) and any NEC contract or site supervision experience. Graduate rotations are valuable — describe each one briefly.' },
    ],
  },

  'mechanical-engineer': {
    title: 'Mechanical Engineer',
    fieldSlug: 'engineering',
    description: 'Mechanical engineers design, analyse, and optimise physical systems across industries from aerospace to consumer products. Your CV must convey analytical depth and practical delivery experience across the full engineering development cycle.',
    keywords: ['CAD (SolidWorks / CATIA / NX)', 'FEA / CFD Analysis', 'GD&T', 'Product Development', 'Manufacturing Processes', 'BS/ISO Standards Compliance'],
    tips: [
      'Frame project impact commercially: "Redesigned heat exchanger assembly — 23% weight reduction and £340K annual material cost saving at production volume of 12,000 units/year".',
      'Name your CAD and simulation packages specifically — SolidWorks, CATIA V5, Ansys, Abaqus, NX — and note your proficiency level. ATS systems frequently filter on tool names.',
      'Show test and validation experience: mechanical CVs that only show design without test, build, and validation suggest a gap in engineering breadth.',
    ],
    altTitles: ['Design Engineer', 'Product Engineer', 'Manufacturing Engineer', 'Systems Engineer', 'R&D Engineer'],
    faq: [
      { q: 'Should I include CAD models or drawings in my CV?', a: 'Attach a separate portfolio PDF or link to a portfolio site — not in the CV itself. Mention it in your personal statement: "See attached portfolio for selected design and analysis work".' },
      { q: 'How do I show manufacturing knowledge without factory experience?', a: 'DFM decisions in your project work are highly relevant — describe tolerancing choices, material selection trade-offs, and liaison with suppliers or production teams.' },
      { q: 'Are professional engineering qualifications necessary?', a: 'IMechE membership and CEng progression are strongly valued in UK engineering. In the US, PE licensure matters for certain regulated roles. List your progress toward chartered status explicitly.' },
    ],
  },

  'electrical-engineer': {
    title: 'Electrical Engineer',
    fieldSlug: 'engineering',
    description: 'Electrical engineers design and deliver the power, control, and electronic systems that underpin modern infrastructure. Your CV must convey technical depth across your specialism, standards compliance, and project delivery track record.',
    keywords: ['IET Membership / CEng', 'AutoCAD Electrical / EPLAN', 'HV/LV Systems', 'Protection & Control', 'BS 7671 / IEC 61850', 'Project Delivery (NEC3/4)'],
    tips: [
      'State your IET membership grade and progress toward CEng — in electrical engineering, professional registration is a career filter, not just a credential.',
      'Quantify project scale: "Delivered 132kV substation upgrade — 4 bays, £6.8M contract value, 14-month programme — achieving energisation 3 days ahead of schedule".',
      'Show software proficiency specifically: EPLAN, AutoCAD Electrical, ETAP, PSS/E, SKM — ATS and hiring managers search for exact tool names relevant to their project types.',
    ],
    altTitles: ['Electrical Design Engineer', 'Power Systems Engineer', 'Control & Instrumentation Engineer', 'C&I Engineer', 'Electrical Project Engineer'],
    faq: [
      { q: 'Is 18th Edition BS 7671 necessary for all electrical engineering roles?', a: 'Essential for building services and low-voltage design roles. Less critical for power systems or high-voltage grid work, which have their own standards requirements. Specify the standards relevant to your specialism.' },
      { q: 'Should I include ATEX / hazardous area experience?', a: 'Yes — ATEX experience (oil & gas, chemical, pharmaceutical sites) is a significant differentiator for instrumentation and C&I engineers. State the zones and protection concepts you have worked with.' },
      { q: 'How do I show electrical engineering experience in renewables?', a: 'Specify technology (solar, wind, battery storage), voltage level (distribution, transmission), and scale (MWp / MWh). The energy transition has created distinct sub-specialisms — be precise.' },
    ],
  },

  // ── Business & Finance (expanded) ─────────────────────────────────────────

  'investment-banker': {
    title: 'Investment Banker',
    fieldSlug: 'finance',
    description: 'Investment banking CVs follow strict conventions. They are dense, transaction-led, and tightly formatted. Every line must demonstrate deal execution experience, technical financial skills, and the academic pedigree the sector filters on.',
    keywords: ['M&A / ECM / DCM', 'Financial Modelling (LBO / DCF / Merger)', 'Pitchbook Construction', 'Due Diligence', 'Bloomberg / Capital IQ', 'CFA / ACA'],
    tips: [
      'One page — always for analysts and associates. Economy of language signals investment banking culture. Senior bankers may extend to two pages only with significant deal and leadership history.',
      'Lead with a deal tombstone section: for each role, list 3-5 transactions with deal type, value, and your specific role. Banks read this section first.',
      'GPA matters more in finance than almost any other sector — include it if 3.7+ (US) or First / high 2:1 (UK). Target school prestige is a real credential at bulge-bracket firms.',
    ],
    altTitles: ['M&A Analyst', 'IBD Associate', 'Corporate Finance Analyst', 'Deals Analyst', 'Capital Markets Analyst'],
    faq: [
      { q: 'Is a target school required for investment banking?', a: 'In bulge-bracket banking, it remains a significant filter. However, strong grades from non-target schools plus relevant experience (Big 4, boutique IB, strong internships) can overcome it.' },
      { q: 'Should investment banking CVs have a personal statement?', a: 'No — investment banking CVs are transaction and skills led. The cover letter covers motivation. The CV is structured proof of relevant experience only.' },
      { q: 'How do I structure a banking CV with no deal experience?', a: 'Lead with technical skills (modelling, research, valuation), relevant coursework or CFA progress, and any finance internship. Finance society leadership or case competition wins are meaningful signals at entry level.' },
    ],
  },

  'sales-manager': {
    title: 'Sales Manager',
    fieldSlug: 'sales',
    description: 'Sales manager CVs must be number-dense and results-led. Hiring managers look for quota attainment, team performance, and pipeline metrics immediately — anything less signals underperformance or a lack of commercial accountability.',
    keywords: ['Quota Attainment', 'CRM (Salesforce / HubSpot)', 'Pipeline Management', 'Team Coaching & Development', 'ARR / MRR Growth', 'Enterprise / SMB Sales'],
    tips: [
      'Every role must state your quota, achievement against it, and your team\'s attainment. "Exceeded $2.8M annual quota by 134% — ranked #1 of 22 AEs nationally" is a benchmark sales bullet.',
      'Show team growth: "Hired and ramped 6 AEs in 9 months — team reached 110% quota attainment within 12 months of joining" demonstrates leadership, not just personal performance.',
      'Include the sales motion and deal profile: enterprise vs. mid-market vs. SMB, deal size (ACV), sales cycle length. These contextualise your revenue numbers.',
    ],
    altTitles: ['Head of Sales', 'Regional Sales Manager', 'Enterprise Sales Manager', 'Account Executive', 'VP Sales'],
    faq: [
      { q: 'Should I include quota numbers even if I underperformed?', a: 'If below 80% attainment, contextualise it: market conditions, territory build, product-market fit issues. Leaving quota completely unmentioned raises bigger questions than honest underperformance.' },
      { q: 'How do I show sales leadership without a management title?', a: '"Mentored 3 junior AEs, two of whom were promoted within 12 months" or "Led deal reviews and contributed to territory planning for a team of 8". Both demonstrate informal leadership credibly.' },
      { q: 'Is a sales methodology worth mentioning?', a: 'Yes — MEDDIC, Challenger, SPIN, Command of the Message. It signals systematic operation rather than purely relational selling. Match the methodology to what the hiring company uses.' },
    ],
  },

  'operations-manager': {
    title: 'Operations Manager',
    fieldSlug: 'operations',
    description: 'Operations managers ensure organisations run efficiently, cost-effectively, and at scale. Your CV must demonstrate process improvement track record, resource management, and measurable operational outcomes across cost, quality, and delivery.',
    keywords: ['Lean / Six Sigma', 'P&L Responsibility', 'KPI Management', 'Supply Chain / Logistics', 'Process Improvement', 'Workforce Planning'],
    tips: [
      'Frame every role around the three pillars of operations: cost, quality, and delivery. "Reduced cost-per-unit by 18% while improving on-time delivery from 84% to 97% and reducing customer complaints by 31%".',
      'Show scope clearly: budget managed, headcount led, geographic span, and operational complexity (multi-site, shift patterns, regulated environment).',
      'Include Lean or Six Sigma credentials prominently — even Yellow Belt signals process methodology awareness. Green Belt or Black Belt is a strong differentiator for senior roles.',
    ],
    altTitles: ['Head of Operations', 'COO', 'Plant Manager', 'Logistics Manager', 'Supply Chain Manager', 'Service Delivery Manager'],
    faq: [
      { q: 'How do I show operations leadership across different industries?', a: 'Focus on transferable outcomes: cost reduction, efficiency gains, team management, supplier relationships. Operations fundamentals are portable — the industry context changes but the discipline does not.' },
      { q: 'Should I include financial P&L data on my operations CV?', a: 'Yes — budget ownership is a key differentiator for senior roles. "Managed £4.2M operational budget — delivered 12% under budget through procurement renegotiation" is a strong operations bullet.' },
      { q: 'Is Lean / Six Sigma certification necessary?', a: 'Not always, but valued. If you do not have formal certification, describe Lean tools you\'ve applied: 5S, kaizen events, VSM, SMED. Application of methodology matters more than the certificate at many organisations.' },
    ],
  },

  'business-development-manager': {
    title: 'Business Development Manager',
    fieldSlug: 'sales',
    description: 'Business development managers identify and capture new revenue opportunities. Your CV must show pipeline generation, deal closure, and commercial strategy — not just relationship-building activity.',
    keywords: ['New Business Revenue', 'Pipeline Generation', 'Strategic Partnerships', 'CRM (Salesforce)', 'Contract Negotiation', 'Market Expansion'],
    tips: [
      'Every role should show: new revenue generated, deal count, average deal value, and conversion rate. "Generated £3.8M new ARR from 14 enterprise accounts — average deal value £271K, 6-month sales cycle".',
      'Show partnership value separately from direct sales: licensing revenue, channel partner contributions, and co-sell arrangements all count — quantify each stream.',
      'Demonstrate market development: describe how you entered new verticals, geographies, or customer segments. This differentiates you from account managers.',
    ],
    altTitles: ['BDM', 'Head of Business Development', 'Commercial Manager', 'New Business Manager', 'Strategic Partnerships Manager'],
    faq: [
      { q: 'What is the difference between a BDM and Sales Manager CV?', a: 'BDM CVs emphasise market development, new logo acquisition, and strategic relationship building. Sales Manager CVs emphasise team leadership and quota management. Be explicit about whether you led a team or sold individually.' },
      { q: 'Should I include LinkedIn outreach or SDR-style metrics?', a: 'Yes if they drove pipeline: "Generated 340 qualified opportunities from outbound sequences — 18% connection-to-meeting rate (3x industry benchmark)". If they did not lead to revenue, they are less relevant.' },
      { q: 'How do I show BDM experience in a startup context?', a: '"First external hire — grew revenue from £0 to £1.2M ARR in 18 months." Founding commercial contribution in a startup is more impressive than hitting quota in an established sales team.' },
    ],
  },

  'supply-chain-manager': {
    title: 'Supply Chain Manager',
    fieldSlug: 'operations',
    description: 'Supply chain managers orchestrate the flow of goods from supplier to customer. Your CV must demonstrate end-to-end supply chain thinking, resilience under disruption, and measurable improvements in cost, lead time, and service level.',
    keywords: ['APICS CSCP / CPSM', 'ERP (SAP / Oracle)', 'S&OP / IBP', 'Demand Planning', 'Supplier Management', 'Logistics & 3PL Management'],
    tips: [
      'Anchor every role in the three supply chain metrics: cost, lead time, and service level. "Reduced supplier lead times by 34% and improved OTIF from 89% to 97.2% while cutting inventory by £2.1M".',
      'Show crisis management: supply chain disruption experience (COVID, port delays, sole-source failure) is now a valued credential — describe how you responded and what you changed structurally.',
      'Include S&OP or IBP process ownership: cross-functional demand/supply balancing distinguishes managers from coordinators.',
    ],
    altTitles: ['Procurement Manager', 'Logistics Manager', 'Head of Supply Chain', 'Planning Manager', 'Demand Planner'],
    faq: [
      { q: 'Is APICS certification important for supply chain roles?', a: 'CSCP and CPIM are widely recognised globally. They signal structured supply chain methodology knowledge. For senior roles, they are a strong differentiator; domain experience often outweighs certification for specialist positions.' },
      { q: 'How do I show supply chain experience in manufacturing vs. retail?', a: 'Specify your industry context clearly — manufacturing, FMCG, retail, ecommerce, or B2B distribution each have different demand patterns. Frame your experience in those terms.' },
      { q: 'What financial metrics matter for supply chain CVs?', a: 'Inventory value managed, working capital reduction, cost-of-goods impact, and 3PL contract value. "Renegotiated 3PL contracts saving £840K annually while improving SLA from 93% to 98.5%" is an excellent template.' },
    ],
  },

  'compliance-officer': {
    title: 'Compliance Officer',
    fieldSlug: 'legal',
    description: 'Compliance officers protect organisations from regulatory, legal, and reputational risk. Your CV must convey regulatory knowledge, jurisdiction, and the frameworks you have implemented — not just that you "ensured compliance".',
    keywords: ['FCA / PRA Regulation', 'AML / KYC', 'GDPR / Data Protection', 'Risk Assessment Frameworks', 'Internal Audit', 'Regulatory Reporting'],
    tips: [
      'Name the specific regulator and regulatory framework you operate within: FCA COBS, PRA rules, GDPR Article 30, FCPA, DORA — these are precise filters used by compliance hiring managers.',
      'Show regulatory examination outcomes: "Managed FCA supervisory review — zero enforcement actions; implemented 14 remediation actions to agreed timescales" is a strong compliance achievement.',
      'Describe the financial or reputational risk you mitigated: "Identified and remediated systemic AML process failure — estimated regulatory fine avoided: £4-8M" contextualises the value of compliance work.',
    ],
    altTitles: ['Compliance Manager', 'Risk & Compliance Officer', 'Regulatory Affairs Manager', 'AML Officer', 'MLRO', 'Data Protection Officer'],
    faq: [
      { q: 'Should a compliance CV lead with qualifications or experience?', a: 'For regulated roles (MLRO, DPO, SMF positions), lead with qualifications and regulatory approvals: ICA Diploma, CISI, CAMS, or GDPR practitioner. For general compliance management, lead with experience and frameworks.' },
      { q: 'How do I show compliance impact without disclosing regulatory investigations?', a: '"Led enterprise-wide GDPR remediation programme across 14 jurisdictions — 340 processing activities documented, 47 DPIAs completed." Impact is clear without confidential detail.' },
      { q: 'How important is industry-specific regulatory knowledge?', a: 'Very — financial services, healthcare, pharmaceuticals, and consumer goods all have specific frameworks. Cross-industry experience is valuable but depth in one sector is what most employers hire for.' },
    ],
  },

  'procurement-manager': {
    title: 'Procurement Manager',
    fieldSlug: 'operations',
    description: 'Procurement managers manage the acquisition of goods and services strategically — balancing cost, quality, risk, and supply continuity. Your CV must demonstrate category management depth, savings delivery, and supplier relationship outcomes.',
    keywords: ['CIPS Qualified', 'Category Management', 'Contract Negotiation', 'Spend Analysis', 'Supplier Risk Management', 'ERP (SAP Ariba / Oracle Procurement)'],
    tips: [
      'Quantify savings with baseline context: "Delivered £3.4M in year-1 savings across IT and professional services categories (12.3% reduction from £27.6M baseline spend)".',
      'Show category depth: hiring managers want specialists. State your primary categories (IT, marketing, facilities, logistics, raw materials) and the annual spend you managed.',
      'Include any CIPS qualification (Level 4, 5, or 6 MCIPS/FCIPS) near the top — it is the professional benchmark for UK procurement, equivalent to CPSM in the US.',
    ],
    altTitles: ['Category Manager', 'Strategic Sourcing Manager', 'Head of Procurement', 'Purchasing Manager', 'Sourcing Manager'],
    faq: [
      { q: 'How do I show procurement experience without a "Procurement" title?', a: 'Many organisations embed procurement in operations, finance, or commercial roles. Use a "procurement and sourcing" skills section and describe spend managed, contracts negotiated, and supplier relationships owned explicitly.' },
      { q: 'Should I include supplier names on my CV?', a: 'Only for major, widely known suppliers where the relationship demonstrates status (negotiating with Microsoft, AWS, or Deloitte). For others, describe the category and contract value without naming the vendor.' },
      { q: 'Is CIPS more important than experience?', a: 'Experience and savings delivery usually matter more for mid-to-senior roles. CIPS signals knowledge foundation and professional commitment. It rarely replaces 5+ years of category management experience.' },
    ],
  },

  'executive-assistant': {
    title: 'Executive Assistant',
    fieldSlug: 'administration',
    description: 'Executive assistants are the operational backbone of senior leadership. Your CV must convey the seniority of executives you have supported, the organisational complexity, and the scope of your autonomous judgment — far beyond diary management.',
    keywords: ['C-Suite / Board Support', 'Complex Diary Management', 'Board Pack Preparation', 'Stakeholder Management', 'Confidentiality & Discretion', 'Project Coordination'],
    tips: [
      'State the seniority and scope of your principal explicitly: "EA to CEO and CFO of a FTSE 250 retail business (18,000 employees)" contextualises your work immediately.',
      'Show strategic contribution beyond logistics: "Managed board pack production for 6 quarterly board meetings — liaising with 12 ExCo members across 4 time zones with zero late submissions".',
      'Demonstrate trust through scope: "Managed £180K executive travel budget with sole signing authority" shows independence more powerfully than describing confidentiality.',
    ],
    altTitles: ['Personal Assistant', 'EA', 'PA to CEO', 'Senior PA', 'Chief of Staff (Operational)', 'Senior Administrator'],
    faq: [
      { q: 'How do I show progression in an EA career?', a: 'Move from job title to principal seniority and organisational complexity: PA to Director → EA to CEO. Also show scope expansion: travel budget ownership, team management, project responsibility, board-level access.' },
      { q: 'Should an EA CV include financial data about the principal?', a: 'Do not include specific salary details of those you have supported. Describe your financial responsibility in general terms: "Managed departmental expense budgets totalling £240K".' },
      { q: 'Is a degree necessary for EA roles?', a: 'Not typically, though it helps at the most senior levels. Demonstrated capability, discretion, and relevant experience consistently outweigh academic credentials for EA positions.' },
    ],
  },

  // ── Creative & Professional ────────────────────────────────────────────────

  'graphic-designer': {
    title: 'Graphic Designer',
    fieldSlug: 'design',
    description: 'Graphic designers translate ideas into visual communication. Your CV must demonstrate creative range, brand thinking, and the commercial impact of your design decisions — not just technical software skills.',
    keywords: ['Adobe Creative Suite (Illustrator / Photoshop / InDesign)', 'Figma', 'Typography & Layout', 'Brand Identity', 'Print & Digital Production', 'Motion Graphics (After Effects)'],
    tips: [
      'Your CV is itself a design brief — it must demonstrate your craft. But balance creative expression with readability: a beautiful CV that fails ATS parsing is counterproductive.',
      'Frame design decisions commercially: "Redesigned product packaging — 22% increase in shelf pickup rate measured in a 6-store pilot" is far stronger than "designed packaging".',
      'Curate your portfolio to 6-8 diverse, strong pieces with brief case studies. Quantity signals anxiety; curation signals confidence.',
    ],
    altTitles: ['Visual Designer', 'Brand Designer', 'Creative Designer', 'Digital Designer', 'Art Director'],
    faq: [
      { q: 'Should a graphic designer CV be designed?', a: 'Yes — but restrained. A clean, typographically strong layout is more impressive than an elaborate design that becomes unreadable in ATS systems. Always submit as PDF.' },
      { q: 'How important is a portfolio for graphic design applications?', a: 'Essential — more important than the CV. Include the portfolio URL near your name and email. Ensure it is mobile-friendly, loads within 3 seconds, and leads with your strongest work.' },
      { q: 'How do I show brand design experience without agency background?', a: 'In-house brand work, freelance projects, and personal projects all count. Document the brief, process, and outcome. A well-documented freelance project often impresses more than agency work with unclear individual contribution.' },
    ],
  },

  'ux-researcher': {
    title: 'UX Researcher',
    fieldSlug: 'design',
    description: 'UX researchers uncover user needs, behaviours, and mental models that drive product decisions. Your CV must demonstrate methodological range, the rigour of your analysis, and — critically — how your research influenced outcomes.',
    keywords: ['User Interviews & Usability Testing', 'Survey Design & Analysis', 'Ethnographic Research', 'Card Sorting / Tree Testing', 'Research Operations', 'Jobs-to-be-Done'],
    tips: [
      'Frame every research project with business impact: "Recruited 18 participants for diary study — findings led to navigation redesign, resulting in 23% improvement in task completion rate".',
      'Show methodological breadth and appropriate selection: note when you chose qual vs. quant methods and why. Researchers who can defend their choices are more credible than those who use one method for everything.',
      'Describe your stakeholder influence: "Presented findings to VP Product and CTO — secured immediate commitment to a 3-sprint redesign programme". Research that is not acted on has no business value.',
    ],
    altTitles: ['User Researcher', 'Design Researcher', 'Product Researcher', 'Consumer Insights Manager', 'Mixed-Methods Researcher'],
    faq: [
      { q: 'Should a UX researcher have a portfolio?', a: 'Yes — case studies showing research planning, methodology, analysis, and impact are essential. Redact participant identities and proprietary product details where required.' },
      { q: 'How do I show research impact when decisions were overridden?', a: '"Research recommended A; team chose B for business reasons. I flagged the risk, tracked the outcome, and findings informed the subsequent pivot." Honest documentation of complex situations is respected.' },
      { q: 'Is a psychology or HCI degree necessary?', a: 'Not required, but valued. Psychology, cognitive science, anthropology, and HCI all provide strong foundations. A strong portfolio demonstrating rigorous research practice often outweighs academic background.' },
    ],
  },

  'architect': {
    title: 'Architect',
    fieldSlug: 'architecture',
    description: 'Architectural CVs combine creative portfolio with professional credential. ARB registration and RIBA membership define your qualification status, while projects demonstrate your design range, technical competence, and delivery capability.',
    keywords: ['ARB Registration', 'RIBA Part III', 'AutoCAD / Revit / ArchiCAD', 'RIBA Plan of Work', 'Planning Permission', 'CDM Regulations'],
    tips: [
      'State your ARB registration number and RIBA grade (Part I, II, III) immediately after your name and contact details — these are qualification filters used before design is even considered.',
      'Frame projects commercially: "Delivered 42-unit mixed-tenure residential scheme — £8.4M contract value, on programme, achieving Passivhaus certification with two RIBA award nominations".',
      'Name your software proficiency specifically: Revit, AutoCAD, ArchiCAD, Rhino, SketchUp, Enscape, Vectorworks — and note BIM Level 2 or 3 experience where applicable.',
    ],
    altTitles: ['Architectural Designer', 'RIBA Chartered Architect', 'Design Architect', 'Project Architect', 'Associate Architect'],
    faq: [
      { q: 'Is a portfolio more important than the CV for architectural roles?', a: 'Both are essential and reviewed together. The CV establishes qualifications, experience, and professional narrative; the portfolio demonstrates design sensibility and technical execution.' },
      { q: 'How do I transition from Part II to Part III on a CV?', a: 'List your Part II experience with project types and scales. Note your Part III enrolment date and expected qualification year. Show you are managing projects with appropriate supervision.' },
      { q: 'Should I include planning success rates on an architectural CV?', a: '"87% planning approval rate across 34 planning applications over 4 years" is a meaningful commercial metric. For conservation and listed building work, appeal success rates are equally relevant.' },
    ],
  },

  'journalist': {
    title: 'Journalist',
    fieldSlug: 'media',
    description: 'Journalism CVs need to establish your beat expertise, publication tier, and impact. Editors scan for where you have been published, what you have broken, and the audiences you have reached — quickly.',
    keywords: ['Beat Specialism', 'NCTJ / BJTC Qualification', 'Investigative Reporting', 'Digital Analytics (Pageviews / Reach)', 'Press Awards', 'Multi-platform (print / digital / broadcast)'],
    tips: [
      'List publications in order of prestige — national broadsheets, major trade titles, and significant digital outlets first. A byline in The Guardian or The Times carries more weight than 50 local pieces.',
      'Include digital metrics where available: "Wrote 3 pieces with 100K+ page views; investigative piece shared 14,000 times on social media" — audience impact is increasingly measured.',
      'Note scoops, exclusives, and awards: "Broke story three days ahead of competitor outlets — cited as one of 2024\'s top 10 regional investigations" signals genuine news instinct.',
    ],
    altTitles: ['Reporter', 'Correspondent', 'News Editor', 'Feature Writer', 'Sub-editor', 'Digital Journalist'],
    faq: [
      { q: 'Should I attach cuttings to my journalism CV?', a: 'Link to an online portfolio or cuttings file — either a personal site or a Muck Rack / Journo Portfolio profile. For print-only cuttings, a Google Drive PDF pack is acceptable.' },
      { q: 'Is NCTJ qualification still important?', a: 'Yes for news reporting roles — many editors treat it as a hard requirement. For specialist, features, or digital-native roles, an impressive portfolio and relevant subject expertise often matter more.' },
      { q: 'How do I structure a journalism CV as a freelancer?', a: 'List your top 5-6 publications as clients, then a "Selected Commissions" section with headline, publication, and date for your 10 strongest pieces. Follow with a full publication list if space allows.' },
    ],
  },

  'chef': {
    title: 'Chef',
    fieldSlug: 'hospitality',
    description: 'Culinary CVs need to convey kitchen hierarchy, cuisine type, covers volume, and service tempo quickly. Kitchens are hierarchical and employers scan first for where you trained and at what level you are currently operating.',
    keywords: ['Cuisine Type', 'AA Rosettes / Michelin Stars', 'Covers & Service Volume', 'Kitchen Management', 'HACCP & Food Hygiene Level 3', 'Allergen Management'],
    tips: [
      'Lead with the quality tier: "Sous chef, 2-AA-Rosette country house hotel — 80 covers dinner service, 120 weekend lunch" immediately places you in context.',
      'List your kitchen brigade role explicitly — Head Chef, Sous Chef, Senior Chef de Partie, CDP, Commis — and the section you led (pastry, fish, larder, grill) for each role.',
      'Include Food Hygiene Level 3 (and Level 4 for head chef roles) near the top — kitchens are regulated environments and certificates are checked before interview.',
    ],
    altTitles: ['Head Chef', 'Sous Chef', 'Chef de Partie', 'Pastry Chef', 'Executive Chef', 'Commis Chef'],
    faq: [
      { q: 'How do I show progression in a culinary CV?', a: 'Show movement up the brigade: Commis → CDP → Sous → Head Chef. Note any quality upgrade you contributed to: "Promoted to Head Chef 6 months after joining — kitchen retained its AA Rosette and gained a second within 18 months".' },
      { q: 'Should I include cooking styles and signature dishes?', a: 'Include cuisine style and influences ("Modern British with French classical foundation, seasonal tasting menu focus") but not specific dish names, which change with menus and seasons.' },
      { q: 'How important is the establishment reputation on a chef CV?', a: 'Very — Michelin stars and AA Rosettes signal culinary standards. Named establishments (The Ledbury, Gordon Ramsay Group) carry brand recognition. Prestigious training kitchens are a headline credential.' },
    ],
  },

  'social-worker': {
    title: 'Social Worker',
    fieldSlug: 'social_care',
    description: 'Social work CVs must demonstrate Social Work England registration, statutory knowledge, and evidence-based practice. Employers prioritise safeguarding competence, caseload management, and your track record of effective family and individual support.',
    keywords: ['Social Work England Registration', 'Safeguarding (Adults / Children)', 'Care Act 2014 / Children Act 1989', 'MASH / CIN / CP', 'Caseload Management', 'Risk Assessment'],
    tips: [
      'State your Social Work England registration number and qualified status (DipSW / BA / MA Social Work) at the top — registration is a legal requirement and the first check made by any employer.',
      'Describe caseload volume and complexity: "Managed active caseload of 22 Child Protection cases, 8 Children in Need, and 4 Looked After Children — meeting all statutory timescales".',
      'Evidence statutory knowledge by referencing specific legislation and frameworks you have applied: Care Act assessments, Section 47 enquiries, Pre-Proceedings under PLO.',
    ],
    altTitles: ['Qualified Social Worker', 'QSW', 'Children\'s Social Worker', 'Adults Social Worker', 'MASH Social Worker', 'Independent Social Worker'],
    faq: [
      { q: 'How do I handle emotionally sensitive case work on a CV?', a: 'Describe the category and complexity without identifying detail: "Complex family court cases involving neglect, domestic abuse, and parental substance misuse across 3 family groups". This demonstrates experience while maintaining confidentiality.' },
      { q: 'Is ASYE completion worth mentioning?', a: 'Absolutely — state your ASYE year, employer, and portfolio outcome. It marks the transition to qualified, independent practice and is a reference point employers use to assess experience level.' },
      { q: 'Should I include personal development in social work CPD?', a: 'Yes — Social Work England requires CPD evidence annually. A brief CPD section noting relevant training (trauma-informed practice, motivational interviewing, safeguarding update) demonstrates professional commitment.' },
    ],
  },

  'actuary': {
    title: 'Actuary',
    fieldSlug: 'finance',
    description: 'Actuarial CVs are credential-led and exam-progress-sensitive. Employers hire against your qualification stage, specialism, and the technical depth of your modelling and reserving experience.',
    keywords: ['IFoA / CAS Examinations', 'Reserving / Pricing', 'Solvency II / IFRS 17', 'Prophet / MoSes / R / Python', 'Capital Modelling', 'Risk Management'],
    tips: [
      'State your qualification stage explicitly and prominently: "Fellow of the Institute and Faculty of Actuaries (FIA, 2023)" or "Student — 8 of 15 exams passed (CT1-CT8, CA1, CP1)". Employers hire by exam stage.',
      'Name your modelling tools precisely: Prophet, MoSes, R, Python, SQL, Excel/VBA. Most actuarial roles require specific tools and screen CVs accordingly.',
      'Quantify reserving or pricing work: "Led annual reserving process for £240M general insurance portfolio — presented results to CFO and Audit Committee".',
    ],
    altTitles: ['Actuarial Analyst', 'Qualified Actuary', 'FIA', 'Pricing Actuary', 'Reserving Actuary', 'Capital Actuary'],
    faq: [
      { q: 'How important is exam progress on an actuarial CV?', a: 'Critical at student level — it is the primary hiring filter. Employers set minimum exam requirements (e.g. CT1-CT8 passed for a senior student role). Always state the exact number and list of exams passed.' },
      { q: 'Should I include my exam results?', a: 'First attempts and passes are worth noting if strong: "All 8 CT exams passed — 6 on first attempt" signals academic ability. Resit history is not typically disclosed and not expected.' },
      { q: 'How do I show actuarial value beyond exam progress?', a: 'Describe the financial scale of work: portfolio size, reserving uncertainty, capital outcomes. Also show communication with non-actuarial stakeholders — board presentations, regulator interactions, cross-functional projects.' },
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
    // Technology
    'software-engineer': 'Technology', 'frontend-developer': 'Technology', 'data-scientist': 'Technology',
    'product-manager': 'Technology', 'devops-engineer': 'Technology', 'ux-designer': 'Technology',
    'data-engineer': 'Technology', 'cybersecurity-analyst': 'Technology', 'machine-learning-engineer': 'Technology',
    'qa-engineer': 'Technology', 'cloud-architect': 'Technology', 'backend-developer': 'Technology',
    'network-engineer': 'Technology', 'ux-researcher': 'Technology', 'software-architect': 'Technology',
    // Business & Finance
    'marketing-manager': 'Business & Finance', 'financial-analyst': 'Business & Finance',
    'accountant': 'Business & Finance', 'project-manager': 'Business & Finance',
    'lawyer': 'Business & Finance', 'hr-manager': 'Business & Finance',
    'investment-banker': 'Business & Finance', 'sales-manager': 'Business & Finance',
    'operations-manager': 'Business & Finance', 'business-development-manager': 'Business & Finance',
    'supply-chain-manager': 'Business & Finance', 'compliance-officer': 'Business & Finance',
    'procurement-manager': 'Business & Finance', 'executive-assistant': 'Business & Finance',
    'actuary': 'Business & Finance', 'change-manager': 'Business & Finance',
    // Healthcare & Education
    'nurse': 'Healthcare & Education', 'teacher': 'Healthcare & Education',
    'nurse-practitioner': 'Healthcare & Education', 'doctor': 'Healthcare & Education',
    'pharmacist': 'Healthcare & Education', 'physiotherapist': 'Healthcare & Education',
    'dentist': 'Healthcare & Education', 'paramedic': 'Healthcare & Education',
    'occupational-therapist': 'Healthcare & Education', 'midwife': 'Healthcare & Education',
    'social-worker': 'Healthcare & Education', 'radiographer': 'Healthcare & Education',
    // Engineering
    'civil-engineer': 'Engineering', 'mechanical-engineer': 'Engineering', 'electrical-engineer': 'Engineering',
    // Creative & Media
    'graphic-designer': 'Creative & Media', 'architect': 'Creative & Media',
    'journalist': 'Creative & Media', 'chef': 'Creative & Media',
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
