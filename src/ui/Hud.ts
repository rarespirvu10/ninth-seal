import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { projectToScreen } from './screenProjection';

/** What the HUD needs to know about an enemy to draw its health bar. */
export interface HudEnemy {
  readonly id: number;
  readonly renderPosition: THREE.Vector3;
  readonly height: number;
  readonly alive: boolean;
  readonly health: { readonly fraction: number };
}

const DEATH_SCREEN_DELAY = 1500;
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Heads-up display: the player's health orb, health bars over wounded enemies, a red flash when
 * the player is hit, and the death screen. Driven by combat events; only bar positions update
 * per frame.
 */
export class Hud {
  private readonly root = document.createElement('div');
  private readonly orbFill: SVGRectElement;
  private readonly orbLabel = document.createElement('div');
  private readonly hitFlash = document.createElement('div');
  private readonly deathScreen = document.createElement('div');
  private readonly bars = new Map<number, { element: HTMLElement; fill: HTMLElement }>();
  private readonly anchor = new THREE.Vector3();
  private readonly screen = { x: 0, y: 0 };
  private deathTimer: number | undefined;

  constructor(
    parent: HTMLElement,
    events: EventBus<GameEvents>,
    private readonly player: { readonly health: { readonly current: number; readonly max: number } },
    private readonly enemies: readonly HudEnemy[],
    private readonly onRestart: () => void,
  ) {
    this.root.className = 'hud';

    const orb = document.createElement('div');
    orb.className = 'health-orb';
    const svg = createOrb();
    this.orbFill = svg.querySelector<SVGRectElement>('.health-orb-fill') ?? fail('orb fill');
    this.orbLabel.className = 'health-orb-label';
    orb.append(svg, this.orbLabel);

    this.hitFlash.className = 'hit-flash';

    this.deathScreen.className = 'death-screen';
    this.deathScreen.hidden = true;
    this.deathScreen.innerHTML = '<h2>You have fallen</h2><p>Click or press R to rise again</p>';
    this.deathScreen.addEventListener('click', () => {
      this.onRestart();
    });
    // Listen for the key itself: a quick tap can fall between two physics steps.
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyR' && !this.deathScreen.hidden) this.onRestart();
    });

    for (const enemy of enemies) {
      const element = document.createElement('div');
      element.className = 'enemy-bar';
      element.hidden = true;
      const fill = document.createElement('div');
      fill.className = 'enemy-bar-fill';
      element.append(fill);
      this.root.append(element);
      this.bars.set(enemy.id, { element, fill });
    }

    this.root.append(orb, this.hitFlash, this.deathScreen);
    parent.append(this.root);
    this.showPlayerHealth();

    events.on('combat:damaged', ({ target }) => {
      if (target === 'player') {
        this.showPlayerHealth();
        this.flash();
      }
    });
    events.on('combat:died', ({ target }) => {
      if (target === 'player') {
        this.deathTimer = window.setTimeout(() => {
          this.deathScreen.hidden = false;
        }, DEATH_SCREEN_DELAY);
      }
    });
    events.on('player:respawned', () => {
      window.clearTimeout(this.deathTimer);
      this.deathScreen.hidden = true;
      this.showPlayerHealth();
    });
  }

  /** Repositions enemy health bars; call once per frame after the camera has moved. */
  update(camera: THREE.Camera): void {
    for (const enemy of this.enemies) {
      const bar = this.bars.get(enemy.id);
      if (!bar) continue;
      const wounded = enemy.alive && enemy.health.fraction < 1;
      this.anchor.copy(enemy.renderPosition).setY(enemy.renderPosition.y + enemy.height + 0.25);
      const onScreen = wounded && projectToScreen(this.anchor, camera, this.screen);
      bar.element.hidden = !onScreen;
      if (onScreen) {
        bar.element.style.transform = `translate(${this.screen.x}px, ${this.screen.y}px) translate(-50%, -100%)`;
        bar.fill.style.transform = `scaleX(${enemy.health.fraction})`;
      }
    }
  }

  private showPlayerHealth(): void {
    const { current, max } = this.player.health;
    this.orbFill.style.transform = `scaleY(${current / max})`;
    this.orbLabel.textContent = `${Math.ceil(current)} / ${max}`;
  }

  private flash(): void {
    // A fresh animation each hit, so overlapping hits each flash.
    this.hitFlash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
  }
}

/** Diablo-style health orb: liquid that drains from the top, behind a glass highlight and a gold rim. */
function createOrb(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <defs>
      <radialGradient id="orb-liquid" cx="42%" cy="38%" r="70%">
        <stop offset="0" stop-color="#ff6a52"/>
        <stop offset="0.5" stop-color="#b0121c"/>
        <stop offset="1" stop-color="#3c0306"/>
      </radialGradient>
      <radialGradient id="orb-glass" cx="38%" cy="28%" r="45%">
        <stop offset="0" stop-color="#fff" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="orb-clip"><circle cx="60" cy="60" r="50"/></clipPath>
    </defs>
    <circle cx="60" cy="60" r="50" fill="#120506"/>
    <g clip-path="url(#orb-clip)">
      <rect class="health-orb-fill" x="10" y="10" width="100" height="100" fill="url(#orb-liquid)"/>
    </g>
    <ellipse cx="50" cy="40" rx="30" ry="22" fill="url(#orb-glass)"/>
    <circle cx="60" cy="60" r="51.5" fill="none" stroke="#d8b878" stroke-width="3"/>
    <circle cx="60" cy="60" r="56" fill="none" stroke="#2a1d0e" stroke-width="5"/>`;
  return svg;
}

function fail(what: string): never {
  throw new Error(`HUD is missing its ${what}`);
}
