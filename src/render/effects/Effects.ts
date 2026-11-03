import * as THREE from 'three';
import { ObjectPool } from '../../core/ObjectPool';
import shockwaveVertexShader from '../../shaders/shockwave.vert.glsl?raw';
import shockwaveFragmentShader from '../../shaders/shockwave.frag.glsl?raw';

interface Shockwave {
  mesh: THREE.Mesh;
  progress: { value: number };
  color: { value: THREE.Color };
  age: number;
  duration: number;
}

const ringGeometry = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

/**
 * Short-lived visual effects. Each kind comes from an object pool, so spamming a skill never
 * allocates: meshes are reused, only their uniforms change.
 */
export class Effects {
  readonly shockwaves: ObjectPool<Shockwave>;
  private readonly live: Shockwave[] = [];

  constructor(private readonly scene: THREE.Scene) {
    this.shockwaves = new ObjectPool<Shockwave>(
      () => {
        const progress = { value: 0 };
        const color = { value: new THREE.Color() };
        const mesh = new THREE.Mesh(
          ringGeometry,
          new THREE.ShaderMaterial({
            vertexShader: shockwaveVertexShader,
            fragmentShader: shockwaveFragmentShader,
            uniforms: { uProgress: progress, uColor: color, uIntensity: { value: 2.5 } },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        mesh.renderOrder = 4;
        mesh.visible = false;
        this.scene.add(mesh);
        return { mesh, progress, color, age: 0, duration: 0 };
      },
      (wave) => {
        wave.mesh.visible = false;
      },
      4,
    );
  }

  /** A ring that races outward along the ground from `center` to `radius` meters. */
  shockwave(center: THREE.Vector3, radius: number, color: THREE.ColorRepresentation, duration = 0.45): void {
    const wave = this.shockwaves.acquire();
    wave.age = 0;
    wave.duration = duration;
    wave.mesh.position.set(center.x, center.y + 0.06, center.z);
    wave.mesh.scale.setScalar(radius);
    wave.color.value.set(color);
    wave.mesh.visible = true;
    this.live.push(wave);
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const wave = this.live[i];
      if (!wave) continue;
      wave.age += dt;
      const progress = Math.min(wave.age / wave.duration, 1);
      // Ease out: the front bursts out fast and slows as it fades.
      wave.progress.value = 1 - (1 - progress) ** 2;
      if (progress >= 1) {
        this.shockwaves.release(wave);
        this.live.splice(i, 1);
      }
    }
  }
}
