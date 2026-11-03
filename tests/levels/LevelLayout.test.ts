import { describe, expect, it } from 'vitest';
import testRoom from '../../data/levels/test-room.json';
import { parseLevelLayout } from '../../src/levels/LevelLayout';

function validLayout() {
  const box = { shape: 'box', material: 'stone', size: [1, 2, 3], position: [0, 1, 0], solid: true };
  return {
    box,
    name: 'test',
    spawn: [0, 0, 0],
    materials: {
      stone: { texture: 'stone', tint: '#ffffff' },
      iron: { color: '#222222', metalness: 0.8 },
    },
    ambient: { color: [0.1, 0.1, 0.2] },
    pieces: [
      box,
      {
        shape: 'cylinder',
        material: 'iron',
        radiusTop: 0.5,
        radiusBottom: 0.5,
        height: 2,
        position: [1, 1, 1],
      },
    ],
    fires: [{ position: [0, 2, 0], size: 1, intensity: 50, range: 10 }],
  };
}

describe('parseLevelLayout', () => {
  it('accepts the shipped test room', () => {
    expect(() => parseLevelLayout(testRoom)).not.toThrow();
  });

  it('accepts a valid layout', () => {
    const layout = parseLevelLayout(validLayout());
    expect(layout.pieces).toHaveLength(2);
  });

  it('rejects a piece that references an unknown material', () => {
    const layout = validLayout();
    layout.box.material = 'marble';
    expect(() => parseLevelLayout(layout)).toThrow('pieces[0].material: unknown material "marble"');
  });

  it('rejects an unknown shape', () => {
    const layout = validLayout();
    layout.box.shape = 'sphere';
    expect(() => parseLevelLayout(layout)).toThrow('pieces[0].shape');
  });

  it('rejects non-positive sizes', () => {
    const layout = validLayout();
    layout.box.size = [1, 0, 1];
    expect(() => parseLevelLayout(layout)).toThrow('pieces[0].size[1]: expected a positive number');
  });

  it('rejects malformed vectors', () => {
    const layout = validLayout();
    (layout as { spawn: unknown }).spawn = [0, 0];
    expect(() => parseLevelLayout(layout)).toThrow('spawn: expected 3 numbers');
  });

  it('accepts enemy spawns and rejects malformed ones', () => {
    const layout = { ...validLayout(), enemies: [{ type: 'skeleton', position: [1, 0, 2], facing: 90 }] };
    expect(parseLevelLayout(layout).enemies).toHaveLength(1);

    const broken = { ...validLayout(), enemies: [{ type: 'skeleton', position: [1, 0] }] };
    expect(() => parseLevelLayout(broken)).toThrow('enemies[0].position: expected 3 numbers');
  });

  it('accepts collision-only frustums and rejects malformed ones', () => {
    const ramp = { shape: 'frustum', position: [0, 0, 0], bottom: [7, 7], top: [4, 4], height: 0.4 };
    expect(parseLevelLayout({ ...validLayout(), colliders: [ramp] }).colliders).toHaveLength(1);
    expect(() => parseLevelLayout({ ...validLayout(), colliders: [{ ...ramp, top: [4] }] })).toThrow(
      'colliders[0].top: expected 2 numbers',
    );
  });

  it('rejects malformed colors', () => {
    const layout = validLayout();
    layout.materials.stone.tint = 'white';
    expect(() => parseLevelLayout(layout)).toThrow('materials.stone.tint');
  });
});
