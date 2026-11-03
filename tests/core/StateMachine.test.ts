import { describe, expect, it } from 'vitest';
import { StateMachine, type StateDefinition } from '../../src/core/StateMachine';

type Light = 'green' | 'yellow' | 'red';

function createLight() {
  const log: string[] = [];
  const states: Record<Light, StateDefinition<Light, string[]>> = {
    green: {
      enter: (l, from) => l.push(`enter green from ${from ?? 'start'}`),
      update: (_l, _dt, elapsed) => (elapsed >= 3 ? 'yellow' : undefined),
      exit: (l, to) => l.push(`exit green to ${to}`),
    },
    yellow: {
      enter: (l) => l.push('enter yellow'),
      update: (_l, _dt, elapsed) => (elapsed >= 1 ? 'red' : undefined),
    },
    red: {
      enter: (l) => l.push('enter red'),
    },
  };
  return { log, machine: new StateMachine(log, states, 'green') };
}

describe('StateMachine', () => {
  it('enters the initial state on construction', () => {
    const { log, machine } = createLight();
    expect(machine.state).toBe('green');
    expect(log).toEqual(['enter green from start']);
  });

  it('transitions when update returns a state, running exit before enter', () => {
    const { log, machine } = createLight();
    machine.update(2);
    expect(machine.state).toBe('green');

    machine.update(1);
    expect(machine.state).toBe('yellow');
    expect(log).toEqual(['enter green from start', 'exit green to yellow', 'enter yellow']);
  });

  it('resets elapsed time on each transition', () => {
    const { machine } = createLight();
    machine.update(3);
    expect(machine.elapsed).toBe(0);

    machine.update(0.5);
    expect(machine.elapsed).toBe(0.5);
    expect(machine.state).toBe('yellow');

    machine.update(0.5);
    expect(machine.state).toBe('red');
  });

  it('ignores transitions to the current state', () => {
    const { log, machine } = createLight();
    machine.transition('green');
    expect(log).toEqual(['enter green from start']);
  });

  it('supports transitions requested from outside', () => {
    const { machine } = createLight();
    machine.transition('red');
    expect(machine.state).toBe('red');
  });
});
