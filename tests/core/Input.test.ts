// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { Input, MouseButton } from '../../src/core/Input';

function setup() {
  const surface = document.createElement('div');
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
  document.body.append(surface);
  const input = new Input(surface, window);
  return { surface, input };
}

const key = (type: string, code: string) => new KeyboardEvent(type, { code });
const pointer = (type: string, x: number, y: number, button = 0) =>
  new PointerEvent(type, { clientX: x, clientY: y, button, bubbles: true });

let current: ReturnType<typeof setup> | undefined;
afterEach(() => {
  current?.input.dispose();
  current?.surface.remove();
});

describe('Input', () => {
  it('tracks held keys and movement axes', () => {
    current = setup();
    window.dispatchEvent(key('keydown', 'KeyW'));
    window.dispatchEvent(key('keydown', 'KeyA'));

    expect(current.input.moveAxis()).toEqual({ x: -1, y: 1 });

    window.dispatchEvent(key('keyup', 'KeyW'));
    expect(current.input.moveAxis()).toEqual({ x: -1, y: 0 });
  });

  it('reports a press once, even if it was released before being read', () => {
    current = setup();
    current.surface.dispatchEvent(pointer('pointerdown', 10, 10));
    window.dispatchEvent(pointer('pointerup', 10, 10));

    expect(current.input.isButtonDown(MouseButton.Left)).toBe(false);
    expect(current.input.consumePress(MouseButton.Left)).toBe(true);
    expect(current.input.consumePress(MouseButton.Left)).toBe(false);
  });

  it('ignores presses outside the game surface', () => {
    current = setup();
    document.body.dispatchEvent(pointer('pointerdown', 10, 10));

    expect(current.input.consumePress(MouseButton.Left)).toBe(false);
  });

  it('converts the cursor to normalized device coordinates', () => {
    current = setup();
    window.dispatchEvent(pointer('pointermove', 150, 25));

    expect(current.input.pointer).toEqual({ x: 0.5, y: 0.5 });
  });

  it('releases everything when the window loses focus', () => {
    current = setup();
    window.dispatchEvent(key('keydown', 'KeyD'));
    current.surface.dispatchEvent(pointer('pointerdown', 0, 0));
    window.dispatchEvent(new Event('blur'));

    expect(current.input.isDown('KeyD')).toBe(false);
    expect(current.input.isButtonDown(MouseButton.Left)).toBe(false);
    expect(current.input.consumePress(MouseButton.Left)).toBe(false);
  });
});
