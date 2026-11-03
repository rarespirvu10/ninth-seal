// Expanding ground ring: a bright front that widens and fades as it travels outward,
// over a faint fill behind it. Drawn additively on a flat quad scaled to the ring's radius.

uniform float uProgress;
uniform vec3 uColor;
uniform float uIntensity;

varying vec2 vUv;

void main() {
  float r = length(vUv * 2.0 - 1.0);
  if (r > 1.0) discard;

  float front = uProgress;
  float width = mix(0.06, 0.28, uProgress);
  float ring = smoothstep(front - width, front, r) * (1.0 - smoothstep(front, front + 0.025, r));
  float fill = (1.0 - smoothstep(0.0, front, r)) * 0.12;
  float fade = 1.0 - uProgress * uProgress;

  // Additive blending multiplies by alpha, so the color itself stays at full strength.
  gl_FragColor = vec4(uColor * uIntensity, (ring + fill) * fade);
}
