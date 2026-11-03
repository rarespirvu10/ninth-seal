import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus';

interface TestEvents {
  hit: { damage: number };
  reset: undefined;
}

describe('EventBus', () => {
  it('delivers payloads to subscribers', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('hit', handler);

    bus.emit('hit', { damage: 12 });

    expect(handler).toHaveBeenCalledWith({ damage: 12 });
  });

  it('only notifies subscribers of the emitted event', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('reset', handler);

    bus.emit('hit', { damage: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const unsubscribe = bus.on('hit', handler);

    unsubscribe();
    bus.emit('hit', { damage: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('once() fires a single time', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.once('reset', handler);

    bus.emit('reset', undefined);
    bus.emit('reset', undefined);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('lets a handler unsubscribe during emission without skipping others', () => {
    const bus = new EventBus<TestEvents>();
    const second = vi.fn();
    const unsubscribeFirst = bus.on('hit', () => {
      unsubscribeFirst();
    });
    bus.on('hit', second);

    bus.emit('hit', { damage: 1 });

    expect(second).toHaveBeenCalledTimes(1);
  });
});
