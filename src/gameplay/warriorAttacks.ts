import type { AttackStep } from './AttackSequence';

/**
 * The warrior's three-hit combo: two quick slashes, then a heavy overhead finisher.
 * Hit windows bracket each swing's peak, measured from the right hand's speed in the
 * source animations (slash peaks at 0.70 s and 1.23 s, attack at 0.77 s).
 */
export const WARRIOR_COMBO: readonly AttackStep[] = [
  { clip: 'slash', start: 0.15, end: 0.95, hit: [0.55, 0.85], damage: 15, range: 2.1, arc: 120 },
  { clip: 'slash', start: 0.95, end: 1.7, hit: [1.08, 1.4], damage: 18, range: 2.1, arc: 120 },
  { clip: 'attack', start: 0.2, end: 1.4, hit: [0.6, 0.92], damage: 32, range: 2.4, arc: 90 },
];

/** Plays the source animations faster so attacks feel responsive. */
export const WARRIOR_ATTACK_RATE = 1.3;
