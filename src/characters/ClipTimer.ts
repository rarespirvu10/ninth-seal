/** Plays a range of a clip once, on the fixed step, for gameplay-timed actions such as flinching. */
export class ClipTimer {
  private _time: number;
  private _previous: number;

  constructor(
    readonly clip: string,
    readonly start: number,
    readonly end: number,
    readonly rate = 1,
  ) {
    this._time = start;
    this._previous = start;
  }

  get time(): number {
    return this._time;
  }

  /** Clip time before the last update; root motion moves by the difference. */
  get previous(): number {
    return this._previous;
  }

  get finished(): boolean {
    return this._time >= this.end;
  }

  restart(): void {
    this._time = this.start;
    this._previous = this.start;
  }

  /** Advances; returns true once the end is reached. */
  update(dt: number): boolean {
    this._previous = this._time;
    this._time = Math.min(this._time + dt * this.rate, this.end);
    return this.finished;
  }
}
