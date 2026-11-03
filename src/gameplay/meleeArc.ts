export interface MeleeSwing {
  originX: number;
  originZ: number;
  /** Radians; 0 faces +Z. */
  facing: number;
  /** Reach in meters, measured to the target's edge. */
  range: number;
  /** Full width of the swing in degrees. */
  arc: number;
}

export interface MeleeTarget {
  x: number;
  z: number;
  /** Body radius in meters; a swing that clips the edge of the body still lands. */
  radius: number;
}

/** Whether a swing reaches a target: within reach of its edge, and inside the arc. */
export function inMeleeArc(swing: MeleeSwing, target: MeleeTarget): boolean {
  const dx = target.x - swing.originX;
  const dz = target.z - swing.originZ;
  const distance = Math.hypot(dx, dz);
  if (distance > swing.range + target.radius) return false;
  if (distance <= target.radius) return true; // Overlapping: any direction connects.

  const angle = Math.atan2(dx, dz);
  const offset = Math.abs(Math.atan2(Math.sin(angle - swing.facing), Math.cos(angle - swing.facing)));
  // Widen the arc by the angle the target's body covers, so its edge counts too.
  const halfArc = (swing.arc * Math.PI) / 360 + Math.asin(Math.min(1, target.radius / distance));
  return offset <= halfArc;
}
