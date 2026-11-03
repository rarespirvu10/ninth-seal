import type * as THREE from 'three';
import type { CharacterMotor } from '../../characters/CharacterMotor';
import type { HitEffects } from '../../core/events';
import type { Combatant } from '../CombatSystem';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  manaCost: number;
  /** Seconds before it can be used again. */
  cooldown: number;
  /** Icon for the skill bar (see src/ui/skillIcons.ts). */
  icon: string;
}

export interface MeleeSpec {
  /** Reach in meters. */
  range: number;
  /** Width in degrees. */
  arc: number;
  damage: number;
  effects?: HitEffects;
}

/**
 * Everything a skill may do with the character using it. Skills only talk to this interface,
 * so new classes' skills plug in without touching the player code.
 */
export interface SkillHost {
  readonly motor: CharacterMotor;
  /** Ground point under the cursor, if any. */
  aimPoint(): THREE.Vector3 | null;
  /** Turns toward the cursor instantly. */
  faceAim(): void;
  /** Starts an action clip; its pose then follows `poseAction`. */
  playAction(clip: string, time: number): void;
  /** Sets the action's pose for this step, from one clip time to the next (smoothed on screen). */
  poseAction(from: number, to: number): void;
  /** Moves by the clip's root motion between two clip times; stands still if it has none. */
  moveByRootMotion(clip: string, from: number, to: number, dt: number): void;
  /** A fresh id for a swing, so each target is hit at most once by it. */
  newSwing(): number;
  /** A melee hit in front of the character; call every step of the hit window. */
  strike(swing: number, spec: MeleeSpec): void;
  /** Hits everything around a point at once. */
  area(center: THREE.Vector3, radius: number, damage: number, effects?: HitEffects): void;
  /** Draws enemies within `radius` into the fight. */
  provoke(radius: number): void;
  /** Multiplies the character's damage for a while. */
  empower(multiplier: number, duration: number): void;
  /** Shows or hides the weapon trail. */
  setSwinging(swinging: boolean): void;
  shockwave(center: THREE.Vector3, radius: number, color: THREE.ColorRepresentation): void;
  shake(amount: number): void;
  enemiesNear(x: number, z: number, radius: number): readonly Combatant[];
}

/** A skill in progress. */
export interface SkillAction {
  /** Advances one fixed step; returns true when the skill has finished. */
  update(dt: number): boolean;
}

/** A skill: data about it, plus how it plays out (a strategy object). */
export interface Skill {
  readonly definition: SkillDefinition;
  begin(host: SkillHost): SkillAction;
}
