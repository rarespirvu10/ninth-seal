import { describe, expect, it } from 'vitest';
import { Health } from '../../src/gameplay/Health';

describe('Health', () => {
  it('starts full', () => {
    const health = new Health(100);
    expect(health.current).toBe(100);
    expect(health.fraction).toBe(1);
    expect(health.dead).toBe(false);
  });

  it('reports damage taken, never more than what is left', () => {
    const health = new Health(30);
    expect(health.damage(20)).toBe(20);
    expect(health.damage(20)).toBe(10);
    expect(health.current).toBe(0);
    expect(health.dead).toBe(true);
  });

  it('ignores damage and healing once dead', () => {
    const health = new Health(10);
    health.damage(10);
    expect(health.damage(5)).toBe(0);
    expect(health.heal(5)).toBe(0);
  });

  it('caps healing at the maximum', () => {
    const health = new Health(50);
    health.damage(10);
    expect(health.heal(30)).toBe(10);
    expect(health.current).toBe(50);
  });

  it('ignores negative amounts', () => {
    const health = new Health(50);
    expect(health.damage(-5)).toBe(0);
    expect(health.heal(-5)).toBe(0);
    expect(health.current).toBe(50);
  });

  it('resets to full, reviving the dead', () => {
    const health = new Health(40);
    health.damage(40);
    health.reset();
    expect(health.current).toBe(40);
    expect(health.dead).toBe(false);
  });

  it('rejects a non-positive maximum', () => {
    expect(() => new Health(0)).toThrow();
  });
});
