/**
 * Level layout: the single description of a level's geometry, materials, and lights.
 * Read by the game (colliders, fires, spawn) and by tools/blender/bake_level.py (geometry, lightmap).
 * Coordinates are Y-up meters, matching the game.
 */

export type Vec3 = [number, number, number];

export interface TexturedMaterialSpec {
  /** Poly Haven texture id under public/assets/textures. */
  texture: string;
  tint?: string;
}

export interface PlainMaterialSpec {
  color: string;
  metalness?: number;
  roughness?: number;
}

export type MaterialSpec = TexturedMaterialSpec | PlainMaterialSpec;

interface PieceBase {
  material: string;
  position: Vec3;
  /** World-space size of one texture repeat, in meters. */
  tile?: number;
  /** Blocks movement. */
  solid?: boolean;
  castShadow?: boolean;
}

export interface BoxPiece extends PieceBase {
  shape: 'box';
  size: Vec3;
}

export interface CylinderPiece extends PieceBase {
  shape: 'cylinder';
  radiusTop: number;
  radiusBottom: number;
  height: number;
}

export type Piece = BoxPiece | CylinderPiece;

export interface FireSpec {
  position: Vec3;
  size: number;
  /** Light intensity in candela. */
  intensity: number;
  range: number;
}

/**
 * Collision-only shape, invisible in the game. Used where the collision should be simpler than
 * what's drawn, such as a ramp over shallow steps that slow walkers can't climb.
 */
export interface FrustumCollider {
  shape: 'frustum';
  /** Center of the base. */
  position: Vec3;
  /** Width (x) and depth (z) at the base and at the top, in meters. */
  bottom: [number, number];
  top: [number, number];
  height: number;
}

export interface EnemySpawn {
  /** Enemy kind, e.g. "skeleton". */
  type: string;
  position: Vec3;
  /** Degrees around the vertical axis; 0 faces +Z. */
  facing?: number;
}

export interface LevelLayout {
  name: string;
  spawn: Vec3;
  materials: Record<string, MaterialSpec>;
  /** Linear RGB radiance of the ambient sky light baked into the lightmap. */
  ambient: { color: Vec3 };
  pieces: Piece[];
  fires: FireSpec[];
  colliders?: FrustumCollider[];
  enemies?: EnemySpawn[];
}

/** Validates untyped JSON and returns it as a layout, or throws with the path of the first problem. */
export function parseLevelLayout(data: unknown): LevelLayout {
  const root = asRecord(data, 'layout');
  const materials = asRecord(root.materials, 'materials');
  for (const [id, spec] of Object.entries(materials)) checkMaterial(spec, `materials.${id}`);

  const pieces = asArray(root.pieces, 'pieces');
  pieces.forEach((piece, i) => {
    checkPiece(piece, `pieces[${i}]`, materials);
  });

  const fires = asArray(root.fires, 'fires');
  fires.forEach((fire, i) => {
    checkFire(fire, `fires[${i}]`);
  });

  if (root.colliders !== undefined) {
    asArray(root.colliders, 'colliders').forEach((collider, i) => {
      checkCollider(collider, `colliders[${i}]`);
    });
  }

  if (root.enemies !== undefined) {
    asArray(root.enemies, 'enemies').forEach((enemy, i) => {
      checkEnemy(enemy, `enemies[${i}]`);
    });
  }

  asString(root.name, 'name');
  asVec3(root.spawn, 'spawn');
  asVec3(asRecord(root.ambient, 'ambient').color, 'ambient.color');

  return data as LevelLayout;
}

function checkMaterial(value: unknown, path: string): void {
  const spec = asRecord(value, path);
  if ('texture' in spec) {
    asString(spec.texture, `${path}.texture`);
    if (spec.tint !== undefined) asColor(spec.tint, `${path}.tint`);
  } else {
    asColor(spec.color, `${path}.color`);
    if (spec.metalness !== undefined) asNumber(spec.metalness, `${path}.metalness`);
    if (spec.roughness !== undefined) asNumber(spec.roughness, `${path}.roughness`);
  }
}

function checkPiece(value: unknown, path: string, materials: Record<string, unknown>): void {
  const piece = asRecord(value, path);
  const material = asString(piece.material, `${path}.material`);
  if (!(material in materials)) fail(`${path}.material`, `unknown material "${material}"`);
  asVec3(piece.position, `${path}.position`);
  if (piece.tile !== undefined) asPositive(piece.tile, `${path}.tile`);
  if (piece.solid !== undefined) asBoolean(piece.solid, `${path}.solid`);
  if (piece.castShadow !== undefined) asBoolean(piece.castShadow, `${path}.castShadow`);

  if (piece.shape === 'box') {
    asVec3(piece.size, `${path}.size`).forEach((n, i) => asPositive(n, `${path}.size[${i}]`));
  } else if (piece.shape === 'cylinder') {
    asPositive(piece.radiusTop, `${path}.radiusTop`);
    asPositive(piece.radiusBottom, `${path}.radiusBottom`);
    asPositive(piece.height, `${path}.height`);
  } else {
    fail(`${path}.shape`, 'expected "box" or "cylinder"');
  }
}

function checkFire(value: unknown, path: string): void {
  const fire = asRecord(value, path);
  asVec3(fire.position, `${path}.position`);
  asPositive(fire.size, `${path}.size`);
  asPositive(fire.intensity, `${path}.intensity`);
  asPositive(fire.range, `${path}.range`);
}

function checkCollider(value: unknown, path: string): void {
  const collider = asRecord(value, path);
  if (collider.shape !== 'frustum') fail(`${path}.shape`, 'expected "frustum"');
  asVec3(collider.position, `${path}.position`);
  asPositive(collider.height, `${path}.height`);
  for (const key of ['bottom', 'top'] as const) {
    const size = asArray(collider[key], `${path}.${key}`);
    if (size.length !== 2) fail(`${path}.${key}`, 'expected 2 numbers');
    size.forEach((n, i) => asPositive(n, `${path}.${key}[${i}]`));
  }
}

function checkEnemy(value: unknown, path: string): void {
  const enemy = asRecord(value, path);
  asString(enemy.type, `${path}.type`);
  asVec3(enemy.position, `${path}.position`);
  if (enemy.facing !== undefined) asNumber(enemy.facing, `${path}.facing`);
}

function fail(path: string, message: string): never {
  throw new Error(`Invalid level layout at ${path}: ${message}`);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'expected an object');
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'expected an array');
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'expected a string');
  return value;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'expected a boolean');
  return value;
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a number');
  return value;
}

function asPositive(value: unknown, path: string): number {
  const n = asNumber(value, path);
  if (n <= 0) fail(path, 'expected a positive number');
  return n;
}

function asColor(value: unknown, path: string): string {
  const color = asString(value, path);
  if (!/^#[0-9a-f]{6}$/i.test(color)) fail(path, 'expected a color like "#a1b2c3"');
  return color;
}

function asVec3(value: unknown, path: string): Vec3 {
  const array = asArray(value, path);
  if (array.length !== 3) fail(path, 'expected 3 numbers');
  array.forEach((n, i) => asNumber(n, `${path}[${i}]`));
  return array as Vec3;
}
