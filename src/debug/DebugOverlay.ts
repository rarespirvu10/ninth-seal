import type * as THREE from 'three';
import type { GameRenderer } from '../render/GameRenderer';
import { QUALITY_LEVELS, type QualityLevel } from '../render/QualitySettings';

const REFRESH_INTERVAL = 0.25;

/**
 * Developer overlay toggled with F3: frame timing, renderer stats, GPU, quality controls.
 * Updates its text a few times per second rather than every frame to keep its own cost negligible.
 */
export class DebugOverlay {
  private readonly panel: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly buttons = new Map<QualityLevel, HTMLButtonElement>();

  private frames = 0;
  private sinceRefresh = 0;
  private worstFrame = 0;

  constructor(
    root: HTMLElement,
    private readonly renderer: GameRenderer,
    private readonly playerPosition: THREE.Vector3,
    onQualityChange: (level: QualityLevel) => void,
  ) {
    this.panel = document.createElement('section');
    this.panel.className = 'debug-panel';
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', 'Debug overlay');

    this.stats = document.createElement('pre');
    this.panel.append(this.stats);

    const controls = document.createElement('div');
    controls.className = 'debug-quality';
    for (const level of QUALITY_LEVELS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = level;
      button.addEventListener('click', () => {
        onQualityChange(level);
        this.highlightQuality();
      });
      this.buttons.set(level, button);
      controls.append(button);
    }
    this.panel.append(controls);
    root.append(this.panel);

    this.highlightQuality();
    window.addEventListener('keydown', this.onKeyDown);
  }

  update(dt: number): void {
    this.frames++;
    this.sinceRefresh += dt;
    this.worstFrame = Math.max(this.worstFrame, dt);
    if (this.sinceRefresh < REFRESH_INTERVAL) return;

    if (!this.panel.hidden) this.refresh();
    this.frames = 0;
    this.sinceRefresh = 0;
    this.worstFrame = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.panel.remove();
  }

  private refresh(): void {
    const { calls, triangles } = this.renderer.renderer.info.render;
    const fps = this.frames / this.sinceRefresh;
    const average = (this.sinceRefresh / this.frames) * 1000;
    const { x, y, z } = this.playerPosition;

    this.stats.textContent = [
      `FPS        ${fps.toFixed(0)}`,
      `Frame      ${average.toFixed(1)} ms avg, ${(this.worstFrame * 1000).toFixed(1)} ms worst`,
      `Draw calls ${calls}`,
      `Triangles  ${triangles.toLocaleString()}`,
      `Quality    ${this.renderer.quality}`,
      `Res scale  ${(this.renderer.resolutionScale * 100).toFixed(0)}%`,
      `GPU        ${this.renderer.gpu ?? 'unknown'}`,
      `Player     ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`,
    ].join('\n');
  }

  private highlightQuality(): void {
    for (const [level, button] of this.buttons) {
      button.setAttribute('aria-pressed', String(level === this.renderer.quality));
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'F3') return;
    event.preventDefault();
    this.panel.hidden = !this.panel.hidden;
    if (!this.panel.hidden) this.refresh();
  };
}
