import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export interface CharacterBodyOptions {
  radius?: number;
  /** Total height, including both rounded caps. */
  height?: number;
  /** Tallest ledge the character walks up without jumping. */
  maxStepHeight?: number;
}

/**
 * A kinematic capsule moved by Rapier's character controller: slides along walls,
 * climbs small steps, and sticks to the ground on the way down.
 */
export class CharacterBody {
  readonly radius: number;
  readonly height: number;

  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly halfHeight: number;
  private ghost = false;

  constructor(
    private readonly world: RAPIER.World,
    feetPosition: THREE.Vector3,
    options: CharacterBodyOptions,
  ) {
    this.radius = options.radius ?? 0.35;
    this.height = options.height ?? 1.8;
    this.halfHeight = this.height / 2;

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        feetPosition.x,
        feetPosition.y + this.halfHeight,
        feetPosition.z,
      ),
    );
    // Rapier capsules are sized by the half-length of the straight segment between the caps.
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(this.halfHeight - this.radius, this.radius),
      this.body,
    );

    this.controller = world.createCharacterController(0.01);
    this.controller.enableAutostep(options.maxStepHeight ?? 0.35, 0.2, false);
    this.controller.enableSnapToGround(0.3);
    this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(45));
  }

  get grounded(): boolean {
    return this.controller.computedGrounded();
  }

  /** Requests a move; the controller resolves collisions. Applied on the next physics step. */
  move(delta: THREE.Vector3): void {
    // Ghosts only collide with the level itself, never with other characters, so nobody can
    // push them and they can't push anybody.
    const filter = this.ghost ? RAPIER.QueryFilterFlags.ONLY_FIXED : undefined;
    this.controller.computeColliderMovement(this.collider, delta, filter);
    const corrected = this.controller.computedMovement();
    const current = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: current.x + corrected.x,
      y: current.y + corrected.y,
      z: current.z + corrected.z,
    });
  }

  /** Moves instantly to a feet position, ignoring collisions. */
  teleport(feet: THREE.Vector3): void {
    const center = { x: feet.x, y: feet.y + this.halfHeight, z: feet.z };
    this.body.setTranslation(center, true);
    this.body.setNextKinematicTranslation(center);
  }

  /**
   * A ghost (a corpse) is invisible to other characters: they walk straight through it, and its
   * own moves (a death fall) only collide with the level.
   */
  setGhost(ghost: boolean): void {
    this.ghost = ghost;
    this.collider.setEnabled(!ghost);
  }

  /** Writes the position of the character's feet into `target`. */
  getFeetPosition(target: THREE.Vector3): THREE.Vector3 {
    const { x, y, z } = this.body.translation();
    return target.set(x, y - this.halfHeight, z);
  }

  dispose(): void {
    this.world.removeCharacterController(this.controller);
    this.world.removeRigidBody(this.body);
  }
}
