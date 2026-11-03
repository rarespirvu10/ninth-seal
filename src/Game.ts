import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import testRoomLayout from '../data/levels/test-room.json';
import { loadCharacter, type CharacterAsset } from './characters/Character';
import { attachToBone, loadWeaponModels, MIXAMO_MOUNTS } from './characters/equipment';
import { EventBus } from './core/EventBus';
import type { GameEvents } from './core/events';
import { GameLoop } from './core/GameLoop';
import { Input } from './core/Input';
import { DebugOverlay } from './debug/DebugOverlay';
import { CombatSystem } from './gameplay/CombatSystem';
import { Enemy } from './gameplay/Enemy';
import { ENEMY_TYPES, SKELETON } from './gameplay/enemies';
import { PlayerController } from './gameplay/PlayerController';
import { Level } from './levels/Level';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { applyEnvironment, createAmbientEnvironment } from './render/environment';
import { GameRenderer } from './render/GameRenderer';
import { IsometricCamera } from './render/IsometricCamera';
import { loadQualityPreference, saveQualityPreference } from './render/qualityPreference';
import { Hud } from './ui/Hud';

/** Composition root: creates the systems and wires them together. */
export class Game {
  private readonly events = new EventBus<GameEvents>();
  private readonly scene = new THREE.Scene();
  private readonly isoCamera = new IsometricCamera();
  private readonly input: Input;
  private readonly renderer: GameRenderer;
  private readonly player: PlayerController;
  private readonly enemies: Enemy[] = [];
  private readonly debug: DebugOverlay;
  private readonly hud: Hud;
  private readonly loop: GameLoop;
  private readonly aim = new THREE.Vector3();
  private elapsed = 0;

  private constructor(
    canvas: HTMLCanvasElement,
    ui: HTMLElement,
    private readonly level: Level,
    private readonly physics: PhysicsWorld,
    character: CharacterAsset,
    enemyCharacters: ReadonlyMap<string, CharacterAsset>,
  ) {
    this.input = new Input(canvas);
    this.scene.background = new THREE.Color(0x050407);
    this.scene.fog = new THREE.FogExp2(0x050407, 0.012);
    this.scene.add(level.object);
    level.addColliders(physics);

    this.player = new PlayerController(
      physics.createCharacter(level.spawnPoint),
      physics.gravity,
      character,
      this.events,
    );
    this.scene.add(this.player.object);

    level.enemySpawns.forEach((spawn, index) => {
      const definition = ENEMY_TYPES[spawn.type];
      const asset = enemyCharacters.get(definition?.character ?? '');
      if (!definition || !asset) throw new Error(`Unknown enemy type "${spawn.type}"`);
      const enemy = new Enemy(
        index + 1,
        definition,
        asset,
        cloneSkinned(asset.model),
        physics.createCharacter(new THREE.Vector3(...spawn.position)),
        physics.gravity,
        THREE.MathUtils.degToRad(spawn.facing ?? 0),
        this.player,
        this.events,
      );
      this.enemies.push(enemy);
      this.scene.add(enemy.object);
    });
    // Lives as long as its event subscription: it resolves strikes announced on the bus.
    new CombatSystem(this.events, this.player, this.enemies);

    // Subscribe before the renderer exists: it announces the initial quality from its constructor.
    this.events.on('quality:changed', ({ settings }) => {
      level.applyQuality(settings);
    });
    this.renderer = new GameRenderer(
      canvas,
      this.scene,
      this.isoCamera.camera,
      this.events,
      loadQualityPreference() ?? undefined,
    );

    // The level's ambient light is baked; dynamic objects get a matching environment instead.
    const ground = level.ambientColor.clone().multiplyScalar(0.25);
    const environment = createAmbientEnvironment(this.renderer.renderer, level.ambientColor, ground);
    // Boosted so the metal armor has enough to reflect in a dark room.
    applyEnvironment(this.player.object, environment, 2.5);
    for (const enemy of this.enemies) applyEnvironment(enemy.object, environment, 1.5);

    this.hud = new Hud(ui, this.events, this.player, this.enemies, () => {
      this.restart();
    });
    this.debug = new DebugOverlay(ui, this.renderer, this.player, this.enemies, this.isoCamera.camera, (quality) => {
      this.renderer.setQuality(quality);
      saveQualityPreference(quality);
    });

    this.isoCamera.snapTo(level.spawnPoint);

    this.loop = new GameLoop({
      fixedUpdate: (dt) => {
        this.fixedUpdate(dt);
      },
      update: (dt, alpha) => {
        this.update(dt, alpha);
      },
    });
  }

  static async create(canvas: HTMLCanvasElement, ui: HTMLElement): Promise<Game> {
    const [level, physics, character, weapons, skeleton] = await Promise.all([
      Level.load(testRoomLayout),
      PhysicsWorld.create(),
      loadCharacter('warrior', { height: 1.8 }),
      loadWeaponModels(),
      loadCharacter(SKELETON.character, { height: SKELETON.height }),
    ]);
    attachToBone(character.model, weapons.create('sword'), MIXAMO_MOUNTS.mainHand);
    attachToBone(character.model, weapons.create('shield'), MIXAMO_MOUNTS.offHandShield);
    return new Game(canvas, ui, level, physics, character, new Map([[SKELETON.character, skeleton]]));
  }

  start(): void {
    this.loop.start();
  }

  /** Revives the player at the spawn point and resets every enemy. */
  restart(): void {
    this.player.respawn(this.level.spawnPoint);
    for (const enemy of this.enemies) enemy.respawn();
    this.isoCamera.snapTo(this.level.spawnPoint);
  }

  private fixedUpdate(dt: number): void {
    const aim = this.isoCamera.pointOnGround(this.input.pointer, this.player.renderPosition.y, this.aim);
    this.player.fixedUpdate(dt, { input: this.input, basis: this.isoCamera, aim });
    for (const enemy of this.enemies) enemy.fixedUpdate(dt);
    this.physics.step(dt);
    this.player.afterPhysics(dt);
    for (const enemy of this.enemies) enemy.afterPhysics(dt);
  }

  private update(dt: number, alpha: number): void {
    this.elapsed += dt;
    this.player.render(dt, alpha);
    for (const enemy of this.enemies) enemy.render(dt, alpha);
    this.isoCamera.update(dt, this.player.renderPosition);
    this.level.update(this.elapsed, this.isoCamera.camera, this.player.renderPosition);
    this.renderer.render(dt);
    this.hud.update(this.isoCamera.camera);
    this.debug.update(dt);
  }
}
