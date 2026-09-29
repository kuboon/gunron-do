/**
 * The enemies, as groups — and the shots, as where on the enemy they land.
 *
 * Each kind of enemy is a solid, and the rotations that land that solid on itself are a group: the
 * dihedral groups D₃ and D₄ for the plates, A₄ for the tetrahedron, S₄ for the cube and A₅ for the
 * dodecahedron. An enemy's state is one element of its group — the rotation that takes the home
 * pose to the pose it is in now — and the home pose, the `e` face upright and facing the turret, is
 * the identity `e`.
 *
 * Every element other than `e` is a turn about one axis (Euler's rotation theorem), and every axis
 * of these solids comes out of it through a face's middle, a corner, or an edge's middle. That is
 * the shot: hit the enemy at one of those spots and it turns one step about the axis through it —
 * clockwise as the turret sees it for a 右回し round, the other way for a 左回し. One step is
 * `360° / k`, where `k` is how many steps make a full turn about that axis, so a round at a corner
 * of the cube turns it 120° and three of them bring it back.
 *
 * So the way to undo an enemy is its inverse: the same axis it is turned about, the other way. Most
 * elements are one step about some axis and go home in one shot; the rest — a half turn about a
 * cube's face, two steps round a dodecahedron's face — take two.
 *
 * The spots are fixed to the body, so a shot is a multiplication on the right: hitting spot `s` of
 * an enemy in `g` puts it in `g · s`. In the turret's view that is the same as turning it about a
 * fixed axis on the left, which is why a shot always turns the enemy the way it looks as if it
 * should. Everything here — the elements, the spots, a table of what each shot does to each
 * element, and each element's distance from `e` — is worked out once, at load.
 */

import {
  axisAngle,
  dot,
  IDENTITY,
  mul,
  normalize,
  type Quat,
  rotate,
  sameRotation,
  scale,
  type Vec3,
} from "./quat.ts";
import {
  cube,
  dodecahedron,
  faceCentre,
  faceNormal,
  plate,
  type Solid,
  tetrahedron,
} from "./solids.ts";

/** Which way a round turns what it hits, as the turret sees the spot. */
export type Spin = "ccw" | "cw";

export const SPINS: readonly Spin[] = ["ccw", "cw"];

/** Every kind of enemy there is. */
export type SpeciesId = "D3" | "D4" | "A4" | "S4" | "A5";

/** What is at a spot: the middle of a face, a corner, or the middle of an edge. */
export type SpotKind = "face" | "vertex" | "edge";

/** A place on the solid where an axis comes out, and so a place a round can land. */
export interface Spot {
  kind: SpotKind;
  /** From the middle out through the spot, in the home pose. */
  dir: Vec3;
  /** The spot itself, on the surface, in the home pose (circumradius 1). */
  point: Vec3;
  /** How many steps round this axis make a full turn. */
  fold: number;
}

/** One kind of enemy: a solid, and the group its rotations form. */
export interface Species {
  id: SpeciesId;
  /** The group's name as it is written — `D₄`. */
  label: string;
  /** What the solid is called. */
  shape: string;
  solid: Solid;
  /** How many elements the group has. */
  order: number;
  /** The elements, as rotations. Element 0 is `e`. */
  elements: readonly Quat[];
  /** Every place a round can land, whether or not it faces the turret right now. */
  spots: readonly Spot[];
  /** `next[spin][spot][i]`: the element a round takes element `i` to. */
  next: Readonly<Record<Spin, readonly (readonly number[])[]>>;
  /** Fewest shots from each element back to `e`. */
  depth: readonly number[];
  /** The largest of those. */
  diameter: number;
}

/**
 * Roughly where the camera is, seen from an enemy: towards the turret and above it. Used only to
 * prefer, of two equally good shots, the one the player can see.
 */
export const FACING: Vec3 = normalize([0, 0.6, 0.8]);

/**
 * Closes a solid's rotations, then finds its axes and the spots where they come out.
 *
 * @param id The group's code
 * @param label Its written name
 * @param shape What the solid is called
 * @param solid The body
 */
function species(
  id: SpeciesId,
  label: string,
  shape: string,
  solid: Solid,
): Species {
  // The elements: everything a twist about the front and the solid's half turn generate. Any pair
  // of generators would do; these two are known to reach the whole group of each solid.
  const generators = [
    axisAngle([0, 0, 1], (2 * Math.PI) / solid.sides),
    axisAngle(solid.flipAxis, Math.PI),
  ];
  const elements: Quat[] = [IDENTITY];
  for (let i = 0; i < elements.length; i++) {
    for (const g of generators) {
      const q = mul(g, elements[i]);
      if (!elements.some((e) => sameRotation(e, q))) elements.push(q);
    }
    if (elements.length > 120) {
      throw new Error(`${id}: the rotations do not close up`);
    }
  }
  const find = (q: Quat): number => {
    const i = elements.findIndex((e) => sameRotation(e, q));
    if (i === -1) throw new Error(`${id}: a shot left the group`);
    return i;
  };

  // The axes: one per line, with how many elements turn about it.
  const lines: { dir: Vec3; count: number }[] = [];
  for (const q of elements.slice(1)) {
    const { axis } = axisOf(q);
    const line = lines.find((l) => Math.abs(dot(l.dir, axis)) > 1 - 1e-6);
    if (line) line.count += 1;
    else lines.push({ dir: axis, count: 1 });
  }

  // Both ends of every axis are spots.
  const planes = solid.faces.map((face) => {
    const n = faceNormal(solid.vertices, face);
    return { n, h: dot(n, faceCentre(solid.vertices, face)) };
  });
  const spots: Spot[] = lines.flatMap(({ dir, count }) =>
    [dir, scale(dir, -1)].map((d) => surface(planes, d, count + 1))
  );

  const next: Record<Spin, number[][]> = { ccw: [], cw: [] };
  for (const spin of SPINS) {
    next[spin] = spots.map((spot) => {
      const step = axisAngle(
        spot.dir,
        ((spin === "ccw" ? 1 : -1) * 2 * Math.PI) / spot.fold,
      );
      return elements.map((q) => find(mul(q, step)));
    });
  }

  // Distances home, breadth first. Each spot's two rounds are each other's inverse, so distance
  // from `e` and distance to `e` are the same thing.
  const depth = elements.map(() => -1);
  depth[0] = 0;
  const queue = [0];
  while (queue.length > 0) {
    const i = queue.shift()!;
    for (const spin of SPINS) {
      for (const row of next[spin]) {
        const j = row[i];
        if (depth[j] === -1) {
          depth[j] = depth[i] + 1;
          queue.push(j);
        }
      }
    }
  }

  return {
    id,
    label,
    shape,
    solid,
    order: elements.length,
    elements,
    spots,
    next,
    depth,
    diameter: Math.max(...depth),
  };
}

/** Where a ray from the middle leaves a convex solid, and what it leaves through. */
function surface(
  planes: readonly { n: Vec3; h: number }[],
  dir: Vec3,
  fold: number,
): Spot {
  let t = Infinity;
  for (const { n, h } of planes) {
    const c = dot(n, dir);
    if (c > 1e-9) t = Math.min(t, h / c);
  }
  const through = planes.filter(({ n, h }) => {
    const c = dot(n, dir);
    return c > 1e-9 && Math.abs(h / c - t) < 1e-6;
  }).length;
  return {
    kind: through === 1 ? "face" : through === 2 ? "edge" : "vertex",
    dir,
    point: scale(dir, t),
    fold,
  };
}

/** The five kinds, built once. */
export const SPECIES: Readonly<Record<SpeciesId, Species>> = {
  D3: species("D3", "D₃", "正三角形の板", plate(3)),
  D4: species("D4", "D₄", "正方形の板", plate(4)),
  A4: species("A4", "A₄", "正四面体", tetrahedron()),
  S4: species("S4", "S₄", "立方体", cube()),
  A5: species("A5", "A₅", "正十二面体", dodecahedron()),
};

/**
 * A rotation's axis, and how far it turns about it — at most half a turn, the axis chosen to match.
 *
 * @param q A unit quaternion
 */
export function axisOf(q: Quat): { axis: Vec3; angle: number } {
  const [x, y, z, w] = q[3] < 0 ? [-q[0], -q[1], -q[2], -q[3]] : q;
  const s = Math.hypot(x, y, z);
  if (s < 1e-9) return { axis: [0, 0, 1], angle: 0 };
  return {
    axis: [x / s, y / s, z / s],
    angle: 2 * Math.atan2(s, Math.min(1, w)),
  };
}

/**
 * Where a spot is now: its direction out of the enemy, in the enemy's frame — `+Z` towards the
 * turret, `+Y` up.
 *
 * @param s The kind of enemy
 * @param state Its element
 * @param spot Which spot
 */
export function spotDir(s: Species, state: number, spot: number): Vec3 {
  return rotate(s.elements[state], s.spots[spot].dir);
}

/**
 * Whether a round from the turret can reach a spot: it has to be on the turret's half of the
 * enemy. The rim of that half counts, so that a plate side-on can still be turned over.
 *
 * @param s The kind of enemy
 * @param state Its element
 * @param spot Which spot
 */
export function reachable(s: Species, state: number, spot: number): boolean {
  return spotDir(s, state, spot)[2] > -1e-6;
}

/** One shot: a spot, a way round, and how many times in a row it has to go in. */
export interface Answer {
  spot: number;
  spin: Spin;
  times: number;
}

/**
 * The shot to make next, for the hint.
 *
 * Of the shots that bring the enemy a step closer to home, the one about the enemy's own axis if
 * there is one — then the same round at the same spot finishes the job, and the hint teaches the
 * inverse rather than a trick — and otherwise the one the camera sees best.
 *
 * @param s The kind of enemy
 * @param state Its element, not `e`
 */
export function answer(s: Species, state: number): Answer | null {
  if (state === 0) return null;
  const own = axisOf(s.elements[state]).axis;
  let best: Answer | null = null;
  let bestScore = -Infinity;
  s.spots.forEach((_, spot) => {
    if (!reachable(s, state, spot)) return;
    const d = spotDir(s, state, spot);
    const along = Math.abs(dot(d, own)) > 1 - 1e-6;
    for (const spin of SPINS) {
      if (s.depth[s.next[spin][spot][state]] !== s.depth[state] - 1) continue;
      const score = (along ? 10 : 0) + dot(d, FACING);
      if (score > bestScore) {
        bestScore = score;
        best = { spot, spin, times: along ? s.depth[state] : 1 };
      }
    }
  });
  return best;
}

/**
 * The elements of a group that are exactly `d` shots from home.
 *
 * @param s The kind of enemy
 * @param d A distance, clamped to what the group has
 */
export function atDepth(s: Species, d: number): number[] {
  const want = Math.max(1, Math.min(d, s.diameter));
  return s.depth.flatMap((x, i) => (x === want ? [i] : []));
}

/** What a spot is called, in the HUD. */
export const SPOT_NAMES: Readonly<Record<SpotKind, string>> = {
  face: "面",
  vertex: "頂点",
  edge: "辺",
};
