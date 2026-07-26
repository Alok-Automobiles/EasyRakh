export const particleMorphDurationMs = 12_000;

export type ParticleShape = 'rupee' | 'easyrakh';

export type ParticleMorphPhase =
  | ParticleShape
  | 'rupee-to-easyrakh'
  | 'easyrakh-to-rupee';

export type ParticleMorphState = {
  from: ParticleShape;
  phase: ParticleMorphPhase;
  progress: number;
  to: ParticleShape;
};

export function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function transition(
  elapsedMs: number,
  startMs: number,
  durationMs: number,
  from: ParticleShape,
  to: ParticleShape,
  phase: ParticleMorphPhase,
): ParticleMorphState {
  return {
    from,
    phase,
    progress: easeInOutCubic((elapsedMs - startMs) / durationMs),
    to,
  };
}

export function getParticleMorphState(
  elapsedMs: number,
  reducedMotion = false,
): ParticleMorphState {
  if (reducedMotion) {
    return {
      from: 'rupee',
      phase: 'rupee',
      progress: 0,
      to: 'rupee',
    };
  }

  const cycleMs =
    ((elapsedMs % particleMorphDurationMs) + particleMorphDurationMs) %
    particleMorphDurationMs;

  if (cycleMs < 3_000) {
    return {
      from: 'rupee',
      phase: 'rupee',
      progress: 0,
      to: 'rupee',
    };
  }

  if (cycleMs < 5_500) {
    return transition(
      cycleMs,
      3_000,
      2_500,
      'rupee',
      'easyrakh',
      'rupee-to-easyrakh',
    );
  }

  if (cycleMs < 9_000) {
    return {
      from: 'easyrakh',
      phase: 'easyrakh',
      progress: 0,
      to: 'easyrakh',
    };
  }

  return transition(
    cycleMs,
    9_000,
    3_000,
    'easyrakh',
    'rupee',
    'easyrakh-to-rupee',
  );
}
