import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameLoop } from '../../src/core/GameLoop';

function createLoop(fixedHz = 60, maxFrameTime = 0.25) {
  const fixedUpdate = vi.fn();
  const update = vi.fn();
  const loop = new GameLoop({ fixedUpdate, update }, { fixedHz, maxFrameTime });
  return { loop, fixedUpdate, update };
}

describe('GameLoop', () => {
  it('runs one fixed step per fixed interval', () => {
    const { loop, fixedUpdate } = createLoop(50);

    const steps = loop.advance(0.1);

    expect(steps).toBe(5);
    expect(fixedUpdate).toHaveBeenCalledTimes(5);
    expect(fixedUpdate).toHaveBeenCalledWith(0.02);
  });

  it('carries leftover time into the next frame', () => {
    const { loop } = createLoop(10);

    expect(loop.advance(0.15)).toBe(1);
    expect(loop.advance(0.05)).toBe(1);
  });

  it('reports interpolation alpha between fixed steps', () => {
    const { loop, update } = createLoop(10);

    loop.advance(0.125);

    const alpha = update.mock.calls[0]?.[1] as number;
    expect(alpha).toBeCloseTo(0.25);
  });

  it('caps catch-up after a long stall', () => {
    const { loop } = createLoop(10, 0.25);

    const steps = loop.advance(5);

    expect(steps).toBe(2);
  });

  it('ignores negative elapsed time', () => {
    const { loop, fixedUpdate } = createLoop();

    loop.advance(-1);

    expect(fixedUpdate).not.toHaveBeenCalled();
  });
});

describe('GameLoop scheduling', () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps running after a frame throws', () => {
    const update = vi.fn().mockImplementationOnce(() => {
      throw new Error('bad frame');
    });
    const loop = new GameLoop({ fixedUpdate: vi.fn(), update });
    loop.start();

    expect(() => frames[0]?.(0)).toThrow('bad frame');
    expect(frames).toHaveLength(2); // The next frame was still scheduled.

    frames[1]?.(16);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('stops requesting frames after stop()', () => {
    const loop = new GameLoop({ fixedUpdate: vi.fn(), update: vi.fn() });
    loop.start();
    loop.stop();

    expect(loop.running).toBe(false);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
