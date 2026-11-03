import RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three';
import { CharacterBody, type CharacterBodyOptions } from './CharacterBody';

/** Thin wrapper over a Rapier world: loads the WASM module and exposes only what the game needs. */
export class PhysicsWorld {
  private constructor(private readonly world: RAPIER.World) {}

  static async create(gravity = -20): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld(new RAPIER.World({ x: 0, y: gravity, z: 0 }));
  }

  get gravity(): number {
    return this.world.gravity.y;
  }

  addStaticBox(halfExtents: THREE.Vector3, position: THREE.Vector3): void {
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z).setTranslation(
        position.x,
        position.y,
        position.z,
      ),
    );
  }

  addStaticCylinder(radius: number, halfHeight: number, position: THREE.Vector3): void {
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(halfHeight, radius).setTranslation(
        position.x,
        position.y,
        position.z,
      ),
    );
  }

  createCharacter(feetPosition: THREE.Vector3, options: CharacterBodyOptions = {}): CharacterBody {
    return new CharacterBody(this.world, feetPosition, options);
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }
}
