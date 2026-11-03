const MOVE_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
} as const;

export const MouseButton = { Left: 0, Right: 2 } as const;

/**
 * Keyboard and mouse state. Keys use physical codes, so WASD works on any keyboard layout.
 * Mouse presses only count on the game surface, so clicking UI never triggers an attack.
 */
export class Input {
  /** Cursor position in normalized device coordinates: -1..1, y up. */
  readonly pointer = { x: 0, y: 0 };

  private readonly keys = new Set<string>();
  private readonly buttons = new Set<number>();
  /** Presses not yet consumed, so a click between two fixed steps isn't lost. */
  private readonly presses = new Set<number>();
  private readonly keyPresses = new Set<string>();

  constructor(
    private readonly surface: HTMLElement,
    private readonly target: Window = window,
  ) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('pointerup', this.onPointerUp);
    // Keys and buttons released while the tab is in the background never fire their up events.
    target.addEventListener('blur', this.onBlur);
    surface.addEventListener('pointerdown', this.onPointerDown);
    surface.addEventListener('contextmenu', this.onContextMenu);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  isButtonDown(button: number): boolean {
    return this.buttons.has(button);
  }

  /** True once per press of `button`; later calls return false until it's pressed again. */
  consumePress(button: number): boolean {
    return this.presses.delete(button);
  }

  /** True once per press of a key (by physical code), even if it was released before being read. */
  consumeKeyPress(code: string): boolean {
    return this.keyPresses.delete(code);
  }

  /** Movement intent in screen space: x right, y up, each -1..1. Diagonals are not normalized. */
  moveAxis(): { x: number; y: number } {
    const pressed = (codes: readonly string[]) => codes.some((code) => this.keys.has(code));
    return {
      x: Number(pressed(MOVE_KEYS.right)) - Number(pressed(MOVE_KEYS.left)),
      y: Number(pressed(MOVE_KEYS.up)) - Number(pressed(MOVE_KEYS.down)),
    };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('pointerup', this.onPointerUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.surface.removeEventListener('pointerdown', this.onPointerDown);
    this.surface.removeEventListener('contextmenu', this.onContextMenu);
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.surface.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Held keys repeat keydown; only the first counts as a press.
    if (!event.repeat) this.keyPresses.add(event.code);
    this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.updatePointer(event);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.updatePointer(event);
    this.buttons.add(event.button);
    this.presses.add(event.button);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.buttons.delete(event.button);
  };

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private readonly onBlur = (): void => {
    this.keys.clear();
    this.buttons.clear();
    this.presses.clear();
    this.keyPresses.clear();
  };
}
