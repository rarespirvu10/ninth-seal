import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const WEAPONS_URL = `${import.meta.env.BASE_URL}assets/weapons/weapons.glb`;

type Vec3 = readonly [number, number, number];

/** Where a held item sits relative to a bone, in that bone's frame. */
export interface Mount {
  /** Bone name as three.js sees it (glTF loading strips the ":" from "mixamorig:RightHand"). */
  bone: string;
  /** Offset from the bone's joint, in meters. */
  position: Vec3;
  /** Directions the item's local X, Y, and Z axes point, in the bone's frame. */
  axes: { x: Vec3; y: Vec3; z: Vec3 };
}

/**
 * Mounts for Mixamo skeletons, derived from the right hand's knuckle positions: the hand bone's
 * Y axis runs from wrist to knuckles, X toward the thumb, Z toward the palm. A sword's grip runs
 * along X through the curled fingers with the blade out past the thumb (item +Y to bone +X).
 * The left hand mirrors this; a shield's face points away from the palm.
 */
export const MIXAMO_MOUNTS = {
  mainHand: {
    bone: 'mixamorigRightHand',
    position: [-0.012, 0.075, 0.03],
    axes: { x: [0, 1, 0], y: [1, 0, 0], z: [0, 0, -1] },
  },
  offHandShield: {
    bone: 'mixamorigLeftHand',
    position: [0, 0.06, -0.06],
    axes: { x: [0, -1, 0], y: [-1, 0, 0], z: [0, 0, -1] },
  },
} as const satisfies Record<string, Mount>;

/** Loaded weapon models; `create` returns a fresh copy each time. */
export interface WeaponModels {
  create(name: string): THREE.Object3D;
}

export async function loadWeaponModels(): Promise<WeaponModels> {
  const gltf = await new GLTFLoader().loadAsync(WEAPONS_URL);
  return {
    create(name) {
      const source = gltf.scene.getObjectByName(name);
      if (!source) throw new Error(`No weapon model named "${name}"`);
      const copy = source.clone();
      copy.position.set(0, 0, 0);
      copy.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      return copy;
    },
  };
}

/**
 * Attaches `item` to a bone of `model` so it follows the animation.
 * Mixamo bones carry the skeleton's import scale (centimeters), so the item hangs from a socket
 * that cancels it: the item is sized in meters and scales with the character.
 */
export function attachToBone(model: THREE.Object3D, item: THREE.Object3D, mount: Mount): void {
  const bone = model.getObjectByName(mount.bone);
  if (!bone) throw new Error(`Model has no bone "${mount.bone}"`);

  model.updateWorldMatrix(true, true);
  const boneScale = bone.getWorldScale(new THREE.Vector3()).x;
  const modelScale = model.getWorldScale(new THREE.Vector3()).x;

  const socket = new THREE.Object3D();
  socket.name = `${mount.bone}Socket`;
  socket.scale.setScalar(modelScale / boneScale);
  bone.add(socket);

  item.position.set(...mount.position);
  item.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...mount.axes.x),
      new THREE.Vector3(...mount.axes.y),
      new THREE.Vector3(...mount.axes.z),
    ),
  );
  socket.add(item);
}
