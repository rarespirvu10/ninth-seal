const MOVE_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
} as const;

/** Tracks which keys are held. Uses physical key codes, so WASD works on any keyboard layout. */
export class Input {
  private readonly held = new Set<string>();

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    // Keys released while the tab is in the background never fire keyup.
    target.addEventListener('blur', this.onBlur);
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** Movement intent in screen space: x right, y up, each -1..1. Diagonals are not normalized. */
  moveAxis(): { x: number; y: number } {
    const pressed = (codes: readonly string[]) => codes.some((code) => this.held.has(code));
    return {
      x: Number(pressed(MOVE_KEYS.right)) - Number(pressed(MOVE_KEYS.left)),
      y: Number(pressed(MOVE_KEYS.up)) - Number(pressed(MOVE_KEYS.down)),
    };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.held.clear();
  };
}
