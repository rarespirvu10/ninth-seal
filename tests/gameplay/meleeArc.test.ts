import { describe, expect, it } from 'vitest';
import { inMeleeArc, type MeleeSwing } from '../../src/gameplay/meleeArc';

// Facing +Z, 2 m reach, 90 degree arc.
const swing: MeleeSwing = { originX: 0, originZ: 0, facing: 0, range: 2, arc: 90 };
const target = (x: number, z: number, radius = 0) => ({ x, z, radius });

describe('inMeleeArc', () => {
  it('hits a target straight ahead within reach', () => {
    expect(inMeleeArc(swing, target(0, 1.5))).toBe(true);
  });

  it('misses a target beyond reach', () => {
    expect(inMeleeArc(swing, target(0, 2.5))).toBe(false);
  });

  it("measures reach to the target's edge", () => {
    expect(inMeleeArc(swing, target(0, 2.3, 0.4))).toBe(true);
  });

  it('misses a target behind', () => {
    expect(inMeleeArc(swing, target(0, -1))).toBe(false);
  });

  it('respects the arc edges', () => {
    expect(inMeleeArc(swing, target(Math.sin(0.7), Math.cos(0.7)))).toBe(true); // 40 degrees off
    expect(inMeleeArc(swing, target(Math.sin(0.9), Math.cos(0.9)))).toBe(false); // 52 degrees off
  });

  it("counts a target whose body reaches into the arc", () => {
    // 60 degrees off center, but a 0.5 m body at 1 m covers 30 degrees.
    expect(inMeleeArc(swing, target(Math.sin(Math.PI / 3), Math.cos(Math.PI / 3), 0.5))).toBe(true);
  });

  it('always hits an overlapping target', () => {
    expect(inMeleeArc(swing, target(0, -0.2, 0.4))).toBe(true);
  });

  it('follows the facing direction', () => {
    const facingEast = { ...swing, facing: Math.PI / 2 };
    expect(inMeleeArc(facingEast, target(1.5, 0))).toBe(true);
    expect(inMeleeArc(facingEast, target(0, 1.5))).toBe(false);
  });
});
