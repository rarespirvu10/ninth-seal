import * as THREE from 'three';

interface FadedMesh {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
  faded: THREE.Material[];
  baseOpacity: number[];
  castShadow: boolean;
}

/**
 * Fades an object out over time, then hides it. Meshes get their own transparent copies of their
 * materials while fading, because clones of a character share materials and only this one should
 * fade. `reset` restores the originals.
 */
export class FadeOut {
  private meshes: FadedMesh[] = [];
  private elapsed = 0;
  private _active = false;

  constructor(
    private readonly root: THREE.Object3D,
    private readonly duration: number,
  ) {}

  get active(): boolean {
    return this._active;
  }

  get done(): boolean {
    return this._active && this.elapsed >= this.duration;
  }

  start(): void {
    if (this._active) return;
    this._active = true;
    this.elapsed = 0;
    this.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const mesh = node as THREE.Mesh;
      const original = mesh.material;
      const faded = (Array.isArray(original) ? original : [original]).map((material) => {
        const copy = material.clone();
        copy.transparent = true;
        return copy;
      });
      this.meshes.push({
        mesh,
        original,
        faded,
        baseOpacity: faded.map((material) => material.opacity),
        castShadow: mesh.castShadow,
      });
      mesh.material = Array.isArray(original) ? faded : (faded[0] ?? original);
      // Transparent surfaces can't cast partial shadows, so the shadow goes as the fade begins.
      mesh.castShadow = false;
    });
  }

  /** Advances the fade; hides the object when it finishes. Returns true once done. */
  update(dt: number): boolean {
    if (!this._active) return false;
    this.elapsed = Math.min(this.elapsed + dt, this.duration);
    const remaining = 1 - this.elapsed / this.duration;
    for (const { faded, baseOpacity } of this.meshes) {
      faded.forEach((material, i) => {
        material.opacity = (baseOpacity[i] ?? 1) * remaining;
      });
    }
    if (this.done) this.root.visible = false;
    return this.done;
  }

  /** Puts back the original materials and shadows, and shows the object again. */
  reset(): void {
    for (const { mesh, original, faded, castShadow } of this.meshes) {
      mesh.material = original;
      mesh.castShadow = castShadow;
      for (const material of faded) material.dispose();
    }
    this.meshes = [];
    this.elapsed = 0;
    this._active = false;
    this.root.visible = true;
  }
}
