import * as THREE from 'three';

/**
 * Builds a soft image-based-lighting environment: a sky color above fading to a darker ground below.
 * Static level geometry gets its ambient light from the baked lightmap; dynamic objects such as
 * characters use this instead, so they match the baked lighting without lighting the level twice.
 */
export function createAmbientEnvironment(
  renderer: THREE.WebGLRenderer,
  sky: THREE.Color,
  ground: THREE.Color,
): THREE.Texture {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uSky: { value: sky }, uGround: { value: ground } },
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSky;
        uniform vec3 uGround;
        varying vec3 vDirection;
        void main() {
          gl_FragColor = vec4(mix(uGround, uSky, smoothstep(-0.2, 0.6, vDirection.y)), 1.0);
        }`,
    }),
  );
  scene.add(dome);

  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(scene, 0, 0.1, 10);
  generator.dispose();
  dome.geometry.dispose();
  dome.material.dispose();
  return target.texture;
}

/** Applies an environment map to every standard material under `root`. */
export function applyEnvironment(root: THREE.Object3D, environment: THREE.Texture): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.envMap = environment;
        material.needsUpdate = true;
      }
    }
  });
}
