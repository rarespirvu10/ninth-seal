import type * as THREE from 'three';
import type { QualityLevel, QualitySettings } from '../render/QualitySettings';

/** Every event in the game, mapped to its payload type. */
export interface GameEvents {
  'quality:changed': { level: QualityLevel; settings: Readonly<QualitySettings> };
  /**
   * The player's blade is in its hit window this step. Sent every step of the window;
   * `swing` identifies the swing so each target is hit at most once by it.
   * `origin` is reused between events: read it during the handler, don't keep it.
   */
  'player:strike': {
    swing: number;
    origin: THREE.Vector3;
    /** Radians; 0 faces +Z. */
    facing: number;
    range: number;
    /** Degrees. */
    arc: number;
    damage: number;
  };
}
