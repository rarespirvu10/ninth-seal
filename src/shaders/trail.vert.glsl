// Weapon trail ribbon. Positions are already in world space; each vertex carries how recent it is
// (aFade: 1 newest, 0 oldest) and where it sits across the blade (aEdge: 0 hilt, 1 tip).

attribute float aFade;
attribute float aEdge;

varying float vFade;
varying float vEdge;

void main() {
  vFade = aFade;
  vEdge = aEdge;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
