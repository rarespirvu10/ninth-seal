// Expanding ground ring: a sharp bright front with a short glow trailing behind it, fading as it
// travels outward. Drawn additively on a flat quad scaled to the ring's radius.

uniform float uProgress;
uniform vec3 uColor;
uniform float uIntensity;

varying vec2 vUv;

void main() {
  float r = length(vUv * 2.0 - 1.0);
  if (r > 1.0) discard;

  float front = uProgress;
  float width = mix(0.04, 0.14, uProgress);
  float ring = smoothstep(front - width, front, r) * (1.0 - smoothstep(front, front + 0.02, r));
  // A faint wake just behind the front, not a filled disc.
  float wake = smoothstep(front - 0.35, front, r) * step(r, front) * 0.06;
  float fade = 1.0 - uProgress * uProgress;

  // Additive blending multiplies by alpha, so the color itself stays at full strength.
  gl_FragColor = vec4(uColor * uIntensity, (ring + wake) * fade);
}
