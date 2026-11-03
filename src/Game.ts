import * as THREE from 'three';
import { EventBus } from './core/EventBus';
import type { GameEvents } from './core/events';
import { GameLoop } from './core/GameLoop';
import { Input } from './core/Input';
import { PlayerController } from './gameplay/PlayerController';
import { TestRoom } from './levels/TestRoom';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { GameRenderer } from './render/GameRenderer';
import { IsometricCamera } from './render/IsometricCamera';

/** Composition root: creates the systems and wires them together. */
export class Game {
  private readonly events = new EventBus<GameEvents>();
  private readonly scene = new THREE.Scene();
  private readonly isoCamera = new IsometricCamera();
  private readonly input = new Input();
  private readonly renderer: GameRenderer;
  private readonly player: PlayerController;
  private readonly loop: GameLoop;
  private elapsed = 0;

  private constructor(
    canvas: HTMLCanvasElement,
    private readonly room: TestRoom,
    private readonly physics: PhysicsWorld,
  ) {
    this.scene.background = new THREE.Color(0x050407);
    this.scene.fog = new THREE.FogExp2(0x050407, 0.012);
    this.scene.add(room.object);
    room.addColliders(physics);

    this.player = new PlayerController(
      physics.createCharacter(room.spawnPoint),
      physics.gravity,
    );
    this.scene.add(this.player.object);

    // Subscribe before the renderer exists: it announces the initial quality from its constructor.
    this.events.on('quality:changed', ({ settings }) => {
      room.applyQuality(settings);
    });
    this.renderer = new GameRenderer(canvas, this.scene, this.isoCamera.camera, this.events);

    this.isoCamera.snapTo(room.spawnPoint);

    this.loop = new GameLoop({
      fixedUpdate: (dt) => {
        this.fixedUpdate(dt);
      },
      update: (dt, alpha) => {
        this.update(dt, alpha);
      },
    });
  }

  static async create(canvas: HTMLCanvasElement): Promise<Game> {
    const [room, physics] = await Promise.all([
      TestRoom.load(new THREE.TextureLoader()),
      PhysicsWorld.create(),
    ]);
    return new Game(canvas, room, physics);
  }

  start(): void {
    this.loop.start();
  }

  private fixedUpdate(dt: number): void {
    this.player.fixedUpdate(dt, this.input, this.isoCamera);
    this.physics.step(dt);
    this.player.afterPhysics();
  }

  private update(dt: number, alpha: number): void {
    this.elapsed += dt;
    this.player.render(alpha);
    this.isoCamera.update(dt, this.player.renderPosition);
    this.room.update(this.elapsed, this.isoCamera.camera);
    this.renderer.render(dt);
  }
}
