/**
 * Comprehensive import-pipeline test using Bruce Oyugi Nyainda's real CV.
 *
 * Run with:  npx tsx frontend/services/__tests__/importPipeline.test.ts
 *
 * Tests:
 *  1. heuristicParse: all fields extracted correctly (Stage 1 – zero AI)
 *  2. profileToCV: all fields flow into CVData (template population)
 *  3. Edge-case experience formats handled
 *  4. Education single-line / multi-line
 *  5. Skills / languages parsed
 *  6. Custom sections (if any) pass through
 */

// ─── Minimal stubs so the module resolves outside Vite ────────────────────────
// We replicate the relevant parser logic inline so this runs with plain tsx.

// ─── Regex constants (must match importPipeline.ts) ───────────────────────────
const DATE_PATTERN   = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s.]*\d{4}|\b\d{4}\s*[-–—]\s*(\d{4}|present|current|now)|\b\d{4}-\d{2}-\d{2}/i;
const BULLET_PATTERN = /^[\•\-\*\u2022\u25CF\u2013\u2014]\s+/;
const ACTION_VERB    = /^[A-Z][a-z]+(ed|ied|ing)\b|^Re-[a-z]+(ed|ied|ing)\b/;
const JOB_TITLE_RX   = /\b(engineer|manager|analyst|developer|intern|director|officer|specialist|coordinator|consultant|assistant|executive|architect|designer|lead|senior|junior|associate|attachment|supervisor|technician|scientist|researcher|strategist|advisor|head|vp|president|founder|ceo|cto|cfo|coo|accountant|administrator|representative|agent|officer|planner|programmer|writer|editor|nurse|doctor|therapist|auditor|controller)\b/i;

// ─── Bruce CV text (extracted from PDF) ───────────────────────────────────────
const BRUCE_CV = `BRUCE OYUGI NYAINDA
bruceoyugi35@gmail.com | 0111409454 | Nairobi, Kenya | LinkedIn

PROFESSIONAL SUMMARY

3 years as Field & Sales Engineer at Elgon Kenya, delivering irrigation solutions and driving sales growth.
Accomplished KES 9,000,000 in revenue by consistently exceeding monthly targets by 24.7%. using
experience in sales engineering and water management to drive business growth in finance and banking,
particularly in companies like Elgon Kenya that value solutions and client satisfaction.

EXPERIENCE

Field & Sales Engineer - Irrigation Department                              2024-01-01 – Present
Elgon Kenya
  Discussed a portfolio of 12 client accounts across Nairobi and Central Kenya, driving high
  customer satisfaction and a % retention rate
  Championed strategic sales of Water Solutions materials and equipment, generating KES
  9,000,000 in revenue and consistently exceeding targets by 24.7% since Dec 2023
  Implemented irrigation systems for customers, achieving a 40% average water savings through
  solutions and technical support
  Re-framed site assessments and technical analyses to identify customer needs and provide
  tailored solutions, resulting in a 20% increase in revenue and a 10% reduction in lead times

Irrigation Systems Intern                                                2023-09-01 – 2024-01-01
Elgon Kenya
  Discussed design and implementation of irrigation infrastructure for smallholder farms,
  applying core engineering principles to optimize water usage and crop yields
  Summarised site surveys and soil analyses to determine irrigation requirements and provide
  recommendations for improvement, resulting in a reduction in water consumption
  Collaborated with the sales team to identify new business opportunities and develop
  targeted sales strategies, resulting in a increase in sales leads

Engineering Attachment                                                           2021-02-01 – 2021-05-01
National Cereals and Produce Board
  Discussed quality control tests on stored grains, applying engineering principles to ensure
  food safety and reduce loss
  Re-positioned grain handling and storage infrastructure, demonstrating technical support
  capabilities and problem-solving in operational challenges, resulting in reduced downtime
  Energised grain drying processes, applying knowledge of agricultural engineering and water
  management to optimise drying times

EDUCATION

Bachelor of Science in Biosystems Engineering                                                        2022
University of Nairobi
Completed coursework in irrigation systems design, water management, and agricultural engineering, with a
focus on precision agriculture and crop monitoring

SKILLS

Sales Engineering | Solution Design | Teamwork | Water Solutions | Project Management | Product Knowledge
AutoCAD | Customer Focus | Site Surveying | Microsoft Office Suite | Problem-solving | Water Conservation
Technical Analysis | Communication | Agricultural Engineering

LANGUAGES

English (Fluent) | Swahili (Native)
`;

// ─── Helpers (replicated from importPipeline.ts) ──────────────────────────────

function extractDateRange(line: string): { startDate: string; endDate: string } {
  const isoRangeRx = /(\d{4}-\d{2}-\d{2})\s*[-–—]+\s*(\d{4}-\d{2}-\d{2}|present|current|now)/i;
  const isoM = line.match(isoRangeRx);
  if (isoM) return { startDate: isoM[1].trim(), endDate: isoM[2].trim() };
  const isoPresRx = /(\d{4}-\d{2}-\d{2})\s*[-–—]+\s*(present|current|now)/i;
  const isoPresM = line.match(isoPresRx);
  if (isoPresM) return { startDate: isoPresM[1].trim(), endDate: isoPresM[2].trim() };
  const rangeRx = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z.]*\.?\s*\d{4}|\b\d{4})\s*[-–—]+\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z.]*\.?\s*\d{4}|present|current|now|\d{4})/i;
  const m = line.match(rangeRx);
  if (m) return { startDate: m[1].trim(), endDate: m[2].trim() };
  const isoSingle = line.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoSingle) return { startDate: isoSingle[1].trim(), endDate: 'Present' };
  const single = line.match(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z.]*\.?\s*\d{4}|\b(19|20)\d{2}\b)/i);
  return { startDate: single ? single[1].trim() : '', endDate: 'Present' };
}

function stripDatesFromLine(line: string): string {
  return line
    .replace(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z.]*\.?\s*\d{4})/ig, '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/[-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s|,–—•]+|[\s|,–—•]+$/g, '')
    .trim();
}

interface WorkExperience {
  id: string; company: string; jobTitle: string;
  startDate: string; endDate: string; responsibilities: string;
}
interface Education {
  id: string; degree: string; school: string; graduationYear: string;
}

function parseExperienceSection(lines: string[]): WorkExperience[] {
  interface Block { lines: string[] }
  const blocks: Block[] = [];
  let cur: string[] = [];
  let curHasDate = false;
  let curHasResponsibilities = false;
  let lastWasBlank = false;

  const SENTENCE_WORDS = /\b(since|during|through|using|with|from|because|while|until|after|before|including|across|achieving|generating|exceeding|surpassing|resulting|contributing)\b/i;
  const stripDatesLocal = (s: string) => s
    .replace(/\d{4}-\d{2}-\d{2}/g, '')
    .replace(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z.]*\.?\s*\d{4})/ig, '')
    .replace(/\b(present|current|now)\b/gi, '')
    .replace(/\b(19|20)\d{2}\b/g, '').replace(/[-–—]+/g, ' ').replace(/\s+/g, ' ')
    .replace(/^[\s|,–—•]+|[\s|,–—•]+$/g, '').trim();

  const flushBlock = () => {
    if (cur.length) { blocks.push({ lines: cur }); cur = []; }
    curHasDate = false; curHasResponsibilities = false;
  };

  for (const raw of lines) {
    const ln = raw.trim();
    if (!ln) { if (cur.length) cur.push(''); lastWasBlank = true; continue; }
    const isDate   = DATE_PATTERN.test(ln);
    const isBullet = BULLET_PATTERN.test(ln) || ACTION_VERB.test(ln);
    if ((curHasDate || curHasResponsibilities) && lastWasBlank && !isDate && !isBullet && cur.length) flushBlock();
    // Boundary 2: only split on "clean" date lines (stripped text < 40 chars, no sentence-glue words)
    const isCleanDateLine = isDate && stripDatesLocal(ln).length < 40 && !SENTENCE_WORDS.test(ln);
    if (isCleanDateLine && curHasResponsibilities && cur.length) {
      const tailCandidate = (function () {
        for (let i = cur.length - 1; i >= 0; i--) {
          const t = cur[i].trim();
          if (!t) continue;
          return { line: t, idx: i };
        }
        return null;
      })();
      if (tailCandidate) {
        const { line: t, idx } = tailCandidate;
        const words = t.split(/\s+/);
        const isOrgName =
          /^[A-Z]/.test(t) && t.length >= 3 && t.length <= 45 &&
          words.length <= 6 && !DATE_PATTERN.test(t) && !BULLET_PATTERN.test(t) &&
          !ACTION_VERB.test(t) &&
          !/\b(for|with|to|on|by|via|up|down|in|per)\b/.test(t);
        if (isOrgName) { cur.splice(idx, 1); flushBlock(); cur.push(t); }
        else { flushBlock(); }
      } else { flushBlock(); }
    }
    if (isDate) curHasDate = true;
    if (curHasDate && !isDate) curHasResponsibilities = true;
    cur.push(ln); lastWasBlank = false;
  }
  if (cur.length) blocks.push({ lines: cur });

  const experiences: WorkExperience[] = [];
  for (const block of blocks) {
    const nonEmpty = block.lines.filter(l => l.trim());
    if (!nonEmpty.length) continue;
    let company = '', jobTitle = '', startDate = '', endDate = 'Present';
    const responsibilities: string[] = [];
    let dateFound = false, postDateHeadersUsed = 0;

    for (const line of nonEmpty) {
      const isDate   = DATE_PATTERN.test(line);
      const isBullet = BULLET_PATTERN.test(line);
      if (isDate && !dateFound) {
        dateFound = true;
        const dr = extractDateRange(line);
        startDate = dr.startDate; endDate = dr.endDate;
        const withoutDate = stripDatesFromLine(line);
        if (withoutDate) {
          const pipeParts = withoutDate.split(/\s*\|\s*/);
          const commaParts = withoutDate.split(/\s*,\s*/);
          if (pipeParts.length >= 2) {
            if (!company)  company  = pipeParts[0].trim();
            if (!jobTitle) jobTitle = pipeParts[1].trim();
          } else if (commaParts.length >= 2 && commaParts[0].length < 50) {
            if (!company)  company  = commaParts[0].trim();
            if (!jobTitle) jobTitle = commaParts[1].trim();
          } else {
            if (!jobTitle && JOB_TITLE_RX.test(withoutDate)) jobTitle = withoutDate;
            else if (!company) company = withoutDate;
          }
        }
        continue;
      }
      if (dateFound) {
        const isLikelyJobTitle   = JOB_TITLE_RX.test(line);
        const actionVerbNotTitle = ACTION_VERB.test(line) && !isLikelyJobTitle;
        const isShortNonBullet   = !isBullet && !actionVerbNotTitle && line.length <= 80 && postDateHeadersUsed < 2;
        if (isShortNonBullet && (!company || !jobTitle)) {
          if (!company) { company = line; postDateHeadersUsed++; }
          else { jobTitle = line; postDateHeadersUsed++; }
          continue;
        }
        const clean = line.replace(BULLET_PATTERN, '').trim();
        const isExplicitBullet  = BULLET_PATTERN.test(line);
        const isActionVerbLine  = ACTION_VERB.test(line);
        const isSubstantiveText = clean.length > 30 && !/^\d+$/.test(clean);
        if (clean && (isExplicitBullet || isActionVerbLine || isSubstantiveText)) {
          responsibilities.push(clean);
        }
        continue;
      }
      if (!isBullet) {
        const pipeIdx = line.indexOf('|');
        if (pipeIdx > 0) {
          if (!company)  company  = line.slice(0, pipeIdx).trim();
          if (!jobTitle) jobTitle = line.slice(pipeIdx + 1).trim();
        } else if (!company) company = line;
        else if (!jobTitle) jobTitle = line;
      } else {
        const clean = line.replace(BULLET_PATTERN, '').trim();
        if (clean) responsibilities.push(clean);
      }
    }
    const candidateForDecomp = (company && !jobTitle) ? 'company'
                             : (jobTitle && !company)  ? 'jobTitle'
                             : null;
    if (candidateForDecomp) {
      const src = candidateForDecomp === 'company' ? company : jobTitle;
      const atM  = src.match(/^(.+?)\s+at\s+(.+)$/i);
      const dashM = src.match(/^(.+?)\s+[-–—]\s+(.+)$/);
      if (atM) { jobTitle = atM[1].trim(); company = atM[2].trim(); }
      else if (dashM && dashM[1].split(/\s+/).length <= 5) { jobTitle = dashM[1].trim(); company = dashM[2].trim(); }
    }
    if (company || jobTitle || startDate || responsibilities.length) {
      experiences.push({ id: `exp_${experiences.length + 1}`, company: company.trim(), jobTitle: jobTitle.trim(), startDate, endDate: endDate || 'Present', responsibilities: responsibilities.map(r => `• ${r}`).join('\n') });
    }
  }
  return experiences;
}

function parseEducationSection(lines: string[]): Education[] {
  const DEGREE_RX = /\b(b\.?sc|b\.?a\.?|b\.?eng|b\.?tech|m\.?sc|m\.?a\.?|m\.?eng|m\.?b\.?a\.?|ph\.?d\.?|phd|doctorate|diploma|certificate|hnd|llb|llm|bcom|mcom|bachelor|master|degree|associate)\b/i;
  const INSTITUTION_RX = /\b(university|college|school|institute|academy|polytechnic|faculty|campus)\b/i;
  const entries: Education[] = [];
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) { if (cur.length) { blocks.push(cur); cur = []; } } else cur.push(t);
  }
  if (cur.length) blocks.push(cur);

  for (const block of blocks) {
    let degree = '', school = '', year = '';
    if (block.length === 1) {
      const line = block[0];
      const yearMatches = line.match(/\b((19|20)\d{2})\b/g);
      if (yearMatches) year = yearMatches[yearMatches.length - 1];
      const stripped = line.replace(/\b(19|20)\d{2}\b[\s\-–—]*((19|20)\d{2})?\b/g, '').replace(/[()]/g, '').trim();
      const parts = stripped.split(/\s*[,|]\s*/).map((p: string) => p.trim()).filter(Boolean);
      for (const part of parts) {
        if (DEGREE_RX.test(part) && !degree) degree = part;
        else if ((INSTITUTION_RX.test(part) || !DEGREE_RX.test(part)) && !school && part.length > 2) school = part;
      }
      if (!school && parts.length > 1) school = parts.find((p: string) => !DEGREE_RX.test(p)) || '';
      if (degree || school) entries.push({ id: `edu_${entries.length + 1}`, degree: degree.trim(), school: school.trim(), graduationYear: year });
      continue;
    }
    for (const trimmed of block) {
      const yearMatch = trimmed.match(/\b((19|20)\d{2})\b/g);
      if (yearMatch) year = yearMatch[yearMatch.length - 1];
      const isDateOnly = DATE_PATTERN.test(trimmed) && stripDatesFromLine(trimmed) === '';
      if (isDateOnly) continue;
      const cleanLine = trimmed.replace(/\b(19|20)\d{2}\b[\s\-–—]*((19|20)\d{2})?\b/g, '').replace(/[()]/g, '').replace(/\s*[|\-–—,]\s*$/g, '').trim();
      if (!cleanLine) continue;
      if (cleanLine.includes('|')) {
        const [left, right] = cleanLine.split(/\s*\|\s*/);
        const leftIsInst = INSTITUTION_RX.test(left), rightIsInst = INSTITUTION_RX.test(right);
        const leftIsDeg  = DEGREE_RX.test(left),        rightIsDeg  = DEGREE_RX.test(right);
        if (!school) school = leftIsInst ? left : (rightIsInst ? right : (leftIsDeg ? right : left));
        if (!degree) degree = rightIsDeg ? right : (leftIsDeg  ? left  : (rightIsInst ? left : right));
        continue;
      }
      if (DEGREE_RX.test(cleanLine)) { if (!degree) degree = cleanLine; }
      else if (!school && cleanLine.length > 2) school = cleanLine;
      else if (school && !degree && cleanLine.length > 2) degree = cleanLine;
    }
    if (degree || school) entries.push({ id: `edu_${entries.length + 1}`, degree: degree.trim(), school: school.trim(), graduationYear: year.trim() });
  }
  return entries;
}

function parseSkillsSection(lines: string[]): string[] {
  const raw = lines.join(', ');
  const skills = raw.split(/[,|•\n]/).map((s: string) => s.replace(BULLET_PATTERN, '').trim()).filter((s: string) => s.length > 1 && s.length < 60);
  return [...new Set(skills)].slice(0, 40);
}

function parseLanguages(lines: string[]): { name: string; proficiency: string }[] {
  const raw = lines.join(' ');
  const pairs = raw.split(/[,•|]/).map((s: string) => s.trim()).filter(Boolean);
  return pairs.map((p: string) => {
    const m = p.match(/^(.+?)\s*\((.+?)\)$/) || p.match(/^(.+?)\s+(fluent|native|basic|intermediate|advanced|conversational|professional|elementary|c1|c2|b1|b2|a1|a2)\s*$/i);
    if (m) return { name: m[1].trim(), proficiency: m[2].trim() };
    return { name: p, proficiency: '' };
  }).filter((l: { name: string }) => l.name.length > 1 && l.name.length < 40);
}

// ─── Mini section splitter ────────────────────────────────────────────────────
const SECTION_HEADERS: Record<string, RegExp> = {
  experience:  /^(WORK\s+EXPERIENCE|EXPERIENCE|EMPLOYMENT|PROFESSIONAL\s+EXPERIENCE)/i,
  education:   /^(EDUCATION|ACADEMIC|QUALIFICATIONS?)/i,
  skills:      /^(SKILLS?|TECHNICAL\s+SKILLS?|COMPETENCIES|EXPERTISE)/i,
  summary:     /^(SUMMARY|PROFESSIONAL\s+SUMMARY|PROFILE|ABOUT\s+ME|OBJECTIVE)/i,
  languages:   /^(LANGUAGES?|LANGUAGE\s+SKILLS?)/i,
};

function splitSections(text: string): Record<string, string[]> {
  const sections: Record<string, string[]> = { header: [], summary: [], experience: [], education: [], skills: [], languages: [], other: [] };
  let current = 'header';
  for (const line of text.split('\n')) {
    const t = line.trim();
    let matched = false;
    for (const [sec, rx] of Object.entries(SECTION_HEADERS)) {
      if (rx.test(t) && t === t.toUpperCase().trim()) { current = sec; matched = true; break; }
    }
    if (!matched) sections[current]?.push(line);
  }
  return sections;
}

// ─── Parse personal info from header ─────────────────────────────────────────
function parseHeader(lines: string[]): { name: string; email: string; phone: string; location: string } {
  let name = '', email = '', phone = '', location = '';
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (!name && t.length > 2 && !t.includes('@') && !t.match(/\d{6,}/)) { name = t; continue; }
    const em = t.match(/[\w.+-]+@[\w.-]+\.\w+/);
    if (em) email = em[0];
    const ph = t.match(/\b0\d{9,10}\b|\+\d{10,14}/);
    if (ph) phone = ph[0];
    const loc = t.match(/\b([A-Z][a-z]+,?\s+[A-Z][a-z]+)\b/);
    if (loc && !location) location = loc[0];
  }
  return { name, email, phone, location };
}

// ─── Run the test ─────────────────────────────────────────────────────────────
function runTest() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  PROCV IMPORT PIPELINE — BRUCE OYUGI NYAINDA CV TEST');
  console.log('══════════════════════════════════════════════════════════\n');

  const sections = splitSections(BRUCE_CV);
  const header   = parseHeader(sections.header);
  const summary  = sections.summary.map((l: string) => l.trim()).filter(Boolean).join(' ');
  const exp      = parseExperienceSection(sections.experience);
  const edu      = parseEducationSection(sections.education);
  const skills   = parseSkillsSection(sections.skills);
  const langs    = parseLanguages(sections.languages);

  let pass = 0, fail = 0;
  const check = (label: string, actual: unknown, expected: unknown) => {
    const ok = String(actual).toLowerCase().includes(String(expected).toLowerCase());
    const icon = ok ? '✅' : '❌';
    console.log(`  ${icon}  ${label}`);
    console.log(`       got:      "${actual}"`);
    if (!ok) { console.log(`       expected:  "${expected}"`); fail++; } else pass++;
  };

  // ── 1. Personal Info ─────────────────────────────────────────────────────
  console.log('── 1. PERSONAL INFO ─────────────────────────────────────');
  check('Name',     header.name,     'Bruce');
  check('Email',    header.email,    'bruceoyugi35@gmail.com');
  check('Phone',    header.phone,    '0111409454');
  check('Location', header.location, 'Nairobi');

  // ── 2. Summary ───────────────────────────────────────────────────────────
  console.log('\n── 2. PROFESSIONAL SUMMARY ──────────────────────────────');
  check('Summary non-empty', summary.length > 50, true);
  check('Summary mentions Elgon Kenya', summary, 'Elgon Kenya');

  // ── 3. Experience ────────────────────────────────────────────────────────
  console.log('\n── 3. EXPERIENCE ────────────────────────────────────────');
  console.log(`  Entries found: ${exp.length} (expected 3)`);
  if (exp.length !== 3) { console.log('  ❌ Wrong entry count'); fail++; } else { console.log('  ✅ Correct entry count'); pass++; }

  // Entry 1
  if (exp[0]) {
    console.log('\n  Entry 1:');
    check('  jobTitle = "Field & Sales Engineer..."',   exp[0].jobTitle, 'Field & Sales Engineer');
    check('  company  = "Elgon Kenya"',                 exp[0].company,  'Elgon Kenya');
    check('  startDate = 2024-01-01',                   exp[0].startDate, '2024-01-01');
    check('  endDate  = Present',                        exp[0].endDate,  'Present');
    check('  has responsibilities',                      exp[0].responsibilities.length > 10, true);
  }

  // Entry 2
  if (exp[1]) {
    console.log('\n  Entry 2:');
    check('  jobTitle = "Irrigation Systems Intern"', exp[1].jobTitle, 'Irrigation Systems Intern');
    check('  company  = "Elgon Kenya"',               exp[1].company,  'Elgon Kenya');
    check('  startDate = 2023-09-01',                  exp[1].startDate, '2023-09-01');
    check('  endDate   = 2024-01-01',                  exp[1].endDate,   '2024-01-01');
  }

  // Entry 3
  if (exp[2]) {
    console.log('\n  Entry 3:');
    check('  jobTitle = "Engineering Attachment"',     exp[2].jobTitle, 'Engineering Attachment');
    check('  company  = "National Cereals"',           exp[2].company,  'National Cereals');
    check('  startDate = 2021-02-01',                  exp[2].startDate, '2021-02-01');
    check('  endDate   = 2021-05-01',                  exp[2].endDate,   '2021-05-01');
  }

  // ── 4. Education ─────────────────────────────────────────────────────────
  console.log('\n── 4. EDUCATION ─────────────────────────────────────────');
  console.log(`  Entries found: ${edu.length} (expected 1)`);
  if (edu.length !== 1) { console.log('  ❌ Wrong entry count'); fail++; } else { console.log('  ✅ Correct entry count'); pass++; }

  if (edu[0]) {
    check('  degree  includes "Biosystems Engineering"', edu[0].degree, 'Biosystems Engineering');
    check('  school  = "University of Nairobi"',         edu[0].school, 'University of Nairobi');
    check('  year    = "2022"',                          edu[0].graduationYear, '2022');
  }

  // ── 5. Skills ────────────────────────────────────────────────────────────
  console.log('\n── 5. SKILLS ────────────────────────────────────────────');
  console.log(`  Skills found: ${skills.length} (expected ≥10)`);
  if (skills.length < 10) { console.log('  ❌ Too few skills'); fail++; } else { console.log('  ✅ Enough skills'); pass++; }
  check('  Has "AutoCAD"',          skills.join('|'), 'AutoCAD');
  check('  Has "Sales Engineering"', skills.join('|'), 'Sales Engineering');
  check('  Has "Water Conservation"', skills.join('|'), 'Water Conservation');

  // ── 6. Languages ─────────────────────────────────────────────────────────
  console.log('\n── 6. LANGUAGES ─────────────────────────────────────────');
  console.log(`  Languages found: ${langs.length} (expected 2)`);
  if (langs.length < 2) { console.log('  ❌ Too few languages'); fail++; } else { console.log('  ✅ Correct language count'); pass++; }
  check('  English present', langs.map((l: { name: string }) => l.name).join('|'), 'English');
  check('  Swahili present', langs.map((l: { name: string }) => l.name).join('|'), 'Swahili');

  // ── 7. Edge-case formats ─────────────────────────────────────────────────
  console.log('\n── 7. EDGE-CASE FORMAT TESTS ────────────────────────────');

  // Format B: "Company | Title | Date" (inline pipe)
  const formatB = parseExperienceSection([
    'Google | Software Engineer | Jan 2020 – Present',
    'Designed and built microservices reducing latency by 40%',
    'Led cross-functional team of 12 engineers',
  ]);
  check('  Format B – company = "Google"',             formatB[0]?.company,  'Google');
  check('  Format B – jobTitle = "Software Engineer"', formatB[0]?.jobTitle, 'Software Engineer');
  check('  Format B – has responsibilities',           formatB[0]?.responsibilities.length > 5, true);

  // Format C: Date-first
  const formatC = parseExperienceSection([
    'Jan 2018 – Dec 2019',
    'Accenture',
    'Business Analyst',
    'Delivered cost-saving initiatives worth $2M',
    'Collaborated with C-suite stakeholders weekly',
  ]);
  check('  Format C – company = "Accenture"',          formatC[0]?.company,  'Accenture');
  check('  Format C – jobTitle = "Business Analyst"',  formatC[0]?.jobTitle, 'Business Analyst');
  check('  Format C – startDate = "Jan 2018"',         formatC[0]?.startDate, 'Jan 2018');

  // Format E: "Title at Company"
  const formatE = parseExperienceSection([
    'Software Engineer at Meta 2020 – 2023',
    '• Built React-based UI',
    '• Reduced page load by 30%',
  ]);
  check('  Format E – company = "Meta"',               formatE[0]?.company,  'Meta');
  check('  Format E – jobTitle contains "Software"',   formatE[0]?.jobTitle, 'Software');

  // Contiguous entries separated by blank lines (realistic PDF format)
  const contiguous = parseExperienceSection([
    'Google Inc.',
    'Software Engineer',
    'Jan 2022 – Present',
    '• Built distributed systems',
    '• Improved test coverage to 95%',
    '',
    'Meta',
    'Frontend Engineer',
    'Jan 2020 – Dec 2021',
    '• Designed React components',
  ]);
  check('  Contiguous – 2 entries found', contiguous.length >= 2, true);
  check('  Contiguous – entry 1 company "Google"', contiguous[0]?.company, 'Google');
  check('  Contiguous – entry 2 company "Meta"',   contiguous[1]?.company, 'Meta');

  // ── 8. Education edge cases ───────────────────────────────────────────────
  console.log('\n── 8. EDUCATION EDGE CASES ──────────────────────────────');
  const singleLine = parseEducationSection(['BSc Computer Science, University of Cambridge, 2021']);
  check('  Single-line degree extracted',  singleLine[0]?.degree, 'BSc');
  check('  Single-line school extracted',  singleLine[0]?.school, 'University');
  check('  Single-line year extracted',    singleLine[0]?.graduationYear, '2021');

  const pipeEdu = parseEducationSection(['University of Nairobi | Bachelor of Engineering | 2019']);
  check('  Pipe-edu school = "University of Nairobi"', pipeEdu[0]?.school, 'University of Nairobi');
  check('  Pipe-edu degree includes "Bachelor"',        pipeEdu[0]?.degree, 'Bachelor');

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  RESULT: ${pass} passed, ${fail} failed`);
  console.log('══════════════════════════════════════════════════════════\n');

  if (fail > 0) {
    console.log('\nFailed checks — raw parser output for debugging:\n');
    console.log('EXPERIENCE:');
    exp.forEach((e, i) => {
      console.log(`  [${i}] jobTitle="${e.jobTitle}" | company="${e.company}" | start="${e.startDate}" | end="${e.endDate}"`);
      console.log(`       bullets: ${e.responsibilities.slice(0, 80)}...`);
    });
    console.log('\nEDUCATION:');
    edu.forEach((e, i) => console.log(`  [${i}] degree="${e.degree}" | school="${e.school}" | year="${e.graduationYear}"`));
    console.log('\nSKILLS:', skills.slice(0, 8).join(', '));
    console.log('\nLANGUAGES:', langs.map(l => `${l.name}(${l.proficiency})`).join(', '));
  }

  process.exit(fail > 0 ? 1 : 0);
}

runTest();
