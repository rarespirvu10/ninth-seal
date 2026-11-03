import { ClipTimer } from '../../characters/ClipTimer';
import type { SkillAction, SkillHost } from './types';

export interface TimelineOptions {
  clip: string;
  /** Clip time (seconds) to play from and to. */
  start: number;
  end: number;
  rate?: number;
  /** One-off events at clip times (a roar, a slam's impact). */
  cues?: readonly { at: number; fire: () => void }[];
  /** Run on every step that overlaps the window (melee hit windows). */
  windows?: readonly { from: number; to: number; during: () => void }[];
  /** Clip-time range in which the weapon trail shows. */
  trail?: readonly [number, number];
}

/**
 * The common shape of a skill: play part of an animation, moving with its root motion, and fire
 * events at set moments in it. Most skills are just a timeline with different numbers.
 */
export class ClipTimeline implements SkillAction {
  private readonly timer: ClipTimer;
  private readonly fired = new Set<number>();
  private started = false;

  constructor(
    private readonly host: SkillHost,
    private readonly options: TimelineOptions,
  ) {
    this.timer = new ClipTimer(options.clip, options.start, options.end, options.rate ?? 1);
  }

  update(dt: number): boolean {
    const { clip, cues = [], windows = [], trail } = this.options;
    if (!this.started) {
      this.host.playAction(clip, this.timer.start);
      this.started = true;
    }

    const finished = this.timer.update(dt);
    const from = this.timer.previous;
    const to = this.timer.time;
    this.host.poseAction(from, to);
    this.host.moveByRootMotion(clip, from, to, dt);

    cues.forEach((cue, i) => {
      if (!this.fired.has(i) && to >= cue.at) {
        this.fired.add(i);
        cue.fire();
      }
    });
    for (const window of windows) {
      if (to > window.from && from < window.to) window.during();
    }
    if (trail) this.host.setSwinging(to >= trail[0] && to <= trail[1]);
    return finished;
  }
}
