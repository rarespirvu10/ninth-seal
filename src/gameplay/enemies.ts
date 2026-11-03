import type { AttackStep } from './AttackSequence';

/** Everything that makes one kind of enemy behave the way it does. */
export interface EnemyDefinition {
  /** Converted character name under public/assets/characters. */
  character: string;
  /** Height to draw it at, in meters. */
  height: number;
  maxHealth: number;
  /** Notices the player within this distance. */
  aggroRange: number;
  /** Gives up the chase beyond this distance. */
  leashRange: number;
  chaseSpeed: number;
  /** Starts an attack when the player is this close (center to center). */
  attackRange: number;
  /** Pause between attacks, in seconds. */
  attackCooldown: number;
  attack: AttackStep;
  attackRate: number;
  /** Portions of the hit-reaction and death clips to play, and how fast. */
  flinch: { start: number; end: number; rate: number };
  death: { start: number; end: number; rate: number };
  /** Walk/run clips may play this much faster than recorded to keep up with movement. */
  maxPlaybackRate: number;
}

/**
 * A shambling skeleton: slow and weak alone, dangerous in groups.
 * Its claw swing peaks at 1.0 s into the attack clip (measured from the right hand's speed).
 */
export const SKELETON: EnemyDefinition = {
  character: 'skeleton',
  height: 1.9,
  maxHealth: 60,
  aggroRange: 9,
  leashRange: 16,
  chaseSpeed: 1.2,
  attackRange: 1.7,
  attackCooldown: 0.8,
  attack: { clip: 'attack', start: 0.25, end: 1.75, hit: [0.8, 1.2], damage: 12, range: 1.9, arc: 100 },
  attackRate: 1.15,
  flinch: { start: 0, end: 1.0, rate: 1.4 },
  death: { start: 0, end: 2.97, rate: 1 },
  maxPlaybackRate: 3.6,
};

/** Enemy kinds by the name level layouts use. */
export const ENEMY_TYPES: Readonly<Record<string, EnemyDefinition>> = {
  skeleton: SKELETON,
};
