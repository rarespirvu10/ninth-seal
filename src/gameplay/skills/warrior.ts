import * as THREE from 'three';
import { ClipTimeline } from './ClipTimeline';
import type { Skill, SkillAction, SkillHost } from './types';

/*
 * The warrior's skills. Timings are clip times taken from the source animations: the sword hand
 * peaks at 0.83 s in Cleave, the kick connects at 0.40 s in Charge, the arms fling out at 0.47 s
 * in War Cry, and the sword meets the ground at 1.6 s in Earthshatter.
 */

/** A point `distance` meters in front of the character, on the ground. */
function pointAhead(host: SkillHost, distance: number, target = new THREE.Vector3()): THREE.Vector3 {
  const { position, facing } = host.motor;
  return target.set(position.x + Math.sin(facing) * distance, position.y, position.z + Math.cos(facing) * distance);
}

export const CLEAVE: Skill = {
  definition: {
    id: 'cleave',
    name: 'Cleave',
    description: 'A wide sweep that hits everything in front of you.',
    manaCost: 12,
    cooldown: 2.5,
    icon: 'cleave',
  },
  begin(host) {
    host.faceAim();
    const swing = host.newSwing();
    return new ClipTimeline(host, {
      clip: 'cleave',
      start: 0.35,
      end: 1.3,
      rate: 1.3,
      windows: [
        {
          from: 0.66,
          to: 0.98,
          during: () => {
            host.strike(swing, { range: 2.7, arc: 220, damage: 26, effects: { knockback: 3 } });
          },
        },
      ],
      trail: [0.58, 1.0],
    });
  },
};

const DASH_SPEED = 13;
const DASH_DISTANCE = 7;
/** How far ahead of the warrior an enemy counts as reached. */
const DASH_REACH = 1.1;
/** The run clip's length; the dash loops it fast. */
const RUN_CYCLE = 0.7;

/** Dashes toward the cursor, then bashes whatever it reached. */
class ChargeAction implements SkillAction {
  private readonly swing: number;
  private readonly ahead = new THREE.Vector3();
  private dashed = 0;
  private dashTime = 0;
  private bash: ClipTimeline | null = null;

  constructor(private readonly host: SkillHost) {
    host.faceAim();
    this.swing = host.newSwing();
    host.playAction('run', 0);
  }

  update(dt: number): boolean {
    if (this.bash) return this.bash.update(dt);

    const { motor } = this.host;
    const from = (this.dashTime * 2.4) % RUN_CYCLE;
    this.dashTime += dt;
    const to = (this.dashTime * 2.4) % RUN_CYCLE;
    this.host.poseAction(to < from ? to : from, to); // No backward blend when the loop wraps.
    motor.walk(Math.sin(motor.facing) * DASH_SPEED, Math.cos(motor.facing) * DASH_SPEED, dt);
    this.dashed += DASH_SPEED * dt;

    pointAhead(this.host, DASH_REACH, this.ahead);
    const reached = this.host.enemiesNear(this.ahead.x, this.ahead.z, 0.5).length > 0;
    const blocked = this.dashTime > 0.12 && motor.speed < DASH_SPEED * 0.35;
    if (reached || blocked || this.dashed >= DASH_DISTANCE) {
      this.bash = new ClipTimeline(this.host, {
        clip: 'charge',
        start: 0.15,
        end: 0.9,
        rate: 1.25,
        windows: [
          {
            from: 0.3,
            to: 0.5,
            during: () => {
              this.host.strike(this.swing, {
                range: 2.0,
                arc: 120,
                damage: 22,
                effects: { stun: 0.8, knockback: 9 },
              });
            },
          },
        ],
      });
    }
    return false;
  }
}

export const CHARGE: Skill = {
  definition: {
    id: 'charge',
    name: 'Charge',
    description: 'Rush toward the cursor and shield-bash the first enemy you reach, stunning it.',
    manaCost: 18,
    cooldown: 6,
    icon: 'charge',
  },
  begin: (host) => new ChargeAction(host),
};

export const WAR_CRY: Skill = {
  definition: {
    id: 'warcry',
    name: 'War Cry',
    description: 'A roar that draws nearby enemies to you and raises your damage by 50% for 8 seconds.',
    manaCost: 20,
    cooldown: 15,
    icon: 'warcry',
  },
  begin(host) {
    return new ClipTimeline(host, {
      clip: 'warcry',
      start: 0.15,
      end: 1.45,
      rate: 1.15,
      cues: [
        {
          at: 0.47,
          fire: () => {
            host.provoke(10);
            host.empower(1.5, 8);
            host.shockwave(host.motor.position, 6, 0xffc861);
            host.shake(0.3);
          },
        },
      ],
    });
  },
};

export const EARTHSHATTER: Skill = {
  definition: {
    id: 'earthshatter',
    name: 'Earthshatter',
    description: 'Leap and slam the ground, damaging and stunning everything around the impact.',
    manaCost: 35,
    cooldown: 10,
    icon: 'earthshatter',
  },
  begin(host) {
    host.faceAim();
    return new ClipTimeline(host, {
      clip: 'earthshatter',
      start: 0.25,
      end: 2.05,
      rate: 1.2,
      cues: [
        {
          at: 1.55,
          fire: () => {
            const impact = pointAhead(host, 1.4);
            host.area(impact, 3.2, 34, { stun: 1.6, knockback: 4 });
            host.shockwave(impact, 3.8, 0xff7a2a);
            host.shake(0.75);
          },
        },
      ],
      trail: [1.15, 1.58],
    });
  },
};

export const WARRIOR_SKILLS: readonly Skill[] = [CLEAVE, CHARGE, WAR_CRY, EARTHSHATTER];
