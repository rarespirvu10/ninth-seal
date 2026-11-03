import * as THREE from 'three';

const scratch = new THREE.Vector3();

/**
 * Projects a world position to CSS pixels in the viewport, for placing HTML over the 3D view.
 * Returns false (and leaves `out` unchanged) if the point is behind the camera.
 */
export function projectToScreen(
  world: THREE.Vector3,
  camera: THREE.Camera,
  out: { x: number; y: number },
): boolean {
  scratch.copy(world).project(camera);
  if (scratch.z > 1) return false;
  out.x = ((scratch.x + 1) / 2) * window.innerWidth;
  out.y = ((1 - scratch.y) / 2) * window.innerHeight;
  return true;
}
