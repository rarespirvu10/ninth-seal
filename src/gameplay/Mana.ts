/** A spendable resource that refills over time. */
export class Mana {
  private _current: number;

  constructor(
    readonly max: number,
    /** Points restored per second. */
    readonly regen: number,
  ) {
    if (max <= 0) throw new Error('Maximum mana must be positive');
    this._current = max;
  }

  get current(): number {
    return this._current;
  }

  /** 0..1, for the mana orb. */
  get fraction(): number {
    return this._current / this.max;
  }

  canAfford(cost: number): boolean {
    return this._current >= cost;
  }

  /** Spends `cost` if there's enough; returns whether it was spent. */
  spend(cost: number): boolean {
    if (!this.canAfford(cost)) return false;
    this._current -= cost;
    return true;
  }

  update(dt: number): void {
    this._current = Math.min(this.max, this._current + this.regen * dt);
  }

  reset(): void {
    this._current = this.max;
  }
}
