/**
 * The enemies, as groups.
 *
 * Each kind of enemy is a solid, and the rotations that land that solid on itself are a group: the
 * dihedral groups D₃ and D₄ for the plates, A₄ for the tetrahedron, S₄ for the cube and A₅ for the
 * dodecahedron. An enemy's state is one element of its group — the rotation that takes the home
 * pose to the pose it is in now — and the home pose, the `e` face upright and facing you, is the
 * identity `e`.
 *
 * Why that works: a rotation of one of these solids is fixed by which face ends up at the front
 * and which way up it is, and every such pair is reached by exactly one rotation. So "the `e` face
 * is at the front, the right way up" and "the enemy is at `e`" are the same statement, and a
 * player who can read the one is reading the other.
 *
 * The shots act from the player's side: a shot at an enemy in state `g` puts it in `s · g`, where
 * `s` is the shot's rotation about an axis fixed relative to the player. That is why the same shot
 * always turns the enemy the same way on screen, whatever state it is in.
 *
 * Everything is worked out here, once, by closing the shots under composition — the elements, a
 * multiplication table for the three shots, and each element's distance from `e` in shots, which
 * is how many a perfect player needs.
 */

import {
  axisAngle,
  dot,
  IDENTITY,
  mul,
  type Quat,
  rotate,
  sameRotation,
  type Vec3,
} from "./quat.ts";
import {
  cube,
  dodecahedron,
  faceNormal,
  plate,
  type Solid,
  tetrahedron,
} from "./solids.ts";

/** The three element rounds the gun fires. */
export type Shot = "ccw" | "cw" | "flip";

export const SHOTS: readonly Shot[] = ["ccw", "cw", "flip"];

/** Every kind of enemy there is. */
export type SpeciesId = "D3" | "D4" | "A4" | "S4" | "A5";

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
  /** The rotation each shot applies. */
  shots: Readonly<Record<Shot, Quat>>;
  /** `next[shot][i]` is the element a shot takes element `i` to. */
  next: Readonly<Record<Shot, readonly number[]>>;
  /** Fewest shots from each element back to `e`. */
  depth: readonly number[];
  /** The largest of those: how far from home an enemy of this kind can be. */
  diameter: number;
  /** How many degrees one twist is. */
  twistDegrees: number;
  /**
   * Where the ⇅ slot is: the direction, from the enemy's middle, of the face a flip brings round
   * to the front. The same whatever state the enemy is in, because the flip turns about an axis
   * fixed towards the player — which is what lets the screen draw it as a fixed green frame.
   */
  slot: Vec3;
  /** In the home pose, which face sits in the ⇅ slot — so the frame can be drawn as its outline. */
  slotFace: number;
  /** For each ring of faces, where on it a flip lifts a face furthest — see {@link guide}. */
  ladder: readonly Rung[];
}

/**
 * Closes the shots of a solid under composition.
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
  const twist = (2 * Math.PI) / solid.sides;
  const shots: Record<Shot, Quat> = {
    ccw: axisAngle([0, 0, 1], twist),
    cw: axisAngle([0, 0, 1], -twist),
    flip: axisAngle(solid.flipAxis, Math.PI),
  };

  // Breadth first from `e`, so each element is found at its distance from it — which, the three
  // shots being closed under inverse (cw undoes ccw, flip undoes itself), is also its distance to it.
  const elements: Quat[] = [IDENTITY];
  const depth: number[] = [0];
  const next: Record<Shot, number[]> = { ccw: [], cw: [], flip: [] };
  for (let i = 0; i < elements.length; i++) {
    for (const shot of SHOTS) {
      const q = mul(shots[shot], elements[i]);
      let j = elements.findIndex((e) => sameRotation(e, q));
      if (j === -1) {
        j = elements.length;
        elements.push(q);
        depth.push(depth[i] + 1);
      }
      next[shot][i] = j;
    }
    if (elements.length > 120) {
      throw new Error(`${id}: the shots do not close up`);
    }
  }

  const slot = rotate(shots.flip, [0, 0, 1]);

  return {
    id,
    label,
    shape,
    solid,
    order: elements.length,
    elements,
    shots,
    next,
    depth,
    diameter: Math.max(...depth),
    twistDegrees: 360 / solid.sides,
    slot,
    slotFace: nearestFace(solid, slot),
    ladder: buildLadder(solid, shots.flip),
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
 * The elements of a group that are exactly `d` shots from home.
 *
 * @param s The kind of enemy
 * @param d A distance, clamped to what the group has
 */
export function atDepth(s: Species, d: number): number[] {
  const want = Math.max(1, Math.min(d, s.diameter));
  return s.depth.flatMap((x, i) => (x === want ? [i] : []));
}

/**
 * One shortest way home from an element, as shots.
 *
 * Greedy on `depth`: from anywhere but `e` some shot brings the enemy one closer, so following the
 * slope is a shortest path. Used for the hint on the easy waves, never shown as a whole.
 */
export function wayHome(s: Species, i: number): Shot[] {
  const path: Shot[] = [];
  let at = i;
  while (at !== 0) {
    const step = SHOTS.find((shot) =>
      s.depth[s.next[shot][at]] === s.depth[at] - 1
    )!;
    path.push(step);
    at = s.next[step][at];
  }
  return path;
}

/** The face of a solid, in its home pose, whose outward direction is closest to `dir`. */
function nearestFace(solid: Solid, dir: Vec3): number {
  let best = 0;
  let bestDot = -Infinity;
  solid.faces.forEach((face, i) => {
    const n = faceNormal(solid.vertices, face);
    const d = dot(n, dir);
    if (d > bestDot) {
      bestDot = d;
      best = i;
    }
  });
  return best;
}

/** What to do next, and where the green frame goes. */
export interface Guide {
  /**
   * - `home`: it is at `e`. Fire the e砲.
   * - `upright`: the `e` face is at the front but not upright. Twist it upright.
   * - `twist`: twist the `e` face round into the green frame.
   * - `flip`: the `e` face is in the green frame. Flip.
   */
  advice: "home" | "upright" | "twist" | "flip";
  /** The face position, as a face of the home pose, the green frame outlines — or `null`. */
  frame: number | null;
}

/**
 * The move to make next, in a form a player can follow by looking.
 *
 * Every rotation is "which face is at the front, and which way up". A twist turns the solid about
 * the axis pointing at the player, so it carries every face round a ring at a fixed depth; only a
 * flip moves a face from one ring to another. So on each ring there is one position from which a
 * flip lifts a face furthest towards the front, and the green frame marks it on whichever ring the
 * `e` face is on: twist the `e` into the frame, flip, and repeat until it is at the front — then
 * twist it upright. On the plates, the tetrahedron and the cube that is one or two flips; on the
 * dodecahedron it can be three.
 *
 * This is always a way home, not always the shortest one; the distance shown beside it is.
 *
 * @param s The kind of enemy
 * @param state Its element
 */
export function guide(s: Species, state: number): Guide {
  if (state === 0) return { advice: "home", frame: null };
  const n = rotate(s.elements[state], [0, 0, 1]);
  if (n[2] > 1 - 1e-6) return { advice: "upright", frame: null };
  const frame = s.ladder.find((rung) => Math.abs(rung.z - n[2]) < 1e-4);
  if (frame === undefined) return { advice: "twist", frame: null };
  const at = dot(n, frame.dir) > 1 - 1e-6;
  return { advice: at ? "flip" : "twist", frame: frame.face };
}

/**
 * For each ring of faces below the front, the position a flip lifts highest.
 *
 * @param solid The body, in its home pose
 * @param flip The flip's rotation
 */
function buildLadder(solid: Solid, flip: Quat): Rung[] {
  const normals = solid.faces.map((face) => faceNormal(solid.vertices, face));
  const rungs: Rung[] = [];
  normals.forEach((n, i) => {
    if (n[2] > 1 - 1e-6) return;
    const lift = rotate(flip, n)[2];
    const rung = rungs.find((r) => Math.abs(r.z - n[2]) < 1e-4);
    if (rung === undefined) rungs.push({ z: n[2], face: i, dir: n, lift });
    else if (lift > rung.lift + 1e-6) {
      Object.assign(rung, { face: i, dir: n, lift });
    }
  });
  return rungs;
}

interface Rung {
  /** How far towards the player this ring of faces points. */
  z: number;
  /** The face at the rung's best position, in the home pose. */
  face: number;
  dir: Vec3;
  /** How far towards the player a flip carries it. */
  lift: number;
}
