export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high', 'ultra'];

/** N8AO quality modes, or off. */
export type AmbientOcclusionMode = 'off' | 'Performance' | 'Low' | 'Medium' | 'High';

export interface QualitySettings {
  /** Upper bound on device pixel ratio before dynamic resolution scaling. */
  maxPixelRatio: number;
  /** Shadow map resolution per light (per cube face for point lights). */
  shadowMapSize: number;
  /** How many lights may cast shadows at once. */
  shadowCastingLights: number;
  ambientOcclusion: AmbientOcclusionMode;
  ambientOcclusionHalfRes: boolean;
  bloom: boolean;
  /** SMAA anti-aliasing. */
  antialiasing: boolean;
  textureAnisotropy: number;
}

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, Readonly<QualitySettings>>> = {
  low: {
    maxPixelRatio: 1,
    shadowMapSize: 256,
    shadowCastingLights: 0,
    ambientOcclusion: 'off',
    ambientOcclusionHalfRes: true,
    bloom: true,
    antialiasing: false,
    textureAnisotropy: 1,
  },
  medium: {
    maxPixelRatio: 1,
    shadowMapSize: 512,
    shadowCastingLights: 1,
    ambientOcclusion: 'Performance',
    ambientOcclusionHalfRes: true,
    bloom: true,
    antialiasing: true,
    textureAnisotropy: 4,
  },
  high: {
    maxPixelRatio: 1.5,
    shadowMapSize: 512,
    shadowCastingLights: 2,
    ambientOcclusion: 'Medium',
    ambientOcclusionHalfRes: true,
    bloom: true,
    antialiasing: true,
    textureAnisotropy: 8,
  },
  ultra: {
    maxPixelRatio: 2,
    shadowMapSize: 1024,
    shadowCastingLights: 3,
    ambientOcclusion: 'High',
    ambientOcclusionHalfRes: false,
    bloom: true,
    antialiasing: true,
    textureAnisotropy: 16,
  },
};

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i;
const MOBILE_GPU = /mali|adreno|powervr/i;
const INTEL_ARC = /intel.*arc/i;
const INTEL_IRIS = /intel.*iris/i;
const INTEL = /intel/i;
const AMD_INTEGRATED = /radeon\(tm\) graphics|radeon graphics|vega \d+ graphics/i;
const HIGH_END_DISCRETE = /rtx|radeon rx [6-9]\d{3}/i;
const DISCRETE = /nvidia|geforce|radeon|amd/i;
const APPLE_SILICON_PRO = /apple m\d+ (pro|max|ultra)/i;
const APPLE_SILICON = /apple m\d+/i;

/**
 * Picks a starting preset from the GPU name WebGL reports
 * (e.g. "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 ...)").
 * Deliberately conservative: a smooth Low beats a stuttering High for a first impression.
 */
export function detectQualityLevel(gpu: string | null): QualityLevel {
  if (!gpu) return 'medium';
  if (SOFTWARE_RENDERER.test(gpu) || MOBILE_GPU.test(gpu)) return 'low';
  if (INTEL_ARC.test(gpu)) return 'high';
  if (INTEL_IRIS.test(gpu)) return 'medium';
  if (INTEL.test(gpu)) return 'low';
  if (AMD_INTEGRATED.test(gpu)) return 'medium';
  if (HIGH_END_DISCRETE.test(gpu)) return 'ultra';
  if (DISCRETE.test(gpu)) return 'high';
  if (APPLE_SILICON_PRO.test(gpu)) return 'ultra';
  if (APPLE_SILICON.test(gpu)) return 'high';
  return 'medium';
}

export function isQualityLevel(value: unknown): value is QualityLevel {
  return typeof value === 'string' && (QUALITY_LEVELS as readonly string[]).includes(value);
}
