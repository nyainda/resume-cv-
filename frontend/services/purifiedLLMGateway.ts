/**
 * purifiedLLMGateway.ts — Feature 4: Purified LLM Gateway.
 *
 * Every AI call that produces CV text should go through purifiedCompletion()
 * instead of returning raw LLM output to the user.
 *
 * The gateway is a drop-in swap — callers get cleaner text, no new loading states.
 * It is synchronous from the caller's perspective (still async, but same signature).
 *
 * Events emitted here feed escapeCollector so we know what the LLM is still
 * generating that needs cleaning.
 */

import { cleanImportedText } from './cvPurificationPipeline';
import type { PipelineEvent } from '../types/buildReport';

export interface PurifiedResult {
  text: string;
  events: PipelineEvent[];
}

/**
 * Wrap any LLM call that returns a string bullet or text fragment.
 * Runs the result through deterministic purification passes and
 * returns both the cleaned text and a list of events for telemetry.
 *
 * @param callFn  Async function that returns raw LLM text.
 * @param context Profile context for metric/voice checks.
 */
export async function purifiedCompletion(
  callFn: () => Promise<string>,
  _context?: { skills?: string[]; currentRole?: boolean },
): Promise<PurifiedResult> {
  const events: PipelineEvent[] = [];

  let raw: string;
  try {
    raw = await callFn();
  } catch (err) {
    throw err; // propagate — caller handles errors
  }

  // Strip markdown fences and leading/trailing whitespace
  let text = raw
    .trim()
    .replace(/^```(?:json|markdown|text)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // Run through the deterministic banned-phrase cleaner
  const { cleaned, changes } = cleanImportedText(text);
  if (changes.length > 0) {
    text = cleaned;
    events.push({
      tier: 0,
      category: 'language',
      description: `Cleaned ${changes.length} banned phrase${changes.length > 1 ? 's' : ''} from AI output`,
      count: changes.length,
    });
  } else {
    text = cleaned;
  }

  // Strip first-person pronouns at bullet start
  const pronounRx = /^(I\s+|my\s+|we\s+|our\s+)/i;
  if (pronounRx.test(text)) {
    text = text.replace(pronounRx, '').trim();
    text = text.charAt(0).toUpperCase() + text.slice(1);
    events.push({
      tier: 0,
      category: 'voice_tense',
      description: 'Removed first-person pronoun from AI output',
      count: 1,
    });
  }

  return { text, events };
}
