import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { DynamicResolution } from './DynamicResolution';
import {
  QUALITY_PRESETS,
  detectQualityLevel,
  type QualityLevel,
  type QualitySettings,
} from './QualitySettings';

/**
 * Owns the WebGL renderer and the post-processing chain:
 * scene -> ambient occlusion -> bloom -> tone mapping -> vignette -> film grain -> SMAA.
 * The chain is rebuilt whenever the quality preset changes.
 */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  /** GPU name reported by the browser, or null if hidden. */
  readonly gpu: string | null;

  private readonly composer: EffectComposer;
  private readonly dynamicResolution = new DynamicResolution();
  private _quality: QualityLevel = 'medium';
  private settings: Readonly<QualitySettings> = QUALITY_PRESETS.medium;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly events: EventBus<GameEvents>,
    quality?: QualityLevel,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // SMAA handles anti-aliasing in post.
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // The composer renders several passes per frame; reset stats manually so they cover all of them.
    this.renderer.info.autoReset = false;

    this.gpu = readGpuName(this.renderer);
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });

    this.setQuality(quality ?? detectQualityLevel(this.gpu));
    window.addEventListener('resize', this.onResize);
  }

  get quality(): QualityLevel {
    return this._quality;
  }

  get resolutionScale(): number {
    return this.dynamicResolution.scale;
  }

  setQuality(level: QualityLevel): void {
    this._quality = level;
    this.settings = QUALITY_PRESETS[level];
    this.buildPasses();
    this.dynamicResolution.reset();
    this.applyResolution();
    this.events.emit('quality:changed', { level, settings: this.settings });
  }

  render(frameTime: number): void {
    if (this.dynamicResolution.update(frameTime)) this.applyResolution();
    this.renderer.info.reset();
    this.composer.render(frameTime);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.composer.dispose();
    this.renderer.dispose();
  }

  private buildPasses(): void {
    // removeAllPasses() disposes the old passes and their render targets.
    this.composer.removeAllPasses();
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const { ambientOcclusion } = this.settings;
    if (ambientOcclusion !== 'off') {
      const ao = new N8AOPostPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
      ao.setQualityMode(ambientOcclusion);
      ao.configuration.aoRadius = 1.5;
      ao.configuration.distanceFalloff = 1;
      ao.configuration.intensity = 2.5;
      ao.configuration.halfRes = this.settings.ambientOcclusionHalfRes;
      this.composer.addPass(ao);
    }

    const effects = [];
    if (this.settings.bloom) {
      effects.push(
        new BloomEffect({
          mipmapBlur: true,
          luminanceThreshold: 1,
          luminanceSmoothing: 0.3,
          intensity: 1.2,
          radius: 0.75,
        }),
      );
    }
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
    effects.push(new VignetteEffect({ offset: 0.3, darkness: 0.65 }));

    const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true });
    grain.blendMode.opacity.value = 0.35;
    effects.push(grain);

    this.composer.addPass(new EffectPass(this.camera, ...effects));

    // SMAA runs last, on the final tone-mapped image, as a separate pass.
    if (this.settings.antialiasing) {
      this.composer.addPass(
        new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH })),
      );
    }
  }

  private applyResolution(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio =
      Math.min(window.devicePixelRatio, this.settings.maxPixelRatio) * this.dynamicResolution.scale;

    this.renderer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private readonly onResize = (): void => {
    this.applyResolution();
  };
}

function readGpuName(renderer: THREE.WebGLRenderer): string | null {
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const name: unknown = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  return typeof name === 'string' ? name : null;
}
