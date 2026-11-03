import * as THREE from 'three';
import type { CharacterAsset } from '../characters/Character';
import { CharacterAnimator } from '../characters/CharacterAnimator';
import { CharacterMotor } from '../characters/CharacterMotor';
import { ClipTimer } from '../characters/ClipTimer';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { StateMachine, type StateDefinition } from '../core/StateMachine';
import type { CharacterBody } from '../physics/CharacterBody';
import { AttackSequence } from './AttackSequence';
import type { Combatant } from './CombatSystem';
import type { EnemyDefinition } from './enemies';
import { Health } from './Health';

export type EnemyState = 'idle' | 'chase' | 'attack' | 'hit' | 'dead';

/** What an enemy needs to know about its target. */
export interface EnemyTarget {
  readonly position: THREE.Vector3;
  readonly alive: boolean;
}

const TURN_SHARPNESS = 6;

/**
 * An AI-driven enemy. Its brain is a state machine:
 * idle -> chase (player within aggro range) -> attack (in reach, cooldown ready) -> chase,
 * with hit (flinch) and dead reachable from any state when struck.
 */
export class Enemy implements Combatant {
  readonly object = new THREE.Group();
  readonly health: Health;

  private readonly motor: CharacterMotor;
  private readonly animator: CharacterAnimator;
  private readonly machine: StateMachine<EnemyState, Enemy>;
  private readonly attacks: AttackSequence;
  private readonly flinch: ClipTimer;
  private readonly death: ClipTimer;
  private readonly spawn: THREE.Vector3;
  private readonly spawnFacing: number;
  private actionTimeFrom = 0;
  private actionTimeTo = 0;
  private swing = 0;
  private cooldown = 0;

  constructor(
    readonly id: number,
    private readonly definition: EnemyDefinition,
    private readonly character: CharacterAsset,
    /** This enemy's own copy of the character's model. */
    private readonly model: THREE.Object3D,
    body: CharacterBody,
    gravity: number,
    facing: number,
    private readonly target: EnemyTarget,
    private readonly events: EventBus<GameEvents>,
  ) {
    this.health = new Health(definition.maxHealth);
    this.motor = new CharacterMotor(body, gravity);
    this.motor.facing = facing;
    this.spawn = this.motor.position.clone();
    this.spawnFacing = facing;
    this.attacks = new AttackSequence([definition.attack], definition.attackRate);
    this.flinch = new ClipTimer('hit', definition.flinch.start, definition.flinch.end, definition.flinch.rate);
    this.death = new ClipTimer('death', definition.death.start, definition.death.end, definition.death.rate);

    this.object.add(model);
    this.object.position.copy(this.motor.position);
    model.rotation.y = facing;

    const walkSpeed = character.groundSpeed('walk');
    this.animator = new CharacterAnimator(
      model,
      { idle: character.clip('idle'), walk: character.clip('walk'), run: character.optionalClip('run') },
      { walk: walkSpeed, run: character.optionalGroundSpeed('run') ?? walkSpeed },
      // Chasing counts as running (the run clip if there is one); slower approaches walk.
      { walk: definition.chaseSpeed * 0.4, run: definition.chaseSpeed },
      { maxPlaybackRate: definition.maxPlaybackRate },
    );

    this.machine = new StateMachine<EnemyState, Enemy>(this, Enemy.states, 'idle');
  }

  private static readonly states = {
    idle: {
      update: (enemy: Enemy, dt: number) => {
        enemy.motor.hold(dt);
        return enemy.targetDistance() < enemy.definition.aggroRange ? ('chase' as const) : undefined;
      },
    },
    chase: {
      update: (enemy: Enemy, dt: number) => {
        const distance = enemy.targetDistance();
        if (distance > enemy.definition.leashRange) return 'idle' as const;

        const { x, z } = enemy.target.position;
        enemy.motor.turnToward(enemy.motor.angleTo(x, z), TURN_SHARPNESS, dt);
        if (distance <= enemy.definition.attackRange) {
          // In reach: stop pushing into the target and swing when ready.
          enemy.motor.hold(dt);
          return enemy.cooldown <= 0 ? ('attack' as const) : undefined;
        }
        // Walk the way it faces, so it curves toward the target instead of sliding sideways.
        const speed = enemy.definition.chaseSpeed;
        enemy.motor.walk(Math.sin(enemy.motor.facing) * speed, Math.cos(enemy.motor.facing) * speed, dt);
        return undefined;
      },
    },
    attack: {
      enter: (enemy: Enemy) => {
        enemy.attacks.start();
      },
      update: (enemy: Enemy, dt: number) => enemy.attack(dt),
      exit: (enemy: Enemy) => {
        enemy.cooldown = enemy.definition.attackCooldown;
        enemy.animator.stopAction();
      },
    },
    hit: {
      enter: (enemy: Enemy) => {
        enemy.startAction(enemy.flinch);
      },
      update: (enemy: Enemy, dt: number) => (enemy.playAction(enemy.flinch, dt) ? ('chase' as const) : undefined),
      exit: (enemy: Enemy) => {
        enemy.animator.stopAction();
      },
    },
    dead: {
      enter: (enemy: Enemy) => {
        // A ghost from the first frame: walkable through, and impossible to push.
        enemy.motor.setGhost(true);
        enemy.startAction(enemy.death);
        enemy.events.emit('combat:died', { target: enemy.id });
      },
      update: (enemy: Enemy, dt: number) => {
        // Fall with the death animation's root motion, then never move again: the body stays
        // where it landed, as part of the floor.
        if (!enemy.death.finished) enemy.playAction(enemy.death, dt);
        return undefined;
      },
    },
  } satisfies Record<EnemyState, StateDefinition<EnemyState, Enemy>>;

  get position(): THREE.Vector3 {
    return this.motor.position;
  }

  get renderPosition(): THREE.Vector3 {
    return this.motor.renderPosition;
  }

  get radius(): number {
    return this.motor.radius;
  }

  get height(): number {
    return this.definition.height;
  }

  get alive(): boolean {
    return !this.health.dead;
  }

  get state(): EnemyState {
    return this.machine.state;
  }


  takeHit(damage: number, fromX: number, fromZ: number): void {
    const taken = this.health.damage(damage);
    if (taken === 0) return;
    this.events.emit('combat:damaged', {
      target: this.id,
      amount: taken,
      health: this.health.current,
      maxHealth: this.health.max,
    });

    // Turn toward the attacker: staggers push back away from the blow, and it fights back.
    this.motor.face(fromX, fromZ);
    if (this.health.dead) {
      this.machine.transition('dead');
    } else if (this.machine.state === 'hit') {
      this.startAction(this.flinch); // Flinch again from the start.
    } else {
      this.machine.transition('hit');
    }
  }

  respawn(): void {
    this.health.reset();
    this.motor.setGhost(false);
    this.motor.teleport(this.spawn);
    this.motor.facing = this.spawnFacing;
    this.cooldown = 0;
    this.machine.transition('idle');
    this.animator.reset();
  }

  fixedUpdate(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.machine.update(dt);
  }

  afterPhysics(dt: number): void {
    this.motor.afterPhysics(dt);
  }

  render(dt: number, alpha: number): void {
    this.object.position.copy(this.motor.interpolate(alpha));
    this.model.rotation.y = this.motor.facing;

    const state = this.machine.state;
    const acting = state === 'attack' || state === 'hit' || state === 'dead';
    if (acting) {
      this.animator.setActionTime(THREE.MathUtils.lerp(this.actionTimeFrom, this.actionTimeTo, alpha));
    }
    this.animator.update(dt, acting ? 0 : this.motor.speed);
  }

  // --- Helpers ---------------------------------------------------------------------------------

  private targetDistance(): number {
    if (!this.target.alive) return Infinity;
    return this.motor.distanceTo(this.target.position.x, this.target.position.z);
  }

  private attack(dt: number): EnemyState | undefined {
    const frame = this.attacks.update(dt);
    if (frame.stepStarted) {
      this.swing++;
      this.motor.face(this.target.position.x, this.target.position.z);
      this.animator.playAction(this.character.clip(frame.step.clip), frame.previousTime);
    }
    this.actionTimeFrom = frame.previousTime;
    this.actionTimeTo = frame.time;
    this.motor.moveByRootMotion(this.character.rootMotion(frame.step.clip), frame.previousTime, frame.time, dt);

    if (frame.hitActive) {
      this.events.emit('combat:strike', {
        attacker: this.id,
        swing: this.swing,
        origin: this.motor.position,
        facing: this.motor.facing,
        range: frame.step.range,
        arc: frame.step.arc,
        damage: frame.step.damage,
      });
    }
    return frame.finished ? 'chase' : undefined;
  }

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
}
