export type LocomotionState = 'idle' | 'walk' | 'run';

/** Below this horizontal speed (m/s) the character counts as standing still. */
const IDLE_THRESHOLD = 0.3;
const MIN_RATE = 0.5;
const DEFAULT_MAX_RATE = 2;

/**
 * Picks the clip for a movement speed: idle when (nearly) still, otherwise walk or run,
 * whichever speed is closer. Uses the measured speed, so pushing into a wall plays idle.
 */
export function selectLocomotionState(
  speed: number,
  walkSpeed: number,
  runSpeed: number,
): LocomotionState {
  if (speed < IDLE_THRESHOLD) return 'idle';
  return speed < (walkSpeed + runSpeed) / 2 ? 'walk' : 'run';
}

/**
 * Playback rate that makes a clip's planted feet move at `speed`, so they don't slide.
 * A negative ground speed (a clip that travels backward) gives a negative rate: played in reverse.
 * The magnitude is clamped so brief speed dips don't produce slow-motion or frantic animation.
 */
export function playbackRate(speed: number, groundSpeed: number, maxRate = DEFAULT_MAX_RATE): number {
  if (groundSpeed === 0) return 1;
  const rate = speed / Math.abs(groundSpeed);
  return Math.sign(groundSpeed) * Math.min(maxRate, Math.max(MIN_RATE, rate));
}
