/**
 * The twelve rotations of a tetrahedron, and the six moves that generate them.
 *
 * A cell on the board is a move: turn the solid 120° about one of the three marked corners of the
 * floor triangle, clockwise or counter-clockwise. That is six moves — `a b c` and their inverses —
 * and every product of them is one of the twelve rotations carrying the tetrahedron onto itself,
 * the group A₄. A trace clears when its product is the identity, so the board is a group table
 * read with a finger, which is the whole of the game.
 *
 * The three axes are fixed in space, not carried by the solid: they run through the corners the
 * tetrahedron starts on, which is what makes every generator a symmetry of the solid at its home
 * position and keeps the products inside those twelve. Turning about a moving corner would leave
 * the group at once, and nothing would ever come back to the identity.
 *
 * Rotations compose as quaternions rather than matrices because the solid has to be drawn part-way
 * through a turn: {@link slerp} between two orientations is the shortest turn between them, which
 * is what a die tipping over a corner looks like. A quaternion and its negation are the same
 * rotation, which is why nothing here compares two of them for equality — {@link isIdentity} reads
 * the angle instead.
 */

/** A point, or an axis, in the space the solid turns in. */
export type Vec3 = readonly [number, number, number];

/** A rotation, as a unit quaternion `[w, x, y, z]`. */
export type Quat = readonly [number, number, number, number];

/**
 * One of the six moves a cell can hold.
 *
 * `0 1 2` are `a b c` — the clockwise turn about each floor corner, seen from outside — and `3 4 5`
 * are their inverses, so {@link opBase} is the corner and {@link opDirection} is the way round.
 */
export type Op = 0 | 1 | 2 | 3 | 4 | 5;

/** Every move, in the order the labels read. */
export const OPS: readonly Op[] = [0, 1, 2, 3, 4, 5];

/** Doing nothing: the orientation a cleared trace has to come back to. */
export const IDENTITY: Quat = [1, 0, 0, 0];

/**
 * The tetrahedron's corners, at its home orientation.
 *
 * Alternate corners of a cube, which is the coordinate-free way to write a regular tetrahedron
 * down: every pair is the same distance apart, and each corner's own vector is the axis of the
 * 120° turn that fixes it.
 */
export const VERTICES: readonly Vec3[] = [
  [1, 1, 1],
  [1, -1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
];

/** The corner the solid stands on top of. The other three are the floor it stands on. */
export const APEX = 3;

/**
 * Which corner each of `a b c` turns about.
 *
 * The order is the one that makes the labels read the way the floor is drawn — `a` bottom right,
 * `b` top, `c` bottom left — and it is also the assignment under which `a b c` is the identity, so
 * the shortest clearing trace on the board is the three letters in order.
 */
export const AXIS_VERTEX: readonly number[] = [0, 2, 1];

/** How many letters a clearing trace has to have left once the cancellations are taken out. */
export const MIN_REDUCED_LENGTH = 3;

/** Which corner a move turns about: `0 1 2` for `a b c`. */
export function opBase(op: Op): number {
  return op % 3;
}

/** Which way a move turns: `1` clockwise, `-1` for an inverse. */
export function opDirection(op: Op): 1 | -1 {
  return op < 3 ? 1 : -1;
}

/** The move that undoes `op`. */
export function opInverse(op: Op): Op {
  return ((op + 3) % 6) as Op;
}

/** The letters, without the inverse mark. */
export const OP_NAMES: readonly string[] = ["a", "b", "c"];

/** How a move is written: `a`, or `a⁻¹`. */
export function opLabel(op: Op): string {
  return OP_NAMES[opBase(op)] + (opDirection(op) < 0 ? "⁻¹" : "");
}

// --- quaternion arithmetic ---------------------------------------------------

/** Composes two rotations: `b` first, then `a`. */
export function multiply(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

/** The rotation that undoes `q`, for a unit quaternion. */
function conjugate(q: Quat): Quat {
  return [q[0], -q[1], -q[2], -q[3]];
}

/**
 * A turn of `angle` radians about `axis`, right-handed.
 *
 * @param axis Any vector along the axis — it is normalised here
 * @param angle Radians, positive counter-clockwise looking down the axis toward the origin
 * @returns The rotation as a unit quaternion
 */
export function fromAxisAngle(axis: Vec3, angle: number): Quat {
  const length = Math.hypot(axis[0], axis[1], axis[2]);
  const half = Math.sin(angle / 2);
  return [
    Math.cos(angle / 2),
    (axis[0] / length) * half,
    (axis[1] / length) * half,
    (axis[2] / length) * half,
  ];
}

/** Applies a rotation to a point. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const r = multiply(multiply(q, [0, v[0], v[1], v[2]]), conjugate(q));
  return [r[1], r[2], r[3]];
}

/**
 * The orientation `t` of the way from `a` to `b`, along the shortest turn between them.
 *
 * The sign flip is what makes it the shortest one: `b` and `-b` are the same orientation, and
 * without it half the turns would go the long way round.
 *
 * @param a Where the turn starts
 * @param b Where it ends
 * @param t How far along, `0` to `1`
 * @returns The orientation in between
 */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let end = b;
  if (dot < 0) {
    end = [-b[0], -b[1], -b[2], -b[3]];
    dot = -dot;
  }
  // Too close to interpolate as an arc without dividing by nothing; a straight line is within a
  // pixel of it here, and it is what every implementation of this falls back to.
  if (dot > 0.9995) {
    return [
      a[0] + (end[0] - a[0]) * t,
      a[1] + (end[1] - a[1]) * t,
      a[2] + (end[2] - a[2]) * t,
      a[3] + (end[3] - a[3]) * t,
    ];
  }
  const theta = Math.acos(dot);
  const sin = Math.sin(theta);
  const from = Math.sin((1 - t) * theta) / sin;
  const to = Math.sin(t * theta) / sin;
  return [
    a[0] * from + end[0] * to,
    a[1] * from + end[1] * to,
    a[2] * from + end[2] * to,
    a[3] * from + end[3] * to,
  ];
}

/**
 * Whether a rotation is the identity.
 *
 * `w` is the cosine of half the angle, and a quaternion is its own negation as a rotation, so the
 * test is on its size. The slack is for accumulated floating-point error over a long trace, and is
 * far tighter than the smallest turn in the group: a third of a revolution puts `|w|` at a half.
 */
export function isIdentity(q: Quat): boolean {
  return Math.abs(q[0]) > 0.999;
}

// --- the moves ---------------------------------------------------------------

/**
 * What each move does, as a rotation.
 *
 * Clockwise is read looking at the corner from outside the solid, which is the way a player sees
 * it — and that is a *negative* turn about the outward axis under the right-hand rule, hence the
 * sign.
 */
export const OP_ROTATIONS: readonly Quat[] = OPS.map((op) =>
  fromAxisAngle(
    VERTICES[AXIS_VERTEX[opBase(op)]],
    (-opDirection(op) * 2 * Math.PI) / 3,
  )
);

/**
 * The single rotation a trace amounts to.
 *
 * Left-multiplied, so the moves apply in the order they were traced: the first cell turns the
 * solid from its home orientation, and each one after turns what the previous left.
 *
 * @param ops The moves, in trace order
 * @returns Their product
 */
export function compose(ops: readonly Op[]): Quat {
  let q = IDENTITY;
  for (const op of ops) q = multiply(OP_ROTATIONS[op], q);
  return q;
}

/**
 * Which moves in a trace are struck out, and how many are left.
 *
 * `a a⁻¹` is the identity whatever else is around it, so a trace padded with pairs is the same
 * rotation as the trace without them — and scoring the padding would make the longest trace the
 * one that says the least. This is the free reduction of the word, done with a stack of positions:
 * each move either cancels the one on top or joins it, and the ones that cancelled are the ones
 * the board draws dim.
 *
 * Nested pairs go too: in `a b b⁻¹ a⁻¹` the inner pair cancels first, which leaves the outer two
 * adjacent, so all four are struck out.
 *
 * @param ops The moves, in trace order
 * @returns One flag per move, and how many survived
 */
export function freeReduction(
  ops: readonly Op[],
): { cancelled: boolean[]; length: number } {
  const cancelled = ops.map(() => false);
  const stack: number[] = [];

  for (let i = 0; i < ops.length; i++) {
    const top = stack[stack.length - 1];
    if (top !== undefined && ops[top] === opInverse(ops[i])) {
      cancelled[top] = true;
      cancelled[i] = true;
      stack.pop();
    } else {
      stack.push(i);
    }
  }

  return { cancelled, length: stack.length };
}

/**
 * How long a trace is once the moves that undo each other are struck out.
 *
 * @param ops The moves, in trace order
 * @returns The length of the reduced word
 */
export function reducedLength(ops: readonly Op[]): number {
  return freeReduction(ops).length;
}
