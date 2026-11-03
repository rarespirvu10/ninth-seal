// Declarations for the dissolve effect, injected into three.js's standard material shader.

uniform float uDissolve;
uniform vec3 uDissolveEdgeColor;
uniform float uDissolveEdgeWidth;

varying vec3 vDissolvePosition;

float dissolveHash(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yxz + 19.19);
  return fract((p.x + p.y) * p.z);
}

float dissolveValueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(dissolveHash(i), dissolveHash(i + vec3(1, 0, 0)), u.x),
      mix(dissolveHash(i + vec3(0, 1, 0)), dissolveHash(i + vec3(1, 1, 0)), u.x),
      u.y
    ),
    mix(
      mix(dissolveHash(i + vec3(0, 0, 1)), dissolveHash(i + vec3(1, 0, 1)), u.x),
      mix(dissolveHash(i + vec3(0, 1, 1)), dissolveHash(i + vec3(1, 1, 1)), u.x),
      u.y
    ),
    u.z
  );
}

// Layered noise in 0..1: large blotches with ragged detail at their edges.
float dissolveNoise(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * dissolveValueNoise(p);
    p *= 2.1;
    amplitude *= 0.5;
  }
  return value / 0.9375;
}
