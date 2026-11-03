import type * as THREE from 'three';
import type { QualityLevel, QualitySettings } from '../render/QualitySettings';

/** Who an event is about: the player, or an enemy by id. */
export type CombatantId = 'player' | number;

/** Extra effects a hit can carry beyond damage. */
export interface HitEffects {
  /** Seconds the target is stunned. */
  stun?: number;
  /** Speed (m/s) the target is shoved away from the attacker. */
  knockback?: number;
}

/**
 * A melee strike in progress. Sent every step of the attacker's hit window; `swing` identifies
 * the swing so each target is hit at most once by it.
 * `origin` is reused between events: read it during the handler, don't keep it.
 */
export interface Strike {
  attacker: CombatantId;
  swing: number;
  origin: THREE.Vector3;
  /** Radians; 0 faces +Z. */
  facing: number;
  range: number;
  /** Degrees. */
  arc: number;
  damage: number;
  effects?: HitEffects;
}

/** A hit on everything within a radius at once (slams, explosions). */
export interface AreaHit {
  attacker: CombatantId;
  /** Center of the area. Reused between events: read it during the handler. */
  origin: THREE.Vector3;
  radius: number;
  damage: number;
  effects?: HitEffects;
}

/** Every event in the game, mapped to its payload type. */
export interface GameEvents {
  'quality:changed': { level: QualityLevel; settings: Readonly<QualitySettings> };
  'combat:strike': Strike;
  'combat:area': AreaHit;
  /** Makes enemies within a radius notice the attacker and come for them (War Cry). */
  'combat:provoke': { origin: THREE.Vector3; radius: number };
  'combat:damaged': {
    target: CombatantId;
    amount: number;
    health: number;
    maxHealth: number;
    /** The target's feet. Reused between events: read it during the handler. */
    position: THREE.Vector3;
  };
  'combat:died': { target: CombatantId };
  'player:respawned': undefined;
}
