import { describe, expect, it } from 'vitest';
import { rootMotionDelta, sampleRootMotion, scaleRootMotion } from '../../src/characters/rootMotion';

const curve = { fps: 10, forward: [0, 0.1, 0.3, 0.6], right: [0, 0, -0.1, -0.1] };

describe('sampleRootMotion', () => {
  it('returns exact samples on frame boundaries', () => {
    expect(sampleRootMotion(curve, 0.2)).toEqual({ forward: 0.3, right: -0.1 });
  });

  it('interpolates between frames', () => {
    const sample = sampleRootMotion(curve, 0.15);
    expect(sample.forward).toBeCloseTo(0.2);
    expect(sample.right).toBeCloseTo(-0.05);
  });

  it('clamps before the start and after the end', () => {
    expect(sampleRootMotion(curve, -1)).toEqual({ forward: 0, right: 0 });
    expect(sampleRootMotion(curve, 5)).toEqual({ forward: 0.6, right: -0.1 });
  });

  it('writes into a provided target to avoid allocations', () => {
    const target = { forward: 9, right: 9 };
    const result = sampleRootMotion(curve, 0, target);
    expect(result).toBe(target);
    expect(target).toEqual({ forward: 0, right: 0 });
  });
});

describe('scaleRootMotion', () => {
  it('scales every displacement', () => {
    const scaled = scaleRootMotion(curve, 2);
    expect(scaled.forward).toEqual([0, 0.2, 0.6, 1.2]);
    expect(scaled.right).toEqual([0, 0, -0.2, -0.2]);
    expect(scaled.fps).toBe(10);
  });
});

describe('rootMotionDelta', () => {
  const lunge = { fps: 10, forward: [0, 1, 2], right: [0, 0, 0.5] };

  it('moves along +Z when facing 0', () => {
    const delta = rootMotionDelta(lunge, 0, 0.1, 0, { x: 0, z: 0 });
    expect(delta.x).toBeCloseTo(0);
    expect(delta.z).toBeCloseTo(1);
  });

  it('rotates travel with the facing direction', () => {
    const delta = rootMotionDelta(lunge, 0, 0.1, Math.PI / 2, { x: 0, z: 0 });
    expect(delta.x).toBeCloseTo(1);
    expect(delta.z).toBeCloseTo(0);
  });

  it("maps sideways travel to the character's right (-X when facing +Z)", () => {
    const delta = rootMotionDelta(lunge, 0.1, 0.2, 0, { x: 0, z: 0 });
    expect(delta.x).toBeCloseTo(-0.5);
    expect(delta.z).toBeCloseTo(1);
  });
});
