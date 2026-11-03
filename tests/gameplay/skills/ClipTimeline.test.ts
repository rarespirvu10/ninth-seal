import { describe, expect, it, vi } from 'vitest';
import { ClipTimeline } from '../../../src/gameplay/skills/ClipTimeline';
import type { SkillHost } from '../../../src/gameplay/skills/types';

function fakeHost() {
  const calls = {
    playAction: vi.fn(),
    poseAction: vi.fn(),
    moveByRootMotion: vi.fn(),
    setSwinging: vi.fn(),
  };
  return { calls, host: calls as unknown as SkillHost };
}

describe('ClipTimeline', () => {
  it('starts the clip once, then poses and moves it every step', () => {
    const { calls, host } = fakeHost();
    const timeline = new ClipTimeline(host, { clip: 'slam', start: 0.2, end: 1 });

    timeline.update(0.1);
    timeline.update(0.1);

    expect(calls.playAction).toHaveBeenCalledTimes(1);
    expect(calls.playAction).toHaveBeenCalledWith('slam', 0.2);
    expect(calls.poseAction).toHaveBeenLastCalledWith(expect.closeTo(0.3), expect.closeTo(0.4));
    expect(calls.moveByRootMotion).toHaveBeenCalledTimes(2);
  });

  it('fires each cue once, when its time is reached', () => {
    const { host } = fakeHost();
    const fire = vi.fn();
    const timeline = new ClipTimeline(host, { clip: 'roar', start: 0, end: 1, cues: [{ at: 0.45, fire }] });

    for (let i = 0; i < 4; i++) timeline.update(0.1);
    expect(fire).not.toHaveBeenCalled();
    for (let i = 0; i < 4; i++) timeline.update(0.1);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('runs windows on every step that overlaps them', () => {
    const { host } = fakeHost();
    const during = vi.fn();
    const timeline = new ClipTimeline(host, { clip: 'cut', start: 0, end: 1, windows: [{ from: 0.25, to: 0.5, during }] });

    for (let i = 0; i < 8; i++) timeline.update(0.125);
    // Steps ending at 0.375 and 0.5 overlap the window; those ending at 0.25 and 0.625 only touch it.
    expect(during).toHaveBeenCalledTimes(2);
  });

  it('applies the playback rate and reports when it finishes', () => {
    const { host } = fakeHost();
    const timeline = new ClipTimeline(host, { clip: 'cut', start: 0, end: 1, rate: 2 });

    expect(timeline.update(0.25)).toBe(false);
    expect(timeline.update(0.25)).toBe(true);
  });

  it('shows the weapon trail only within its range', () => {
    const { calls, host } = fakeHost();
    const timeline = new ClipTimeline(host, { clip: 'cut', start: 0, end: 1, trail: [0.3, 0.6] });

    timeline.update(0.2);
    expect(calls.setSwinging).toHaveBeenLastCalledWith(false);
    timeline.update(0.2);
    expect(calls.setSwinging).toHaveBeenLastCalledWith(true);
    timeline.update(0.4);
    expect(calls.setSwinging).toHaveBeenLastCalledWith(false);
  });
});
