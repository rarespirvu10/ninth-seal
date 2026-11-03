import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { ObjectPool } from '../core/ObjectPool';
import { projectToScreen } from './screenProjection';

const LIFETIME = 0.9;
/** How high numbers float, in meters, over their lifetime. */
const RISE = 1.1;
/** Where numbers start, above the target's feet: just over the health bar. */
const START_HEIGHT = 2.5;
/** Hits at least this big get the large style. */
const HEAVY_HIT = 30;

interface FloatingNumber {
  element: HTMLElement;
  position: THREE.Vector3;
  age: number;
}

/**
 * Damage numbers that pop up over whoever was hit and float away: gold for damage dealt,
 * red for damage taken. Elements come from an object pool, so a long fight creates only as many
 * as are ever on screen at once.
 */
export class DamageNumbers {
  readonly pool: ObjectPool<HTMLElement>;
  private readonly live: FloatingNumber[] = [];
  private readonly anchor = new THREE.Vector3();
  private readonly screen = { x: 0, y: 0 };

  constructor(parent: HTMLElement, events: EventBus<GameEvents>) {
    const layer = document.createElement('div');
    layer.className = 'damage-numbers';
    parent.append(layer);

    this.pool = new ObjectPool<HTMLElement>(
      () => {
        const element = document.createElement('div');
        element.hidden = true;
        layer.append(element);
        return element;
      },
      (element) => {
        element.hidden = true;
      },
      8,
    );

    events.on('combat:damaged', ({ target, amount, position }) => {
      this.spawn(Math.round(amount), position, target === 'player', amount >= HEAVY_HIT);
    });
  }

  /** Moves, fades, and retires numbers; call once per frame after the camera has moved. */
  update(dt: number, camera: THREE.Camera): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const number = this.live[i];
      if (!number) continue;
      number.age += dt;
      const t = number.age / LIFETIME;
      if (t >= 1) {
        this.pool.release(number.element);
        this.live.splice(i, 1);
        continue;
      }

      // Rise fast then settle (ease out); fade during the last half.
      const rise = RISE * (1 - (1 - t) ** 3);
      this.anchor.copy(number.position).setY(number.position.y + rise);
      if (!projectToScreen(this.anchor, camera, this.screen)) continue;
      const pop = t < 0.12 ? 1.35 - (t / 0.12) * 0.35 : 1;
      number.element.style.opacity = String(t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5);
      number.element.style.transform = `translate(${this.screen.x}px, ${this.screen.y}px) translate(-50%, -50%) scale(${pop})`;
    }
  }

  private spawn(amount: number, feet: THREE.Vector3, taken: boolean, heavy: boolean): void {
    const element = this.pool.acquire();
    element.textContent = String(amount);
    element.className = `damage-number${taken ? ' taken' : ''}${heavy ? ' heavy' : ''}`;
    element.hidden = false;
    element.style.opacity = '0';
    // A little sideways scatter so quick hits don't stack exactly on top of each other.
    const position = feet.clone();
    position.x += (Math.random() - 0.5) * 0.6;
    position.z += (Math.random() - 0.5) * 0.6;
    position.y += START_HEIGHT;
    this.live.push({ element, position, age: 0 });
  }
}
