/** Hit points with a maximum. Damage and healing report the amount actually applied. */
export class Health {
  private _current: number;

  constructor(readonly max: number) {
    if (max <= 0) throw new Error('Maximum health must be positive');
    this._current = max;
  }

  get current(): number {
    return this._current;
  }

  /** 0..1, for health bars. */
  get fraction(): number {
    return this._current / this.max;
  }

  get dead(): boolean {
    return this._current <= 0;
  }

  /** Returns the damage taken: never more than what was left, and 0 once dead. */
  damage(amount: number): number {
    if (this.dead || amount <= 0) return 0;
    const taken = Math.min(amount, this._current);
    this._current -= taken;
    return taken;
  }

  /** Returns the health restored: capped at the maximum, and 0 once dead. */
  heal(amount: number): number {
    if (this.dead || amount <= 0) return 0;
    const restored = Math.min(amount, this.max - this._current);
    this._current += restored;
    return restored;
  }

  reset(): void {
    this._current = this.max;
  }
}
