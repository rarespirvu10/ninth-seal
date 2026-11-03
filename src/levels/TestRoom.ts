import * as THREE from 'three';
import { Fire } from '../render/effects/Fire';
import { createTiledBox, createTiledCylinder } from '../render/geometry';
import { loadPbrMaterial, setAnisotropy } from '../render/materials';
import type { QualitySettings } from '../render/QualitySettings';

const HALF = 12;
const WALL_HEIGHT = 6;
const LOW_WALL_HEIGHT = 0.8;
const WALL_THICKNESS = 1;

interface RoomMaterials {
  floor: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  pillar: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
}

/**
 * Look-test room: a 24 x 24 m torch-lit chamber.
 * Walls facing away from the camera are full height; walls facing it are kept low,
 * Diablo-style, so they never block the view.
 */
export class TestRoom {
  readonly object = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(5, 0, 5);

  /** Ordered by shadow priority: the first N cast shadows, per the quality preset. */
  private readonly fires: Fire[] = [];

  private constructor(private readonly materials: RoomMaterials) {
    this.buildFloor();
    this.buildWalls();
    this.buildPillars();
    this.buildDais();
    this.buildWallTorches();
    this.buildLighting();
  }

  static async load(loader: THREE.TextureLoader): Promise<TestRoom> {
    const [floor, wall, pillar] = await Promise.all([
      loadPbrMaterial(loader, 'monastery_stone_floor'),
      loadPbrMaterial(loader, 'castle_wall_slates', { tint: 0xb8b0a8 }),
      loadPbrMaterial(loader, 'old_stone_wall_02', { tint: 0xa89c90 }),
    ]);
    const iron = new THREE.MeshStandardMaterial({
      name: 'iron',
      color: 0x2a2522,
      metalness: 0.8,
      roughness: 0.55,
    });
    return new TestRoom({ floor, wall, pillar, iron });
  }

  update(time: number, camera: THREE.Camera): void {
    for (const fire of this.fires) fire.update(time, camera);
  }

  applyQuality(settings: Readonly<QualitySettings>): void {
    this.fires.forEach((fire, index) => {
      fire.setCastShadow(index < settings.shadowCastingLights, settings.shadowMapSize);
    });
    const { floor, wall, pillar } = this.materials;
    setAnisotropy([floor, wall, pillar], settings.textureAnisotropy);
  }

  private buildFloor(): void {
    const size = HALF * 2;
    const floor = this.addMesh(createTiledBox(size, 0.5, size, 3), this.materials.floor);
    floor.position.y = -0.25;
    floor.castShadow = false;
  }

  private buildWalls(): void {
    const outer = HALF + WALL_THICKNESS / 2;
    const span = HALF * 2 + WALL_THICKNESS * 2;
    const { wall } = this.materials;

    // Back walls (full height).
    this.addMesh(createTiledBox(WALL_THICKNESS, WALL_HEIGHT, span, 2.5), wall).position.set(
      -outer,
      WALL_HEIGHT / 2,
      0,
    );
    this.addMesh(createTiledBox(HALF * 2, WALL_HEIGHT, WALL_THICKNESS, 2.5), wall).position.set(
      0,
      WALL_HEIGHT / 2,
      -outer,
    );

    // Front walls (low, so the camera sees over them).
    this.addMesh(createTiledBox(WALL_THICKNESS, LOW_WALL_HEIGHT, HALF * 2, 2.5), wall).position.set(
      outer,
      LOW_WALL_HEIGHT / 2,
      0,
    );
    this.addMesh(createTiledBox(span, LOW_WALL_HEIGHT, WALL_THICKNESS, 2.5), wall).position.set(
      0,
      LOW_WALL_HEIGHT / 2,
      outer,
    );
  }

  private buildPillars(): void {
    const positions: [number, number][] = [
      [-9, -3],
      [-9, 5],
      [-3, -9],
      [5, -9],
      [-4.5, -4.5],
    ];
    const { pillar } = this.materials;
    const shaft = createTiledCylinder(0.6, WALL_HEIGHT, 2);
    const base = createTiledBox(1.6, 0.4, 1.6, 2);
    const capital = createTiledBox(1.5, 0.35, 1.5, 2);

    for (const [x, z] of positions) {
      this.addMesh(shaft, pillar).position.set(x, WALL_HEIGHT / 2, z);
      this.addMesh(base, pillar).position.set(x, 0.2, z);
      this.addMesh(capital, pillar).position.set(x, WALL_HEIGHT - 0.175, z);
    }
  }

  private buildDais(): void {
    const { pillar, iron } = this.materials;
    this.addMesh(createTiledBox(6, 0.2, 6, 2), pillar).position.set(0, 0.1, 0);
    this.addMesh(createTiledBox(4.4, 0.2, 4.4, 2), pillar).position.set(0, 0.3, 0);

    // Brazier: a stand and a bowl, with the main fire of the room.
    const stand = this.addMesh(new THREE.CylinderGeometry(0.12, 0.2, 0.8, 12), iron);
    stand.position.set(0, 0.8, 0);
    const bowl = this.addMesh(new THREE.CylinderGeometry(0.55, 0.3, 0.35, 16), iron);
    bowl.position.set(0, 1.35, 0);
    // The fire sits right above the brazier, so its shadow would black out the whole dais.
    stand.castShadow = false;
    bowl.castShadow = false;

    this.addFire(new THREE.Vector3(0, 1.5, 0), { size: 1.1, intensity: 140, range: 20 });
  }

  private buildWallTorches(): void {
    const inner = HALF - 0.25;
    const torches: { position: THREE.Vector3; facing: THREE.Vector3 }[] = [
      { position: new THREE.Vector3(-inner, 2.6, -1), facing: new THREE.Vector3(1, 0, 0) },
      { position: new THREE.Vector3(-inner, 2.6, 8), facing: new THREE.Vector3(1, 0, 0) },
      { position: new THREE.Vector3(-1, 2.6, -inner), facing: new THREE.Vector3(0, 0, 1) },
      { position: new THREE.Vector3(8, 2.6, -inner), facing: new THREE.Vector3(0, 0, 1) },
    ];
    const bracket = new THREE.BoxGeometry(0.1, 0.5, 0.1);

    for (const { position, facing } of torches) {
      this.addMesh(bracket, this.materials.iron).position.copy(position);
      const flameBase = position.clone().addScaledVector(facing, 0.12).setY(position.y + 0.25);
      this.addFire(flameBase, { size: 0.55, intensity: 70, range: 14 });
    }
  }

  private buildLighting(): void {
    // Faint cold fill so unlit areas read as deep blue-black instead of pure black.
    this.object.add(new THREE.HemisphereLight(0x5a6c90, 0x1a120c, 3));
  }

  private addFire(position: THREE.Vector3, options: ConstructorParameters<typeof Fire>[1]): void {
    const fire = new Fire(position, options);
    this.fires.push(fire);
    this.object.add(fire.object);
  }

  private addMesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.object.add(mesh);
    return mesh;
  }
}
