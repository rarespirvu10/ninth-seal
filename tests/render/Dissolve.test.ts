import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Dissolve } from '../../src/render/Dissolve';

function setup() {
  const shared = new THREE.MeshStandardMaterial();
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  body.castShadow = true;
  const sibling = new THREE.Mesh(new THREE.BoxGeometry(), shared); // Another character's mesh.
  root.add(body);
  return { shared, root, body, sibling, dissolve: new Dissolve(root, { duration: 2 }) };
}

describe('Dissolve', () => {
  it('burns its own copy of the material, leaving shared materials untouched', () => {
    const { shared, body, sibling, dissolve } = setup();
    dissolve.start();

    expect(body.material).not.toBe(shared);
    expect((body.material as THREE.Material).customProgramCacheKey()).toMatch(/^dissolve/);
    expect(sibling.material).toBe(shared);
  });

  it('advances from intact to gone, then hides the object', () => {
    const { root, dissolve } = setup();
    dissolve.start();
    expect(dissolve.amount).toBe(0);

    dissolve.update(1);
    expect(dissolve.amount).toBeCloseTo(0.5);
    expect(root.visible).toBe(true);

    expect(dissolve.update(1)).toBe(true);
    expect(dissolve.amount).toBe(1);
    expect(root.visible).toBe(false);
  });

  it('eases in, so the first holes open slowly', () => {
    const { dissolve } = setup();
    dissolve.start();
    dissolve.update(0.2);
    expect(dissolve.amount).toBeLessThan(0.1);
  });

  it('turns off shadows while burning', () => {
    const { body, dissolve } = setup();
    dissolve.start();
    expect(body.castShadow).toBe(false);
  });

  it('restores the original material, shadow, and visibility on reset', () => {
    const { shared, root, body, dissolve } = setup();
    dissolve.start();
    dissolve.update(5);
    dissolve.reset();

    expect(body.material).toBe(shared);
    expect(body.castShadow).toBe(true);
    expect(root.visible).toBe(true);
    expect(dissolve.active).toBe(false);
    expect(dissolve.amount).toBe(0);
  });

  it('reuses the same burning materials after a reset, keeping their shader compiled', () => {
    const { body, dissolve } = setup();
    dissolve.start();
    const burning = body.material;
    dissolve.reset();
    dissolve.start();

    expect(body.material).toBe(burning);
  });

  it('can swap the burning materials in for shader warm-up without starting', () => {
    const { shared, body, dissolve } = setup();
    dissolve.useDissolvingMaterials(true);
    expect(body.material).not.toBe(shared);
    expect(dissolve.active).toBe(false);

    dissolve.useDissolvingMaterials(false);
    expect(body.material).toBe(shared);
  });

  it('does nothing before it starts', () => {
    const { root, dissolve } = setup();
    expect(dissolve.update(10)).toBe(false);
    expect(root.visible).toBe(true);
  });
});
