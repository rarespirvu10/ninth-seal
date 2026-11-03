import * as THREE from 'three';

/**
 * Box whose UVs are in world units divided by `tileSize`, so a repeating texture keeps the
 * same scale on every face regardless of the box's dimensions.
 */
export function createTiledBox(
  width: number,
  height: number,
  depth: number,
  tileSize: number,
): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;

  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; four vertices per face.
  const faceSizes: [number, number][] = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ];
  faceSizes.forEach(([u, v], face) => {
    for (let i = face * 4; i < face * 4 + 4; i++) {
      uv.setXY(i, (uv.getX(i) * u) / tileSize, (uv.getY(i) * v) / tileSize);
    }
  });
  uv.needsUpdate = true;
  return geometry;
}

/** Cylinder with world-scaled UVs around its side. */
export function createTiledCylinder(
  radius: number,
  height: number,
  tileSize: number,
  radialSegments = 24,
): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, radialSegments);
  const circumference = 2 * Math.PI * radius;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) * circumference) / tileSize, (uv.getY(i) * height) / tileSize);
  }
  uv.needsUpdate = true;
  return geometry;
}
