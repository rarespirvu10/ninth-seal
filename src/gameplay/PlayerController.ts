import * as THREE from 'three';
import type { CharacterAsset } from '../characters/Character';
import { CharacterAnimator } from '../characters/CharacterAnimator';
import { CharacterMotor } from '../characters/CharacterMotor';
import { ClipTimer } from '../characters/ClipTimer';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { MouseButton, type Input } from '../core/Input';
import { StateMachine } from '../core/StateMachine';
import type { CharacterBody } from '../physics/CharacterBody';
import { AttackSequence } from './AttackSequence';
import type { Combatant } from './CombatSystem';
import { Health } from './Health';
import { WARRIOR_ATTACK_RATE, WARRIOR_COMBO } from './warriorAttacks';

export interface MovementBasis {
  /** Ground-plane direction that appears as "up" on screen. */
  forward: THREE.Vector3;
  /** Ground-plane direction that appears as "right" on screen. */
  right: THREE.Vector3;
}

/** What the player controls this step. */
export interface PlayerIntent {
  input: Input;
  basis: MovementBasis;
  /** Point on the ground under the cursor, if any. */
  aim: THREE.Vector3 | null;
}

type PlayerState = 'move' | 'attack' | 'hit' | 'dead';

const MAX_HEALTH = 100;
const RUN_SPEED = 4.5;
const WALK_SPEED = 1.4;
const TURN_SHARPNESS = 14;
/** After a flinch, further hits only deal damage for this long, so enemies can't stun-lock you. */
const FLINCH_IMMUNITY = 1.2;
/**
 * Soft light that follows the hero, as in Diablo: keeps the character readable in dark rooms
 * and leaves a pool of light around them. Placed toward the camera so it lights the front.
 */
const HERO_LIGHT = { color: 0xffe2c8, intensity: 30, range: 9, offset: new THREE.Vector3(1.2, 3.2, 1.2) };

/**
 * The player character: a state machine over moving, attacking, flinching, and dying.
 * Gameplay runs on the fixed physics step; rendering interpolates between the last two steps.
 */
export class PlayerController implements Combatant {
  readonly id = 'player' as const;
  /** Follows the character's position; holds the hero light, which must not turn with the model. */
  readonly object = new THREE.Group();
  readonly health = new Health(MAX_HEALTH);

  private readonly motor: CharacterMotor;
  private readonly machine: StateMachine<PlayerState, PlayerController>;
  private readonly attacks = new AttackSequence(WARRIOR_COMBO, WARRIOR_ATTACK_RATE);
  private readonly flinch = new ClipTimer('hit', 0, 0.7, 1.2);
  private readonly death = new ClipTimer('death', 0, 3.9);
  private readonly model: THREE.Object3D;
  private readonly animator: CharacterAnimator;
  private intent: PlayerIntent | null = null;
  /** Action clip time at the last two fixed steps, interpolated for rendering. */
  private actionTimeFrom = 0;
  private actionTimeTo = 0;
  private swing = 0;
  private sinceFlinch = Infinity;

  constructor(
    body: CharacterBody,
    gravity: number,
    private readonly character: CharacterAsset,
    private readonly events: EventBus<GameEvents>,
  ) {
    this.motor = new CharacterMotor(body, gravity);
    this.model = character.model;
    this.object.add(this.model);
    this.object.position.copy(this.motor.position);

    const light = new THREE.PointLight(HERO_LIGHT.color, HERO_LIGHT.intensity, HERO_LIGHT.range, 2);
    light.position.copy(HERO_LIGHT.offset);
    this.object.add(light);

    this.animator = new CharacterAnimator(
      character.model,
      { idle: character.clip('idle'), walk: character.clip('walk'), run: character.clip('run') },
      { walk: character.groundSpeed('walk'), run: character.groundSpeed('run') },
      { walk: WALK_SPEED, run: RUN_SPEED },
    );

    this.machine = new StateMachine<PlayerState, PlayerController>(
      this,
      {
        move: {
          update: (player, dt) => {
            player.move(dt);
            return player.wantsToAttack() ? 'attack' : undefined;
          },
        },
        attack: {
          enter: (player) => {
            player.attacks.start();
          },
          update: (player, dt) => player.attack(dt),
          exit: (player) => {
            player.animator.stopAction();
          },
        },
        hit: {
          enter: (player) => {
            player.sinceFlinch = 0;
            player.startAction(player.flinch);
          },
          update: (player, dt) => (player.playAction(player.flinch, dt) ? 'move' : undefined),
          exit: (player) => {
            player.animator.stopAction();
          },
        },
        dead: {
          enter: (player) => {
            player.motor.setGhost(true);
            player.startAction(player.death);
            player.events.emit('combat:died', { target: 'player' });
          },
          update: (player, dt) => {
            // Fall with the death animation, then stay put until respawning.
            if (!player.death.finished) player.playAction(player.death, dt);
            return undefined;
          },
        },
      },
      'move',
    );
  }

  get position(): THREE.Vector3 {
    return this.motor.position;
  }

  /** Feet position interpolated for the current frame. */
  get renderPosition(): THREE.Vector3 {
    return this.motor.renderPosition;
  }

  get radius(): number {
    return this.motor.radius;
  }

  get alive(): boolean {
    return !this.health.dead;
  }

  /** Current state, for the debug overlay. */
  get animationState(): string {
    const state = this.machine.state;
    return state === 'move' ? this.animator.state : state;
  }

  get speed(): number {
    return this.motor.speed;
  }

  takeHit(damage: number, fromX: number, fromZ: number): void {
    const taken = this.health.damage(damage);
    if (taken === 0) return;
    this.events.emit('combat:damaged', {
      target: 'player',
      amount: taken,
      health: this.health.current,
      maxHealth: this.health.max,
    });

    if (this.health.dead) {
      this.motor.face(fromX, fromZ);
      this.machine.transition('dead');
    } else if (this.sinceFlinch >= FLINCH_IMMUNITY) {
      this.motor.face(fromX, fromZ);
      this.machine.transition('hit');
    }
  }

  respawn(feet: THREE.Vector3): void {
    this.health.reset();
    this.motor.setGhost(false);
    this.motor.teleport(feet);
    this.motor.facing = 0;
    this.sinceFlinch = Infinity;
    this.machine.transition('move');
    this.animator.reset();
    this.events.emit('player:respawned', undefined);
  }

  fixedUpdate(dt: number, intent: PlayerIntent): void {
    this.intent = intent;
    this.sinceFlinch += dt;
    this.machine.update(dt);
  }

  /** Called after the physics step to record the new position. */
  afterPhysics(dt: number): void {
    this.motor.afterPhysics(dt);
  }

  /** Called once per rendered frame. `alpha` is the fraction between the last two physics steps. */
  render(dt: number, alpha: number): void {
    this.object.position.copy(this.motor.interpolate(alpha));
    this.model.rotation.y = this.motor.facing;

    const moving = this.machine.state === 'move';
    if (!moving) {
      this.animator.setActionTime(THREE.MathUtils.lerp(this.actionTimeFrom, this.actionTimeTo, alpha));
    }
    // Lunges and staggers move the body fast; that isn't running, so locomotion sees zero speed.
    this.animator.update(dt, moving ? this.motor.speed : 0);
  }

  // --- States ----------------------------------------------------------------------------------

  private move(dt: number): void {
    const { input, basis } = this.requireIntent();
    const axis = input.moveAxis();
    let x = basis.forward.x * axis.y + basis.right.x * axis.x;
    let z = basis.forward.z * axis.y + basis.right.z * axis.x;
    const length = Math.hypot(x, z);
    if (length > 0) {
      x /= length;
      z /= length;
      this.motor.turnToward(Math.atan2(x, z), TURN_SHARPNESS, dt);
    }
    const walking = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = walking ? WALK_SPEED : RUN_SPEED;
    this.motor.walk(x * speed, z * speed, dt);
  }

  private attack(dt: number): PlayerState | undefined {
    const { input } = this.requireIntent();
    // A click during a swing, or holding the button, continues the combo.
    if (input.consumePress(MouseButton.Left) || input.isButtonDown(MouseButton.Left)) {
      this.attacks.queueNext();
    }

    const frame = this.attacks.update(dt);
    if (frame.stepStarted) {
      this.swing++;
      // Turn instantly toward the cursor, as action RPGs do when a swing starts.
      const aim = this.intent?.aim;
      if (aim) this.motor.face(aim.x, aim.z);
      this.animator.playAction(this.character.clip(frame.step.clip), frame.previousTime);
    }
    this.actionTimeFrom = frame.previousTime;
    this.actionTimeTo = frame.time;
    this.motor.moveByRootMotion(
      this.character.rootMotion(frame.step.clip),
      frame.previousTime,
      frame.time,
      dt,
    );

    if (frame.hitActive) {
      this.events.emit('combat:strike', {
        attacker: 'player',
        swing: this.swing,
        origin: this.motor.position,
        facing: this.motor.facing,
        range: frame.step.range,
        arc: frame.step.arc,
        damage: frame.step.damage,
      });
    }
    return frame.finished ? 'move' : undefined;
  }

  // --- Helpers ---------------------------------------------------------------------------------

  private startAction(timer: ClipTimer): void {
    timer.restart();
    this.actionTimeFrom = this.actionTimeTo = timer.start;
    this.animator.playAction(this.character.clip(timer.clip), timer.start);
  }

  /** Advances a timed action and its root motion; returns true when it has finished. */
  private playAction(timer: ClipTimer, dt: number): boolean {
    const finished = timer.update(dt);
    this.actionTimeFrom = timer.previous;
    this.actionTimeTo = timer.time;
    this.motor.moveByRootMotion(this.character.rootMotion(timer.clip), timer.previous, timer.time, dt);
    return finished;
  }

  private wantsToAttack(): boolean {
    const { input } = this.requireIntent();
    return input.consumePress(MouseButton.Left) || input.isButtonDown(MouseButton.Left);
  }

  private requireIntent(): PlayerIntent {
    if (!this.intent) throw new Error('PlayerController.fixedUpdate must run before its states');
    return this.intent;
  }
}
