import { describe, expect, it } from 'vitest';
import {
  getParticleMorphState,
  particleMorphDurationMs,
} from '@/components/auth/particleMorph';

describe('authentication particle morph timeline', () => {
  it.each([
    [0, 'rupee'],
    [2_999, 'rupee'],
    [3_000, 'rupee-to-easyrakh'],
    [5_500, 'easyrakh'],
    [8_999, 'easyrakh'],
    [9_000, 'easyrakh-to-rupee'],
    [particleMorphDurationMs, 'rupee'],
  ])('uses the expected phase at %ims', (elapsedMs, expectedPhase) => {
    expect(getParticleMorphState(elapsedMs).phase).toBe(expectedPhase);
  });

  it('eases halfway through both transitions', () => {
    expect(getParticleMorphState(4_250).progress).toBeCloseTo(0.5);
    expect(getParticleMorphState(10_500).progress).toBeCloseTo(0.5);
  });

  it('normalizes negative elapsed time into the loop', () => {
    expect(getParticleMorphState(-1).phase).toBe('easyrakh-to-rupee');
  });

  it('shows a static rupee when reduced motion is enabled', () => {
    expect(getParticleMorphState(7_000, true)).toEqual({
      from: 'rupee',
      phase: 'rupee',
      progress: 0,
      to: 'rupee',
    });
  });
});
