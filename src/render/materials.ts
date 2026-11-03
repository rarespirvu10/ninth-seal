import * as THREE from 'three';

const TEXTURE_ROOT = `${import.meta.env.BASE_URL}assets/textures`;

export interface PbrMaterialOptions {
  /** Multiplied with the color map, e.g. to darken a texture. */
  tint?: THREE.ColorRepresentation;
  normalScale?: number;
}

/**
 * Loads a Poly Haven texture set (color, normal, packed AO/roughness/metal) into a standard material.
 * Textures repeat; geometry UVs decide the tiling (see geometry.ts).
 */
export async function loadPbrMaterial(
  loader: THREE.TextureLoader,
  id: string,
  options: PbrMaterialOptions = {},
): Promise<THREE.MeshStandardMaterial> {
  const [map, normalMap, armMap] = await Promise.all(
    ['diff', 'normal', 'arm'].map((name) => loader.loadAsync(`${TEXTURE_ROOT}/${id}/${name}.jpg`)),
  );
  if (!map || !normalMap || !armMap) throw new Error(`Incomplete texture set: ${id}`);

  map.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [map, normalMap, armMap]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }

  const normalScale = options.normalScale ?? 1;
  return new THREE.MeshStandardMaterial({
    name: id,
    color: options.tint ?? 0xffffff,
    map,
    normalMap,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    // ARM packing: R = ambient occlusion, G = roughness, B = metalness.
    aoMap: armMap,
    roughnessMap: armMap,
    roughness: 1,
    metalness: 0,
  });
}

export function setAnisotropy(materials: Iterable<THREE.MeshStandardMaterial>, level: number): void {
  for (const material of materials) {
    for (const texture of [material.map, material.normalMap, material.aoMap]) {
      if (texture && texture.anisotropy !== level) {
        texture.anisotropy = level;
        texture.needsUpdate = true;
      }
    }
  }
}
