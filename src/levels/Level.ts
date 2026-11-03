import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { Fire } from '../render/effects/Fire';
import { loadPbrMaterial, setAnisotropy } from '../render/materials';
import type { QualitySettings } from '../render/QualitySettings';
import { parseLevelLayout, type EnemySpawn, type LevelLayout, type MaterialSpec } from './LevelLayout';

const LEVEL_ROOT = `${import.meta.env.BASE_URL}assets/levels`;
/** Mesh name suffix set by tools/blender/bake_level.py for geometry that must not cast shadows. */
const NO_SHADOW_SUFFIX = '__noshadow';

/**
 * A level built offline by tools/blender/bake_level.py: baked geometry and lightmap for visuals,
 * plus the layout it was built from for colliders, fires, and the spawn point.
 */
export class Level {
  readonly object = new THREE.Group();
  readonly spawnPoint: THREE.Vector3;
  /** Linear RGB of the baked ambient sky light, for lighting dynamic objects to match. */
  readonly ambientColor: THREE.Color;

  private readonly fires: Fire[] = [];
  private shadowBudget = 0;
  private shadowMapSize = 512;
  private frame = 0;

  private constructor(
    private readonly layout: LevelLayout,
    geometry: THREE.Object3D,
    private readonly materials: THREE.MeshStandardMaterial[],
  ) {
    this.spawnPoint = new THREE.Vector3(...layout.spawn);
    this.ambientColor = new THREE.Color(...layout.ambient.color);
    this.object.add(geometry);
    for (const fire of layout.fires) {
      const instance = new Fire(new THREE.Vector3(...fire.position), fire);
      this.fires.push(instance);
      this.object.add(instance.object);
    }
  }

  static async load(layoutData: unknown): Promise<Level> {
    const layout = parseLevelLayout(layoutData);
    const textures = new THREE.TextureLoader();
    const base = `${LEVEL_ROOT}/${layout.name}`;

    const [gltf, lightMap, bake, materials] = await Promise.all([
      new GLTFLoader().loadAsync(`${base}/level.glb`),
      textures.loadAsync(`${base}/lightmap.png`),
      fetch(`${base}/lightmap.json`).then((response) => response.json() as Promise<unknown>),
      createMaterials(textures, layout.materials),
    ]);

    // Written by the bake script: sRGB-encoded, glTF UV orientation, second UV set.
    lightMap.colorSpace = THREE.SRGBColorSpace;
    lightMap.flipY = false;
    lightMap.channel = 1;
    const intensity = readLightMapIntensity(bake);
    for (const material of materials.values()) {
      material.lightMap = lightMap;
      material.lightMapIntensity = intensity;
    }

    gltf.scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const placeholder = node.material as THREE.Material;
      const material = materials.get(placeholder.name);
      if (!material) throw new Error(`Level mesh "${node.name}" uses unknown material "${placeholder.name}"`);
      placeholder.dispose();
      node.material = material;
      node.castShadow = !node.name.endsWith(NO_SHADOW_SUFFIX);
      node.receiveShadow = true;
    });

    return new Level(layout, gltf.scene, [...materials.values()]);
  }

  get enemySpawns(): readonly EnemySpawn[] {
    return this.layout.enemies ?? [];
  }

  addColliders(physics: PhysicsWorld): void {
    this.addColliderShapes(physics);
    for (const piece of this.layout.pieces) {
      if (!piece.solid) continue;
      const position = new THREE.Vector3(...piece.position);
      if (piece.shape === 'box') {
        const [w, h, d] = piece.size;
        physics.addStaticBox(new THREE.Vector3(w / 2, h / 2, d / 2), position);
      } else {
        physics.addStaticCylinder(Math.max(piece.radiusTop, piece.radiusBottom), piece.height / 2, position);
      }
    }
  }

  /** `focus` is where the player is: the fires nearest to it get the shadow budget. */
  private addColliderShapes(physics: PhysicsWorld): void {
    for (const collider of this.layout.colliders ?? []) {
      const [x, y, z] = collider.position;
      const corners: number[] = [];
      for (const [[w, d], height] of [[collider.bottom, 0], [collider.top, collider.height]] as const) {
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) corners.push(x + (sx * w) / 2, y + height, z + (sz * d) / 2);
        }
      }
      physics.addStaticConvexHull(new Float32Array(corners));
    }
  }

  update(time: number, camera: THREE.Camera, focus: THREE.Vector3): void {
    for (const fire of this.fires) fire.update(time, camera);
    this.assignShadows(focus);
  }

  applyQuality(settings: Readonly<QualitySettings>): void {
    this.shadowBudget = settings.shadowCastingLights;
    this.shadowMapSize = settings.shadowMapSize;
    this.assignShadows(this.spawnPoint);
    setAnisotropy(this.materials, settings.textureAnisotropy);
  }

  /**
   * Point-light shadows are the most expensive part of a frame: each one redraws every shadow
   * caster six times. So only a few fires cast them, chosen nearest the player, whose shadows are
   * the ones you notice. The nearest redraws every frame; the others take turns, every other frame.
   */
  private assignShadows(focus: THREE.Vector3): void {
    this.frame++;
    this.fires.sort(
      (a, b) =>
        a.object.position.distanceToSquared(focus) - b.object.position.distanceToSquared(focus),
    );
    this.fires.forEach((fire, index) => {
      const casts = index < this.shadowBudget;
      fire.setCastShadow(casts, this.shadowMapSize);
      if (casts) fire.setShadowRefresh(index === 0, (this.frame + index) % 2 === 0);
    });
  }
}

async function createMaterials(
  loader: THREE.TextureLoader,
  specs: Record<string, MaterialSpec>,
): Promise<Map<string, THREE.MeshStandardMaterial>> {
  const entries = await Promise.all(
    Object.entries(specs).map(async ([id, spec]) => {
      const material =
        'texture' in spec
          ? await loadPbrMaterial(loader, spec.texture, spec.tint ? { tint: spec.tint } : {})
          : new THREE.MeshStandardMaterial({
              color: spec.color,
              metalness: spec.metalness ?? 0,
              roughness: spec.roughness ?? 0.5,
            });
      material.name = id;
      return [id, material] as const;
    }),
  );
  return new Map(entries);
}

function readLightMapIntensity(data: unknown): number {
  const value = (data as { lightMapIntensity?: unknown } | null)?.lightMapIntensity;
  if (typeof value !== 'number' || value <= 0) throw new Error('lightmap.json is missing lightMapIntensity');
  return value;
}
