#!/usr/bin/env node
/**
 * E2E test for the section-parallel CV generation pipeline.
 * Simulates exactly what services/geminiService.ts:generateCV() now sends
 * to /api/cv/parallel-sections, then validates each section returned.
 *
 * Run: node scripts/test-parallel-sections-e2e.mjs
 */

const WORKER = process.env.CV_ENGINE_URL || 'https://cv-engine-worker.dripstech.workers.dev';

// ── Realistic profile (mid-career water resources engineer) ────────────────
const profile = {
  personalInfo: {
    name: 'Amani Otieno',
    title: 'Water Resources Engineer',
    email: 'amani.otieno@example.com',
    phone: '+254 712 345 678',
    location: 'Nairobi, Kenya',
    linkedin: 'linkedin.com/in/amaniotieno',
  },
  summary: 'Water Resources Engineer with 6 years across rural infrastructure projects in East Africa. Delivered KES 480M in irrigation works for 12 counties.',
  workExperience: [
    {
      jobTitle: 'Senior Water Resources Engineer',
      company: 'AquaTrust Engineering Ltd',
      startDate: '2023-03-01',
      endDate: 'Present',
      responsibilities: 'Lead design and delivery of irrigation and rural water supply projects across 12 counties. Manage 6-engineer team. Oversee KES 240M budget.',
      pointCount: 5,
    },
    {
      jobTitle: 'Water Engineer',
      company: 'GreenLink Consultancy',
      startDate: '2020-07-01',
      endDate: '2023-02-28',
      responsibilities: 'Designed pipeline networks for 8 county projects. Conducted hydraulic modeling using EPANET. Field-supervised contractor delivery.',
      pointCount: 4,
    },
  ],
  education: [
    {
      degree: 'BSc Biosystems Engineering',
      school: 'University of Nairobi',
      year: '2019',
      description: 'First Class Honours. Thesis on smallholder irrigation efficiency in semi-arid counties.',
    },
  ],
  skills: ['EPANET', 'AutoCAD Civil 3D', 'GIS', 'Hydraulic Modeling', 'Project Management', 'MS Project', 'Contract Administration'],
  projects: [
    {
      name: 'Turkana County Borehole Network',
      description: 'Designed and supervised installation of 14 solar-powered boreholes serving 28,000 residents.',
      technologies: ['EPANET', 'AutoCAD', 'Solar pumps'],
    },
    {
      name: 'Machakos Irrigation Master Plan',
      description: 'Authored the 5-year irrigation master plan for Machakos County, including 3 dam feasibility studies.',
    },
  ],
};

const jd = `We are recruiting a Senior Water Resources Engineer to lead our infrastructure programme across East Africa.
Required: 5+ years water resources experience, EPANET, hydraulic modeling, project management.
Nice to have: GIS, dam feasibility, irrigation design.
Budget responsibility: KES 200M+. Team size: 5+ engineers. Location: Nairobi.`;

// ── Build a representative preamble that mirrors generateCV's job mode ─────
const preamble = `You are the world's greatest CV strategist operating under strict market-calibrated rules.
Your sole mission: generate the single highest-performing CV for this specific candidate targeting this specific role.

USER PROFILE:
${JSON.stringify(profile, null, 2)}

JOB DESCRIPTION / TARGET CONTEXT:
${jd}

=== CV GENERATION STRATEGY — Follow in order ===

① PROFESSIONAL SUMMARY — The "3P Formula" (55–75 words, 3–4 sentences):
   HOOK (Sentence 1): [Years of experience as a number] + [EXACT job title from JD] + [primary domain].
   PROOF (Sentence 2): Their single strongest, most-quantified achievement that DIRECTLY addresses what the JD needs.
   PROMISE (Sentence 3): Why hiring them solves the employer's specific problem.
   BANNED IN SUMMARY: "passionate", "dynamic", "results-driven", "detail-oriented", "innovative", "proactive", "go-getter".

② EXPERIENCE — Every bullet is proof of fit:
   FIRST BULLET = SCOPE ANCHOR (mandatory): team size, geographic coverage, budget, project count.
   BULLET COUNT PER ROLE — USER-CHOSEN (binding):
     • Senior Water Resources Engineer @ AquaTrust Engineering Ltd → EXACTLY 5 bullets
     • Water Engineer @ GreenLink Consultancy → EXACTLY 4 bullets
   VERB TENSE: Current role = present tense. Past roles = past tense.
   No two bullets across the document may start with the same verb.

③ SKILLS (EXACTLY 15 — ordered by JD priority):
   Position 1–5: EXACT tools/technologies named in the JD.
   Position 6–10: Core technical skills.
   Position 11–13: Soft/transferable skills as demonstrated competencies.
   Position 14–15: Industry/domain ATS keywords.

④ EDUCATION:
   1 concise sentence — GPA / honors / thesis / relevant courses.
   GRADUATION-STATUS RULE: Past or current-year graduation = COMPLETED. Never write "currently pursuing" for past degrees.

⑤ PROJECTS — Proof-of-Skill Snapshots:
   FORMAT: [Problem/Goal] → [Solution with named technologies] → [Measurable outcome].
   Each project description must name at least one specific technology.

CRITICAL — AUTHENTIC HUMAN WRITING:
- Alternate short (4–8 words) and long (15–25 words) sentences.
- Every bullet uses a DIFFERENT strong verb. No two bullets start with the same verb.
- BANNED PHRASES: delve, robust, seamlessly, synergy, leverage (max once), cutting-edge, state-of-the-art, passionate about, navigate the landscape, groundbreaking, thought leader, game-changer, dynamic, innovative, results-driven, detail-oriented, team player, go-getter, proactive, transformative, impactful.
- Add metrics ONLY when honestly inferable from the user's input. Never fabricate numbers.
`;

const SYSTEM = 'You are an elite CV writer producing CVs that pass ATS systems and impress recruiters. Output strict JSON only.';

// IMPORTANT: instructions describe the schema in plain English.
// Scout 17B silently returns empty if the prompt contains literal JSON
// example blobs like {"experience":[{"jobTitle":"..."}]}.
const sections = [
  { name: 'summary',    task: 'cvSummary',    instruction: 'OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called summary whose value is the professional summary as a single string. The summary must be 60–90 words, 3–4 sentences, following the hook → proof → promise formula. Honor every rule above (banned phrases, sentence rhythm, length). Do NOT include any other CVData fields. NO markdown fences, NO commentary.', maxTokens: 500,  temperature: 0.65, json: true },
  { name: 'skills',     task: 'cvSkills',     instruction: 'OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called skills whose value is an array of EXACTLY 15 string skills. Honor the position-1-5 / 6-10 / 11-13 / 14-15 ordering rule above (JD-priority order for ATS). Do NOT include any other CVData fields. NO markdown fences, NO commentary.', maxTokens: 700,  temperature: 0.65, json: true },
  { name: 'experience', task: 'cvExperience', instruction: 'OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called experience whose value is an array. Each array item is an object with these string fields: company, jobTitle, dates (e.g. "Jan 2020 – Present"), startDate (YYYY-MM-DD), endDate (YYYY-MM-DD or "Present"), and a responsibilities field that is an array of bullet-point strings. Honor the EXACT bullet count per role (binding) and verb-tense rules (current role = present tense, past roles = past tense). FIRST bullet of every role is a SCOPE ANCHOR naming team size, budget, geographic coverage, or project count — not an achievement. No two bullets across the entire document may start with the same verb. Do NOT include any other CVData fields. NO markdown fences, NO commentary.', maxTokens: 5000, temperature: 0.65, json: true },
  { name: 'education',  task: 'cvEducation',  instruction: 'OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called education whose value is an array. Each array item is an object with these string fields: degree, school, year, description. The description should be one concise sentence covering GPA / honors / thesis / 2–3 relevant courses where applicable. Honor the GRADUATION-STATUS RULE strictly — past or current-year graduation years mean the degree is COMPLETED; never write "currently pursuing" for a past degree. Do NOT include any other CVData fields. NO markdown fences, NO commentary.', maxTokens: 1200, temperature: 0.65, json: true },
  { name: 'projects',   task: 'cvProjects',   instruction: 'OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called projects whose value is an array. Each array item is an object with these string fields: name, description, link (link may be empty if none exists). Each project description must follow the format problem/goal → solution with named technologies → measurable outcome, and must name at least one specific technology, tool, framework, or methodology. Do NOT include any other CVData fields. NO markdown fences, NO commentary.', maxTokens: 1800, temperature: 0.65, json: true },
];

const stripFences = (s) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
const tolerantParse = (raw, field) => {
  if (!raw) return null;
  try {
    const obj = JSON.parse(stripFences(raw));
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && field in obj) return obj[field];
    return obj;
  } catch (e) {
    return { __parseError: e.message, __raw: raw.slice(0, 300) };
  }
};

console.log(`\n[E2E] POST ${WORKER}/api/cv/parallel-sections`);
console.log(`[E2E] Preamble: ${preamble.length.toLocaleString()} chars | sections: ${sections.length}`);
const t0 = Date.now();

const r = await fetch(`${WORKER}/api/cv/parallel-sections`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ system: SYSTEM, preamble, fallbackTask: 'cvFallback', sections }),
});

const wallMs = Date.now() - t0;

if (!r.ok) {
  console.error(`[E2E] ✗ HTTP ${r.status} after ${wallMs}ms`);
  console.error(await r.text());
  process.exit(1);
}

const data = await r.json();
console.log(`\n[E2E] ✓ HTTP 200 in ${wallMs}ms (worker totalMs=${data.totalMs}ms)\n`);

let allOk = true;
const cv = {};
for (const sec of sections) {
  const r = data.results[sec.name];
  if (!r) {
    console.log(`  ✗ ${sec.name.padEnd(11)} | NO RESULT`);
    allOk = false;
    continue;
  }
  const parsed = tolerantParse(r.text, sec.name);
  let ok = false;
  let detail = '';
  if (parsed && parsed.__parseError) {
    detail = `JSON parse error: ${parsed.__parseError}`;
  } else if (sec.name === 'summary') {
    ok = typeof parsed === 'string' && parsed.length > 0;
    detail = ok ? `${parsed.split(/\s+/).length} words` : `got ${typeof parsed}`;
    if (ok) cv.summary = parsed;
  } else if (sec.name === 'skills') {
    ok = Array.isArray(parsed);
    detail = ok ? `${parsed.length} skills (need 15)` : `got ${typeof parsed}`;
    if (ok) cv.skills = parsed;
  } else if (sec.name === 'experience') {
    ok = Array.isArray(parsed);
    detail = ok ? `${parsed.length} roles, bullets: [${parsed.map(p => (p.responsibilities || []).length).join(', ')}]` : `got ${typeof parsed}`;
    if (ok) cv.experience = parsed;
  } else if (sec.name === 'education') {
    ok = Array.isArray(parsed);
    detail = ok ? `${parsed.length} degrees` : `got ${typeof parsed}`;
    if (ok) cv.education = parsed;
  } else if (sec.name === 'projects') {
    ok = Array.isArray(parsed);
    detail = ok ? `${parsed.length} projects` : `got ${typeof parsed}`;
    if (ok) cv.projects = parsed;
  }
  const flag = ok ? '✓' : '✗';
  if (!ok) allOk = false;
  console.log(`  ${flag} ${sec.name.padEnd(11)} | ${r.task.padEnd(13)} ${(r.fellBack ? '(*fb)' : '     ')} | ${String(r.ms).padStart(5)}ms | ${r.model}`);
  console.log(`    └─ ${detail}`);
}

if (data.errors && data.errors.length > 0) {
  console.log('\n[E2E] Section errors:');
  for (const e of data.errors) console.log(`  - ${e.section}: ${e.message}`);
}

console.log(`\n[E2E] ${allOk ? '✓ ALL SECTIONS PARSED' : '✗ SOME SECTIONS FAILED'} | wall=${wallMs}ms\n`);

if (allOk) {
  console.log('───── MERGED CV PREVIEW ─────');
  console.log('summary:', cv.summary);
  console.log('skills:', cv.skills);
  console.log('experience[0]:', JSON.stringify(cv.experience[0], null, 2));
  console.log('education[0]:', JSON.stringify(cv.education[0], null, 2));
  if (cv.projects) console.log('projects[0]:', JSON.stringify(cv.projects[0], null, 2));
}

process.exit(allOk ? 0 : 1);
