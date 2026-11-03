/** One swing of a combo, timed against its animation clip. */
export interface AttackStep {
  clip: string;
  /** Clip time (seconds) where this swing starts and ends. */
  start: number;
  end: number;
  /** Clip time window in which the blade can connect. */
  hit: readonly [number, number];
  damage: number;
  /** Reach in meters and arc in degrees, in front of the attacker. */
  range: number;
  arc: number;
}

export interface AttackFrame {
  step: AttackStep;
  stepIndex: number;
  /** Clip time at the start and end of this update; root motion moves by the difference. */
  previousTime: number;
  time: number;
  /** First update of this step: aim and start its animation. */
  stepStarted: boolean;
  /** This update overlaps the step's hit window. */
  hitActive: boolean;
  /** The combo ended with this update. */
  finished: boolean;
}

/**
 * Plays a combo step by step. Each step runs to its end; if the next one was requested
 * (a click during the swing, or the button held), it follows, otherwise the combo ends.
 */
export class AttackSequence {
  private index = 0;
  private time = 0;
  private queued = false;
  private pendingStart = false;
  private _active = false;

  constructor(
    private readonly steps: readonly AttackStep[],
    /** Playback speed; above 1 makes the source animations snappier. */
    private readonly rate = 1,
  ) {
    if (steps.length === 0) throw new Error('An attack sequence needs at least one step');
  }

  get active(): boolean {
    return this._active;
  }

  start(): void {
    this.index = 0;
    this.time = this.current.start;
    this.queued = false;
    this.pendingStart = true;
    this._active = true;
  }

  /** Requests the next step; it starts when the current one ends. Ignored on the last step. */
  queueNext(): void {
    if (this._active && this.index < this.steps.length - 1) this.queued = true;
  }

  update(dt: number): AttackFrame {
    const step = this.current;
    const stepIndex = this.index;
    const stepStarted = this.pendingStart;
    this.pendingStart = false;

    const previousTime = this.time;
    const time = Math.min(previousTime + dt * this.rate, step.end);
    this.time = time;
    const hitActive = time > step.hit[0] && previousTime < step.hit[1];

    let finished = false;
    if (time >= step.end) {
      if (this.queued) {
        // The next step begins on the following update.
        this.index++;
        this.time = this.current.start;
        this.queued = false;
        this.pendingStart = true;
      } else {
        finished = true;
        this._active = false;
      }
    }

    return { step, stepIndex, previousTime, time, stepStarted, hitActive, finished };
  }

  private get current(): AttackStep {
    const step = this.steps[this.index];
    if (!step) throw new Error(`No attack step ${this.index}`);
    return step;
  }
}
