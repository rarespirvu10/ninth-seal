import * as THREE from 'three';

export interface IsometricCameraOptions {
  /** Rotation around the vertical axis, in radians. */
  yaw?: number;
  /** Angle above the ground plane, in radians. */
  pitch?: number;
  distance?: number;
  fov?: number;
  /** How quickly the camera catches up with its target. Higher is snappier. */
  followSharpness?: number;
  /** Height above the target's feet that the camera looks at. */
  lookHeight?: number;
}

/**
 * Diablo-style camera: fixed angle, smoothly follows a target.
 * Also provides the on-screen "up" and "right" directions on the ground plane, for movement input.
 */
export class IsometricCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Ground-plane direction that appears as "up" on screen. */
  readonly forward = new THREE.Vector3();
  /** Ground-plane direction that appears as "right" on screen. */
  readonly right = new THREE.Vector3();

  private readonly offset = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  private readonly sharpness: number;
  private readonly lookHeight: number;

  constructor(options: IsometricCameraOptions = {}) {
    const yaw = options.yaw ?? Math.PI / 4;
    const pitch = options.pitch ?? THREE.MathUtils.degToRad(55);
    const distance = options.distance ?? 18;
    this.sharpness = options.followSharpness ?? 8;
    this.lookHeight = options.lookHeight ?? 1;

    this.camera = new THREE.PerspectiveCamera(options.fov ?? 35, 1, 0.5, 200);

    this.offset.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    ).multiplyScalar(distance);

    this.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  }

  /** Jumps straight to the target with no smoothing. */
  snapTo(target: THREE.Vector3): void {
    this.focus.copy(target).setY(target.y + this.lookHeight);
    this.apply();
  }

  update(dt: number, target: THREE.Vector3): void {
    this.goal.copy(target).setY(target.y + this.lookHeight);
    // Frame-rate independent exponential smoothing.
    this.focus.lerp(this.goal, 1 - Math.exp(-this.sharpness * dt));
    this.apply();
  }

  private apply(): void {
    this.camera.position.copy(this.focus).add(this.offset);
    this.camera.lookAt(this.focus);
  }
}
