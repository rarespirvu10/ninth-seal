import type * as THREE from 'three';
import type { QualityLevel, QualitySettings } from '../render/QualitySettings';

/** Who an event is about: the player, or an enemy by id. */
export type CombatantId = 'player' | number;

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
}

/** Every event in the game, mapped to its payload type. */
export interface GameEvents {
  'quality:changed': { level: QualityLevel; settings: Readonly<QualitySettings> };
  'combat:strike': Strike;
  'combat:damaged': {
    target: CombatantId;
    amount: number;
    health: number;
    maxHealth: number;
  };
  'combat:died': { target: CombatantId };
  'player:respawned': undefined;
}
