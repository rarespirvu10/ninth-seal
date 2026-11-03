import { describe, expect, it } from 'vitest';
import { Mana } from '../../src/gameplay/Mana';

describe('Mana', () => {
  it('spends only what it can afford', () => {
    const mana = new Mana(50, 5);
    expect(mana.spend(30)).toBe(true);
    expect(mana.current).toBe(20);
    expect(mana.spend(30)).toBe(false);
    expect(mana.current).toBe(20);
  });

  it('regenerates over time, up to the maximum', () => {
    const mana = new Mana(50, 5);
    mana.spend(20);
    mana.update(2);
    expect(mana.current).toBe(40);
    mana.update(10);
    expect(mana.current).toBe(50);
  });

  it('resets to full', () => {
    const mana = new Mana(50, 5);
    mana.spend(50);
    mana.reset();
    expect(mana.fraction).toBe(1);
  });
});
