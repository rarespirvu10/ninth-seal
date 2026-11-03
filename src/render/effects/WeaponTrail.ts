import * as THREE from 'three';
import trailVertexShader from '../../shaders/trail.vert.glsl?raw';
import trailFragmentShader from '../../shaders/trail.frag.glsl?raw';

export interface WeaponTrailOptions {
  /** Points on the weapon, in its local space, between which the trail is drawn. */
  base: THREE.Vector3;
  tip: THREE.Vector3;
  color?: THREE.ColorRepresentation;
  /** Above 1 lets the trail bloom. */
  intensity?: number;
  /** Seconds a sample stays visible. */
  lifetime?: number;
}

interface Sample {
  base: THREE.Vector3;
  tip: THREE.Vector3;
  age: number;
}

const MAX_SAMPLES = 24;
/** Extra points inserted between recorded samples, so fast swings stay smooth at any frame rate. */
const SUBDIVISIONS = 3;
const MAX_POINTS = (MAX_SAMPLES - 1) * SUBDIVISIONS + 1;

/**
 * A ribbon traced by a weapon's edge. Samples the weapon's base and tip in world space each
 * frame while emitting, smooths between samples with Catmull-Rom splines, and fades samples out
 * by age. Sample objects are reused, so a trail allocates nothing after construction.
 */
export class WeaponTrail {
  readonly mesh: THREE.Mesh;

  private readonly samples: Sample[] = [];
  private readonly spare: Sample[] = [];
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions = new Float32Array(MAX_POINTS * 2 * 3);
  private readonly fades = new Float32Array(MAX_POINTS * 2);
  private readonly lifetime: number;
  private readonly baseLocal: THREE.Vector3;
  private readonly tipLocal: THREE.Vector3;
  private readonly curvePoint = new THREE.Vector3();

  constructor(
    private readonly weapon: THREE.Object3D,
    options: WeaponTrailOptions,
  ) {
    this.baseLocal = options.base.clone();
    this.tipLocal = options.tip.clone();
    this.lifetime = options.lifetime ?? 0.16;

    const edges = new Float32Array(MAX_POINTS * 2);
    const indices: number[] = [];
    for (let i = 0; i < MAX_POINTS; i++) {
      edges[i * 2] = 0;
      edges[i * 2 + 1] = 1;
      if (i < MAX_POINTS - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aFade', new THREE.BufferAttribute(this.fades, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aEdge', new THREE.BufferAttribute(edges, 1));
    this.geometry.setIndex(indices);
    this.geometry.setDrawRange(0, 0);

    this.mesh = new THREE.Mesh(
      this.geometry,
      new THREE.ShaderMaterial({
        vertexShader: trailVertexShader,
        fragmentShader: trailFragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(options.color ?? 0xcfe0ff) },
          uIntensity: { value: options.intensity ?? 2.2 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    // Vertices are written in world space every frame, so bounds are never valid.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** Call once per frame after the weapon's pose is final. */
  update(dt: number, emitting: boolean): void {
    for (const sample of this.samples) sample.age += dt;
    while (this.samples.length > 0 && (this.samples[0]?.age ?? 0) > this.lifetime) {
      const old = this.samples.shift();
      if (old) this.spare.push(old);
    }

    if (emitting) {
      if (this.samples.length >= MAX_SAMPLES) {
        const old = this.samples.shift();
        if (old) this.spare.push(old);
      }
      const sample = this.spare.pop() ?? { base: new THREE.Vector3(), tip: new THREE.Vector3(), age: 0 };
      this.weapon.updateWorldMatrix(true, false);
      sample.base.copy(this.baseLocal).applyMatrix4(this.weapon.matrixWorld);
      sample.tip.copy(this.tipLocal).applyMatrix4(this.weapon.matrixWorld);
      sample.age = 0;
      this.samples.push(sample);
    }

    this.rebuild();
  }

  private rebuild(): void {
    const count = this.samples.length;
    if (count < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    let point = 0;
    for (let i = 0; i < count - 1; i++) {
      const steps = i === count - 2 ? SUBDIVISIONS + 1 : SUBDIVISIONS;
      for (let s = 0; s < steps; s++) {
        const t = s / SUBDIVISIONS;
        this.writePoint(point, i, t, 'base', 0);
        this.writePoint(point, i, t, 'tip', 1);
        point++;
      }
    }

    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aFade') as THREE.BufferAttribute).needsUpdate = true;
    this.geometry.setDrawRange(0, (point - 1) * 6);
  }

  /** Writes the Catmull-Rom point at `t` between samples i and i + 1, for the base or tip edge. */
  private writePoint(point: number, i: number, t: number, edge: 'base' | 'tip', side: 0 | 1): void {
    const at = (k: number) => (this.samples[Math.min(Math.max(k, 0), this.samples.length - 1)] as Sample);
    const p0 = at(i - 1)[edge];
    const p1 = at(i)[edge];
    const p2 = at(i + 1)[edge];
    const p3 = at(i + 2)[edge];
    catmullRom(p0, p1, p2, p3, t, this.curvePoint);

    const vertex = point * 2 + side;
    this.positions[vertex * 3] = this.curvePoint.x;
    this.positions[vertex * 3 + 1] = this.curvePoint.y;
    this.positions[vertex * 3 + 2] = this.curvePoint.z;

    const age = THREE.MathUtils.lerp(at(i).age, at(i + 1).age, t);
    this.fades[vertex] = Math.max(0, 1 - age / this.lifetime);
  }
}

function catmullRom(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  t: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const blend = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return target.set(blend(p0.x, p1.x, p2.x, p3.x), blend(p0.y, p1.y, p2.y, p3.y), blend(p0.z, p1.z, p2.z, p3.z));
}
