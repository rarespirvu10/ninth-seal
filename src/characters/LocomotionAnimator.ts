import * as THREE from 'three';
import { playbackRate, selectLocomotionState, type LocomotionState } from './locomotion';

const CROSSFADE_SECONDS = 0.25;

export interface LocomotionClips {
  idle: THREE.AnimationClip;
  walk: THREE.AnimationClip;
  run: THREE.AnimationClip;
}

export interface LocomotionSpeeds {
  walk: number;
  run: number;
}

/**
 * Drives idle / walk / run from the character's actual speed: crossfades between clips when
 * the state changes and scales playback so the feet stay planted.
 */
export class LocomotionAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<LocomotionState, THREE.AnimationAction>;
  private _state: LocomotionState = 'idle';

  constructor(
    root: THREE.Object3D,
    clips: LocomotionClips,
    /** Speed (m/s) each clip travels at, measured when the character was converted. */
    private readonly groundSpeeds: LocomotionSpeeds,
    /** Gameplay walk and run speeds (m/s). */
    private readonly moveSpeeds: LocomotionSpeeds,
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {
      idle: this.mixer.clipAction(clips.idle),
      walk: this.mixer.clipAction(clips.walk),
      run: this.mixer.clipAction(clips.run),
    };
    this.actions.idle.play();
  }

  get state(): LocomotionState {
    return this._state;
  }

  update(dt: number, speed: number): void {
    const next = selectLocomotionState(speed, this.moveSpeeds.walk, this.moveSpeeds.run);
    if (next !== this._state) {
      const to = this.actions[next];
      to.reset().play();
      this.actions[this._state].crossFadeTo(to, CROSSFADE_SECONDS, false);
      this._state = next;
    }

    if (this._state !== 'idle') {
      this.actions[this._state].timeScale = playbackRate(speed, this.groundSpeeds[this._state]);
    }
    this.mixer.update(dt);
  }
}
