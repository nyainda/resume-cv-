function stripFirstPerson(text) {
  if (!text) return text || '';
  let out = text;
  out = out.replace(/^(\s*[-•·*»"']?\s*)(?:I|We)(?!['’])\s+(\w+)/i, (_, p, v) =>
    p + v.charAt(0).toUpperCase() + v.slice(1));
  out = out.replace(/\bmy(?!['’])\s+/gi, '');
  out = out.replace(/\bour(?!['’])\s+/gi, 'the ');
  out = out.replace(/\b(?:I|me)(?!['’])\b\s*/g, '');
  return out.replace(/\s{2,}/g, ' ').trim();
}
function stripOrphanMetrics(text) {
  if (!text) return text || '';
  let out = text;
  const PLACEHOLDER = /(?:\{[A-Za-z_]+\}|\[[A-Za-z_]+\]|XX+%?|\$XX+|XXX+|_{2,}|<[A-Za-z_]+>)/;
  out = out.replace(new RegExp(
    `\\s*\\b(?:by|of|to|from|with|over|under|above|below|reaching|achieving|approximately|around|about|roughly|nearly|almost|up\\s+to)\\s+${PLACEHOLDER.source}(?:\\s*(?:%|\\+|(?:K|M|B|KES|NGN|ZAR|GBP|USD|EUR|AED|JPY|INR|CAD|AUD|CHF|CNY)\\b))?`,
    'gi'), '');
  out = out.replace(new RegExp(PLACEHOLDER.source, 'g'), '');
  out = out.replace(/\s*\b(?:by|of|to|with|achieving|reaching|approximately|around|about|roughly|nearly|almost|over|under|above|below|up\s+to)\s+%(?!\w)/gi, '');
  out = out.replace(/(?<![\d.])\s*%(?!\w)/g, '');
  out = out.replace(/\s+\b(?:by|from|to|of|with|over|under|reaching|achieving)\b(?=\s*[,.;:!?]|\s*$)/gi, '');
  return out.replace(/\(\s*\)/g, '').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
}
const VERB_MAP = [{p:'Manages',pa:'Managed'},{p:'Develops',pa:'Developed'},{p:'Implements',pa:'Implemented'},{p:'Conducts',pa:'Conducted'},{p:'Collaborates',pa:'Collaborated'},{p:'Supports',pa:'Supported'},{p:'Coordinates',pa:'Coordinated'}];
function matchCase(o, r) { return o[0]===o[0].toUpperCase() ? r[0].toUpperCase()+r.slice(1) : r.toLowerCase(); }
function flipMidBulletVerb(b, target) {
  let out = b, changed = false;
  for (const pair of VERB_MAP) {
    const wrong = (target==='present'?pair.pa:pair.p).toLowerCase();
    const right = target==='present'?pair.p:pair.pa;
    const re = new RegExp(`\\b(and|,)\\s+(${wrong})\\b`, 'gi');
    if (re.test(out)) { out = out.replace(re, (_,c,w) => `${c} ${matchCase(w,right)}`); changed = true; }
  }
  return { text: out, changed };
}
const tests = [
  ['I\'m preserved',           stripFirstPerson("I'm shipping payment systems"),     "I'm shipping payment systems"],
  ['I\'ve preserved',          stripFirstPerson("I've built 4 microservices"),       "I've built 4 microservices"],
  ['standalone I dropped',     stripFirstPerson("I shipped 4 features"),             "Shipped 4 features"],
  ['my dropped, my\'d kept',   stripFirstPerson("Led my team and my'd workflow"),    "Led team and my'd workflow"],
  ['{metric} clause stripped', stripOrphanMetrics("Reduced costs by {metric} monthly"), "Reduced costs monthly"],
  ['[X] clause stripped',      stripOrphanMetrics("Improved performance by [X]"),    "Improved performance"],
  ['XX% clause stripped',      stripOrphanMetrics("Grew revenue by XX% in Q4"),      "Grew revenue in Q4"],
  ['real % preserved',         stripOrphanMetrics("Grew revenue by 47% in Q4"),      "Grew revenue by 47% in Q4"],
  ['$XX clause stripped',      stripOrphanMetrics("Saved $XX in costs"),             "Saved in costs"],
  ['orphan preposition',       stripOrphanMetrics("Reduced costs by ."),             "Reduced costs."],
  ['mid-bullet tense flip',    flipMidBulletVerb("Develops and implemented X", "present").text, "Develops and implements X"],
  ['mid-bullet comma form',    flipMidBulletVerb("Manages teams, conducted reviews", "present").text, "Manages teams, conducts reviews"],
];
let pass = 0, fail = 0;
for (const [label, actual, expected] of tests) {
  if (actual === expected) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}\n      expected: "${expected}"\n      got:      "${actual}"`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
