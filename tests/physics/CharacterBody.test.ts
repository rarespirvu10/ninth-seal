import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CharacterBody } from '../../src/physics/CharacterBody';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';

const DT = 1 / 60;

/** A floor, plus a wall across the X axis at x = 3. */
async function createWorld() {
  const physics = await PhysicsWorld.create();
  physics.addStaticBox(new THREE.Vector3(20, 0.25, 20), new THREE.Vector3(0, -0.25, 0));
  physics.addStaticBox(new THREE.Vector3(0.5, 2, 20), new THREE.Vector3(3.5, 2, 0));
  return physics;
}

/** Moves `body` by `velocity` (m/s) for `seconds`, stepping the world. */
function walk(physics: PhysicsWorld, body: CharacterBody, velocity: THREE.Vector3, seconds: number) {
  const step = velocity.clone().multiplyScalar(DT).setY(-1 * DT);
  for (let t = 0; t < seconds; t += DT) {
    body.move(step);
    physics.step(DT);
  }
}

const feet = (body: CharacterBody) => body.getFeetPosition(new THREE.Vector3());

describe('CharacterBody ghosts (corpses)', () => {
  let physics: PhysicsWorld;
  beforeAll(async () => {
    physics = await createWorld();
  });

  it('blocks other characters while alive', async () => {
    const world = await createWorld();
    world.createCharacter(new THREE.Vector3(0, 0, 0));
    const walker = world.createCharacter(new THREE.Vector3(0, 0, -2));

    walk(world, walker, new THREE.Vector3(0, 0, 4.5), 1);

    expect(feet(walker).z).toBeLessThan(-0.5);
  });

  it('lets characters walk through a corpse without moving it', () => {
    const corpse = physics.createCharacter(new THREE.Vector3(0, 0, 0));
    corpse.setGhost(true);
    const walker = physics.createCharacter(new THREE.Vector3(0, 0, -2));

    // The corpse keeps getting stand-still updates (gravity only), as bodies did before this fix:
    // its own movement must not shove it out of the walker's way.
    const stay = new THREE.Vector3(0, -DT, 0);
    const forward = new THREE.Vector3(0, -DT, 4.5 * DT);
    for (let t = 0; t < 1; t += DT) {
      walker.move(forward);
      corpse.move(stay);
      physics.step(DT);
    }

    expect(feet(walker).z).toBeGreaterThan(2);
    expect(feet(corpse).x).toBeCloseTo(0);
    expect(feet(corpse).z).toBeCloseTo(0);
  });

  it("moves a corpse through characters during its fall, but not through walls", async () => {
    const world = await createWorld();
    world.createCharacter(new THREE.Vector3(1, 0, 5)); // A bystander in the way.
    const corpse = world.createCharacter(new THREE.Vector3(-1, 0, 5));
    corpse.setGhost(true);

    walk(world, corpse, new THREE.Vector3(3, 0, 0), 2);

    // Passed the bystander at x = 1, stopped by the wall whose face is at x = 3.
    expect(feet(corpse).x).toBeGreaterThan(1.5);
    expect(feet(corpse).x).toBeLessThan(3);
  });
});
