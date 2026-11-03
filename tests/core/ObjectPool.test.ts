import { describe, expect, it, vi } from 'vitest';
import { ObjectPool } from '../../src/core/ObjectPool';

describe('ObjectPool', () => {
  it('creates items on demand and counts them', () => {
    const pool = new ObjectPool(() => ({ value: 0 }));
    const a = pool.acquire();
    const b = pool.acquire();

    expect(a).not.toBe(b);
    expect(pool.size).toBe(2);
    expect(pool.inUse).toBe(2);
  });

  it('reuses released items instead of creating new ones', () => {
    const create = vi.fn(() => ({ value: 0 }));
    const pool = new ObjectPool(create);
    const first = pool.acquire();
    pool.release(first);

    expect(pool.acquire()).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('resets items when they are released', () => {
    const pool = new ObjectPool(
      () => ({ value: 0 }),
      (item) => {
        item.value = 0;
      },
    );
    const item = pool.acquire();
    item.value = 42;
    pool.release(item);

    expect(pool.acquire().value).toBe(0);
  });

  it('preallocates when asked', () => {
    const create = vi.fn(() => ({}));
    const pool = new ObjectPool(create, undefined, 5);

    expect(pool.size).toBe(5);
    expect(pool.inUse).toBe(0);
    for (let i = 0; i < 5; i++) pool.acquire();
    expect(create).toHaveBeenCalledTimes(5);
  });

  it('stays flat under steady churn', () => {
    const pool = new ObjectPool(() => ({}));
    for (let round = 0; round < 100; round++) {
      const items = [pool.acquire(), pool.acquire(), pool.acquire()];
      items.forEach((item) => {
        pool.release(item);
      });
    }
    expect(pool.size).toBe(3);
  });
});
