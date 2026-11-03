import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import type { CombatantId, GameEvents, Strike } from '../../src/core/events';
import { CombatSystem, type Combatant } from '../../src/gameplay/CombatSystem';

function combatant(id: CombatantId, x: number, z: number) {
  const takeHit = vi.fn<(damage: number, fromX: number, fromZ: number) => void>();
  return { id, position: new THREE.Vector3(x, 0, z), radius: 0.35, alive: true, takeHit } satisfies Combatant;
}

function setup() {
  const events = new EventBus<GameEvents>();
  const player = combatant('player', 0, 0);
  const front = combatant(1, 0, 1.5);
  const behind = combatant(2, 0, -1.5);
  new CombatSystem(events, player, [front, behind]);
  return { events, player, front, behind };
}

const strike = (attacker: CombatantId, swing: number, origin: THREE.Vector3, facing = 0): Strike => ({
  attacker,
  swing,
  origin,
  facing,
  range: 2,
  arc: 90,
  damage: 10,
});

describe('CombatSystem', () => {
  it('hits enemies inside the player swing, not those outside it', () => {
    const { events, front, behind } = setup();
    events.emit('combat:strike', strike('player', 1, new THREE.Vector3()));

    expect(front.takeHit).toHaveBeenCalledWith(10, 0, 0);
    expect(behind.takeHit).not.toHaveBeenCalled();
  });

  it('hits each target once per swing, however many steps the window lasts', () => {
    const { events, front } = setup();
    const origin = new THREE.Vector3();
    events.emit('combat:strike', strike('player', 1, origin));
    events.emit('combat:strike', strike('player', 1, origin));
    events.emit('combat:strike', strike('player', 1, origin));

    expect(front.takeHit).toHaveBeenCalledTimes(1);
  });

  it('lets the next swing hit the same target again', () => {
    const { events, front } = setup();
    const origin = new THREE.Vector3();
    events.emit('combat:strike', strike('player', 1, origin));
    events.emit('combat:strike', strike('player', 2, origin));

    expect(front.takeHit).toHaveBeenCalledTimes(2);
  });

  it('lets enemies hit the player but not each other', () => {
    const { events, player, behind } = setup();
    // Enemy 1 at (0, 1.5) swings toward -Z: through the player and on toward enemy 2.
    events.emit('combat:strike', { ...strike(1, 1, new THREE.Vector3(0, 0, 1.5), Math.PI), range: 4 });

    expect(player.takeHit).toHaveBeenCalledTimes(1);
    expect(behind.takeHit).not.toHaveBeenCalled();
  });

  it('ignores dead targets', () => {
    const { events, front } = setup();
    Object.assign(front, { alive: false });
    events.emit('combat:strike', strike('player', 1, new THREE.Vector3()));

    expect(front.takeHit).not.toHaveBeenCalled();
  });
});
