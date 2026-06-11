/**
 * test-cv-landing-validator.mjs
 * Comprehensive tests for the landing page CV validator and scoring pipeline.
 *
 * Run: npm run test:landing-validator
 *
 * Covers:
 *  1. isLikelyCv — JD detection (Stage 1)
 *  2. isLikelyCv — signal check (Stage 2)
 *  3. parseLandingCvText — structure extraction
 *  4. Integration: full scoring produces expected score ranges
 */

// ─── ANSI colours ────────────────────────────────────────────────────────────
const G  = '\x1b[32m✓\x1b[0m';
const R  = '\x1b[31m✗\x1b[0m';
const DIM = '\x1b[2m';
const RST = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  ${G} ${label}`);
    passed++;
  } else {
    console.log(`  ${R} ${label}${detail ? `\n      ${DIM}→ ${detail}${RST}` : ''}`);
    failed++;
    failures.push(label);
  }
}

function section(title) {
  console.log(`\n${BOLD}${CYAN}${title}${RST}`);
}

// ─── Inline the validator logic (mirrors frontend/utils/cvLandingValidator.ts) ─
// We inline rather than importing the TypeScript source directly so this script
// runs with plain `node` and has zero build step.

function isLikelyCv(text) {
  const t = text.trim();
  if (t.length < 200) {
    return 'Please paste more of your CV — we need at least a summary and one experience section (200+ characters).';
  }
  const JD_HEADERS  = /^#{0,3}\s*(job\s+description|position\s+overview|about\s+(the\s+)?(role|position|company|us)|we\s+are\s+(seeking|looking\s+for)|the\s+successful\s+candidate|job\s+posting|vacancy|what\s+we\s+offer|our\s+client)\b/im;
  const JD_SECTIONS = /^#{0,3}\s*(responsibilities|requirements|qualifications|preferred\s+skills?|desired\s+skills?|nice\s+to\s+have|benefits|compensation|salary)\s*[:\-–]?\s*$/im;
  const JD_PHRASES  = /\b(we\s+are\s+(seeking|looking\s+for)|you\s+will\s+be\s+(responsible|expected)|the\s+(ideal|successful)\s+candidate|apply\s+(now|by|before)|equal\s+opportunity\s+(employer)?|to\s+apply\s+(please|send|email)|must\s+have\s+a\s+(degree|bachelor|master)|salary\s+(range|package)|closing\s+date)\b/i;
  if (JD_HEADERS.test(t) || JD_SECTIONS.test(t) || JD_PHRASES.test(t)) {
    return 'This looks like a job description, not a CV.';
  }
  const hasPersonalSections = /\b(professional\s+summary|career\s+summary|work\s+experience|work\s+history|employment\s+history|education|key\s+skills|core\s+competencies|profile|objective)\b/i.test(t);
  const hasDateRanges       = /\b(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|present|current|now|to\s+date)\b/i.test(t);
  const hasBullets          = /^[\s]*[•·›➤▸]\s/m.test(t);
  const hasContact          = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/.test(t) || /\+?\d[\d\s\-(). ]{7,}\d/.test(t);
  const hasName             = /^[A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3}\s*$/.test(t.split('\n')[0]?.trim() ?? '');
  const hasJobTitle         = /\b(manager|engineer|analyst|developer|designer|director|officer|specialist|consultant|lead|head\s+of|chief|vice\s+president|associate|coordinator)\b/i.test(t.split('\n').slice(0, 4).join(' '));
  const signals = [hasPersonalSections, hasDateRanges, hasBullets, hasContact, hasName, hasJobTitle].filter(Boolean).length;
  if (signals < 2) {
    return "This doesn't look like a CV.";
  }
  return null;
}

function parseLandingCvText(text) {
  const lines      = text.split('\n').map(l => l.trim()).filter(Boolean);
  const bulletRx   = /^[•\-\*·›➤▸]\s*(.+)$|^\d+\.\s+(.+)$/;
  const dateLineRx = /\b(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|present|current|now|to\s+date)\b/i;
  const sectionRx  = /^(EXPERIENCE|EMPLOYMENT|WORK|EDUCATION|SKILLS|SUMMARY|PROFILE|CERTIFICATIONS?|QUALIFICATIONS?|ACHIEVEMENTS?|PROJECTS?)\s*:?\s*$/i;
  const name = lines[0] ?? '';
  const summaryLines = [];
  for (let i = 1; i < lines.length && summaryLines.length < 6; i++) {
    const l = lines[i];
    if (sectionRx.test(l) || dateLineRx.test(l)) break;
    if (!bulletRx.test(l) && l.length > 20) summaryLines.push(l);
  }
  const summary = summaryLines.join(' ');
  const roles = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const hasDate     = dateLineRx.test(l);
    const nextHasDate = i + 1 < lines.length && dateLineRx.test(lines[i + 1]);
    if (hasDate || nextHasDate) {
      if (cur) roles.push(cur);
      const titleLine = hasDate ? l.replace(dateLineRx, '').trim() : l;
      const parts = titleLine.split(/[|·—\-,@]/);
      cur = {
        jobTitle: (parts[0] ?? titleLine).trim().slice(0, 60) || 'Role',
        company:  (parts[1] ?? '').trim().slice(0, 40) || 'Company',
        responsibilities: [],
      };
    } else if (cur && bulletRx.test(l)) {
      const m = bulletRx.exec(l);
      if (m) cur.responsibilities.push((m[1] || m[2]).trim());
    }
  }
  if (cur) roles.push(cur);
  if (roles.length === 0) {
    const allBullets = lines.flatMap(l => { const m = bulletRx.exec(l); return m ? [(m[1] || m[2]).trim()] : []; });
    if (allBullets.length > 0) roles.push({ company: 'Previous Employer', jobTitle: 'Professional', responsibilities: allBullets });
  }
  const sm = text.match(/(?:skills?|technologies|tools|competenc(?:y|ies))[\s:]+([^\n]{20,}(?:\n[^\n]{0,80}){0,4})/i);
  const skills = sm ? sm[1].split(/[,|•\n·]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 35).slice(0, 20) : [];
  return { name, summary, experience: roles, skills, education: [], certifications: [], languages: [] };
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

// A realistic (though anonymised) mid-level CV
const REAL_CV = `
Jane Smith
Senior Software Engineer | jane.smith@email.com | +44 7700 900123 | London, UK

PROFESSIONAL SUMMARY
Results-driven Software Engineer with 7 years of experience building scalable web applications in TypeScript, React, and Node.js. Led cross-functional teams of up to 8 engineers and delivered projects 20% under budget.

WORK EXPERIENCE

Senior Software Engineer — Acme Corp                   2020 – Present
• Led migration of monolithic Rails app to microservices, reducing deploy time by 65%
• Mentored 4 junior engineers; 3 promoted within 18 months
• Introduced automated testing, raising coverage from 12% to 87%

Software Engineer — Beta Ltd                           2017 – 2020
• Built customer-facing React dashboard serving 50,000 daily active users
• Reduced page load time by 40% through lazy loading and CDN optimisation
• Collaborated with product and design to ship 3 major feature releases per quarter

EDUCATION
BSc Computer Science — University of Edinburgh        2013 – 2017

SKILLS
TypeScript, React, Node.js, PostgreSQL, Docker, Kubernetes, AWS, CI/CD, REST APIs, GraphQL
`.trim();

// Job description that was previously passing the old validator
const JD_WITH_HASH_HEADERS = `
# Job Description 1 — Graduate Water & Irrigation Engineer

## Position Overview
We are seeking a motivated Graduate Water & Irrigation Engineer to join our growing team. The successful candidate will work alongside senior engineers on water management projects.

## Responsibilities
- Design irrigation systems for large-scale agricultural projects
- Conduct hydraulic modelling using industry-standard software
- Prepare technical reports and drawings for client delivery
- Liaise with contractors and site teams during construction phases

## Qualifications
- BEng or MEng in Civil Engineering, Environmental Engineering, or a related discipline
- Exposure to water/irrigation design is desirable but not essential
- Proficiency with AutoCAD and HEC-RAS preferred

## Preferred Skills
- Strong analytical and problem-solving skills
- Excellent written and verbal communication
- Ability to manage multiple tasks under pressure

Salary range: £28,000 – £35,000 | Closing date: 30 July 2026
`.trim();

// A plain JD without hash headers — relies on phrases and section titles
const JD_PLAIN = `
Water & Irrigation Engineer — Graduate Role

About the Role
We are seeking a motivated graduate to join our infrastructure team. The successful candidate will support senior engineers across a range of water management projects.

Responsibilities:
Assist with hydraulic modelling and irrigation design.
Prepare technical reports and liaise with contractors.
Attend site visits and contribute to feasibility studies.

Qualifications:
Must have a degree in Civil or Environmental Engineering.
Equal opportunity employer. To apply, please send your CV to careers@firm.com.
Salary package: £28,000–£32,000.
`.trim();

// Minimal JD — no headers, tests phrase-level detection
const JD_MINIMAL = `
Water & Irrigation Engineer

We are looking for a motivated graduate engineer to join our team. The successful candidate will work on irrigation design projects. Apply now by sending your CV. We are an equal opportunity employer. Must have a degree in Civil Engineering. Salary range £28,000–£32,000. Closing date 31 July 2026. This role requires strong analytical skills and attention to detail and experience with hydraulic modelling software is preferred. Benefits include 25 days holiday, pension, and flexible working arrangements.
`.trim();

// Very short text — should be rejected regardless of content
const SHORT_TEXT = `Jane Smith\nSoftware Engineer`;

// Random article text (not a CV, not a JD)
const ARTICLE_TEXT = `
The history of the Roman Empire spans several centuries, during which time it transformed from a republic into an imperial power. The Senate played a crucial role in governance, though its influence waned as individual emperors consolidated power. Key battles such as Actium and the sack of Carthage shaped Rome's territorial expansion. Cultural achievements in architecture, law, and literature left a lasting legacy on Western civilization. The fall of the Western Roman Empire in 476 AD marked the end of antiquity and the beginning of the medieval period in European history. Economic pressures, military overextension, and political instability all contributed to the gradual decline over several centuries of Roman dominance.
`.trim();

// LinkedIn post (not a CV)
const LINKEDIN_POST = `
Thrilled to announce that I've just been promoted to Senior Manager at XYZ Corp! 🎉 It's been an incredible three years of learning, growing, and building amazing products with an even more amazing team. A huge thank you to my mentor Sarah and the entire leadership team for believing in me. If you're looking to connect with professionals in the fintech space, feel free to reach out — always happy to chat about career journeys and industry trends! #Promotion #Grateful #FinTech #LinkedIn
`.trim();

// CV using * bullets — the original failing case (should PASS as a CV)
const CV_WITH_STAR_BULLETS = `
Alex Johnson
Project Manager | alex.johnson@email.com | Manchester, UK

PROFESSIONAL SUMMARY
PMP-certified Project Manager with 6 years' experience delivering complex digital transformation programmes in financial services. Managed budgets up to £2M and teams of 12.

WORK EXPERIENCE

Project Manager — FinCorp Ltd                        2019 – Present
* Led 14 simultaneous projects, achieving 92% on-time delivery rate
* Managed vendor relationships across 6 technology partners
* Reduced project overhead costs by £180,000 in FY2022

Junior Project Manager — StartupXYZ                  2017 – 2019
* Supported launch of 3 mobile payment products reaching 200,000 users
* Coordinated cross-functional teams across design, engineering and marketing

EDUCATION
BA Business Administration — Manchester Metropolitan  2014 – 2017

SKILLS: Agile, Scrum, PRINCE2, JIRA, Confluence, MS Project, Stakeholder management
`.trim();

// CV with no email but strong signals — should PASS
const CV_NO_EMAIL = `
Michael Okafor
Finance Analyst

PROFESSIONAL SUMMARY
Detail-oriented Finance Analyst with 4 years in investment banking supporting M&A and equity research. CFA Level 2 candidate.

WORK EXPERIENCE
Finance Analyst — Goldman Sachs                      2021 – Present
• Built financial models for 12 M&A transactions totalling $4.2bn in deal value
• Produced weekly equity research briefs distributed to 300+ institutional clients

Analyst Intern — Barclays Capital                    2020 – 2021
• Supported senior analysts on DCF and LBO modelling for tech sector coverage

EDUCATION
MSc Finance — London School of Economics             2019 – 2020
BSc Economics — University of Lagos                  2015 – 2019

KEY SKILLS
Financial modelling, DCF, LBO, Bloomberg, Capital IQ, Excel VBA, Python
`.trim();

// ─── Suite 1: JD Detection (Stage 1) ────────────────────────────────────────

section('Suite 1 — JD Detection (Stage 1)');

assert(
  isLikelyCv(JD_WITH_HASH_HEADERS) !== null,
  'JD with markdown headers (# Job Description, ## Position Overview) is rejected'
);
assert(
  isLikelyCv(JD_WITH_HASH_HEADERS)?.includes('job description'),
  'Rejected JD shows "job description" message'
);
assert(
  isLikelyCv(JD_PLAIN) !== null,
  'Plain JD with "we are seeking" + "equal opportunity employer" is rejected'
);
assert(
  isLikelyCv(JD_MINIMAL) !== null,
  'Minimal JD with "closing date" + "salary range" phrases is rejected'
);
assert(
  (() => {
    const jdWithQuals = `
Job Description — Water Engineer

We are seeking a graduate Water & Irrigation Engineer. The ideal candidate will hold a degree in Civil Engineering. Apply now by emailing hr@firm.com.

* Design irrigation systems
* Prepare hydraulic models
* Liaise with contractors

Qualifications:
Must have a degree in Civil Engineering or equivalent.
Equal opportunity employer.
Salary range: £28,000 – £35,000 per annum. Closing date 30 August 2026.
    `.trim();
    return isLikelyCv(jdWithQuals) !== null;
  })(),
  'JD with * bullets + Qualifications section is still rejected (original regression test)'
);

// ─── Suite 2: Signal Check (Stage 2 — text that passed Stage 1) ─────────────

section('Suite 2 — Signal Check (Stage 2)');

assert(
  isLikelyCv(SHORT_TEXT) !== null,
  'Short text (< 200 chars) is rejected'
);
assert(
  isLikelyCv(SHORT_TEXT)?.includes('200'),
  'Short text error message mentions character threshold'
);
assert(
  isLikelyCv(ARTICLE_TEXT) !== null,
  'Random article (no CV signals) is rejected'
);
assert(
  isLikelyCv(LINKEDIN_POST) !== null,
  'LinkedIn post (no dates, no sections) is rejected'
);

// ─── Suite 3: Legitimate CVs pass ───────────────────────────────────────────

section('Suite 3 — Legitimate CVs Pass');

assert(
  isLikelyCv(REAL_CV) === null,
  'Strong CV (email + dates + bullets + sections) passes'
);
assert(
  isLikelyCv(CV_WITH_STAR_BULLETS) === null,
  'CV with * bullets (project manager) passes'
);
assert(
  isLikelyCv(CV_NO_EMAIL) === null,
  'CV without email but with strong date + section + title signals passes'
);

// Edge: A CV that mentions "responsibilities" as part of a bullet
assert(
  (() => {
    const edgeCv = `
Sarah Lee
Marketing Manager | sarah.lee@company.com | +44 7700 900456

PROFESSIONAL SUMMARY
Award-winning Marketing Manager with 8 years leading brand strategy and demand generation for B2B SaaS companies. Grew pipeline by 340% at TechCo.

WORK EXPERIENCE
Marketing Manager — TechCo                           2019 – Present
• Core responsibilities included managing a £1.5M annual marketing budget
• Scaled email list from 10k to 120k subscribers in 18 months
• Launched 4 product campaigns generating £8M in attributed pipeline

SKILLS
HubSpot, Salesforce, Google Analytics, SEO/SEM, Content Strategy
    `.trim();
    return isLikelyCv(edgeCv) === null;
  })(),
  'CV mentioning "responsibilities" in a bullet (not a standalone header) still passes'
);

// ─── Suite 4: parseLandingCvText structure extraction ────────────────────────

section('Suite 4 — parseLandingCvText Structure Extraction');

const parsed = parseLandingCvText(REAL_CV);

assert(
  parsed.name === 'Jane Smith',
  `Extracts name from first line (got: "${parsed.name}")`
);
assert(
  parsed.summary.length > 30,
  `Extracts non-empty summary (${parsed.summary.slice(0, 60)}…)`
);
assert(
  parsed.experience.length >= 2,
  `Extracts ≥2 experience roles (got: ${parsed.experience.length})`
);
assert(
  parsed.experience.some(r => r.responsibilities?.length >= 1),
  `At least one role has ≥1 responsibility bullet (roles: ${parsed.experience.map(r => r.responsibilities?.length ?? 0).join(',')})`
);
assert(
  parsed.skills.length >= 3,
  `Extracts ≥3 skills (got: ${parsed.skills.length}: ${parsed.skills.slice(0,4).join(', ')})`
);
assert(
  parsed.experience.every(r => r.jobTitle && r.company),
  'Every extracted role has a jobTitle and company'
);

// Test the star-bullet CV — bullets start with * so should still be parsed
const parsedStar = parseLandingCvText(CV_WITH_STAR_BULLETS);
assert(
  parsedStar.experience.length >= 2,
  `Star-bullet CV: extracts ≥2 roles (got: ${parsedStar.experience.length})`
);
assert(
  parsedStar.experience.some(r => r.responsibilities?.length >= 1),
  `Star-bullet CV: at least one role has responsibilities (roles: ${parsedStar.experience.map(r => r.responsibilities?.length ?? 0).join(',')})`
);

// Test CV with no dates — should create a single fallback role from bullets
const MINIMAL_BULLETS_CV = `
Tom Baker
DevOps Engineer | tom@example.com

Senior DevOps Engineer with 5 years automating cloud infrastructure on AWS and GCP.

• Designed CI/CD pipelines reducing release cycle from 2 weeks to 4 hours
• Managed Kubernetes clusters running 200+ microservices across 3 regions
• Reduced infrastructure costs by 35% through right-sizing and reserved instances
• Implemented Terraform for all infrastructure-as-code (zero manual provisioning)
• On-call lead for platform reliability; maintained 99.97% SLA over 24 months

Skills: AWS, GCP, Kubernetes, Terraform, Docker, Jenkins, Datadog, Python, Bash
`.trim();

const parsedMinimal = parseLandingCvText(MINIMAL_BULLETS_CV);
assert(
  parsedMinimal.experience.length >= 1,
  `No-date CV falls back to single pseudo-role with bullets (roles: ${parsedMinimal.experience.length})`
);
assert(
  parsedMinimal.experience[0]?.responsibilities?.length >= 4,
  `Fallback role captures all bullets (got: ${parsedMinimal.experience[0]?.responsibilities?.length})`
);

// ─── Suite 5: Boundary / edge cases ──────────────────────────────────────────

section('Suite 5 — Boundary & Edge Cases');

// Exactly 200 characters should still fail (needs more than 200)
const exactly200 = 'A'.repeat(200);
assert(
  isLikelyCv(exactly200) !== null,
  'Exactly 200 chars is rejected (threshold is > 200)'
);

// 201 chars of garbage should fail Stage 2 (no signals)
const just201 = 'x'.repeat(201);
assert(
  isLikelyCv(just201) !== null,
  '201 chars of junk fails signal check'
);

// JD phrase hidden mid-paragraph: "we are seeking" → catches it
const hiddenJdPhrase = `
John Williams
Senior Engineer | john@email.com | London, UK 2018-2022

This candidate has been reviewed carefully. We are seeking someone exactly like this profile.
Skilled in Java, Python, and cloud architecture. Managed teams of 12.
Led digital transformation at major UK retailer saving £2M annually.
Strong communication and analytical skills with 8 years experience.
    `.trim();
assert(
  isLikelyCv(hiddenJdPhrase) !== null,
  '"we are seeking" phrase embedded in paragraph triggers JD detection'
);

// CV with no summary section but has good signals
const noSummaryCv = `
Rachel Green
rachel.green@example.com | +1 555 234 5678

Software Engineer — Netflix                          2020 – Present
• Built recommendation engine serving 200M daily active users
• Reduced model inference latency by 45ms through batching optimisation

Backend Engineer — Spotify                           2017 – 2020
• Designed playlist generation service handling 5M requests/minute
• Migrated data pipelines from Hadoop to Apache Spark, cutting job time by 60%

EDUCATION
BS Computer Science — MIT                            2013 – 2017
`.trim();
assert(
  isLikelyCv(noSummaryCv) === null,
  'CV with no summary section but valid signals (email, dates, bullets) passes'
);

// ─── Results ──────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(55));
const total = passed + failed;
if (failed === 0) {
  console.log(`${G} ${BOLD}All ${total} tests passed${RST}`);
} else {
  console.log(`${R} ${BOLD}${failed}/${total} tests failed${RST}`);
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  ${R} ${f}`));
}
console.log('─'.repeat(55));

if (failed > 0) process.exit(1);
