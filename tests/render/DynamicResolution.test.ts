import { describe, expect, it } from 'vitest';
import { DynamicResolution } from '../../src/render/DynamicResolution';

const TARGET = 1 / 60;
const SLOW = 1 / 30;

/** Feeds `seconds` worth of frames of the given duration. Returns how many times the scale changed. */
function run(dr: DynamicResolution, frameTime: number, seconds: number): number {
  let changes = 0;
  for (let t = 0; t < seconds; t += frameTime) {
    if (dr.update(frameTime)) changes++;
  }
  return changes;
}

function create() {
  return new DynamicResolution({
    targetFrameTime: TARGET,
    minScale: 0.5,
    maxScale: 1,
    step: 0.1,
    downDelay: 0.5,
    upDelay: 3,
    maxUpDelay: 30,
  });
}

describe('DynamicResolution', () => {
  it('holds full resolution while frames are on target', () => {
    const dr = create();
    run(dr, TARGET, 10);
    expect(dr.scale).toBe(1);
  });

  it('lowers resolution when frames stay slow', () => {
    const dr = create();
    run(dr, SLOW, 1.5);
    expect(dr.scale).toBeLessThan(1);
  });

  it('ignores a single slow frame', () => {
    const dr = create();
    run(dr, TARGET, 1);
    dr.update(0.2);
    run(dr, TARGET, 0.1);
    expect(dr.scale).toBe(1);
  });

  it('never goes below the minimum scale', () => {
    const dr = create();
    run(dr, SLOW, 60);
    expect(dr.scale).toBe(0.5);
  });

  it('raises resolution again once frames recover', () => {
    const dr = create();
    run(dr, SLOW, 2);
    const lowered = dr.scale;

    run(dr, TARGET, 4);

    expect(dr.scale).toBeGreaterThan(lowered);
  });

  it('waits longer before retrying after a step up fails', () => {
    const dr = create();
    run(dr, SLOW, 1); // Drop once.
    run(dr, TARGET, 4); // Average settles (~0.5 s), then steps back up after 3 s.
    expect(dr.scale).toBe(1);

    run(dr, SLOW, 0.8); // That step up fails right away: drop again, back-off doubles to 6 s.
    const afterFailure = dr.scale;
    expect(afterFailure).toBe(0.9);

    run(dr, TARGET, 5);
    expect(dr.scale).toBe(afterFailure);

    run(dr, TARGET, 2);
    expect(dr.scale).toBeGreaterThan(afterFailure);
  });
});
