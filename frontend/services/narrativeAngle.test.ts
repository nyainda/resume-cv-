import { describe, expect, it } from 'vitest';
import {
  ALL_NARRATIVE_ANGLES,
  buildAngleHistoryKey,
  scoreNarrativeAngles,
  selectFreshAngleDetailed,
} from './narrativeAngle';
import { setStorageUser } from './storage/userStorageNamespace';

describe('fit-aware narrative angles', () => {
  it('scores profile and JD signals without calling an AI provider', () => {
    const scorecard = scoreNarrativeAngles(
      'Led a team of 8 engineers, mentored new hires, and partnered with stakeholders.',
      'This role requires cross-functional leadership, mentoring, and client influence.',
      'job',
    );

    expect(scorecard.scores.people).toBeGreaterThan(scorecard.scores.impact);
    expect(scorecard.ranked[0]).toBe('people');
    expect(scorecard.hasEvidence).toBe(true);
  });

  it('keeps weak profiles on the full LRU fallback instead of forcing a frame', () => {
    const result = selectFreshAngleDetailed({
      profileText: 'Administrative assistant with strong communication skills.',
      jd: 'Administrative assistant supporting a busy office.',
      purpose: 'job',
      historyOverride: ['impact', 'process', 'people', 'growth'],
    });

    expect(result.mode).toBe('lru-fallback');
    expect(result.pool).toEqual(ALL_NARRATIVE_ANGLES);
  });

  it('rotates only among evidence-backed angles and can avoid the last angle', () => {
    const result = selectFreshAngleDetailed({
      profileText: 'Improved reporting by 20% through redesigned workflow automation and implemented a scalable reporting pipeline.',
      jd: 'The role owns process improvement, systems, automation, and measurable performance outcomes.',
      purpose: 'job',
      historyOverride: ['process'],
      preferDifferent: true,
    });

    expect(result.mode).toBe('fit-top2');
    expect(result.pool).toContain('process');
    expect(result.pool.length).toBeLessThanOrEqual(2);
    expect(result.angle).not.toBe('process');
  });

  it('scopes history by the active account, profile slot, purpose, and JD', () => {
    setStorageUser('angle-test-user');
    const key = buildAngleHistoryKey({
      slotId: 'slot-a',
      purpose: 'job',
      jd: 'A long job description with enough text to produce a stable context hash for this history key.',
    });

    expect(key).toContain('u_angle-test-user:');
    expect(key).toContain('cv:angleHistory:slot-a:job:');
  });
});