/**
 * The little bit of 3D arithmetic the game's rules need, with no renderer attached.
 *
 * The rules — which rotation an enemy is in, what a shot does to it, whether it is home — are
 * decided on plain numbers, so they can be written, checked and reasoned about without a GPU in
 * sight. The renderer reads the same quaternions and hands them to three.js as they are.
 *
 * A quaternion is `[x, y, z, w]`, the order three.js uses, so nothing is shuffled at the border.
 */

/** A point or a direction. */
export type Vec3 = readonly [number, number, number];

/** A unit quaternion, `[x, y, z, w]`. */
export type Quat = readonly [number, number, number, number];

export const IDENTITY: Quat = [0, 0, 0, 1];

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l === 0 ? a : scale(a, 1 / l);
}

/**
 * The rotation by `angle` radians about `axis`, counter-clockwise as seen from the tip of the axis.
 *
 * @param axis Any non-zero direction
 * @param angle Radians
 */
export function axisAngle(axis: Vec3, angle: number): Quat {
  const [x, y, z] = normalize(axis);
  const s = Math.sin(angle / 2);
  return [x * s, y * s, z * s, Math.cos(angle / 2)];
}

/** `a` after `b`: rotating by the result is rotating by `b`, then by `a`. */
export function mul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function conjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

/** Rotates a vector. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const p = mul(mul(q, [v[0], v[1], v[2], 0]), conjugate(q));
  return [p[0], p[1], p[2]];
}

/**
 * Whether two quaternions are the same rotation.
 *
 * `q` and `-q` turn a solid the same way, so the test is on the absolute dot product.
 */
export function sameRotation(a: Quat, b: Quat, eps = 1e-6): boolean {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  return Math.abs(d) > 1 - eps;
}

/**
 * The rotation carrying direction `from` onto direction `to` by the shortest way round.
 *
 * @param from A unit vector
 * @param to A unit vector
 */
export function between(from: Vec3, to: Vec3): Quat {
  const d = dot(from, to);
  if (d > 1 - 1e-9) return IDENTITY;
  if (d < -1 + 1e-9) {
    // Half a turn about anything perpendicular to `from`.
    const side = Math.abs(from[0]) < 0.9
      ? cross(from, [1, 0, 0])
      : cross(from, [0, 1, 0]);
    return axisAngle(side, Math.PI);
  }
  return axisAngle(cross(from, to), Math.acos(d));
}
