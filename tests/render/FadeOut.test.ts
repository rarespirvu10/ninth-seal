import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FadeOut } from '../../src/render/FadeOut';

function setup() {
  const shared = new THREE.MeshStandardMaterial();
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  body.castShadow = true;
  const sibling = new THREE.Mesh(new THREE.BoxGeometry(), shared); // Another character's mesh.
  root.add(body);
  return { shared, root, body, sibling, fade: new FadeOut(root, 2) };
}

describe('FadeOut', () => {
  it('fades its own copy of the material, leaving shared materials untouched', () => {
    const { shared, body, sibling, fade } = setup();
    fade.start();

    expect(body.material).not.toBe(shared);
    expect(sibling.material).toBe(shared);
    expect(shared.transparent).toBe(false);
  });

  it('lowers opacity over the duration, then hides the object', () => {
    const { root, body, fade } = setup();
    fade.start();

    fade.update(1);
    expect((body.material as THREE.Material).opacity).toBeCloseTo(0.5);
    expect(root.visible).toBe(true);

    expect(fade.update(1)).toBe(true);
    expect((body.material as THREE.Material).opacity).toBeCloseTo(0);
    expect(root.visible).toBe(false);
  });

  it('turns off shadows while fading', () => {
    const { body, fade } = setup();
    fade.start();
    expect(body.castShadow).toBe(false);
  });

  it('restores the original material, shadow, and visibility on reset', () => {
    const { shared, root, body, fade } = setup();
    fade.start();
    fade.update(5);
    fade.reset();

    expect(body.material).toBe(shared);
    expect(body.castShadow).toBe(true);
    expect(root.visible).toBe(true);
    expect(fade.active).toBe(false);
  });

  it('does nothing before it starts', () => {
    const { root, fade } = setup();
    expect(fade.update(10)).toBe(false);
    expect(root.visible).toBe(true);
  });
});
