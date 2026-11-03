import * as THREE from 'three';
import dissolveDeclarations from '../shaders/dissolve_pars.frag.glsl?raw';

interface DissolvedMesh {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
  dissolving: THREE.Material | THREE.Material[];
  castShadow: boolean;
}

export interface DissolveOptions {
  /** Seconds from the first gap appearing to the object being gone. */
  duration: number;
  /** Color of the burning edge; values above 1 bloom. */
  edgeColor?: THREE.ColorRepresentation;
  edgeIntensity?: number;
  /** Width of the glowing band, in noise units (0..1). */
  edgeWidth?: number;
  /** Size of the burn pattern: larger values make smaller holes. */
  noiseScale?: number;
}

/**
 * Burns an object away: noise decides which pixels go first, a glowing band runs along the
 * advancing edge, then the object is hidden. Built on three.js's own standard material shader
 * (via onBeforeCompile), so the object keeps its full lighting until it's gone. Pixels are
 * discarded rather than blended, so there are no transparency sorting artifacts.
 *
 * Meshes get their own copies of their materials while dissolving, because clones of a character
 * share materials and only this one should burn. The copies are made once and kept, so their
 * shader stays compiled across respawns; `reset` swaps the originals back.
 */
export class Dissolve {
  private meshes: DissolvedMesh[] | null = null;
  private elapsed = 0;
  private _active = false;
  private readonly progress = { value: 0 };
  private readonly edgeColor: { value: THREE.Color };
  private readonly edgeWidth: { value: number };
  private readonly noiseScale: number;

  constructor(
    private readonly root: THREE.Object3D,
    private readonly options: DissolveOptions,
  ) {
    this.edgeColor = {
      value: new THREE.Color(options.edgeColor ?? 0xff6a1a).multiplyScalar(options.edgeIntensity ?? 6),
    };
    this.edgeWidth = { value: options.edgeWidth ?? 0.07 };
    this.noiseScale = options.noiseScale ?? 2.4;
  }

  get active(): boolean {
    return this._active;
  }

  get done(): boolean {
    return this._active && this.elapsed >= this.options.duration;
  }

  /** 0 (intact) to 1 (gone). */
  get amount(): number {
    return this.progress.value;
  }

  start(): void {
    if (this._active) return;
    this._active = true;
    this.elapsed = 0;
    this.progress.value = 0;
    this.useDissolvingMaterials(true);
  }

  /**
   * Swaps the burning materials in or out without starting the effect, so their shader can be
   * compiled ahead of time (during loading) instead of stalling the frame of the first death.
   */
  useDissolvingMaterials(enabled: boolean): void {
    for (const { mesh, original, dissolving, castShadow } of this.prepare()) {
      mesh.material = enabled ? dissolving : original;
      // A burning shadow would need the effect in the shadow pass too; dropping it is invisible.
      mesh.castShadow = enabled ? false : castShadow;
    }
  }

  /** Frees the burning copies of the materials. */
  dispose(): void {
    this.reset();
    for (const { dissolving } of this.meshes ?? []) {
      for (const material of Array.isArray(dissolving) ? dissolving : [dissolving]) material.dispose();
    }
    this.meshes = null;
  }

  /** Advances the burn; hides the object when it finishes. Returns true once done. */
  update(dt: number): boolean {
    if (!this._active) return false;
    this.elapsed = Math.min(this.elapsed + dt, this.options.duration);
    // Ease in: the first holes open slowly, then it goes quickly.
    const t = this.elapsed / this.options.duration;
    this.progress.value = t * t * (3 - 2 * t);
    if (this.done) this.root.visible = false;
    return this.done;
  }

  /** Puts back the original materials and shadows, and shows the object again. */
  reset(): void {
    if (this.meshes) this.useDissolvingMaterials(false);
    this.elapsed = 0;
    this.progress.value = 0;
    this._active = false;
    this.root.visible = true;
  }

  /** Makes the burning copies of every mesh's materials, once. */
  private prepare(): DissolvedMesh[] {
    if (this.meshes) return this.meshes;
    const meshes: DissolvedMesh[] = [];
    this.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const mesh = node as THREE.Mesh;
      const original = mesh.material;
      const dissolving = Array.isArray(original)
        ? original.map((material) => this.makeDissolving(material))
        : this.makeDissolving(original);
      meshes.push({ mesh, original, dissolving, castShadow: mesh.castShadow });
    });
    this.meshes = meshes;
    return meshes;
  }

  private makeDissolving(source: THREE.Material): THREE.Material {
    const material = source.clone();
    const scale = this.noiseScale.toFixed(3);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uDissolve = this.progress;
      shader.uniforms.uDissolveEdgeColor = this.edgeColor;
      shader.uniforms.uDissolveEdgeWidth = this.edgeWidth;

      // World-space position after skinning, so the pattern stays fixed on the body as it burns.
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vDissolvePosition;')
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvDissolvePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${dissolveDeclarations}`)
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          // Threshold runs a little past 0..1 so the object starts whole and ends fully gone.
          float dissolveThreshold = uDissolve * 1.15 - 0.08;
          float dissolveValue = dissolveNoise(vDissolvePosition * ${scale});
          if (dissolveValue < dissolveThreshold) discard;
          float dissolveEdge = 1.0 - smoothstep(0.0, uDissolveEdgeWidth, dissolveValue - dissolveThreshold);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uDissolveEdgeColor * dissolveEdge * step(0.001, uDissolve);',
        );
    };
    // Dissolving copies need their own compiled program, not the original material's.
    material.customProgramCacheKey = () => `dissolve-${scale}`;
    return material;
  }
}
