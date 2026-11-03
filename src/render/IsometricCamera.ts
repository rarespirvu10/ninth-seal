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

/** Trauma lost per second; a full-strength shake settles in about half a second. */
const SHAKE_DECAY = 2.2;
/** Largest camera displacement, in meters, at full trauma. */
const SHAKE_MAX_OFFSET = 0.35;
const SHAKE_FREQUENCY = 28;

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
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly shakeOffset = new THREE.Vector3();
  private trauma = 0;
  private shakeTime = 0;
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

  /**
   * Where the cursor points on a horizontal plane at `height`, written into `target`.
   * Returns null if the ray is parallel to the plane (impossible from this camera's angle).
   */
  pointOnGround(
    pointer: { x: number; y: number },
    height: number,
    target: THREE.Vector3,
  ): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.ndc.set(pointer.x, pointer.y), this.camera);
    this.groundPlane.constant = -height;
    return this.raycaster.ray.intersectPlane(this.groundPlane, target);
  }

  /** Jumps straight to the target with no smoothing. */
  snapTo(target: THREE.Vector3): void {
    this.focus.copy(target).setY(target.y + this.lookHeight);
    this.apply();
  }

  /**
   * Adds screen shake. `amount` (0..1) accumulates up to 1 and decays quickly; the visible shake
   * grows with its square, so small hits barely register and big ones punch.
   */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, target: THREE.Vector3): void {
    this.goal.copy(target).setY(target.y + this.lookHeight);
    // Frame-rate independent exponential smoothing.
    this.focus.lerp(this.goal, 1 - Math.exp(-this.sharpness * dt));

    this.trauma = Math.max(0, this.trauma - SHAKE_DECAY * dt);
    this.shakeTime += dt;
    const strength = this.trauma * this.trauma * SHAKE_MAX_OFFSET;
    // Layered sines at unrelated frequencies: irregular, but smooth from frame to frame.
    const t = this.shakeTime * SHAKE_FREQUENCY;
    this.shakeOffset.set(
      Math.sin(t * 1.1) + Math.sin(t * 2.3 + 1.7) * 0.5,
      Math.sin(t * 1.3 + 0.4) + Math.sin(t * 2.9 + 2.1) * 0.5,
      Math.sin(t * 0.9 + 2.6) + Math.sin(t * 2.1 + 0.8) * 0.5,
    ).multiplyScalar(strength / 1.5);
    this.apply();
  }

  private apply(): void {
    this.camera.position.copy(this.focus).add(this.offset).add(this.shakeOffset);
    this.camera.lookAt(this.focus.x + this.shakeOffset.x, this.focus.y + this.shakeOffset.y, this.focus.z + this.shakeOffset.z);
  }
}
