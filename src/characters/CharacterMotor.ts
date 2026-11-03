import * as THREE from 'three';
import type { CharacterBody } from '../physics/CharacterBody';
import { rootMotionDelta, type RootMotionCurve } from './rootMotion';

/** Smoothing for the measured speed, so single-step jitter doesn't flicker animation states. */
const SPEED_SHARPNESS = 15;
/** How quickly knockback fades; at 9 per second, a push travels about 1/9 of its speed in meters. */
const PUSH_DECAY = 9;

/**
 * Moves a character's physics body on the fixed step: walking, root-motion travel, gravity, and
 * facing. Measures the speed actually achieved after collisions and interpolates positions for
 * rendering. Shared by the player and enemies by composition.
 */
export class CharacterMotor {
  /** Feet position after the latest physics step. */
  readonly position = new THREE.Vector3();
  /** Feet position interpolated for the current frame. */
  readonly renderPosition = new THREE.Vector3();
  /** Radians; 0 faces +Z. */
  facing = 0;

  private readonly previous = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private verticalVelocity = 0;
  private _speed = 0;
  /** External shove (knockback), in m/s; decays quickly and adds to whatever the character does. */
  private pushX = 0;
  private pushZ = 0;

  constructor(
    private readonly body: CharacterBody,
    private readonly gravity: number,
  ) {
    body.getFeetPosition(this.position);
    this.previous.copy(this.position);
    this.renderPosition.copy(this.position);
  }

  /** Horizontal speed actually achieved after collisions, in m/s. Walking into a wall reads ~0. */
  get speed(): number {
    return this._speed;
  }

  get radius(): number {
    return this.body.radius;
  }

  get height(): number {
    return this.body.height;
  }

  /** Moves at a horizontal velocity (m/s) for one step. */
  walk(vx: number, vz: number, dt: number): void {
    this.delta.set(vx * dt, 0, vz * dt);
    this.step(dt);
  }

  /** Moves by a clip's root motion between two clip times; stands still if the clip has none. */
  moveByRootMotion(curve: RootMotionCurve | null, from: number, to: number, dt: number): void {
    if (curve) rootMotionDelta(curve, from, to, this.facing, this.delta);
    else this.delta.set(0, 0, 0);
    this.step(dt);
  }

  /** Stays in place for one step; gravity still applies. */
  hold(dt: number): void {
    this.delta.set(0, 0, 0);
    this.step(dt);
  }

  /** Shoves the character: adds a velocity (m/s) that fades out over about a third of a second. */
  push(vx: number, vz: number): void {
    this.pushX += vx;
    this.pushZ += vz;
  }

  /** Turns toward an angle along the shortest arc, frame-rate independently. */
  turnToward(angle: number, sharpness: number, dt: number): void {
    const difference = Math.atan2(Math.sin(angle - this.facing), Math.cos(angle - this.facing));
    this.facing += difference * (1 - Math.exp(-sharpness * dt));
  }

  /** Faces a point on the ground instantly. */
  face(x: number, z: number): void {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    if (dx * dx + dz * dz > 0.0001) this.facing = Math.atan2(dx, dz);
  }

  /** Angle from this character to a point, in the same convention as `facing`. */
  angleTo(x: number, z: number): number {
    return Math.atan2(x - this.position.x, z - this.position.z);
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(x - this.position.x, z - this.position.z);
  }

  /** Called after each physics step to record the new position and measure speed. */
  afterPhysics(dt: number): void {
    this.previous.copy(this.position);
    this.body.getFeetPosition(this.position);
    const moved = Math.hypot(this.position.x - this.previous.x, this.position.z - this.previous.z);
    this._speed += (moved / dt - this._speed) * (1 - Math.exp(-SPEED_SHARPNESS * dt));
  }

  /** Interpolates between the last two physics steps; `alpha` is 0..1. */
  interpolate(alpha: number): THREE.Vector3 {
    return this.renderPosition.lerpVectors(this.previous, this.position, alpha);
  }

  /** Moves instantly, with no collision and no interpolation (respawning). */
  teleport(feet: THREE.Vector3): void {
    this.body.teleport(feet);
    this.position.copy(feet);
    this.previous.copy(feet);
    this.renderPosition.copy(feet);
    this._speed = 0;
    this.verticalVelocity = 0;
    this.pushX = 0;
    this.pushZ = 0;
  }

  /** Corpses become ghosts: other characters walk through them and can't push them. */
  setGhost(ghost: boolean): void {
    this.body.setGhost(ghost);
  }

  private step(dt: number): void {
    // Keep a small downward push while grounded so ground snapping stays engaged.
    this.verticalVelocity = this.body.grounded ? -1 : this.verticalVelocity + this.gravity * dt;
    this.delta.y = this.verticalVelocity * dt;
    this.delta.x += this.pushX * dt;
    this.delta.z += this.pushZ * dt;
    const decay = Math.exp(-PUSH_DECAY * dt);
    this.pushX *= decay;
    this.pushZ *= decay;
    this.body.move(this.delta);
  }
}
