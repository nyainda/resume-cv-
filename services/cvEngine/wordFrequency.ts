// Word-frequency check — architecture-doc Fix 5.
// Detects non-stopword tokens (and their morphological siblings) used too
// often across a body of CV text so the voice-enforcement layer can rewrite
// them. Pure / deterministic: no AI calls.

const STOPWORDS = new Set<string>([
    // articles, prepositions, pronouns, aux verbs
    'a','an','the','and','or','but','if','then','else','for','of','to','in','on',
    'at','by','with','from','as','is','was','are','were','be','been','being',
    'have','has','had','do','does','did','will','would','should','could','can',
    'may','might','must','shall','am','this','that','these','those','it','its',
    'we','our','us','you','your','they','their','them','i','my','me','he','she',
    'his','her','him','not','no','yes','so','than','too','very','also','just',
    'more','most','some','any','each','every','all','both','few','many','much',
    'other','another','such','same','own','only','out','up','down','off','over',
    'under','again','once','further','here','there','when','where','why','how',
    'into','through','during','before','after','above','below','about','against',
    'between','both','until','while','who','whom','which','what','whose',
    // common CV connectives & auxiliaries — never count these as "overused"
    'ensure','ensured','ensuring','using','via','per','within','across','toward',
    'towards','onto','upon','around',
]);

// Strip a few common English suffixes so "client/clients/client's" all collapse
// onto the same stem — keeps the threshold meaningful for real reuse.
function stem(token: string): string {
    let t = token.toLowerCase();
    // possessive
    t = t.replace(/'s$/, '').replace(/s'$/, '');
    if (t.length <= 4) return t;
    // -ies → -y (companies → company)
    if (t.endsWith('ies')) return t.slice(0, -3) + 'y';
    // -es / -s
    if (t.endsWith('sses')) return t.slice(0, -2);    // processes → process
    if (t.endsWith('xes') || t.endsWith('ches') || t.endsWith('shes')) return t.slice(0, -2);
    if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us') && !t.endsWith('is')) return t.slice(0, -1);
    // -ing → strip
    if (t.endsWith('ing') && t.length > 5) {
        const base = t.slice(0, -3);
        // running → run (double-letter undouble)
        if (base.length >= 2 && base[base.length - 1] === base[base.length - 2]) return base.slice(0, -1);
        return base;
    }
    // -ed → strip
    if (t.endsWith('ed') && t.length > 4) {
        const base = t.slice(0, -2);
        if (base.length >= 2 && base[base.length - 1] === base[base.length - 2]) return base.slice(0, -1);
        return base;
    }
    return t;
}

export interface OverusedWord {
    /** The most-frequent surface form encountered in the input. */
    word: string;
    /** Total occurrences across all morphological variants. */
    count: number;
    /** The stem all variants collapsed onto. */
    stem: string;
    /** The bullet indices (when the input is bullet-form) that contain a variant. */
    bulletIndices?: number[];
}

/**
 * Find non-stopword tokens used at least `minCount` times across the input.
 * Variants are collapsed onto a common stem so "client/clients/client's" count together.
 *
 * @param input  Either a single string (the whole CV body) or an array of bullet strings.
 * @param minCount  Threshold — defaults to 5 per the architecture doc.
 */
export function findOverusedWords(
    input: string | string[],
    minCount = 5,
): OverusedWord[] {
    const bullets = Array.isArray(input) ? input : [input];
    const stemCounts = new Map<string, number>();
    const stemSurfaces = new Map<string, Map<string, number>>();
    const stemBullets = new Map<string, Set<number>>();

    bullets.forEach((bullet, idx) => {
        if (!bullet) return;
        const tokens = bullet
            .toLowerCase()
            .replace(/[^\p{L}\p{N}'\-]+/gu, ' ')
            .split(/\s+/)
            .filter(Boolean);
        for (const raw of tokens) {
            if (raw.length < 4) continue;          // ignore very short words
            if (/^\d/.test(raw)) continue;          // skip numbers / metric tokens
            if (STOPWORDS.has(raw)) continue;
            const s = stem(raw);
            if (!s || STOPWORDS.has(s)) continue;
            stemCounts.set(s, (stemCounts.get(s) || 0) + 1);
            const surfaceMap = stemSurfaces.get(s) || new Map<string, number>();
            surfaceMap.set(raw, (surfaceMap.get(raw) || 0) + 1);
            stemSurfaces.set(s, surfaceMap);
            const bulletSet = stemBullets.get(s) || new Set<number>();
            bulletSet.add(idx);
            stemBullets.set(s, bulletSet);
        }
    });

    const out: OverusedWord[] = [];
    for (const [s, count] of stemCounts.entries()) {
        if (count < minCount) continue;
        const surfaces = stemSurfaces.get(s)!;
        // Pick the most-frequent surface form as the canonical word to surface.
        let topSurface = s;
        let topFreq = -1;
        for (const [surf, freq] of surfaces.entries()) {
            if (freq > topFreq) { topFreq = freq; topSurface = surf; }
        }
        out.push({
            word: topSurface,
            count,
            stem: s,
            bulletIndices: Array.from(stemBullets.get(s) || []).sort((a, b) => a - b),
        });
    }
    return out.sort((a, b) => b.count - a.count);
}
