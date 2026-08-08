/**
 * Banned-phrase filter applied to CV text (tier 1/2 + tidy).
 * Logic unchanged — extracted for readability.
 */

import { CVData } from '../../types';

export function applyBannedPhraseFilter(cvData: CVData): CVData {
    // ── Tier 1 — single adjectives/adverbs. Pure deletion is grammatically
    //    safe (they modify the next word and removing them rarely breaks
    //    the sentence). Article agreement is repaired in tidy() below.
    const tier1Words = [
        'seamlessly', 'robust', 'holistic', 'proactive', 'groundbreaking',
        'transformative', 'dynamic', 'innovative', 'impactful',
    ];

    // ── Tier 2 — multi-word phrases. Each entry has a SUBSTITUTION rather
    //    than a hard strip. The previous version deleted the verb in
    //    phrases like "worked on payment systems", leaving " payment
    //    systems" — a broken sentence. Substitutions preserve grammar AND
    //    move the writing toward the concrete verbs the prompt rules
    //    require ("Built", "Led", "Drove", "Owned").
    //
    //    NOTE: contractions like "I've built" do NOT match any pattern
    //    here because \b boundaries treat the apostrophe as a word break,
    //    so "I've" is the token "I" + "ve" and never aligns with any
    //    multi-word pattern below. Tier 1 single words also have no
    //    overlap with contraction fragments.
    const tier2Subs: Array<{ pattern: string; replacement: string }> = [
        // Weak verbs / openers — keep the sentence with a stronger verb.
        { pattern: 'responsible for',         replacement: 'owned' },
        { pattern: 'tasked with',             replacement: 'led' },
        { pattern: 'helped with',             replacement: 'drove' },
        { pattern: 'assisted in',             replacement: 'supported' },
        { pattern: 'worked on',               replacement: 'built' },
        { pattern: 'was part of',             replacement: 'joined' },
        { pattern: 'participated in',         replacement: 'led' },
        { pattern: 'contributed to',          replacement: 'drove' },
        { pattern: 'played a key role in',    replacement: 'led' },
        { pattern: 'supported the',           replacement: 'led the' },
        { pattern: 'passionate about',        replacement: 'focused on' },
        // Pure filler — safe to delete.
        { pattern: 'results-driven',          replacement: '' },
        { pattern: 'detail-oriented',         replacement: '' },
        { pattern: 'team player',             replacement: '' },
        { pattern: 'go-getter',               replacement: '' },
        { pattern: 'thought leader',          replacement: '' },
        { pattern: 'game-changer',            replacement: '' },
        { pattern: 'best-in-class',           replacement: '' },
        { pattern: 'world-class',             replacement: '' },
        { pattern: 'cutting-edge',            replacement: '' },
        { pattern: 'state-of-the-art',        replacement: '' },
        { pattern: 'moving the needle',       replacement: '' },
        { pattern: 'navigate the landscape',  replacement: '' },
        { pattern: "in today's fast-paced world", replacement: '' },
        { pattern: 'excited to',              replacement: '' },
        { pattern: 'delve',                   replacement: 'dig into' },
        // Standalone 'passionate' only matches if 'passionate about'
        // didn't (longest-pattern-first ordering below).
        { pattern: 'passionate',              replacement: '' },
    ];

    // ── Tidy: repairs the inevitable artefacts (orphan punctuation,
    //    a/an disagreement, doubled "the the", leading commas, and
    //    sentence-start capitalization that substitutions can break —
    //    e.g. "Worked on X" → "built X" needs to become "Built X").
    export function tidy(s: string, originalStartedUpper: boolean): string {
        let out = s;
        // Collapse runs of whitespace created by deletions.
        out = out.replace(/\s{2,}/g, ' ');
        // Pull punctuation back to the previous word: " ," " ." " ;" → ","
        out = out.replace(/\s+([,.;:!?])/g, '$1');
        // Strip leading punctuation/whitespace at sentence start.
        out = out.replace(/^[\s,;:.!?]+/, '');
        // Fix article disagreement after a Tier 1 deletion.
        // "an [consonant]" → "a [consonant]"
        out = out.replace(/\b([Aa])n\s+([bcdfghjklmnpqrstvwxz])/g,
            (_, A, c) => `${A === 'A' ? 'A' : 'a'} ${c}`);
        // "a [vowel]" → "an [vowel]"
        out = out.replace(/\b([Aa])\s+([aeiou])/g,
            (_, A, c) => `${A === 'A' ? 'An' : 'an'} ${c}`);
        // Adjacent duplicate words ("the the", "and and").
        out = out.replace(/\b(\w+)\s+\1\b/gi, '$1');
        // Re-capitalize first letter if the original was sentence-cased.
        // Substitutions like "Worked on" → "built" leave a lowercase opener.
        if (originalStartedUpper && out.length > 0) {
            out = out.charAt(0).toUpperCase() + out.slice(1);
        }
        // Re-capitalize after sentence-ending punctuation too: ". built" → ". Built"
        out = out.replace(/([.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
        return out.trim();
    }

    const stripped: string[] = [];
    let revertedCount = 0;

    export function cleanText(text: string): string {
        if (!text || typeof text !== 'string') return text;
        const original = text;
        const origLen = original.replace(/\s+/g, ' ').trim().length;
        let t = text;

        // Tier 2 substitutions, longest-pattern-first so "passionate about"
        // wins over "passionate" and "supported the" wins over "supported".
        const sortedSubs = [...tier2Subs].sort(
            (a, b) => b.pattern.length - a.pattern.length,
        );
        for (const { pattern, replacement } of sortedSubs) {
            const re = new RegExp(
                `\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
                'gi',
            );
            if (re.test(t)) {
                stripped.push(pattern);
                t = t.replace(re, replacement);
            }
        }

        // Tier 1 standalone words — pure deletion.
        for (const word of tier1Words) {
            const re = new RegExp(`\\b${word}\\b`, 'gi');
            if (re.test(t)) {
                stripped.push(word);
                t = t.replace(re, '');
            }
        }

        const originalStartedUpper = /^[A-Z]/.test(original.trim());
        t = tidy(t, originalStartedUpper);

        // ── Safety guard: never ship a text that the filter destroyed.
        //    If a substitution accidentally over-fires (e.g. an unforeseen
        //    pattern eats most of the bullet), revert to the original and
        //    log it so we can review. Skip the guard for very short fields
        //    where ratio math is noisy.
        if (origLen >= 30 && (t.length < 12 || t.length / origLen < 0.5)) {
            revertedCount++;
            console.warn(
                `[CV BannedPhraseFilter] Reverted destructive strip: ` +
                `"${original.slice(0, 60)}…" → "${t.slice(0, 60)}…"`,
            );
            return original;
        }

        return t;
    }

    // Apply to every text field in CVData
    const result: CVData = {
        ...cvData,
        summary: cleanText(cvData.summary),
        skills: (cvData.skills || []).map(cleanText),
        experience: (cvData.experience || []).map(exp => ({
            ...exp,
            responsibilities: (exp.responsibilities || []).map(cleanText),
        })),
        education: (cvData.education || []).map(edu => ({
            ...edu,
            description: cleanText(edu.description || ''),
        })),
        projects: (cvData.projects || []).map(proj => ({
            ...proj,
            description: cleanText(proj.description || ''),
        })),
    };

    if (stripped.length > 0) {
        const unique = [...new Set(stripped)];
        console.warn(
            `[CV BannedPhraseFilter] Substituted ${stripped.length} ` +
            `banned instance(s): ${unique.join(', ')}` +
            (revertedCount ? ` (${revertedCount} reverted as destructive)` : ''),
        );
    } else {
        console.log('[CV BannedPhraseFilter] Clean — no banned phrases detected.');
    }

    return result;
}

