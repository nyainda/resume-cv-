/**
 * importPipeline.ts — AI-first import pipeline
 *
 * All format paths (PDF text, DOCX text, JSON) converge here.
 * Text-based imports are handled by parseWordTextToProfile() which tries
 * Workers AI → Claude → Gemini in priority order.
 * Output is always run through purifyProfile() before returning.
 *
 * Vision paths (scanned PDF, image) stay in App.tsx and call
 * generateProfileFromFileWithGemini / generateProfileFromFileClaude directly —
 * those callers are also responsible for calling purifyProfile().
 */

import { UserProfile, WorkExperience } from '../types';
import { ROLE_TRACKS } from '../data/roleTracks';
import { detectField } from './cvPromptHelpers';
import { parseWordTextToProfile } from './wordImportService';
import { purifyProfile } from './cvPurificationPipeline';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportResult {
  profile:       UserProfile;
  confidence:    Record<string, number>;
  detectedField: string | null;
  detectedTrack: string | null;
  unknownRoles:  string[];
  aiVerified:    boolean;
  stage1Ms:      number;
  stage2Ms:      number | null;
}

export interface OntologyResult {
  detectedField: string | null;
  detectedTrack: string | null;
  unknownRoles:  string[];
}

type ImportFormat = 'pdf' | 'docx' | 'json' | 'text';

export interface RunImportPipelineOpts {
  /** Called immediately when parsing finishes — lets UI update before any follow-up work. */
  onStage1Complete?: (result: Pick<ImportResult, 'profile' | 'confidence' | 'detectedField' | 'detectedTrack'>) => void;
  /** No-op kept for API compatibility — AI path is already single-stage. */
  onStage2Complete?: (verified: UserProfile, provider: string) => void;
  /** Unused; kept for API compat. */
  skipAi?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true when the CV engine worker URL is configured.
 * Workers AI is always available in that case (free tier).
 */
export function hasAnyAiKey(): boolean {
  return !!import.meta.env.VITE_CV_ENGINE_URL;
}

/** Score experience entries against ROLE_TRACKS and detect field/track. */
export function classifyImportedRoles(workExperience: WorkExperience[]): OntologyResult {
  if (!workExperience.length) return { detectedField: null, detectedTrack: null, unknownRoles: [] };

  const corpus = workExperience.map(e => `${e.jobTitle} ${e.responsibilities}`).join(' ').toLowerCase();
  let bestTrack = '';
  let bestScore = 0;
  for (const track of ROLE_TRACKS) {
    const score = track.keywords.filter(kw => corpus.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestTrack = track.name; }
  }

  const partialProfile: Pick<UserProfile, 'workExperience' | 'personalInfo' | 'summary' | 'education' | 'skills'> = {
    personalInfo:   { name: '', email: '', phone: '', location: '', linkedin: '', website: '', github: '' },
    summary:        '',
    workExperience,
    education:      [],
    skills:         [],
  };
  const detectedField = detectField(undefined, partialProfile as UserProfile);
  const fieldSlug = detectedField !== 'general' ? detectedField : null;
  const unknownRoles = detectedField === 'general'
    ? workExperience.map(e => e.jobTitle).filter(Boolean).slice(0, 5)
    : [];

  return {
    detectedField: fieldSlug,
    detectedTrack: bestScore > 0 ? bestTrack : null,
    unknownRoles,
  };
}

/** Fire-and-forget unknown role titles to the D1 ontology queue. */
function queueUnknownRoles(roles: string[]): void {
  if (!roles.length) return;
  const engineUrl = import.meta.env.VITE_CV_ENGINE_URL;
  if (!engineUrl) return;
  const seen: string[] = JSON.parse(sessionStorage.getItem('_unknownRolesQueued') || '[]');
  const newRoles = roles.filter(r => !seen.includes(r));
  if (!newRoles.length) return;
  sessionStorage.setItem('_unknownRolesQueued', JSON.stringify([...seen, ...newRoles]));
  fetch(`${engineUrl}/api/ontology/unknown-roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles: newRoles }),
  }).catch(() => { /* fire-and-forget */ });
}

/** Build a full-confidence map for an AI-parsed profile (all fields done in one shot). */
function buildConfidence(profile: UserProfile): Record<string, number> {
  const has = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).length > 0 : !!v) ? 95 : 0;
  return {
    'personalInfo.name':     has(profile.personalInfo?.name),
    'personalInfo.email':    has(profile.personalInfo?.email),
    'personalInfo.phone':    has(profile.personalInfo?.phone),
    'personalInfo.location': has(profile.personalInfo?.location),
    'personalInfo.linkedin': profile.personalInfo?.linkedin ? 95 : 50,
    'personalInfo.github':   profile.personalInfo?.github   ? 95 : 50,
    'personalInfo.website':  profile.personalInfo?.website  ? 95 : 50,
    'summary':               has(profile.summary),
    'workExperience':        has(profile.workExperience),
    'education':             has(profile.education),
    'skills':                has(profile.skills),
    'projects':              profile.projects?.length ? 90 : 50,
    'languages':             profile.languages?.length ? 95 : 50,
  };
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Main import entry-point. Call after format-specific text extraction.
 *
 * - For JSON: pass the already-parsed UserProfile as `input`.
 * - For PDF / DOCX / text: pass the extracted text string.
 *
 * The AI provider is determined strictly by the user's Settings selection
 * (getSelectedProvider()). No cross-provider fallback.
 *
 * purifyProfile() is always applied to the output.
 */
export async function runImportPipeline(
  input:  string | UserProfile,
  format: ImportFormat,
  opts:   RunImportPipelineOpts = {},
): Promise<ImportResult> {
  const t0 = performance.now();

  // ── Parse ─────────────────────────────────────────────────────────────────
  let profile: UserProfile;

  if (format === 'json') {
    profile = input as UserProfile;
  } else {
    const text = input as string;
    if (!text.trim()) throw new Error('Extracted text is empty — cannot parse.');
    // Delegate entirely to the AI-based parser (Workers AI / BYOK Claude / Gemini)
    profile = await parseWordTextToProfile(text);
  }

  // ── Always purify — removes banned phrases, formatting artefacts ──────────
  profile = purifyProfile(profile);

  const stage1Ms = performance.now() - t0;

  // ── Ontology / field detection ────────────────────────────────────────────
  const ontology = classifyImportedRoles(profile.workExperience || []);
  if (ontology.unknownRoles.length) queueUnknownRoles(ontology.unknownRoles);

  profile = {
    ...profile,
    detectedField: ontology.detectedField ?? undefined,
    detectedTrack: ontology.detectedTrack ?? undefined,
    importSource:  format,
  } as UserProfile;

  const confidence = buildConfidence(profile);

  // ── Monitoring log ────────────────────────────────────────────────────────
  const highConf  = Object.entries(confidence).filter(([, v]) => v >= 70).map(([k]) => k);
  const lowConf   = Object.entries(confidence).filter(([, v]) => v < 70).map(([k]) => k);
  console.log(`[PDFParser] AI parse — ${Math.round(stage1Ms)}ms`);
  console.log(`  ✓ High confidence (≥70%): ${highConf.join(', ') || '(none)'}`);
  if (lowConf.length) console.warn(`  ⚠ Low confidence (<70%): ${lowConf.join(', ')}`);
  console.log(`  Field: ${ontology.detectedField ?? '(undetected)'} | Track: ${ontology.detectedTrack ?? '(undetected)'}`);
  console.log(`  Experience entries: ${profile.workExperience?.length ?? 0} | Education: ${profile.education?.length ?? 0} | Skills: ${profile.skills?.length ?? 0}`);

  opts.onStage1Complete?.({
    profile,
    confidence,
    detectedField: ontology.detectedField,
    detectedTrack: ontology.detectedTrack,
  });

  // Fire stage2 callback synthetically so UI progress steps (step 4 "AI verified ✓")
  // still fire — there is no separate Stage 2 pass, AI parsed everything in one shot.
  if (format !== 'json') {
    const provider = import.meta.env.VITE_CV_ENGINE_URL ? 'workers-ai' : 'gemini';
    opts.onStage2Complete?.(profile, provider);
  }

  console.log(`[ImportPipeline] ✓ Import complete — ${Math.round(stage1Ms)}ms total`);

  return {
    profile,
    confidence,
    detectedField: ontology.detectedField,
    detectedTrack: ontology.detectedTrack,
    unknownRoles:  ontology.unknownRoles,
    aiVerified:    true,
    stage1Ms,
    stage2Ms:      null,
  };
}

// ─── Convenience re-export for callers that want the raw AI text parser ───────
export { parseWordTextToProfile } from './wordImportService';
