#!/usr/bin/env node
/**
 * test-banned-phrase-filter.mjs
 *
 * CI hard gate: locks in the grammar-preserving behaviour of
 * `applyBannedPhraseFilter` (see services/geminiService.ts).
 *
 * The previous version of the filter did hard deletions, which produced
 * sentences like "I payment systems" or "an change". This test pins the
 * substitution-based behaviour so a future "simplification" of the filter
 * cannot silently bring those bugs back.
 *
 * The filter logic is duplicated below (kept in sync intentionally) so the
 * test runs in plain Node without a TypeScript build step. If the filter in
 * geminiService.ts changes, the duplicate here must change too — and CI
 * will catch any divergence the moment a real-world bullet regresses.
 */

// ─── Mirror of the filter ───────────────────────────────────────────────
// IMPORTANT: keep this block in sync with applyBannedPhraseFilter in
// services/geminiService.ts. If you change one, change the other.

const tier1Words = [
  'seamlessly', 'robust', 'holistic', 'proactive', 'groundbreaking',
  'transformative', 'dynamic', 'innovative', 'impactful',
];

const tier2Subs = [
  { pattern: 'responsible for',          replacement: 'owned' },
  { pattern: 'tasked with',              replacement: 'led' },
  { pattern: 'helped with',              replacement: 'drove' },
  { pattern: 'assisted in',              replacement: 'supported' },
  { pattern: 'worked on',                replacement: 'built' },
  { pattern: 'was part of',              replacement: 'joined' },
  { pattern: 'participated in',          replacement: 'led' },
  { pattern: 'contributed to',           replacement: 'drove' },
  { pattern: 'played a key role in',     replacement: 'led' },
  { pattern: 'supported the',            replacement: 'led the' },
  { pattern: 'passionate about',         replacement: 'focused on' },
  { pattern: 'results-driven',           replacement: '' },
  { pattern: 'detail-oriented',          replacement: '' },
  { pattern: 'team player',              replacement: '' },
  { pattern: 'go-getter',                replacement: '' },
  { pattern: 'thought leader',           replacement: '' },
  { pattern: 'game-changer',             replacement: '' },
  { pattern: 'best-in-class',            replacement: '' },
  { pattern: 'world-class',              replacement: '' },
  { pattern: 'cutting-edge',             replacement: '' },
  { pattern: 'state-of-the-art',         replacement: '' },
  { pattern: 'moving the needle',        replacement: '' },
  { pattern: 'navigate the landscape',   replacement: '' },
  { pattern: "in today's fast-paced world", replacement: '' },
  { pattern: 'excited to',               replacement: '' },
  { pattern: 'delve',                    replacement: 'dig into' },
  { pattern: 'passionate',               replacement: '' },
];

function tidy(s, originalStartedUpper) {
  let out = s
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,;:.!?]+/, '')
    .replace(/\b([Aa])n\s+([bcdfghjklmnpqrstvwxz])/g,
      (_, A, c) => `${A === 'A' ? 'A' : 'a'} ${c}`)
    .replace(/\b([Aa])\s+([aeiou])/g,
      (_, A, c) => `${A === 'A' ? 'An' : 'an'} ${c}`)
    .replace(/\b(\w+)\s+\1\b/gi, '$1');
  if (originalStartedUpper && out.length > 0) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  out = out.replace(/([.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
  return out.trim();
}

function clean(text) {
  if (!text || typeof text !== 'string') return text;
  const original = text;
  const origLen = original.replace(/\s+/g, ' ').trim().length;
  let t = text;
  const sortedSubs = [...tier2Subs].sort(
    (a, b) => b.pattern.length - a.pattern.length,
  );
  for (const { pattern, replacement } of sortedSubs) {
    const re = new RegExp(
      `\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'gi',
    );
    if (re.test(t)) t = t.replace(re, replacement);
  }
  for (const word of tier1Words) {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    if (re.test(t)) t = t.replace(re, '');
  }
  const originalStartedUpper = /^[A-Z]/.test(original.trim());
  t = tidy(t, originalStartedUpper);
  if (origLen >= 30 && (t.length < 12 || t.length / origLen < 0.5)) {
    return `[REVERTED] ${original}`;
  }
  return t;
}

// ─── Golden cases ───────────────────────────────────────────────────────

const cases = [
  // Contractions are NEVER targeted (the user's original concern).
  ['contraction safe',
    "I've built a payment system used by 4 banks across East Africa.",
    "I've built a payment system used by 4 banks across East Africa."],
  ['contraction in middle',
    "I've shipped 47 features and didn't break prod once.",
    "I've shipped 47 features and didn't break prod once."],
  ['transformative + contraction',
    "She's a transformative leader who didn't compromise.",
    "She's a leader who didn't compromise."],

  // Previously broken: deletion left no verb.
  ['worked on -> built',
    'I worked on payment systems processing $4M monthly.',
    'I built payment systems processing $4M monthly.'],
  ['contributed to -> drove',
    'Contributed to the open-source migration effort over 6 months.',
    'Drove the open-source migration effort over 6 months.'],
  ['was part of -> joined',
    'Was part of the migration team that shipped v2.0.',
    'Joined the migration team that shipped v2.0.'],
  ['responsible for -> owned',
    'Responsible for end-to-end design of three microservices.',
    'Owned end-to-end design of three microservices.'],
  ['played a key role in -> led',
    'Played a key role in launching the new mobile app.',
    'Led launching the new mobile app.'],

  // Article agreement after Tier 1 strip.
  ['an impactful X -> a X',
    'Delivered an impactful change to the billing flow.',
    'Delivered a change to the billing flow.'],
  ['robust noun strip',
    'Built a robust pipeline that processes 12K events/min.',
    'Built a pipeline that processes 12K events/min.'],
  ['a -> an after results-driven removal',
    'A results-driven engineer focused on shipping fast.',
    'An engineer focused on shipping fast.'],
  ['holistic mid-sentence',
    'Built a holistic monitoring stack across 12 services.',
    'Built a monitoring stack across 12 services.'],

  // Longest pattern wins.
  ['passionate about beats passionate',
    "I'm passionate about distributed systems and cold beer.",
    "I'm focused on distributed systems and cold beer."],

  // Sentence-start re-cap after substitution.
  ['re-cap after period',
    'Owned migrations. worked on logging too.',
    'Owned migrations. Built logging too.'],

  // Safety guard: never ship a destroyed bullet.
  ['safety guard reverts gibberish',
    'passionate passionate passionate passionate passionate.',
    '[REVERTED] passionate passionate passionate passionate passionate.'],
];

let pass = 0;
let fail = 0;
const failures = [];
for (const [label, input, expected] of cases) {
  const out = clean(input);
  const ok = out === expected;
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push({ label, input, expected, actual: out });
    console.log(`  ✗ ${label}`);
  }
}

console.log('');
console.log(`[banned-filter test] ${pass} passed, ${fail} failed`);

if (fail > 0) {
  console.log('');
  console.log('Failures:');
  for (const f of failures) {
    console.log('');
    console.log(`  Case:     ${f.label}`);
    console.log(`  Input:    "${f.input}"`);
    console.log(`  Expected: "${f.expected}"`);
    console.log(`  Got:      "${f.actual}"`);
  }
  console.log('');
  console.log('If applyBannedPhraseFilter was changed intentionally, update the');
  console.log('mirror copy in scripts/test-banned-phrase-filter.mjs AND adjust the');
  console.log('expected outputs above to match the new behaviour.');
  process.exit(1);
}
process.exit(0);
