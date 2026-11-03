import type { QualityLevel, QualitySettings } from '../render/QualitySettings';

/** Every event in the game, mapped to its payload type. */
export interface GameEvents {
  'quality:changed': { level: QualityLevel; settings: Readonly<QualitySettings> };
}
