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

/** The corner the solid stands on top of. */
export const APEX = 3;

/**
 * Which corner each of `a b c` turns about.
 *
 * The three corners around the face the `e` is painted on, which is the face turned toward the
 * viewer at rest. So the letters are the triangle you are looking at, and the fourth corner —
 * the one hidden behind, opposite the `e` — is the unlabelled one. That is also why a cell's own
 * little triangle reads as the solid seen from the front.
 *
 * Which three corners, and in which order, is not free: this is one of the three assignments on
 * that face under which `a b c` is the identity, so the shortest clearing trace on the board
 * stays the three letters in order.
 */
export const AXIS_VERTEX: readonly number[] = [0, 1, 3];

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

/**
 * How far a trace may go without the solid coming home.
 *
 * The one rule that makes length mean anything. Without it, a long trace is free: the solid turns
 * under your finger, so you can wander and lift when the `e` comes back round — and it comes back
 * round on its own, because there are only twelve orientations to be in. Measured, a player who
 * reads nothing averages a 7-cell clear and lands 12 or more a third of the time, which is most of
 * what a player who reads the board gets.
 *
 * The obvious fix — *a long trace must pass through home somewhere* — is the wrong way round: the
 * longer the wander, the likelier it already does, so the rule waves the long ones through (83% of
 * 24-cell wanders) and only catches the middling ones. This is the other way round. Wander six
 * moves without closing and the trace is dead where it stands, so every further move has to be
 * part of something that closes. A wanderer's 12-cell traces survive 13% of the time and its 18-cell
 * ones 3%, while a player who chains short clears comes away with *more* than today: the long
 * trace stops being one long guess and becomes several short answers, taken without lifting the
 * finger.
 *
 * The allowance is spent in moves, not in cells, so a cancelling pair is free. That is the same
 * bargain the score already offers — a pair turns the solid and turns it back, so there is nothing
 * for either to count — and it makes the bridge one rule instead of two. It is not free of cost,
 * though: re-measuring the two ways of counting side by side, a wanderer scores on 36% of its
 * walks rather than 22%, and takes 2.1 cells a walk rather than 1.2. What it does not get back is
 * the thing this limit exists for. Its rate of clears of twelve or more does not move at all, and
 * stays an order of magnitude under what no limit gives it, because a cancellation can rescue a
 * wanderer that overshot by one but cannot carry it anywhere. A player who chains short answers is
 * untouched. Tightening this to five would buy most of the difference back (28%, 1.4) at almost no
 * cost to the reader; four starts taking real money off them.
 *
 * Six, and the reason is not that it scored best of the numbers tried. Raising this does nothing
 * for a player once it passes how far ahead they can actually see: a player who reads five cells
 * ahead comes away with the same 12.8 at five, six, seven or eight, because the rule stopped being
 * the thing holding them back. It keeps paying the wanderer the whole way up, though — 0.9 at
 * five, 1.4 at six, 2.1 at seven, 2.7 at eight. Every cell above a player's reach is a gift to the
 * one who is not looking.
 *
 * So it should sit at the reach, and this game names its reach in the one place it asks a player
 * to read: the walkthrough's last step is a six-cell trace, and it is six because it is a three
 * and then a three again — which is how a stretch of six is meant to be read here, and the most a
 * first lesson is willing to ask anyone to hold. Above six only the wanderer collects, at half
 * again its rate per cell. Below it the reader starts paying: five costs them a little and four
 * costs them real ground.
 */
export const MAX_OPEN = 6;

/** Where a trace stands against {@link MAX_OPEN}. */
export interface Chain {
  /**
   * Moves since the solid was last home, after the free reduction.
   *
   * Cells the trace cancelled out again are not in it. Walking `a` and then `a⁻¹` costs two cells
   * and two cells' worth of clock, and leaves this where it was.
   */
  since: number;
  /**
   * Whether it has already gone too far to count, wherever the finger stops.
   *
   * A stretch that has spent {@link MAX_OPEN} moves without closing is already spoiled, not one
   * move away from it: the next closing would be one over the limit, and so would every closing
   * after that. The board says so on the sixth move rather than the seventh, because the sixth is
   * where the trace stopped being worth carrying forward.
   */
  broken: boolean;
  /**
   * How many answers the trace is made of.
   *
   * One per stretch between closings that survives the free reduction as three moves or more. A
   * stretch that is nothing but a cancelling pair brings the solid home and is a fine place to
   * carry on from, but it is not an answer and is not counted — which is what stops a player
   * padding a combo with `a a⁻¹` over and over.
   *
   * Three cells is the least an answer can be, so twenty-five cells hold at most eight of them.
   */
  closings: number;
  /**
   * The stretch that spent the allowance, or `null` while the trace is still good for something.
   *
   * Which cells went wrong, rather than only that some did. A broken trace is worth nothing from
   * end to end, but it did not go wrong everywhere: it went wrong here, and a player who is told
   * *here* can see what to do about it next time.
   */
  overrun: Overrun | null;
}

/** The cells of the stretch that spent {@link MAX_OPEN}, as positions in the trace. */
export interface Overrun {
  /** The first cell of the stretch: the one after the closing before it, or the trace's own start. */
  from: number;
  /**
   * The cell the count reached {@link MAX_OPEN} on.
   *
   * Also where the trace ends, while it is broken: every move past it is one the stretch cannot
   * pay for, so the board declines to take it rather than growing a path it has nothing to draw.
   */
  to: number;
}

/**
 * Where a trace first ran out of allowance.
 *
 * A cell at a time rather than by prefixes, because what is wanted is *where* it happened rather
 * than whether it did. Home is looked for first at each cell, since closing on the allowance is
 * spending it exactly, not overspending it.
 *
 * @param ops The moves, in trace order
 * @returns The stretch that spent it, or `null` if none did
 */
function overrunOf(ops: readonly Op[]): Overrun | null {
  let from = 0;
  for (let j = 0; j < ops.length; j++) {
    const prefix = ops.slice(0, j + 1);
    if (
      reducedLength(prefix) >= MIN_REDUCED_LENGTH && isIdentity(compose(prefix))
    ) {
      from = j + 1;
      continue;
    }
    if (reducedLength(ops.slice(from, j + 1)) >= MAX_OPEN) {
      return { from, to: j };
    }
  }
  return null;
}

/**
 * How a trace stands as a chain of closings.
 *
 * Home means what it means everywhere else in the game: the solid is back *and* enough of the
 * trace survived the free reduction to be an answer. So `a a⁻¹` is not a place to start counting
 * again from, which is the same thing the board says by drawing that pair dim.
 *
 * The allowance is spent in moves that survive the free reduction, not in cells. A cancelling
 * pair turns the solid and turns it back, so it costs the player two cells and the clock the time
 * to walk them, and it leaves the orientation exactly where it was — there is nothing for the
 * limit to catch. It is the same accounting the score already uses, and it makes the bridge one
 * thing everywhere rather than a trick that only works after the first answer.
 *
 * A finger that retraces its own path un-breaks the trace, because the moves it undoes go out of
 * the count with it. Backing out is in fact the only way out: cancelling never lands on home,
 * since every orientation it passes through is one the trace already stood on and did not close
 * at. So a trace that has spent the allowance has to spend cells undoing before it can spend any
 * going forward.
 *
 * @param ops The moves, in trace order
 * @returns Where the last closing was, and whether the chain is already spoiled
 */
export function chain(ops: readonly Op[]): Chain {
  let last = 0;
  let broken = false;
  let closings = 0;

  for (let k = MIN_REDUCED_LENGTH; k <= ops.length; k++) {
    const prefix = ops.slice(0, k);
    if (
      reducedLength(prefix) < MIN_REDUCED_LENGTH || !isIdentity(compose(prefix))
    ) {
      continue;
    }
    // One measure does both jobs: what the stretch is worth is what it costs.
    const span = reducedLength(ops.slice(last, k));
    if (span > MAX_OPEN) broken = true;
    if (span >= MIN_REDUCED_LENGTH) closings += 1;
    last = k;
  }

  // An open run that has spent the allowance is broken there and then, not one move later. Closing
  // on `MAX_OPEN` is fine — the loop above lets it through — but once the allowance is gone every
  // move that is not a cancellation puts the stretch over, and a cancellation cannot close.
  const since = reducedLength(ops.slice(last));
  const spoiled = broken || since >= MAX_OPEN;
  // Only while it is actually spoiled. A finger that backs out of an overrun takes the moves out
  // of the count with it, and a trace that is good again should not still be carrying a mark
  // saying where it once was not.
  return {
    since,
    broken: spoiled,
    closings,
    overrun: spoiled ? overrunOf(ops) : null,
  };
}
