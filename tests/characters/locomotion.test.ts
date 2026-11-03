import { describe, expect, it } from 'vitest';
import { playbackRate, selectLocomotionState } from '../../src/characters/locomotion';

describe('selectLocomotionState', () => {
  const walk = 1.4;
  const run = 4.5;

  it('idles when still or nearly still', () => {
    expect(selectLocomotionState(0, walk, run)).toBe('idle');
    expect(selectLocomotionState(0.2, walk, run)).toBe('idle');
  });

  it('walks at walking speed and runs at running speed', () => {
    expect(selectLocomotionState(walk, walk, run)).toBe('walk');
    expect(selectLocomotionState(run, walk, run)).toBe('run');
  });

  it('switches at the midpoint between walk and run speeds', () => {
    expect(selectLocomotionState(2.9, walk, run)).toBe('walk');
    expect(selectLocomotionState(3.0, walk, run)).toBe('run');
  });
});

describe('playbackRate', () => {
  it('matches movement speed to the clip ground speed', () => {
    expect(playbackRate(4.5, 3.6)).toBeCloseTo(1.25);
  });

  it('plays backward-moving clips in reverse', () => {
    expect(playbackRate(1.4, -1.0)).toBeCloseTo(-1.4);
  });

  it('clamps extreme rates', () => {
    expect(playbackRate(0.1, 3.6)).toBe(0.5);
    expect(playbackRate(20, 3.6)).toBe(2);
    expect(playbackRate(20, -3.6)).toBe(-2);
  });

  it('plays at normal speed when the clip has no measured ground speed', () => {
    expect(playbackRate(3, 0)).toBe(1);
  });
});
