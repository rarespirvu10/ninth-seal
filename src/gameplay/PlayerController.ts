import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { CharacterBody } from '../physics/CharacterBody';

export interface MovementBasis {
  /** Ground-plane direction that appears as "up" on screen. */
  forward: THREE.Vector3;
  /** Ground-plane direction that appears as "right" on screen. */
  right: THREE.Vector3;
}

const MOVE_SPEED = 5;
const TURN_SHARPNESS = 14;

/**
 * Turns input into character movement on the fixed physics step, and smooths the result
 * for rendering by interpolating between the last two physics positions.
 */
export class PlayerController {
  readonly object = new THREE.Group();
  /** Interpolated feet position for this frame. */
  readonly renderPosition = new THREE.Vector3();

  private readonly previous = new THREE.Vector3();
  private readonly current = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly step = new THREE.Vector3();
  private facing = 0;

  constructor(
    private readonly body: CharacterBody,
    private readonly gravity: number,
  ) {
    body.getFeetPosition(this.current);
    this.previous.copy(this.current);
    this.renderPosition.copy(this.current);
    this.object.add(createPlaceholderMesh(body.radius, body.height));
    this.object.position.copy(this.current);
  }

  fixedUpdate(dt: number, input: Input, basis: MovementBasis): void {
    const axis = input.moveAxis();
    this.step
      .copy(basis.forward)
      .multiplyScalar(axis.y)
      .addScaledVector(basis.right, axis.x);
    if (this.step.lengthSq() > 0) this.step.normalize();

    this.velocity.x = this.step.x * MOVE_SPEED;
    this.velocity.z = this.step.z * MOVE_SPEED;
    // Keep a small downward push while grounded so ground snapping stays engaged.
    this.velocity.y = this.body.grounded ? -1 : this.velocity.y + this.gravity * dt;

    if (this.step.lengthSq() > 0) {
      const target = Math.atan2(this.step.x, this.step.z);
      this.facing = dampAngle(this.facing, target, TURN_SHARPNESS, dt);
    }

    this.body.move(this.step.copy(this.velocity).multiplyScalar(dt));
  }

  /** Called after the physics step to record the new position. */
  afterPhysics(): void {
    this.previous.copy(this.current);
    this.body.getFeetPosition(this.current);
  }

  /** Called once per rendered frame. `alpha` is the fraction between the last two physics steps. */
  render(alpha: number): void {
    this.renderPosition.lerpVectors(this.previous, this.current, alpha);
    this.object.position.copy(this.renderPosition);
    this.object.rotation.y = this.facing;
  }
}

/** Rotates `current` toward `target` along the shortest arc, frame-rate independently. */
function dampAngle(current: number, target: number, sharpness: number, dt: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-sharpness * dt));
}

/** Stand-in for the character model: a capsule with a visor showing which way it faces. */
function createPlaceholderMesh(radius: number, height: number): THREE.Group {
  const group = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x8c9099, metalness: 0.75, roughness: 0.35 });
  const visor = new THREE.MeshStandardMaterial({
    color: 0x111111,
    emissive: 0x66ccff,
    emissiveIntensity: 3,
  });

  const capsule = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, height - radius * 2, 8, 16),
    armor,
  );
  capsule.position.y = height / 2;

  const eye = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.2, 0.08, 0.1), visor);
  eye.position.set(0, height - radius * 1.1, radius * 0.9);

  for (const mesh of [capsule, eye]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
