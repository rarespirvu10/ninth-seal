import * as THREE from 'three';
import { playbackRate, selectLocomotionState, type LocomotionState } from './locomotion';

const LOCOMOTION_FADE = 0.25;
const ACTION_FADE_IN = 0.08;
const ACTION_FADE_OUT = 0.25;

export interface LocomotionClips {
  idle: THREE.AnimationClip;
  walk: THREE.AnimationClip;
  /** Optional: without it, the walk clip plays faster for every speed. */
  run?: THREE.AnimationClip | undefined;
}

export interface LocomotionSpeeds {
  walk: number;
  run: number;
}

export interface AnimatorOptions {
  /** Fastest the walk/run clips may play to keep up with movement. */
  maxPlaybackRate?: number;
}

/**
 * Animates a character in two layers of responsibility:
 * - Locomotion: idle / walk / run chosen from actual speed, crossfaded, with playback scaled so
 *   the feet stay planted.
 * - Actions: one-off clips (attacks, hit reactions, death) that take over from locomotion.
 *   Their time is set by gameplay code each frame rather than advanced by the mixer, so the
 *   pose always matches gameplay state such as hit windows and root motion.
 */
export class CharacterAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly locomotion: Record<LocomotionState, THREE.AnimationAction>;
  private readonly maxPlaybackRate: number | undefined;
  private readonly hasRun: boolean;
  private locomotionState: LocomotionState = 'idle';
  private action: THREE.AnimationAction | null = null;

  constructor(
    private readonly root: THREE.Object3D,
    clips: LocomotionClips,
    /** Speed (m/s) each clip travels at, at the character's in-game scale. */
    private readonly groundSpeeds: LocomotionSpeeds,
    /** Gameplay walk and run speeds (m/s). */
    private readonly moveSpeeds: LocomotionSpeeds,
    options: AnimatorOptions = {},
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    const walk = this.mixer.clipAction(clips.walk);
    this.locomotion = {
      idle: this.mixer.clipAction(clips.idle),
      walk,
      // Without a run clip, "run" is the walk action itself (selectState maps run to walk).
      run: clips.run ? this.mixer.clipAction(clips.run) : walk,
    };
    this.hasRun = clips.run !== undefined;
    this.maxPlaybackRate = options.maxPlaybackRate;
    this.locomotion.idle.play();
  }


  /** The locomotion clip playing, or "action" while an action has taken over. */
  get state(): LocomotionState | 'action' {
    return this.action ? 'action' : this.locomotionState;
  }

  /** Starts an action clip, fading out whatever is playing. Its time is set with `setActionTime`. */
  playAction(clip: THREE.AnimationClip, startTime = 0): void {
    const next = this.mixer.clipAction(clip, this.root);
    if (next === this.action) return; // Already playing: the caller just keeps driving its time.

    next.reset();
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.timeScale = 0; // Time is driven externally.
    next.time = startTime;
    next.play();

    const from = this.action ?? this.locomotion[this.locomotionState];
    from.crossFadeTo(next, ACTION_FADE_IN, false);
    this.action = next;
  }

  /** Drops any action and snaps back to idle with no fade (respawning). */
  reset(): void {
    this.mixer.stopAllAction();
    this.action = null;
    this.locomotionState = 'idle';
    this.locomotion.idle.reset().play();
  }

  setActionTime(time: number): void {
    if (this.action) this.action.time = time;
  }

  /**
   * Ends the current action and fades back into locomotion.
   * `hold` keeps the action's last pose instead (used for death).
   */
  stopAction({ hold = false }: { hold?: boolean } = {}): void {
    if (!this.action || hold) return;
    const back = this.locomotion[this.locomotionState];
    back.reset().play();
    this.action.crossFadeTo(back, ACTION_FADE_OUT, false);
    this.action = null;
  }

  update(dt: number, speed: number): void {
    let next = selectLocomotionState(speed, this.moveSpeeds.walk, this.moveSpeeds.run);
    if (next === 'run' && !this.hasRun) next = 'walk';
    if (next !== this.locomotionState) {
      // While an action plays, only track the state so locomotion resumes with the right clip.
      if (!this.action) {
        const to = this.locomotion[next];
        to.reset().play();
        this.locomotion[this.locomotionState].crossFadeTo(to, LOCOMOTION_FADE, false);
      }
      this.locomotionState = next;
    }

    if (this.locomotionState !== 'idle') {
      this.locomotion[this.locomotionState].timeScale = playbackRate(
        speed,
        this.groundSpeeds[this.locomotionState],
        this.maxPlaybackRate,
      );
    }
    this.mixer.update(dt);
  }
}
