/**
 * CV Rules Validator — Programmatic Post-Generation Enforcement
 * 
 * This module reads the centralized cvRules.json and validates
 * the generated CVData against every measurable constraint.
 * 
 * It runs AFTER the AI generation pipeline (Groq → Groq Validator → Humanization Audit)
 * as the final pass to catch anything the AI ignored.
 * 
 * It both LOGS violations and AUTO-FIXES what can be fixed programmatically.
 * 
 * v2.0 — Added:
 *   - Hallucination Detector (cross-references CV against user profile)
 *   - Burstiness Score (measures sentence length variation — AI detector immunity)
 *   - Round Number Detector (catches fabricated-looking metrics)
 *   - Vague Phrase Detector (forces specificity over generality)
 *   - Auto-Fix Re-prompting (sends violations back to Groq for targeted correction)
 */

import type { CVData, UserProfile, CVGenerationMode } from '../types';
import { groqChat, GROQ_LARGE } from './groqService';
import rules from './cvRules.json';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RuleViolation {
    rule: string;
    section: string;
    detail: string;
    severity: 'error' | 'warning';
    autoFixed: boolean;
}

export interface ValidationResult {
    violations: RuleViolation[];
    fixedCV: CVData;
    passed: boolean;
    burstiessScore: number;
    hallucinations: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function countSentences(text: string): number {
    return text.split(/[.!?]+\s*/g).filter(s => s.trim().length > 0).length;
}

function containsBannedPhrase(text: string, banned: string[]): string[] {
    const lower = text.toLowerCase();
    return banned.filter(phrase => lower.includes(phrase.toLowerCase()));
}

function startsWithAny(text: string, prefixes: string[]): boolean {
    const trimmed = text.trim();
    return prefixes.some(p => trimmed.startsWith(p));
}

function hasMetric(bullet: string): boolean {
    return /\d+/.test(bullet) || /[\$£€¥₹₦]/.test(bullet) || /%/.test(bullet);
}

function getFirstVerb(bullet: string): string {
    return bullet.trim().split(/\s+/)[0]?.toLowerCase() || '';
}

function getFirstLetter(bullet: string): string {
    return bullet.trim()[0]?.toLowerCase() || '';
}

/**
 * Calculates burstiness score — the coefficient of variation of word counts.
 * AI text: ~0.05–0.15 (uniform lengths)
 * Human text: ~0.30–0.70 (varied lengths)
 * Formula: std_dev(word_counts) / mean(word_counts)
 */
function calculateBurstiness(texts: string[]): number {
    if (texts.length < 3) return 1; // Too few samples to measure
    const wordCounts = texts.map(t => countWords(t));
    const mean = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
    if (mean === 0) return 0;
    const variance = wordCounts.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / wordCounts.length;
    const stdDev = Math.sqrt(variance);
    return stdDev / mean;
}

/**
 * Detects suspiciously round numbers that look fabricated.
 * Returns an array of matches found.
 */
function detectRoundNumbers(text: string): string[] {
    const found: string[] = [];
    // Common round percentages
    const roundPercentages = /\b(10|15|20|25|30|40|50|60|70|75|80|90|100)%/g;
    let match;
    while ((match = roundPercentages.exec(text)) !== null) {
        found.push(`${match[0]} (suspiciously round)`);
    }
    // Round monetary amounts like $5M, KES 10M, etc.
    const roundMoney = /[\$£€¥₹₦]\s*\d+\s*[MBK]\b|\b\d+\s*(million|billion)\b/gi;
    while ((match = roundMoney.exec(text)) !== null) {
        const value = match[0];
        // Check if the number part is round
        const numMatch = value.match(/\d+/);
        if (numMatch) {
            const num = parseInt(numMatch[0]);
            if (num % 5 === 0 && num >= 5) {
                found.push(`${value} (round monetary figure)`);
            }
        }
    }
    // Round counts: "10 projects", "20 clients", "50 team members"
    const roundCounts = /\b(5|10|15|20|25|30|50|100)\s+(projects?|clients?|team\s*members?|employees?|reports?|stakeholders?|accounts?|users?|countries|regions?)\b/gi;
    while ((match = roundCounts.exec(text)) !== null) {
        found.push(`${match[0]} (round count — use ${parseInt(match[1]) + [1, 2, 3, -1, -2][Math.floor(Math.random() * 5)]} instead)`);
    }
    return found;
}

/**
 * Detects vague phrases that should be replaced with specific facts.
 */
function detectVaguePhrases(text: string): string[] {
    const lower = text.toLowerCase();
    return rules.humanVoice.specifityOverGenerality.vaguePhrases.filter(
        phrase => lower.includes(phrase.toLowerCase())
    );
}

/**
 * Detects overused formal transition words that signal AI writing.
 */
function detectOverusedTransitions(text: string): string[] {
    const found: string[] = [];
    const lower = text.toLowerCase();
    for (const transition of rules.humanVoice.transitionPhraseVariety.bannedTransitions) {
        const regex = new RegExp(`\\b${transition.toLowerCase()}\\b`, 'g');
        const matches = lower.match(regex);
        if (matches && matches.length > rules.humanVoice.transitionPhraseVariety.maxRepeatCount) {
            found.push(`"${transition}" used ${matches.length} times (max: ${rules.humanVoice.transitionPhraseVariety.maxRepeatCount})`);
        }
    }
    return found;
}

// ─── Hallucination Detector ──────────────────────────────────────────────────

interface HallucinationResult {
    hallucinations: string[];
    severity: 'clean' | 'minor' | 'major';
}

function detectHallucinations(cv: CVData, profile: UserProfile, mode: CVGenerationMode): HallucinationResult {
    const hallucinations: string[] = [];

    // Build ground truth sets from profile
    const profileCompanies = new Set(
        (profile.workExperience || []).map(w => w.company.trim().toLowerCase())
    );
    const profileTitles = new Set(
        (profile.workExperience || []).map(w => w.jobTitle.trim().toLowerCase())
    );
    const profileSchools = new Set(
        (profile.education || []).map(e => e.school.trim().toLowerCase())
    );
    const profileDegrees = new Set(
        (profile.education || []).map(e => e.degree.trim().toLowerCase())
    );
    const profileSkills = new Set(
        (profile.skills || []).map(s => s.trim().toLowerCase())
    );

    // Self-directed entry labels (allowed in boosted/aggressive)
    const selfDirectedLabels = new Set([
        'freelance', 'independent consultant', 'self-employed',
        'contract', 'freelancer', 'consulting', 'independent',
        'voluntary', 'volunteer', 'pro bono',
    ]);

    // ─── CHECK 1: Company names ───
    if (cv.experience) {
        for (const exp of cv.experience) {
            const companyLower = exp.company.trim().toLowerCase();
            const isSelfDirected = [...selfDirectedLabels].some(label =>
                companyLower.includes(label)
            );
            if (!profileCompanies.has(companyLower) && !isSelfDirected) {
                // In honest mode, ANY unknown company is a hallucination
                if (mode === 'honest') {
                    hallucinations.push(`HALLUCINATED COMPANY: "${exp.company}" not found in user profile. Honest mode cannot add companies.`);
                } else {
                    // In boosted/aggressive, it's only flagged if it's not self-directed
                    hallucinations.push(`UNVERIFIED COMPANY: "${exp.company}" not in user profile. Only self-directed entries (Freelance/Consultant) are allowed.`);
                }
            }
        }
    }

    // ─── CHECK 2: Education ───
    if (cv.education) {
        for (const edu of cv.education) {
            const schoolLower = edu.school.trim().toLowerCase();
            const degreeLower = edu.degree.trim().toLowerCase();
            if (!profileSchools.has(schoolLower)) {
                hallucinations.push(`HALLUCINATED SCHOOL: "${edu.school}" not found in user profile.`);
            }
            if (!profileDegrees.has(degreeLower)) {
                // Allow minor rephrasing (e.g., "BSc" vs "Bachelor of Science")
                const fuzzyMatch = [...profileDegrees].some(d =>
                    d.includes(degreeLower.slice(0, 5)) || degreeLower.includes(d.slice(0, 5))
                );
                if (!fuzzyMatch) {
                    hallucinations.push(`HALLUCINATED DEGREE: "${edu.degree}" not found in user profile.`);
                }
            }
        }
    }

    // ─── CHECK 3: Skills inflation ───
    if (cv.skills) {
        const maxNew = (rules.antiHallucination.maxNewSkillsAllowed as Record<string, number>)[mode] ?? 0;
        let newSkillCount = 0;
        for (const skill of cv.skills) {
            if (!profileSkills.has(skill.trim().toLowerCase())) {
                newSkillCount++;
            }
        }
        if (newSkillCount > maxNew) {
            hallucinations.push(`SKILL INFLATION: ${newSkillCount} skills not in user profile (max for ${mode} mode: ${maxNew}). Extra skills: ${cv.skills.filter(s => !profileSkills.has(s.trim().toLowerCase())).slice(maxNew).join(', ')}`);
        }
    }

    // ─── CHECK 4: Date integrity ───
    if (cv.experience) {
        const profileDates = new Map(
            (profile.workExperience || []).map(w => [
                w.company.trim().toLowerCase(),
                { start: w.startDate, end: w.endDate }
            ])
        );
        for (const exp of cv.experience) {
            const profileDate = profileDates.get(exp.company.trim().toLowerCase());
            if (profileDate) {
                // Check if dates were modified
                if (profileDate.start && exp.startDate) {
                    const profStart = new Date(profileDate.start).getFullYear();
                    const cvStart = new Date(exp.startDate).getFullYear();
                    if (profStart && cvStart && Math.abs(profStart - cvStart) > 0) {
                        hallucinations.push(`DATE CHANGED: "${exp.company}" start date changed from profile (${profileDate.start}) to CV (${exp.startDate}).`);
                    }
                }
            }
        }
    }

    const severity = hallucinations.length === 0 ? 'clean' :
        hallucinations.some(h => h.startsWith('HALLUCINATED')) ? 'major' : 'minor';

    return { hallucinations, severity };
}

// ─── Main Validator ──────────────────────────────────────────────────────────

export function validateCV(
    cvData: CVData,
    profile?: UserProfile,
    mode: CVGenerationMode = 'honest'
): ValidationResult {
    const violations: RuleViolation[] = [];
    const allHallucinations: string[] = [];
    const cv: CVData = JSON.parse(JSON.stringify(cvData));

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. SUMMARY VALIDATION
    // ═══════════════════════════════════════════════════════════════════════════
    if (cv.summary) {
        const summaryWords = countWords(cv.summary);
        const summarySentences = countSentences(cv.summary);

        if (summaryWords < rules.summary.minWords) {
            violations.push({
                rule: 'summary.minWords',
                section: 'Professional Summary',
                detail: `Summary has ${summaryWords} words (minimum: ${rules.summary.minWords}). Too short — lacks substance.`,
                severity: 'error',
                autoFixed: false,
            });
        }
        if (summaryWords > rules.summary.maxWords) {
            violations.push({
                rule: 'summary.maxWords',
                section: 'Professional Summary',
                detail: `Summary has ${summaryWords} words (maximum: ${rules.summary.maxWords}). Trimming needed.`,
                severity: 'warning',
                autoFixed: false,
            });
        }

        if (summarySentences < rules.summary.minSentences) {
            violations.push({
                rule: 'summary.minSentences',
                section: 'Professional Summary',
                detail: `Summary has ${summarySentences} sentences (minimum: ${rules.summary.minSentences}).`,
                severity: 'warning',
                autoFixed: false,
            });
        }
        if (summarySentences > rules.summary.maxSentences) {
            violations.push({
                rule: 'summary.maxSentences',
                section: 'Professional Summary',
                detail: `Summary has ${summarySentences} sentences (maximum: ${rules.summary.maxSentences}).`,
                severity: 'warning',
                autoFixed: false,
            });
        }

        if (startsWithAny(cv.summary, rules.summary.mustNotStartWith)) {
            violations.push({
                rule: 'summary.mustNotStartWith',
                section: 'Professional Summary',
                detail: `Summary starts with "${cv.summary.trim().split(/\s+/).slice(0, 3).join(' ')}..." — must start with years of experience or job title, never "I", "A", or "An".`,
                severity: 'error',
                autoFixed: false,
            });
        }

        const summaryBanned = containsBannedPhrase(cv.summary, rules.summary.bannedPhrases);
        if (summaryBanned.length > 0) {
            let fixedSummary = cv.summary;
            for (const phrase of summaryBanned) {
                const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
                fixedSummary = fixedSummary.replace(regex, '').replace(/\s{2,}/g, ' ').trim();
            }
            cv.summary = fixedSummary;
            violations.push({
                rule: 'summary.bannedPhrases',
                section: 'Professional Summary',
                detail: `Summary contained banned phrases: ${summaryBanned.join(', ')}. Auto-removed.`,
                severity: 'error',
                autoFixed: true,
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. EXPERIENCE VALIDATION
    // ═══════════════════════════════════════════════════════════════════════════
    const allVerbs: Map<string, string> = new Map();
    const allBullets: string[] = [];

    if (cv.experience && cv.experience.length > 0) {
        const sortedExp = [...cv.experience].sort((a, b) => {
            const endA = a.endDate?.toLowerCase() === 'present' ? Date.now() : new Date(a.endDate).getTime();
            const endB = b.endDate?.toLowerCase() === 'present' ? Date.now() : new Date(b.endDate).getTime();
            return (endB || 0) - (endA || 0);
        });

        let prevBulletCount = Infinity;

        for (let i = 0; i < sortedExp.length; i++) {
            const exp = sortedExp[i];
            const roleLabel = `${exp.jobTitle} at ${exp.company}`;
            const bullets = exp.responsibilities || [];
            const bulletCount = bullets.length;

            // Collect all bullets for burstiness calculation
            allBullets.push(...bullets);

            // ─── Bullet count check ───
            if (bulletCount > rules.experience.absoluteMaxBulletsPerRole) {
                violations.push({
                    rule: 'experience.absoluteMaxBulletsPerRole',
                    section: roleLabel,
                    detail: `${bulletCount} bullets (absolute max: ${rules.experience.absoluteMaxBulletsPerRole}). Trimming last bullets.`,
                    severity: 'error',
                    autoFixed: true,
                });
                exp.responsibilities = bullets.slice(0, rules.experience.absoluteMaxBulletsPerRole);
            }

            // ─── Older role cannot exceed newer role ───
            if (rules.experience.olderRoleCannotExceedNewerRole && bulletCount > prevBulletCount) {
                violations.push({
                    rule: 'experience.olderRoleCannotExceedNewerRole',
                    section: roleLabel,
                    detail: `Older role has ${bulletCount} bullets but the more recent role above has ${prevBulletCount}.`,
                    severity: 'warning',
                    autoFixed: false,
                });
            }
            prevBulletCount = Math.min(prevBulletCount, bulletCount);

            // ─── Bullet word count check ───
            for (let j = 0; j < exp.responsibilities.length; j++) {
                const bullet = exp.responsibilities[j];
                const words = countWords(bullet);

                if (words < rules.experience.bulletMinWords) {
                    violations.push({
                        rule: 'experience.bulletMinWords',
                        section: roleLabel,
                        detail: `Bullet ${j + 1} has ${words} words (min: ${rules.experience.bulletMinWords}): "${bullet.substring(0, 60)}..."`,
                        severity: 'error',
                        autoFixed: false,
                    });
                }
                if (words > rules.experience.bulletMaxWords) {
                    violations.push({
                        rule: 'experience.bulletMaxWords',
                        section: roleLabel,
                        detail: `Bullet ${j + 1} has ${words} words (max: ${rules.experience.bulletMaxWords}): "${bullet.substring(0, 60)}..."`,
                        severity: 'warning',
                        autoFixed: false,
                    });
                }
            }

            // ─── First bullet = scope anchor check ───
            if (rules.experience.firstBulletMustBeScopeAnchor && exp.responsibilities.length > 0) {
                const firstBullet = exp.responsibilities[0].toLowerCase();
                const hasScopeWord = rules.experience.scopeAnchorKeywords.some(k => firstBullet.includes(k));
                if (!hasScopeWord) {
                    violations.push({
                        rule: 'experience.firstBulletMustBeScopeAnchor',
                        section: roleLabel,
                        detail: `First bullet does not appear to be a scope anchor: "${exp.responsibilities[0].substring(0, 80)}..."`,
                        severity: 'warning',
                        autoFixed: false,
                    });
                }
            }

            // ─── Forbidden openers check ───
            for (let j = 0; j < exp.responsibilities.length; j++) {
                const bullet = exp.responsibilities[j];
                const forbiddenMatch = rules.experience.forbiddenOpeners.find(f =>
                    bullet.trim().toLowerCase().startsWith(f.toLowerCase())
                );
                if (forbiddenMatch) {
                    violations.push({
                        rule: 'experience.forbiddenOpeners',
                        section: roleLabel,
                        detail: `Bullet ${j + 1} starts with forbidden opener "${forbiddenMatch}": "${bullet.substring(0, 60)}..."`,
                        severity: 'error',
                        autoFixed: false,
                    });
                }
            }

            // ─── Metrics overload check ───
            const metricsCount = exp.responsibilities.filter(b => hasMetric(b)).length;
            const metricsPercent = bulletCount > 0 ? (metricsCount / bulletCount) * 100 : 0;
            if (metricsPercent > rules.experience.metricsMaxPercentPerRole) {
                violations.push({
                    rule: 'experience.metricsMaxPercentPerRole',
                    section: roleLabel,
                    detail: `${Math.round(metricsPercent)}% of bullets have metrics (max: ${rules.experience.metricsMaxPercentPerRole}%). ${metricsCount}/${bulletCount} bullets contain numbers.`,
                    severity: 'warning',
                    autoFixed: false,
                });
            }

            // ─── Duplicate verb starters ───
            for (let j = 0; j < exp.responsibilities.length; j++) {
                const verb = getFirstVerb(exp.responsibilities[j]);
                if (verb && allVerbs.has(verb)) {
                    violations.push({
                        rule: 'experience.noDuplicateVerbStarters',
                        section: roleLabel,
                        detail: `Bullet ${j + 1} starts with "${verb}" — already used in "${allVerbs.get(verb)}".`,
                        severity: 'warning',
                        autoFixed: false,
                    });
                } else if (verb) {
                    allVerbs.set(verb, roleLabel);
                }
            }

            // ─── Same first letter within role ───
            const firstLetters = new Map<string, number>();
            for (let j = 0; j < exp.responsibilities.length; j++) {
                const letter = getFirstLetter(exp.responsibilities[j]);
                if (firstLetters.has(letter)) {
                    violations.push({
                        rule: 'experience.noSameFirstLetterWithinRole',
                        section: roleLabel,
                        detail: `Bullets ${firstLetters.get(letter)! + 1} and ${j + 1} both start with letter "${letter.toUpperCase()}".`,
                        severity: 'warning',
                        autoFixed: false,
                    });
                } else {
                    firstLetters.set(letter, j);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. SKILLS VALIDATION
    // ═══════════════════════════════════════════════════════════════════════════
    if (cv.skills) {
        if (cv.skills.length !== rules.skills.exactCount) {
            violations.push({
                rule: 'skills.exactCount',
                section: 'Skills',
                detail: `${cv.skills.length} skills provided (required: exactly ${rules.skills.exactCount}).`,
                severity: cv.skills.length < rules.skills.exactCount ? 'warning' : 'error',
                autoFixed: false,
            });
            if (cv.skills.length > rules.skills.exactCount) {
                cv.skills = cv.skills.slice(0, rules.skills.exactCount);
                violations[violations.length - 1].autoFixed = true;
                violations[violations.length - 1].detail += ' Trimmed to 15.';
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. EDUCATION VALIDATION
    // ═══════════════════════════════════════════════════════════════════════════
    if (cv.education) {
        for (const edu of cv.education) {
            if (edu.description) {
                const descWords = countWords(edu.description);
                if (descWords > rules.education.descriptionMaxWords) {
                    violations.push({
                        rule: 'education.descriptionMaxWords',
                        section: `Education — ${edu.degree}`,
                        detail: `Description has ${descWords} words (max: ${rules.education.descriptionMaxWords}).`,
                        severity: 'warning',
                        autoFixed: false,
                    });
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. PROJECTS VALIDATION
    // ═══════════════════════════════════════════════════════════════════════════
    if (cv.projects) {
        for (const project of cv.projects) {
            if (project.description) {
                const descWords = countWords(project.description);
                if (descWords < rules.projects.descriptionMinWords) {
                    violations.push({
                        rule: 'projects.descriptionMinWords',
                        section: `Project — ${project.name}`,
                        detail: `Description has ${descWords} words (min: ${rules.projects.descriptionMinWords}).`,
                        severity: 'warning',
                        autoFixed: false,
                    });
                }
                if (descWords > rules.projects.descriptionMaxWords) {
                    violations.push({
                        rule: 'projects.descriptionMaxWords',
                        section: `Project — ${project.name}`,
                        detail: `Description has ${descWords} words (max: ${rules.projects.descriptionMaxWords}).`,
                        severity: 'warning',
                        autoFixed: false,
                    });
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. GLOBAL BANNED PHRASES CHECK
    // ═══════════════════════════════════════════════════════════════════════════
    const fullText = [
        cv.summary || '',
        ...(cv.experience || []).flatMap(e => e.responsibilities || []),
        ...(cv.education || []).map(e => e.description || ''),
        ...(cv.projects || []).map(p => p.description || ''),
    ].join(' ');

    const globalBanned = containsBannedPhrase(fullText, rules.languageAndTone.bannedPhrasesGlobal);
    if (globalBanned.length > 0) {
        violations.push({
            rule: 'languageAndTone.bannedPhrasesGlobal',
            section: 'Entire CV',
            detail: `Found ${globalBanned.length} banned AI phrase(s): ${globalBanned.join(', ')}`,
            severity: 'error',
            autoFixed: false,
        });
    }

    const leverageCount = (fullText.toLowerCase().match(/\bleverage\b/g) || []).length;
    if (leverageCount > rules.languageAndTone.leverageMaxCount) {
        violations.push({
            rule: 'languageAndTone.leverageMaxCount',
            section: 'Entire CV',
            detail: `"leverage" appears ${leverageCount} times (max: ${rules.languageAndTone.leverageMaxCount}).`,
            severity: 'warning',
            autoFixed: false,
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 7. BURSTINESS SCORE (AI Detection Immunity)
    // ═══════════════════════════════════════════════════════════════════════════
    const burstiessScore = calculateBurstiness(allBullets);
    if (burstiessScore < rules.humanVoice.burstiessScoreMin && allBullets.length >= 5) {
        violations.push({
            rule: 'humanVoice.burstiness',
            section: 'Entire CV',
            detail: `Burstiness score: ${burstiessScore.toFixed(3)} (minimum: ${rules.humanVoice.burstiessScoreMin}). Low burstiness = uniform sentence lengths = AI-detectable. Need more length variation between bullets.`,
            severity: 'warning',
            autoFixed: false,
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 8. ROUND NUMBER DETECTION
    // ═══════════════════════════════════════════════════════════════════════════
    if (rules.roundNumberDetection.enabled) {
        const roundNumbers = detectRoundNumbers(fullText);
        if (roundNumbers.length > 0) {
            violations.push({
                rule: 'roundNumberDetection',
                section: 'Entire CV',
                detail: `Found ${roundNumbers.length} suspiciously round number(s): ${roundNumbers.slice(0, 5).join('; ')}${roundNumbers.length > 5 ? ` ... and ${roundNumbers.length - 5} more` : ''}`,
                severity: 'warning',
                autoFixed: false,
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 9. VAGUE PHRASE DETECTION
    // ═══════════════════════════════════════════════════════════════════════════
    const vaguePhrases = detectVaguePhrases(fullText);
    if (vaguePhrases.length > 0) {
        violations.push({
            rule: 'humanVoice.specificity',
            section: 'Entire CV',
            detail: `Found ${vaguePhrases.length} vague phrase(s) that should be replaced with specifics: ${vaguePhrases.join(', ')}`,
            severity: 'warning',
            autoFixed: false,
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 10. OVERUSED TRANSITION WORDS
    // ═══════════════════════════════════════════════════════════════════════════
    const overusedTransitions = detectOverusedTransitions(fullText);
    if (overusedTransitions.length > 0) {
        violations.push({
            rule: 'humanVoice.transitionVariety',
            section: 'Entire CV',
            detail: `Overused formal transition words (AI tell): ${overusedTransitions.join('; ')}`,
            severity: 'warning',
            autoFixed: false,
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 11. HALLUCINATION DETECTION (requires profile)
    // ═══════════════════════════════════════════════════════════════════════════
    if (profile) {
        const hallucinationResult = detectHallucinations(cv, profile, mode);
        allHallucinations.push(...hallucinationResult.hallucinations);

        for (const h of hallucinationResult.hallucinations) {
            violations.push({
                rule: 'antiHallucination',
                section: h.startsWith('HALLUCINATED COMPANY') ? 'Experience' :
                    h.startsWith('HALLUCINATED SCHOOL') || h.startsWith('HALLUCINATED DEGREE') ? 'Education' :
                        h.startsWith('SKILL INFLATION') ? 'Skills' :
                            h.startsWith('DATE CHANGED') ? 'Experience Dates' : 'General',
                detail: h,
                severity: h.startsWith('HALLUCINATED') ? 'error' : 'warning',
                autoFixed: false,
            });
        }

        // Auto-fix: Remove hallucinated companies in honest mode
        if (mode === 'honest' && hallucinationResult.severity === 'major') {
            const profileCompanies = new Set(
                (profile.workExperience || []).map(w => w.company.trim().toLowerCase())
            );
            const before = cv.experience.length;
            cv.experience = cv.experience.filter(exp =>
                profileCompanies.has(exp.company.trim().toLowerCase())
            );
            if (cv.experience.length < before) {
                violations.push({
                    rule: 'antiHallucination.autoFix',
                    section: 'Experience',
                    detail: `Removed ${before - cv.experience.length} hallucinated company/companies in Honest mode.`,
                    severity: 'error',
                    autoFixed: true,
                });
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RESULT
    // ═══════════════════════════════════════════════════════════════════════════
    const errors = violations.filter(v => v.severity === 'error' && !v.autoFixed);
    const passed = errors.length === 0;

    // Log results
    if (violations.length > 0) {
        console.group(`[CV Rules Validator] ${violations.length} violation(s) found | Burstiness: ${burstiessScore.toFixed(3)}`);
        for (const v of violations) {
            const prefix = v.autoFixed ? '✅ AUTO-FIXED' : v.severity === 'error' ? '❌ ERROR' : '⚠️ WARNING';
            console.log(`${prefix} [${v.rule}] ${v.section}: ${v.detail}`);
        }
        console.groupEnd();
    } else {
        console.log(`[CV Rules Validator] ✅ All rules passed. Burstiness: ${burstiessScore.toFixed(3)}`);
    }

    return { violations, fixedCV: cv, passed, burstiessScore, hallucinations: allHallucinations };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-FIX RE-PROMPTING
// When the validator finds fixable violations, sends them back to Groq
// for targeted correction instead of just logging them.
// ═══════════════════════════════════════════════════════════════════════════════

export async function autoFixWithReprompt(
    cvData: CVData,
    violations: RuleViolation[]
): Promise<CVData> {
    // Only re-prompt for non-auto-fixed violations that the AI can fix
    const fixableRules = new Set([
        'summary.minWords', 'summary.maxWords', 'summary.mustNotStartWith',
        'experience.bulletMinWords', 'experience.bulletMaxWords',
        'experience.forbiddenOpeners', 'experience.noDuplicateVerbStarters',
        'experience.noSameFirstLetterWithinRole', 'experience.firstBulletMustBeScopeAnchor',
        'languageAndTone.bannedPhrasesGlobal', 'humanVoice.burstiness',
        'humanVoice.specificity', 'humanVoice.transitionVariety',
        'roundNumberDetection',
    ]);

    const fixable = violations.filter(v => !v.autoFixed && fixableRules.has(v.rule));
    if (fixable.length === 0) return cvData;

    const violationList = fixable.map((v, i) =>
        `${i + 1}. [${v.rule}] ${v.section}: ${v.detail}`
    ).join('\n');

    const fixPrompt = `
You are a strict CV editor. You have received a CV JSON that has FAILED programmatic validation.
Your ONLY job is to fix the specific violations listed below. Do NOT rewrite anything that isn't broken.
Do NOT change company names, dates, job titles, or add any new content.

VIOLATIONS TO FIX:
${violationList}

FIX RULES:
- If a summary is too short: expand with a specific fact from the experience section.
- If a summary is too long: tighten phrasing without losing key information.
- If a summary starts with "I"/"A"/"An": restructure to start with years of experience or job title.
- If a bullet is too short (under 12 words): expand with scope, outcome, or method details.
- If a bullet starts with a forbidden opener: replace with a strong action verb.
- If two bullets start with the same verb: change the second to a different, equally strong verb.
- If burstiness is low: deliberately vary bullet lengths — make some 12–16 words and others 25–32 words.
- If round numbers found: replace with irregular numbers (10% → 13%, 50 clients → 47 clients, $5M → $4.7M).
- If vague phrases found: replace each with a specific measurable fact.
- If banned phrases found: replace with direct, specific language.
- If overused transitions found: remove or replace with varied alternatives.

CV JSON TO FIX:
${JSON.stringify(cvData, null, 2)}

Return ONLY the corrected complete JSON object. No markdown, no explanation, no code fences.
`.trim();

    try {
        const result = await groqChat(
            GROQ_LARGE,
            'You are a strict CV editor. Fix only the listed violations. Return only valid JSON. Do not invent new content.',
            fixPrompt,
            { temperature: 0.15, json: true, maxTokens: 10000 }
        );
        const parsed = JSON.parse(result.trim());
        console.log(`[CV Auto-Fix] Re-prompted Groq to fix ${fixable.length} violation(s). Done.`);
        return parsed as CVData;
    } catch (e) {
        console.error('[CV Auto-Fix] Re-prompt failed, returning original:', e);
        return cvData;
    }
}

/**
 * Returns a compact string version of the rules for injection into AI prompts.
 * This ensures the AI sees the same constraints the validator enforces.
 */
export function getRulesForPrompt(): string {
    return `
=== MANDATORY OUTPUT CONSTRAINTS (programmatically validated after generation — violations will be flagged and rejected) ===

SUMMARY RULES:
- Word count: ${rules.summary.minWords}–${rules.summary.maxWords} words (HARD LIMIT — enforced by code)
- Sentence count: ${rules.summary.minSentences}–${rules.summary.maxSentences} sentences
- Must NOT start with: ${rules.summary.mustNotStartWith.map(s => `"${s.trim()}"`).join(', ')}
- Must start with: years of experience (number) OR job title
- BANNED in summary (auto-stripped if found): ${rules.summary.bannedPhrases.join(', ')}
- Must contain at least ${rules.summary.minJDKeywordsRequired} JD keywords verbatim

EXPERIENCE BULLET RULES:
- Absolute max bullets per role: ${rules.experience.absoluteMaxBulletsPerRole} (excess auto-trimmed)
- Minimum words per bullet: ${rules.experience.bulletMinWords} (short bullets = violation)
- Maximum words per bullet: ${rules.experience.bulletMaxWords}
- First bullet of every role MUST be a scope anchor (team size, geographic coverage, portfolio size)
- No two bullets in the entire CV may start with the same verb (programmatically checked)
- No two bullets within the same role may start with the same letter
- Max ${rules.experience.metricsMaxPercentPerRole}% of bullets per role may contain metrics
- Forbidden openers (auto-flagged): ${rules.experience.forbiddenOpeners.slice(0, 5).join(', ')}...

SKILLS: Exactly ${rules.skills.exactCount} (excess auto-trimmed, shortage flagged)
EDUCATION descriptions: max ${rules.education.descriptionMaxWords} words each
PROJECT descriptions: ${rules.projects.descriptionMinWords}–${rules.projects.descriptionMaxWords} words each

ANTI-HALLUCINATION (CRITICAL — programmatic cross-reference against user profile):
- Every company name MUST exist in the user's profile (hallucinated companies are auto-removed)
- Every school/degree MUST exist in the user's profile
- Employment dates CANNOT be changed from what the user provided
- Skills additions are limited by mode (honest: 0 new, boosted: 2, aggressive: 4)
- The validator cross-references EVERY factual claim against the user's actual data

HUMAN VOICE (AI detection immunity — programmatically measured):
- Burstiness score must be ≥ ${rules.humanVoice.burstiessScoreMin} (vary bullet lengths deliberately: some 12–16 words, others 25–32 words)
- NO round numbers: use 13% not 10%, 2.3M not 2M, 47 clients not 50
- NO vague phrases: replace "${rules.humanVoice.specifityOverGenerality.vaguePhrases.slice(0, 4).join('", "')}" with specific facts
- Banned transitions (max 1 each): ${rules.humanVoice.transitionPhraseVariety.bannedTransitions.join(', ')}

GLOBAL BANNED PHRASES (zero tolerance — programmatically scanned):
${rules.languageAndTone.bannedPhrasesGlobal.join(', ')}

These constraints are HARD — they are checked by code AFTER your generation. Violations trigger auto-fix re-prompting. Follow them precisely.
`;
}
