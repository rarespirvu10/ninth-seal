/**
 * Horizontal travel extracted from a clip by tools/blender/convert_character.py:
 * cumulative displacement in meters, one sample per frame, in the character's own frame.
 */
export interface RootMotionCurve {
  fps: number;
  forward: readonly number[];
  right: readonly number[];
}

export interface RootMotionSample {
  forward: number;
  right: number;
}

/** Displacement at `time` seconds into the clip, linearly interpolated and clamped to the clip. */
export function sampleRootMotion(
  curve: RootMotionCurve,
  time: number,
  target: RootMotionSample = { forward: 0, right: 0 },
): RootMotionSample {
  const last = curve.forward.length - 1;
  const position = Math.min(Math.max(time * curve.fps, 0), last);
  const index = Math.min(Math.floor(position), last - 1);
  const t = position - index;
  target.forward = lerp(curve.forward[index] ?? 0, curve.forward[index + 1] ?? 0, t);
  target.right = lerp(curve.right[index] ?? 0, curve.right[index + 1] ?? 0, t);
  return target;
}

/** Returns a copy of the curve with every displacement multiplied by `scale`. */
export function scaleRootMotion(curve: RootMotionCurve, scale: number): RootMotionCurve {
  return {
    fps: curve.fps,
    forward: curve.forward.map((v) => v * scale),
    right: curve.right.map((v) => v * scale),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * World-space horizontal displacement between two clip times, for a character facing `facing`
 * radians (0 faces +Z). Written into `target` as (x, z); `target.y` is left untouched.
 */
export function rootMotionDelta(
  curve: RootMotionCurve,
  from: number,
  to: number,
  facing: number,
  target: { x: number; z: number },
): { x: number; z: number } {
  const a = sampleRootMotion(curve, from);
  const b = sampleRootMotion(curve, to);
  const forward = b.forward - a.forward;
  const right = b.right - a.right;
  // Facing f points along (sin f, cos f); the character's right is (-cos f, sin f).
  const sin = Math.sin(facing);
  const cos = Math.cos(facing);
  target.x = sin * forward - cos * right;
  target.z = cos * forward + sin * right;
  return target;
}
