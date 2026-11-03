export interface StateDefinition<S extends string, C> {
  enter?(context: C, previous: S | null): void;
  /** Return another state's name to transition to it. `elapsed` is the time spent in this state. */
  update?(context: C, dt: number, elapsed: number): S | undefined;
  exit?(context: C, next: S): void;
}

/**
 * Finite state machine with typed state names. Each state is a set of optional hooks;
 * transitions run the old state's `exit`, then the new state's `enter`.
 */
export class StateMachine<S extends string, C> {
  private _state: S;
  private _elapsed = 0;

  constructor(
    private readonly context: C,
    private readonly states: Readonly<Record<S, StateDefinition<S, C>>>,
    initial: S,
  ) {
    this._state = initial;
    states[initial].enter?.(context, null);
  }

  get state(): S {
    return this._state;
  }

  /** Seconds spent in the current state. */
  get elapsed(): number {
    return this._elapsed;
  }

  transition(next: S): void {
    if (next === this._state) return;
    const previous = this._state;
    this.states[previous].exit?.(this.context, next);
    this._state = next;
    this._elapsed = 0;
    this.states[next].enter?.(this.context, previous);
  }

  update(dt: number): void {
    this._elapsed += dt;
    const next = this.states[this._state].update?.(this.context, dt, this._elapsed);
    if (next !== undefined) this.transition(next);
  }
}
