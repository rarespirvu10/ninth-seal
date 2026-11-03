/**
 * Reuses objects instead of allocating new ones, so frequently spawned things (damage numbers,
 * projectiles, particles) don't churn the garbage collector mid-combat.
 */
export class ObjectPool<T> {
  private readonly free: T[] = [];
  private created = 0;
  private active = 0;

  constructor(
    private readonly create: () => T,
    /** Returns an item to a clean state when it's released. */
    private readonly reset: (item: T) => void = () => undefined,
    preallocate = 0,
  ) {
    for (let i = 0; i < preallocate; i++) {
      this.free.push(this.create());
      this.created++;
    }
  }

  /** Items currently handed out. */
  get inUse(): number {
    return this.active;
  }

  /** Items ever created; stays flat once the pool has warmed up. */
  get size(): number {
    return this.created;
  }

  acquire(): T {
    let item = this.free.pop();
    if (item === undefined) {
      item = this.create();
      this.created++;
    }
    this.active++;
    return item;
  }

  release(item: T): void {
    this.reset(item);
    this.free.push(item);
    this.active--;
  }
}
