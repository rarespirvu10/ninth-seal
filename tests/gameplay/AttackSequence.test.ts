import { describe, expect, it } from 'vitest';
import { AttackSequence, type AttackStep } from '../../src/gameplay/AttackSequence';

const step = (clip: string, start: number, end: number, hit: [number, number]): AttackStep => ({
  clip,
  start,
  end,
  hit,
  damage: 10,
  range: 2,
  arc: 90,
});

const combo = [step('slash', 0, 1, [0.4, 0.6]), step('slash', 1, 2, [1.3, 1.5]), step('heavy', 0, 1.5, [0.7, 0.9])];

/** Runs updates of `dt` until the sequence ends or `max` updates pass; returns every frame. */
function run(sequence: AttackSequence, dt: number, max = 100, onFrame?: (i: number) => void) {
  const frames = [];
  for (let i = 0; i < max && sequence.active; i++) {
    onFrame?.(i);
    frames.push(sequence.update(dt));
  }
  return frames;
}

describe('AttackSequence', () => {
  it('flags the first update of the first step', () => {
    const sequence = new AttackSequence(combo);
    sequence.start();

    const first = sequence.update(0.1);
    const second = sequence.update(0.1);

    expect(first.stepStarted).toBe(true);
    expect(first.step.clip).toBe('slash');
    expect(second.stepStarted).toBe(false);
  });

  it('ends after one step when no follow-up is requested', () => {
    const sequence = new AttackSequence(combo);
    sequence.start();

    const frames = run(sequence, 0.1);

    expect(frames.at(-1)?.finished).toBe(true);
    expect(frames.at(-1)?.time).toBe(1);
    expect(new Set(frames.map((f) => f.stepIndex))).toEqual(new Set([0]));
    expect(sequence.active).toBe(false);
  });

  it('chains into the next step when one is queued', () => {
    const sequence = new AttackSequence(combo);
    sequence.start();

    const frames = run(sequence, 0.1, 100, (i) => {
      if (i === 3) sequence.queueNext();
    });

    const secondStart = frames.find((f) => f.stepIndex === 1);
    expect(secondStart?.stepStarted).toBe(true);
    expect(secondStart?.previousTime).toBe(1);
    expect(frames.at(-1)?.stepIndex).toBe(1);
  });

  it('runs the whole combo while the follow-up is held', () => {
    const sequence = new AttackSequence(combo);
    sequence.start();

    const frames = run(sequence, 0.1, 100, () => {
      sequence.queueNext();
    });

    expect(frames.filter((f) => f.stepStarted).map((f) => f.step.clip)).toEqual(['slash', 'slash', 'heavy']);
    expect(frames.at(-1)?.finished).toBe(true);
  });

  it('reports the hit window only while the update overlaps it', () => {
    const sequence = new AttackSequence(combo);
    sequence.start();

    const frames = run(sequence, 0.1);
    const active = frames.filter((f) => f.hitActive).map((f) => f.time);

    // Updates ending at 0.5 and 0.6 overlap the [0.4, 0.6] window; 0.6 to 0.7 only touches its end.
    expect(active.map((t) => Math.round(t * 10) / 10)).toEqual([0.5, 0.6]);
  });

  it('never skips a hit window, however long the update', () => {
    const sequence = new AttackSequence(combo);
    sequence.start();

    expect(sequence.update(0.9).hitActive).toBe(true);
  });

  it('applies the playback rate to clip time', () => {
    const sequence = new AttackSequence(combo, 2);
    sequence.start();

    expect(sequence.update(0.1).time).toBeCloseTo(0.2);
  });

  it('can be restarted after finishing', () => {
    const sequence = new AttackSequence(combo);
    sequence.start();
    run(sequence, 0.5);

    sequence.start();
    expect(sequence.active).toBe(true);
    expect(sequence.update(0.1).stepStarted).toBe(true);
  });
});
