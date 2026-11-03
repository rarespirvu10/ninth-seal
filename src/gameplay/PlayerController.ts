import * as THREE from 'three';
import type { CharacterAsset } from '../characters/Character';
import { LocomotionAnimator } from '../characters/LocomotionAnimator';
import type { Input } from '../core/Input';
import type { CharacterBody } from '../physics/CharacterBody';

export interface MovementBasis {
  /** Ground-plane direction that appears as "up" on screen. */
  forward: THREE.Vector3;
  /** Ground-plane direction that appears as "right" on screen. */
  right: THREE.Vector3;
}

const RUN_SPEED = 4.5;
/**
 * Soft light that follows the hero, as in Diablo: keeps the character readable in dark rooms
 * and leaves a pool of light around them. Placed toward the camera so it lights the front.
 */
const HERO_LIGHT = { color: 0xffe2c8, intensity: 30, range: 9, offset: new THREE.Vector3(1.2, 3.2, 1.2) };
const WALK_SPEED = 1.4;
const TURN_SHARPNESS = 14;
/** Smoothing for the measured speed that drives animation, so single-step jitter doesn't flicker clips. */
const SPEED_SHARPNESS = 15;

/**
 * Turns input into character movement on the fixed physics step, and smooths the result
 * for rendering by interpolating between the last two physics positions.
 */
export class PlayerController {
  /** Follows the character's position; holds the hero light, which must not turn with the model. */
  readonly object = new THREE.Group();
  /** Interpolated feet position for this frame. */
  readonly renderPosition = new THREE.Vector3();

  private readonly model: THREE.Object3D;
  private readonly animator: LocomotionAnimator;
  private readonly previous = new THREE.Vector3();
  private readonly current = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly step = new THREE.Vector3();
  private facing = 0;
  /** Measured horizontal speed after collisions, in m/s. */
  private groundSpeed = 0;

  constructor(
    private readonly body: CharacterBody,
    private readonly gravity: number,
    character: CharacterAsset,
  ) {
    body.getFeetPosition(this.current);
    this.previous.copy(this.current);
    this.renderPosition.copy(this.current);

    this.model = character.model;
    this.object.add(this.model);
    this.object.position.copy(this.current);

    const light = new THREE.PointLight(HERO_LIGHT.color, HERO_LIGHT.intensity, HERO_LIGHT.range, 2);
    light.position.copy(HERO_LIGHT.offset);
    this.object.add(light);
    this.animator = new LocomotionAnimator(
      character.model,
      { idle: character.clip('idle'), walk: character.clip('walk'), run: character.clip('run') },
      { walk: character.groundSpeed('walk'), run: character.groundSpeed('run') },
      { walk: WALK_SPEED, run: RUN_SPEED },
    );
  }

  get animationState(): string {
    return this.animator.state;
  }

  get speed(): number {
    return this.groundSpeed;
  }

  fixedUpdate(dt: number, input: Input, basis: MovementBasis): void {
    const axis = input.moveAxis();
    this.step
      .copy(basis.forward)
      .multiplyScalar(axis.y)
      .addScaledVector(basis.right, axis.x);
    if (this.step.lengthSq() > 0) this.step.normalize();

    const walking = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = walking ? WALK_SPEED : RUN_SPEED;
    this.velocity.x = this.step.x * speed;
    this.velocity.z = this.step.z * speed;
    // Keep a small downward push while grounded so ground snapping stays engaged.
    this.velocity.y = this.body.grounded ? -1 : this.velocity.y + this.gravity * dt;

    if (this.step.lengthSq() > 0) {
      const target = Math.atan2(this.step.x, this.step.z);
      this.facing = dampAngle(this.facing, target, TURN_SHARPNESS, dt);
    }

    this.body.move(this.step.copy(this.velocity).multiplyScalar(dt));
  }

  /** Called after the physics step to record the new position. */
  afterPhysics(dt: number): void {
    this.previous.copy(this.current);
    this.body.getFeetPosition(this.current);

    // Speed actually achieved after collisions: walking into a wall measures ~0 and plays idle.
    const moved = Math.hypot(this.current.x - this.previous.x, this.current.z - this.previous.z);
    this.groundSpeed += (moved / dt - this.groundSpeed) * (1 - Math.exp(-SPEED_SHARPNESS * dt));
  }

  /** Called once per rendered frame. `alpha` is the fraction between the last two physics steps. */
  render(dt: number, alpha: number): void {
    this.renderPosition.lerpVectors(this.previous, this.current, alpha);
    this.object.position.copy(this.renderPosition);
    this.model.rotation.y = this.facing;
    this.animator.update(dt, this.groundSpeed);
  }
}

/** Rotates `current` toward `target` along the shortest arc, frame-rate independently. */
function dampAngle(current: number, target: number, sharpness: number, dt: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-sharpness * dt));
}
