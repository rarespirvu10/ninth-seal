import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CHARACTER_ROOT = `${import.meta.env.BASE_URL}assets/characters`;

/** Written by tools/blender/convert_character.py next to the model. */
export interface CharacterMetadata {
  height: number;
  clips: Record<string, { duration: number; groundSpeed?: number }>;
}

export interface CharacterAsset {
  model: THREE.Group;
  /** Height in the game, in meters, after scaling. */
  height: number;
  clip(name: string): THREE.AnimationClip;
  /** Speed (m/s) a clip travels at, at the character's in-game scale. */
  groundSpeed(name: string): number;
}

export interface CharacterOptions {
  /**
   * Height to scale the model to, in meters. Action RPGs draw characters a little larger than
   * life so they read well from a high camera; omit to keep the source size.
   */
  height?: number;
}

/** Loads a converted character: skinned model, its animation clips, and their metadata. */
export async function loadCharacter(
  name: string,
  options: CharacterOptions = {},
): Promise<CharacterAsset> {
  const [gltf, metadata] = await Promise.all([
    new GLTFLoader().loadAsync(`${CHARACTER_ROOT}/${name}.glb`),
    fetch(`${CHARACTER_ROOT}/${name}.json`).then(
      (response) => response.json() as Promise<CharacterMetadata>,
    ),
  ]);

  gltf.scene.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });

  // Strides grow with the model, so measured ground speeds scale by the same factor.
  const scale = options.height ? options.height / metadata.height : 1;
  gltf.scene.scale.setScalar(scale);

  const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
  return {
    model: gltf.scene,
    height: metadata.height * scale,
    clip(clipName) {
      const clip = clips.get(clipName);
      if (!clip) throw new Error(`Character "${name}" has no "${clipName}" animation`);
      return clip;
    },
    groundSpeed(clipName) {
      const speed = metadata.clips[clipName]?.groundSpeed;
      if (speed === undefined) throw new Error(`Character "${name}" has no ground speed for "${clipName}"`);
      return speed * scale;
    },
  };
}
