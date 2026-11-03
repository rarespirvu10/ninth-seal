import { isQualityLevel, type QualityLevel } from './QualitySettings';

const STORAGE_KEY = 'ninth-seal:quality';

/** The player's saved quality choice, or null to auto-detect. */
export function loadQualityPreference(): QualityLevel | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isQualityLevel(stored) ? stored : null;
  } catch {
    // Storage can be unavailable (privacy modes, sandboxed iframes); fall back to auto-detect.
    return null;
  }
}

export function saveQualityPreference(level: QualityLevel): void {
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // Not critical: the choice just won't persist.
  }
}
