import type * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { AreaHit, CombatantId, GameEvents, HitEffects, Strike } from '../core/events';
import { inMeleeArc } from './meleeArc';

/** Anything that can be struck. */
export interface Combatant {
  readonly id: CombatantId;
  /** Feet position after the latest physics step. */
  readonly position: THREE.Vector3;
  readonly radius: number;
  readonly alive: boolean;
  /** Applies a hit; `fromX`/`fromZ` is where it came from, for facing or knock-back. */
  takeHit(damage: number, fromX: number, fromZ: number, effects?: HitEffects): void;
  /** Notices an attacker announced from a distance (enemies only). */
  provoke?(): void;
}

/**
 * Resolves melee strikes. Attackers only announce strikes on the event bus; this system decides
 * who they connect with, so neither side needs to know about the other.
 * Rules: each swing hits a target at most once; the player hits enemies, enemies hit the player.
 */
export class CombatSystem {
  /** For each attacker, the swing in progress and who it has already hit. */
  private readonly swings = new Map<CombatantId, { swing: number; hit: Set<CombatantId> }>();
  private readonly unsubscribe: (() => void)[];

  constructor(
    events: EventBus<GameEvents>,
    private readonly player: Combatant,
    private readonly enemies: readonly Combatant[],
  ) {
    this.unsubscribe = [
      events.on('combat:strike', (strike) => {
        this.resolve(strike);
      }),
      events.on('combat:area', (area) => {
        this.resolveArea(area);
      }),
      events.on('combat:provoke', ({ origin, radius }) => {
        for (const enemy of this.enemies) {
          if (enemy.alive && distance(enemy.position, origin.x, origin.z) <= radius) enemy.provoke?.();
        }
      }),
    ];
  }

  /** Living enemies whose bodies reach within `radius` of a point, nearest first. */
  enemiesNear(x: number, z: number, radius: number): Combatant[] {
    return this.enemies
      .filter((enemy) => enemy.alive && distance(enemy.position, x, z) - enemy.radius <= radius)
      .sort((a, b) => distance(a.position, x, z) - distance(b.position, x, z));
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribe) unsubscribe();
  }

  private resolveArea(area: AreaHit): void {
    const targets = area.attacker === 'player' ? this.enemies : [this.player];
    for (const target of targets) {
      if (!target.alive) continue;
      if (distance(target.position, area.origin.x, area.origin.z) - target.radius <= area.radius) {
        target.takeHit(area.damage, area.origin.x, area.origin.z, area.effects);
      }
    }
  }

  private resolve(strike: Strike): void {
    let record = this.swings.get(strike.attacker);
    if (record?.swing !== strike.swing) {
      record = { swing: strike.swing, hit: new Set() };
      this.swings.set(strike.attacker, record);
    }

    const targets = strike.attacker === 'player' ? this.enemies : [this.player];
    const swing = {
      originX: strike.origin.x,
      originZ: strike.origin.z,
      facing: strike.facing,
      range: strike.range,
      arc: strike.arc,
    };
    for (const target of targets) {
      if (!target.alive || record.hit.has(target.id)) continue;
      if (inMeleeArc(swing, { x: target.position.x, z: target.position.z, radius: target.radius })) {
        record.hit.add(target.id);
        target.takeHit(strike.damage, strike.origin.x, strike.origin.z, strike.effects);
      }
    }
  }
}

function distance(position: THREE.Vector3, x: number, z: number): number {
  return Math.hypot(position.x - x, position.z - z);
}
