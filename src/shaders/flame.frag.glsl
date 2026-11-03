// Procedural flame on a camera-facing quad: rising noise, carved into a teardrop and colored by heat.
// Outputs HDR values above 1.0 so the bloom pass makes it glow.

uniform float uTime;
uniform float uSeed;
uniform float uIntensity;

varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// Fractal Brownian motion: layered noise for natural-looking turbulence.
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * valueNoise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = vUv;

  // Scroll noise upward so the flame rises; the seed keeps neighbouring flames out of sync.
  float n = fbm(vec2(uv.x * 3.0 + uSeed, uv.y * 2.4 - uTime * 2.2 + uSeed * 1.7));

  // Teardrop silhouette, wide at the base and narrowing to a tip, distorted by the noise.
  float halfWidth = mix(0.42, 0.03, pow(uv.y, 1.1));
  float dx = abs(uv.x - 0.5 + (n - 0.5) * 0.18 * uv.y);
  float silhouette = 1.0 - smoothstep(halfWidth * 0.55, halfWidth, dx);
  float vertical = smoothstep(0.0, 0.08, uv.y) * (1.0 - smoothstep(0.35, 1.0, uv.y + (n - 0.5) * 0.45));

  float heat = clamp(silhouette * vertical * (0.55 + 0.75 * n), 0.0, 1.0);

  vec3 ember = vec3(0.85, 0.12, 0.02);
  vec3 flame = vec3(1.0, 0.48, 0.08);
  vec3 core = vec3(1.0, 0.88, 0.62);
  vec3 color = mix(ember, flame, smoothstep(0.15, 0.55, heat));
  color = mix(color, core, smoothstep(0.65, 0.95, heat));

  float alpha = smoothstep(0.04, 0.35, heat);
  gl_FragColor = vec4(color * uIntensity * heat, alpha);
}
