// Additive streak: a bright, sharp line along the path of the blade's tip over a faint fill,
// both fading quickly with age, so the trail reads as the edge's motion rather than a sheet.

uniform vec3 uColor;
uniform float uIntensity;

varying float vFade;
varying float vEdge;

void main() {
  float age = vFade * vFade;
  float fill = smoothstep(0.15, 1.0, vEdge) * 0.22;
  float edge = smoothstep(0.82, 1.0, vEdge) * 0.85;
  // Additive blending multiplies by alpha, so the color itself stays at full strength.
  gl_FragColor = vec4(uColor * uIntensity, age * (fill + edge));
}
