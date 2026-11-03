import * as THREE from 'three';
import type { CharacterAsset } from '../characters/Character';
import { CharacterAnimator } from '../characters/CharacterAnimator';
import { sampleRootMotion } from '../characters/rootMotion';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { MouseButton, type Input } from '../core/Input';
import { StateMachine } from '../core/StateMachine';
import type { CharacterBody } from '../physics/CharacterBody';
import { AttackSequence } from './AttackSequence';
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

type PlayerState = 'move' | 'attack';

const RUN_SPEED = 4.5;
const WALK_SPEED = 1.4;
const TURN_SHARPNESS = 14;
/** Smoothing for the measured speed that drives animation, so single-step jitter doesn't flicker clips. */
const SPEED_SHARPNESS = 15;
/**
 * Soft light that follows the hero, as in Diablo: keeps the character readable in dark rooms
 * and leaves a pool of light around them. Placed toward the camera so it lights the front.
 */
const HERO_LIGHT = { color: 0xffe2c8, intensity: 30, range: 9, offset: new THREE.Vector3(1.2, 3.2, 1.2) };

/**
 * The player character: a state machine over moving and attacking. Gameplay runs on the fixed
 * physics step; rendering interpolates between the last two steps.
 */
export class PlayerController {
  /** Follows the character's position; holds the hero light, which must not turn with the model. */
  readonly object = new THREE.Group();
  /** Interpolated feet position for this frame. */
  readonly renderPosition = new THREE.Vector3();

  private readonly machine: StateMachine<PlayerState, PlayerController>;
  private readonly attacks = new AttackSequence(WARRIOR_COMBO, WARRIOR_ATTACK_RATE);
  private readonly model: THREE.Object3D;
  private readonly animator: CharacterAnimator;
  private readonly previous = new THREE.Vector3();
  private readonly current = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly step = new THREE.Vector3();
  private readonly motionFrom = { forward: 0, right: 0 };
  private readonly motionTo = { forward: 0, right: 0 };
  private intent: PlayerIntent | null = null;
  private facing = 0;
  /** Measured horizontal speed after collisions, in m/s. */
  private groundSpeed = 0;
  /** Action clip time at the last two fixed steps, interpolated for rendering. */
  private actionTimeFrom = 0;
  private actionTimeTo = 0;
  private swing = 0;

  constructor(
    private readonly body: CharacterBody,
    private readonly gravity: number,
    private readonly character: CharacterAsset,
    private readonly events: EventBus<GameEvents>,
  ) {
    body.getFeetPosition(this.current);
    this.previous.copy(this.current);
    this.renderPosition.copy(this.current);

    this.model = character.model;
    this.object.add(this.model);
    this.object.position.copy(this.current);

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
      },
      'move',
    );
  }

  /** Movement or attack state, for the debug overlay. */
  get animationState(): string {
    return this.machine.state === 'attack' ? 'attacking' : this.animator.state;
  }

  get speed(): number {
    return this.groundSpeed;
  }

  fixedUpdate(dt: number, intent: PlayerIntent): void {
    this.intent = intent;
    this.machine.update(dt);
  }

  /** Called after the physics step to record the new position. */
  afterPhysics(dt: number): void {
    this.previous.copy(this.current);
    this.body.getFeetPosition(this.current);

    // Speed actually achieved after collisions: walking into a wall measures ~0 and plays idle.
    const moved = Math.hypot(this.current.x - this.previous.x, this.current.z - this.previous.z);
    this.groundSpeed += (moved / dt - this.groundSpeed) * (1 - Math.exp(-SPEED_SHARPNESS * dt));
  }

  /** Called once per rendered frame. `alpha` is the fraction between the last two physics steps. */
  render(dt: number, alpha: number): void {
    this.renderPosition.lerpVectors(this.previous, this.current, alpha);
    this.object.position.copy(this.renderPosition);
    this.model.rotation.y = this.facing;

    const attacking = this.machine.state === 'attack';
    if (attacking) {
      this.animator.setActionTime(THREE.MathUtils.lerp(this.actionTimeFrom, this.actionTimeTo, alpha));
    }
    // Lunges move the body fast; that isn't running, so locomotion sees zero speed meanwhile.
    this.animator.update(dt, attacking ? 0 : this.groundSpeed);
  }

  // --- States ----------------------------------------------------------------------------------

  private move(dt: number): void {
    const { input, basis } = this.requireIntent();
    const axis = input.moveAxis();
    this.step
      .copy(basis.forward)
      .multiplyScalar(axis.y)
      .addScaledVector(basis.right, axis.x);
    if (this.step.lengthSq() > 0) this.step.normalize();

    const walking = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = walking ? WALK_SPEED : RUN_SPEED;
    this.velocity.x = this.step.x * speed;
    this.velocity.z = this.step.z * speed;
    this.applyGravity(dt);

    if (this.step.lengthSq() > 0) {
      const target = Math.atan2(this.step.x, this.step.z);
      this.facing = dampAngle(this.facing, target, TURN_SHARPNESS, dt);
    }

    this.body.move(this.step.copy(this.velocity).multiplyScalar(dt));
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
      this.faceAim();
      this.animator.playAction(this.character.clip(frame.step.clip), frame.previousTime);
    }
    this.actionTimeFrom = frame.previousTime;
    this.actionTimeTo = frame.time;

    this.applyRootMotion(frame.step.clip, frame.previousTime, frame.time, dt);

    if (frame.hitActive) {
      this.events.emit('player:strike', {
        swing: this.swing,
        origin: this.current,
        facing: this.facing,
        range: frame.step.range,
        arc: frame.step.arc,
        damage: frame.step.damage,
      });
    }
    return frame.finished ? 'move' : undefined;
  }

  // --- Helpers ---------------------------------------------------------------------------------

  private wantsToAttack(): boolean {
    const { input } = this.requireIntent();
    return input.consumePress(MouseButton.Left) || input.isButtonDown(MouseButton.Left);
  }

  /** Turns instantly toward the cursor, as action RPGs do when an attack starts. */
  private faceAim(): void {
    const aim = this.intent?.aim;
    if (!aim) return;
    const dx = aim.x - this.current.x;
    const dz = aim.z - this.current.z;
    if (dx * dx + dz * dz > 0.01) this.facing = Math.atan2(dx, dz);
  }

  /** Moves the body by the travel extracted from the clip between two clip times. */
  private applyRootMotion(clip: string, from: number, to: number, dt: number): void {
    const curve = this.character.rootMotion(clip);
    this.velocity.x = 0;
    this.velocity.z = 0;
    if (curve) {
      sampleRootMotion(curve, from, this.motionFrom);
      sampleRootMotion(curve, to, this.motionTo);
      const forward = this.motionTo.forward - this.motionFrom.forward;
      const right = this.motionTo.right - this.motionFrom.right;
      // Facing f points along (sin f, cos f); the character's right is (-cos f, sin f).
      const sin = Math.sin(this.facing);
      const cos = Math.cos(this.facing);
      this.step.set(sin * forward - cos * right, 0, cos * forward + sin * right);
    } else {
      this.step.set(0, 0, 0);
    }
    this.applyGravity(dt);
    this.step.y = this.velocity.y * dt;
    this.body.move(this.step);
  }

  private applyGravity(dt: number): void {
    // Keep a small downward push while grounded so ground snapping stays engaged.
    this.velocity.y = this.body.grounded ? -1 : this.velocity.y + this.gravity * dt;
  }

  private requireIntent(): PlayerIntent {
    if (!this.intent) throw new Error('PlayerController.fixedUpdate must run before its states');
    return this.intent;
  }
}

/** Rotates `current` toward `target` along the shortest arc, frame-rate independently. */
function dampAngle(current: number, target: number, sharpness: number, dt: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-sharpness * dt));
}
