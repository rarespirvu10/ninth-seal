const STEP_EPSILON = 1e-9;

export interface LoopCallbacks {
  /** Runs at a fixed rate. Physics and gameplay logic go here. */
  fixedUpdate(dt: number): void;
  /**
   * Runs once per rendered frame.
   * `alpha` (0..1) is how far we are between the last and next fixed step, for interpolation.
   */
  update(dt: number, alpha: number): void;
}

export interface LoopOptions {
  /** Fixed simulation rate in Hz. */
  fixedHz?: number;
  /** Longest frame (seconds) the loop will catch up on, to avoid a spiral of death after stalls. */
  maxFrameTime?: number;
}

/**
 * Fixed-timestep game loop: simulation runs at a constant rate regardless of frame rate,
 * rendering runs as fast as the display allows.
 */
export class GameLoop {
  readonly fixedDelta: number;
  private readonly maxFrameTime: number;
  private accumulator = 0;
  private lastTime: number | null = null;
  private frameId: number | null = null;

  constructor(
    private readonly callbacks: LoopCallbacks,
    options: LoopOptions = {},
  ) {
    this.fixedDelta = 1 / (options.fixedHz ?? 60);
    this.maxFrameTime = options.maxFrameTime ?? 0.25;
  }

  get running(): boolean {
    return this.frameId !== null;
  }

  start(): void {
    if (this.running) return;
    this.lastTime = null;
    this.frameId = requestAnimationFrame(this.onFrame);
  }

  stop(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  /**
   * Advances the loop by `elapsed` real seconds. Returns how many fixed steps ran.
   * Called by the animation frame callback; public so the timing logic can be tested directly.
   */
  advance(elapsed: number): number {
    const frameTime = Math.min(Math.max(elapsed, 0), this.maxFrameTime);
    this.accumulator += frameTime;

    let steps = 0;
    // Epsilon absorbs floating-point drift so e.g. 0.1s at 50 Hz yields 5 steps, not 4.
    while (this.accumulator + STEP_EPSILON >= this.fixedDelta) {
      this.callbacks.fixedUpdate(this.fixedDelta);
      this.accumulator = Math.max(this.accumulator - this.fixedDelta, 0);
      steps++;
    }

    this.callbacks.update(frameTime, this.accumulator / this.fixedDelta);
    return steps;
  }

  private readonly onFrame = (time: number): void => {
    // Schedule the next frame first: if this one throws, the error is still reported,
    // but the game keeps running instead of freezing for good.
    this.frameId = requestAnimationFrame(this.onFrame);
    const elapsed = this.lastTime === null ? 0 : (time - this.lastTime) / 1000;
    this.lastTime = time;
    this.advance(elapsed);
  };
}
