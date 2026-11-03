import { describe, expect, it } from 'vitest';
import { detectQualityLevel, isQualityLevel } from '../../src/render/QualitySettings';

describe('detectQualityLevel', () => {
  it.each([
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'ultra'],
    ['ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', 'ultra'],
    ['ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'low'],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', 'high'],
    ['ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)', 'ultra'],
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'low'],
    ['Mali-G78', 'low'],
    ['Apple GPU', 'medium'],
  ] as const)('%s -> %s', (gpu, expected) => {
    expect(detectQualityLevel(gpu)).toBe(expected);
  });

  it('defaults to medium when the GPU is unknown', () => {
    expect(detectQualityLevel(null)).toBe('medium');
  });
});

describe('isQualityLevel', () => {
  it('accepts known levels and rejects anything else', () => {
    expect(isQualityLevel('ultra')).toBe(true);
    expect(isQualityLevel('extreme')).toBe(false);
    expect(isQualityLevel(null)).toBe(false);
  });
});
