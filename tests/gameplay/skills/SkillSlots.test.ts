import { describe, expect, it } from 'vitest';
import { SkillSlots } from '../../../src/gameplay/skills/SkillSlots';
import type { Skill } from '../../../src/gameplay/skills/types';

const skill = (cooldown: number): Skill => ({
  definition: { id: 'test', name: 'Test', description: '', manaCost: 0, cooldown, icon: 'test' },
  begin: () => ({ update: () => true }),
});

describe('SkillSlots', () => {
  it('starts with every skill ready', () => {
    const slots = new SkillSlots([skill(2), skill(5)]);
    expect(slots.ready(0)).toBe(true);
    expect(slots.ready(1)).toBe(true);
  });

  it('is not ready during its cooldown, then ready again', () => {
    const slots = new SkillSlots([skill(2)]);
    slots.trigger(0);
    expect(slots.ready(0)).toBe(false);
    expect(slots.cooldownFraction(0)).toBe(1);

    slots.update(1);
    expect(slots.cooldownFraction(0)).toBe(0.5);
    expect(slots.cooldownRemaining(0)).toBe(1);

    slots.update(1);
    expect(slots.ready(0)).toBe(true);
  });

  it('tracks each slot separately', () => {
    const slots = new SkillSlots([skill(2), skill(5)]);
    slots.trigger(1);
    expect(slots.ready(0)).toBe(true);
    expect(slots.ready(1)).toBe(false);
  });

  it('treats empty slots as never ready', () => {
    const slots = new SkillSlots([skill(2)]);
    expect(slots.ready(3)).toBe(false);
  });

  it('resets every cooldown', () => {
    const slots = new SkillSlots([skill(2), skill(5)]);
    slots.trigger(0);
    slots.trigger(1);
    slots.reset();
    expect(slots.ready(0) && slots.ready(1)).toBe(true);
  });
});
