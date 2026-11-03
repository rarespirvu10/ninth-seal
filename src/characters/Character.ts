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
  metadata: CharacterMetadata;
  clip(name: string): THREE.AnimationClip;
  groundSpeed(name: string): number;
}

/** Loads a converted character: skinned model, its animation clips, and their metadata. */
export async function loadCharacter(name: string): Promise<CharacterAsset> {
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

  const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
  return {
    model: gltf.scene,
    metadata,
    clip(clipName) {
      const clip = clips.get(clipName);
      if (!clip) throw new Error(`Character "${name}" has no "${clipName}" animation`);
      return clip;
    },
    groundSpeed(clipName) {
      const speed = metadata.clips[clipName]?.groundSpeed;
      if (speed === undefined) throw new Error(`Character "${name}" has no ground speed for "${clipName}"`);
      return speed;
    },
  };
}
