import * as THREE from 'three';
import flameVertexShader from '../../shaders/flame.vert.glsl?raw';
import flameFragmentShader from '../../shaders/flame.frag.glsl?raw';

export interface FireOptions {
  /** Light intensity in candela. */
  intensity?: number;
  /** Light reach in meters. */
  range?: number;
  /** Height of the visible flame in meters. */
  size?: number;
  color?: THREE.ColorRepresentation;
}

const flameGeometry = new THREE.PlaneGeometry(0.9, 1).translate(0, 0.5, 0);

/** A flickering point light with a procedural flame billboard. */
export class Fire {
  readonly object = new THREE.Group();
  readonly light: THREE.PointLight;

  private readonly flame: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly baseIntensity: number;
  private readonly seed = Math.random() * 100;
  private readonly timeUniform = { value: 0 };

  constructor(position: THREE.Vector3, options: FireOptions = {}) {
    this.baseIntensity = options.intensity ?? 45;
    const size = options.size ?? 0.6;

    this.light = new THREE.PointLight(
      options.color ?? 0xff8a3d,
      this.baseIntensity,
      options.range ?? 14,
      2,
    );
    this.light.position.y = size * 0.5;
    this.light.shadow.bias = -0.002;
    this.light.shadow.normalBias = 0.02;
    this.light.shadow.radius = 4;
    this.light.shadow.camera.near = 0.1;

    this.material = new THREE.ShaderMaterial({
      vertexShader: flameVertexShader,
      fragmentShader: flameFragmentShader,
      uniforms: {
        uTime: this.timeUniform,
        uSeed: { value: this.seed },
        uIntensity: { value: 4 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.flame = new THREE.Mesh(flameGeometry, this.material);
    this.flame.scale.setScalar(size);
    this.flame.renderOrder = 10;

    this.object.position.copy(position);
    this.object.add(this.light, this.flame);
  }

  update(time: number, camera: THREE.Camera): void {
    this.timeUniform.value = time;

    // Layered sine waves at unrelated frequencies read as an irregular flicker.
    const t = time + this.seed;
    const flicker =
      0.84 + 0.08 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 13.7 + 1.3) + 0.03 * Math.sin(t * 23.1);
    this.light.intensity = this.baseIntensity * flicker;

    // Face the camera.
    this.flame.quaternion.copy(camera.quaternion);
  }

  setCastShadow(enabled: boolean, mapSize: number): void {
    if (this.light.shadow.mapSize.x !== mapSize) {
      this.light.shadow.mapSize.set(mapSize, mapSize);
      this.light.shadow.map?.dispose();
      this.light.shadow.map = null;
    }
    this.light.castShadow = enabled;
  }
}
