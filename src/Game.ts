import * as THREE from 'three';
import { EventBus } from './core/EventBus';
import type { GameEvents } from './core/events';
import { GameLoop } from './core/GameLoop';
import { TestRoom } from './levels/TestRoom';
import { GameRenderer } from './render/GameRenderer';
import { IsometricCamera } from './render/IsometricCamera';

/** Composition root: creates the systems and wires them together. */
export class Game {
  private readonly events = new EventBus<GameEvents>();
  private readonly scene = new THREE.Scene();
  private readonly isoCamera = new IsometricCamera();
  private readonly renderer: GameRenderer;
  private readonly loop: GameLoop;
  private elapsed = 0;

  private constructor(
    canvas: HTMLCanvasElement,
    private readonly room: TestRoom,
  ) {
    this.scene.background = new THREE.Color(0x050407);
    this.scene.fog = new THREE.FogExp2(0x050407, 0.012);
    this.scene.add(room.object);

    // Subscribe before the renderer exists: it announces the initial quality from its constructor.
    this.events.on('quality:changed', ({ settings }) => {
      room.applyQuality(settings);
    });
    this.renderer = new GameRenderer(canvas, this.scene, this.isoCamera.camera, this.events);

    this.isoCamera.snapTo(room.spawnPoint);

    this.loop = new GameLoop({
      fixedUpdate: () => {
        // Simulation arrives with physics.
      },
      update: (dt) => {
        this.update(dt);
      },
    });
  }

  static async create(canvas: HTMLCanvasElement): Promise<Game> {
    const room = await TestRoom.load(new THREE.TextureLoader());
    return new Game(canvas, room);
  }

  start(): void {
    this.loop.start();
  }

  private update(dt: number): void {
    this.elapsed += dt;
    this.isoCamera.update(dt, this.room.spawnPoint);
    this.room.update(this.elapsed, this.isoCamera.camera);
    this.renderer.render(dt);
  }
}
