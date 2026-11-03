import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { Skill } from '../gameplay/skills/types';
import { projectToScreen } from './screenProjection';
import { skillIcon } from './skillIcons';

/** What the HUD needs to know about an enemy to draw its health bar. */
export interface HudEnemy {
  readonly id: number;
  readonly renderPosition: THREE.Vector3;
  readonly height: number;
  readonly alive: boolean;
  readonly health: { readonly fraction: number };
}

/** What the HUD needs to know about the player. */
export interface HudPlayer {
  readonly health: { readonly current: number; readonly max: number };
  readonly mana: { readonly current: number; readonly max: number; canAfford(cost: number): boolean };
  readonly skills: {
    readonly skills: readonly Skill[];
    cooldownFraction(slot: number): number;
    cooldownRemaining(slot: number): number;
  };
  /** Seconds left on the War Cry damage buff. */
  readonly empowerRemaining: number;
}

interface SkillSlotView {
  element: HTMLElement;
  cooldown: HTMLElement;
  timer: HTMLElement;
  cost: number;
}

const DEATH_SCREEN_DELAY = 1500;
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Heads-up display, laid out like Diablo's: the health orb, the skill bar, and the mana orb along
 * the bottom; health bars over wounded enemies; a red flash when the player is hit; and the death
 * screen. Values are read each frame and only written to the page when they change.
 */
export class Hud {
  private readonly root = document.createElement('div');
  private readonly healthOrb: Orb;
  private readonly manaOrb: Orb;
  private readonly slots: SkillSlotView[];
  private readonly buff = document.createElement('div');
  private readonly hitFlash = document.createElement('div');
  private readonly deathScreen = document.createElement('div');
  private readonly bars = new Map<number, { element: HTMLElement; fill: HTMLElement }>();
  private readonly anchor = new THREE.Vector3();
  private readonly screen = { x: 0, y: 0 };
  private deathTimer: number | undefined;

  constructor(
    parent: HTMLElement,
    events: EventBus<GameEvents>,
    private readonly player: HudPlayer,
    private readonly enemies: readonly HudEnemy[],
    private readonly onRestart: () => void,
  ) {
    this.root.className = 'hud';

    this.healthOrb = new Orb('health', ['#ff6a52', '#b0121c', '#3c0306']);
    this.manaOrb = new Orb('mana', ['#7ab8ff', '#1f55c8', '#06123c']);

    const skillBar = document.createElement('div');
    skillBar.className = 'skill-bar';
    this.slots = player.skills.skills.map((skill, slot) => {
      const view = createSkillSlot(skill, slot);
      skillBar.append(view.element);
      return view;
    });

    this.buff.className = 'buff';
    this.buff.hidden = true;

    const actionBar = document.createElement('div');
    actionBar.className = 'action-bar';
    actionBar.append(this.healthOrb.element, skillBar, this.manaOrb.element);

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

    this.root.append(actionBar, this.buff, this.hitFlash, this.deathScreen);
    parent.append(this.root);

    events.on('combat:damaged', ({ target }) => {
      if (target === 'player') this.flash();
    });
    events.on('skill:denied', ({ slot, reason }) => {
      const view = this.slots[slot];
      view?.element.animate(
        [{ boxShadow: '0 0 0 3px #ff4a3a' }, { boxShadow: '0 0 0 3px transparent' }],
        { duration: 350, easing: 'ease-out' },
      );
      if (reason === 'mana') this.manaOrb.pulse();
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
    });
  }

  /** Updates orbs, cooldowns, and enemy bars; call once per frame after the camera has moved. */
  update(camera: THREE.Camera): void {
    const { health, mana, skills, empowerRemaining } = this.player;
    this.healthOrb.set(health.current, health.max);
    this.manaOrb.set(mana.current, mana.max);

    this.slots.forEach((view, slot) => {
      const remaining = skills.cooldownRemaining(slot);
      setStyle(view.cooldown, '--cooldown', `${(skills.cooldownFraction(slot) * 360).toFixed(1)}deg`);
      setText(view.timer, remaining > 0 ? String(Math.ceil(remaining)) : '');
      view.element.classList.toggle('unaffordable', !mana.canAfford(view.cost));
    });

    this.buff.hidden = empowerRemaining <= 0;
    if (empowerRemaining > 0) setText(this.buff, `War Cry · +50% damage · ${Math.ceil(empowerRemaining)}s`);

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

  private flash(): void {
    // A fresh animation each hit, so overlapping hits each flash.
    this.hitFlash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
  }
}

/**
 * A Diablo-style resource orb: liquid that drains from the top, behind a glass highlight and a
 * gold rim. `colors` run from the liquid's highlight to its depths.
 */
class Orb {
  readonly element = document.createElement('div');
  private readonly fill: SVGRectElement;
  private readonly label = document.createElement('div');
  private shown = '';

  constructor(kind: string, colors: [string, string, string]) {
    this.element.className = `orb orb-${kind}`;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `
      <defs>
        <radialGradient id="orb-${kind}-liquid" cx="42%" cy="38%" r="70%">
          <stop offset="0" stop-color="${colors[0]}"/>
          <stop offset="0.5" stop-color="${colors[1]}"/>
          <stop offset="1" stop-color="${colors[2]}"/>
        </radialGradient>
        <radialGradient id="orb-${kind}-glass" cx="38%" cy="28%" r="45%">
          <stop offset="0" stop-color="#fff" stop-opacity="0.55"/>
          <stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
        <clipPath id="orb-${kind}-clip"><circle cx="60" cy="60" r="50"/></clipPath>
      </defs>
      <circle cx="60" cy="60" r="50" fill="#0a0608"/>
      <g clip-path="url(#orb-${kind}-clip)">
        <rect class="orb-fill" x="10" y="10" width="100" height="100" fill="url(#orb-${kind}-liquid)"/>
      </g>
      <ellipse cx="50" cy="40" rx="30" ry="22" fill="url(#orb-${kind}-glass)"/>
      <circle cx="60" cy="60" r="51.5" fill="none" stroke="#d8b878" stroke-width="3"/>
      <circle cx="60" cy="60" r="56" fill="none" stroke="#2a1d0e" stroke-width="5"/>`;
    this.fill = svg.querySelector<SVGRectElement>('.orb-fill') ?? fail('orb fill');
    this.label.className = 'orb-label';
    this.element.append(svg, this.label);
  }

  set(current: number, max: number): void {
    const text = `${Math.floor(current)} / ${max}`;
    if (text === this.shown) return;
    this.shown = text;
    this.label.textContent = text;
    this.fill.style.transform = `scaleY(${current / max})`;
  }

  /** Draws attention to the orb, e.g. when there isn't enough mana. */
  pulse(): void {
    this.element.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
  }
}

function createSkillSlot(skill: Skill, slot: number): SkillSlotView {
  const { name, description, manaCost, cooldown, icon } = skill.definition;
  const element = document.createElement('div');
  element.className = 'skill-slot';
  element.title = `${name} (${slot + 1})\n${description}\n${manaCost} mana · ${cooldown}s cooldown`;
  element.innerHTML = `${skillIcon(icon)}
    <div class="skill-cooldown"></div>
    <div class="skill-timer"></div>
    <span class="skill-key">${slot + 1}</span>
    <span class="skill-cost">${manaCost}</span>`;
  return {
    element,
    cooldown: element.querySelector<HTMLElement>('.skill-cooldown') ?? fail('cooldown overlay'),
    timer: element.querySelector<HTMLElement>('.skill-timer') ?? fail('cooldown timer'),
    cost: manaCost,
  };
}

/** Writes only when the value changed, so per-frame updates don't churn the page. */
function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

function setStyle(element: HTMLElement, property: string, value: string): void {
  if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
}

function fail(what: string): never {
  throw new Error(`HUD is missing its ${what}`);
}
