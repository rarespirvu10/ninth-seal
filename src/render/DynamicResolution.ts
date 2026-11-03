export interface DynamicResolutionOptions {
  /** Frame time to hold, in seconds. */
  targetFrameTime?: number;
  minScale?: number;
  maxScale?: number;
  step?: number;
  /** Seconds of slow frames before lowering resolution. */
  downDelay?: number;
  /** Seconds of on-target frames before trying a higher resolution. */
  upDelay?: number;
  /** Longest wait before retrying a higher resolution after repeated failures. */
  maxUpDelay?: number;
}

/**
 * Lowers render resolution when frames run slow and raises it again once they recover.
 *
 * Browsers cap frame rate at the display's refresh rate, so spare GPU headroom can't be measured
 * directly. Instead, after a stretch of on-target frames we try one step up; if that immediately
 * causes slow frames, we step back down and wait twice as long before trying again.
 */
export class DynamicResolution {
  private _scale: number;
  private readonly target: number;
  private readonly minScale: number;
  private readonly maxScale: number;
  private readonly step: number;
  private readonly downDelay: number;
  private readonly baseUpDelay: number;
  private readonly maxUpDelay: number;

  private averageFrameTime: number;
  private slowTime = 0;
  private stableTime = 0;
  private upDelay: number;
  /** Seconds since the last step up, or Infinity if the last change was a step down. */
  private sinceStepUp = Infinity;

  constructor(options: DynamicResolutionOptions = {}) {
    this.target = options.targetFrameTime ?? 1 / 60;
    this.minScale = options.minScale ?? 0.5;
    this.maxScale = options.maxScale ?? 1;
    this.step = options.step ?? 0.1;
    this.downDelay = options.downDelay ?? 0.5;
    this.baseUpDelay = options.upDelay ?? 3;
    this.maxUpDelay = options.maxUpDelay ?? 30;
    this.upDelay = this.baseUpDelay;
    this._scale = this.maxScale;
    this.averageFrameTime = this.target;
  }

  get scale(): number {
    return this._scale;
  }

  /** Feeds one frame's duration in seconds. Returns true if the scale changed. */
  update(frameTime: number): boolean {
    // Exponential moving average smooths out single-frame spikes.
    this.averageFrameTime += (frameTime - this.averageFrameTime) * 0.1;
    this.sinceStepUp += frameTime;

    // Require the current frame to be slow too, so the average lagging behind a recovery
    // doesn't trigger an extra step down.
    const slow = this.averageFrameTime > this.target * 1.2 && frameTime > this.target * 1.05;
    const onTarget = this.averageFrameTime <= this.target * 1.05;

    this.slowTime = slow ? this.slowTime + frameTime : 0;
    this.stableTime = onTarget ? this.stableTime + frameTime : 0;

    if (this.slowTime >= this.downDelay && this._scale > this.minScale) {
      // Dropping right after a step up means that step was too ambitious: back off longer next time.
      const failedStepUp = this.sinceStepUp < this.baseUpDelay;
      this.upDelay = failedStepUp
        ? Math.min(this.upDelay * 2, this.maxUpDelay)
        : this.baseUpDelay;
      this.setScale(this._scale - this.step);
      this.sinceStepUp = Infinity;
      return true;
    }

    if (this.stableTime >= this.upDelay && this._scale < this.maxScale) {
      this.setScale(this._scale + this.step);
      this.sinceStepUp = 0;
      return true;
    }

    return false;
  }

  reset(): void {
    this._scale = this.maxScale;
    this.averageFrameTime = this.target;
    this.slowTime = 0;
    this.stableTime = 0;
    this.upDelay = this.baseUpDelay;
    this.sinceStepUp = Infinity;
  }

  private setScale(value: number): void {
    // Round to avoid accumulating floating-point drift across many steps.
    const rounded = Math.round(value * 100) / 100;
    this._scale = Math.min(this.maxScale, Math.max(this.minScale, rounded));
    this.slowTime = 0;
    this.stableTime = 0;
  }
}
