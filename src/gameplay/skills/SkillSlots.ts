import type { Skill } from './types';

/** The skills on the bar and their cooldowns. */
export class SkillSlots {
  private readonly remaining: number[];

  constructor(readonly skills: readonly Skill[]) {
    this.remaining = skills.map(() => 0);
  }

  skill(slot: number): Skill | undefined {
    return this.skills[slot];
  }

  ready(slot: number): boolean {
    return this.skills[slot] !== undefined && (this.remaining[slot] ?? 0) <= 0;
  }

  /** Seconds left before the slot can be used again. */
  cooldownRemaining(slot: number): number {
    return this.remaining[slot] ?? 0;
  }

  /** 1 right after use, falling to 0 when ready: for the cooldown sweep on the bar. */
  cooldownFraction(slot: number): number {
    const cooldown = this.skills[slot]?.definition.cooldown ?? 0;
    return cooldown > 0 ? (this.remaining[slot] ?? 0) / cooldown : 0;
  }

  /** Starts the slot's cooldown. */
  trigger(slot: number): void {
    const skill = this.skills[slot];
    if (skill) this.remaining[slot] = skill.definition.cooldown;
  }

  update(dt: number): void {
    for (let i = 0; i < this.remaining.length; i++) {
      this.remaining[i] = Math.max(0, (this.remaining[i] ?? 0) - dt);
    }
  }

  reset(): void {
    this.remaining.fill(0);
  }
}
