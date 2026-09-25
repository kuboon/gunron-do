/**
 * The enemies' bodies: five solids, each set up so that its "home" pose means something.
 *
 * Every solid is built the same way round. One face — the `e` face — looks straight at the player
 * along `+Z`, and it sits flat on its bottom edge, the way a letter sits on a line. That pose is
 * the identity, and every other pose the enemy can be in is one rotation of it away.
 *
 * The two shots are defined against that pose, too, and that is what makes them a pair of
 * generators rather than two arbitrary turns:
 *
 * - **twist** turns the solid about the axis pointing at the player, by one face-corner's worth —
 *   `360° / n` for an `n`-gon face. The face still faces you; only which way up it is changes.
 * - **flip** turns it half a turn about the axis through the midpoint of the front face's bottom
 *   edge. That axis is always a two-fold symmetry axis of these solids, so the half turn lands the
 *   solid on itself — but tips the face you were looking at down and away, and brings another up.
 *
 * A plate is the one exception to "the bottom edge": its front face is a whole side of it, and the
 * half turn has to go through the plate's middle, so its flip axis is the one straight down — the
 * plate is turned over like a coin.
 *
 * Nothing here knows about three.js. The engine builds meshes from these numbers, and the group
 * that the two shots generate is worked out from them in `groups.ts`.
 */

import {
  axisAngle,
  between,
  cross,
  dot,
  length,
  normalize,
  rotate,
  scale,
  sub,
  type Vec3,
} from "./quat.ts";

/** One of the solids an enemy can be. */
export interface Solid {
  /** Corners, with the circumradius scaled to 1. */
  vertices: readonly Vec3[];
  /** Each face's corners, counter-clockwise seen from outside. Face 0 is the `e` face. */
  faces: readonly (readonly number[])[];
  /** How many sides the `e` face has — so a twist is `360° / sides`. */
  sides: number;
  /** The axis the flip turns about, from the centre outwards. */
  flipAxis: Vec3;
  /** A plate is flat and two-sided; everything else is a closed polyhedron. */
  kind: "plate" | "poly";
}

const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * A regular `n`-gon plate, standing on one edge.
 *
 * @param n Sides
 * @param thickness Front to back, against a circumradius of 1
 */
export function plate(n: number, thickness = 0.36): Solid {
  const vertices: Vec3[] = [];
  const half = thickness / 2;
  for (const z of [half, -half]) {
    for (let k = 0; k < n; k++) {
      // The first corner is just right of the bottom, and the last just left: a flat bottom edge.
      const a = -Math.PI / 2 + Math.PI / n + (2 * Math.PI * k) / n;
      vertices.push([Math.cos(a), Math.sin(a), z]);
    }
  }
  const front = Array.from({ length: n }, (_, k) => k);
  const back = Array.from({ length: n }, (_, k) => n + (n - 1 - k));
  const sides = Array.from(
    { length: n },
    (_, k) => [k, n + k, n + ((k + 1) % n), (k + 1) % n],
  );
  const raw: Solid = {
    vertices,
    faces: [front, back, ...sides],
    sides: n,
    flipAxis: [0, -1, 0],
    kind: "plate",
  };
  return fitToUnitSphere(orientFaces(raw));
}

/** The regular tetrahedron. */
export function tetrahedron(): Solid {
  return polyhedron(
    [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
    [[-1, -1, -1], [-1, 1, 1], [1, -1, 1], [1, 1, -1]],
  );
}

/** The cube. */
export function cube(): Solid {
  const corners: Vec3[] = [];
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push([x, y, z]);
  }
  return polyhedron(corners, [
    [0, 0, 1],
    [0, 0, -1],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
  ]);
}

/** The regular dodecahedron. */
export function dodecahedron(): Solid {
  const corners: Vec3[] = [];
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push([x, y, z]);
  }
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      corners.push([0, a / PHI, b * PHI]);
      corners.push([a / PHI, b * PHI, 0]);
      corners.push([a * PHI, 0, b / PHI]);
    }
  }
  const normals: Vec3[] = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      normals.push([0, a * PHI, b]);
      normals.push([a * PHI, b, 0]);
      normals.push([b, 0, a * PHI]);
    }
  }
  // The first normal should be the one we turn to face the player; any will do, by symmetry.
  return polyhedron(corners, normals);
}

/**
 * A convex polyhedron from its corners and its face directions, turned into the home pose.
 *
 * A face is every corner furthest along its normal. The first normal's face becomes the `e` face:
 * it is turned to look along `+Z`, then spun about `+Z` until its bottom edge is level.
 */
function polyhedron(corners: readonly Vec3[], normals: readonly Vec3[]): Solid {
  const faces = normals.map((raw) => {
    const n = normalize(raw);
    const far = Math.max(...corners.map((c) => dot(c, n)));
    const on = corners
      .map((c, i) => [i, dot(c, n)] as const)
      .filter(([, d]) => Math.abs(d - far) < 1e-6)
      .map(([i]) => i);
    return sortAround(on, corners, n);
  });

  // Turn face 0 to look at the player.
  const n0 = faceNormal(corners, faces[0]);
  const face = between(n0, [0, 0, 1]);
  let vertices = corners.map((c) => rotate(face, c));

  // Then spin it upright: its first corner goes to where `plate` puts a first corner.
  const k = faces[0].length;
  const [x, y] = vertices[faces[0][0]];
  const want = -Math.PI / 2 + Math.PI / k;
  const spin = axisAngle([0, 0, 1], want - Math.atan2(y, x));
  vertices = vertices.map((c) => rotate(spin, c));

  // The flip axis goes through the middle of the bottom edge: the two lowest corners of face 0.
  const lowest = [...faces[0]].sort((a, b) => vertices[a][1] - vertices[b][1]);
  const [p, q] = [vertices[lowest[0]], vertices[lowest[1]]];
  const flipAxis = normalize([
    (p[0] + q[0]) / 2,
    (p[1] + q[1]) / 2,
    (p[2] + q[2]) / 2,
  ]);

  return fitToUnitSphere({ vertices, faces, sides: k, flipAxis, kind: "poly" });
}

/** A face's corners in order round its normal, counter-clockwise seen from outside. */
function sortAround(on: number[], corners: readonly Vec3[], n: Vec3): number[] {
  const centre = scale(
    on.reduce<Vec3>(
      (
        s,
        i,
      ) => [s[0] + corners[i][0], s[1] + corners[i][1], s[2] + corners[i][2]],
      [0, 0, 0],
    ),
    1 / on.length,
  );
  const u = normalize(sub(corners[on[0]], centre));
  const v = cross(n, u);
  return [...on].sort((a, b) => {
    const da = sub(corners[a], centre);
    const db = sub(corners[b], centre);
    return Math.atan2(dot(da, v), dot(da, u)) -
      Math.atan2(dot(db, v), dot(db, u));
  });
}

/** The outward normal of a face, from its first three corners. */
export function faceNormal(
  vertices: readonly Vec3[],
  face: readonly number[],
): Vec3 {
  const [a, b, c] = [vertices[face[0]], vertices[face[1]], vertices[face[2]]];
  return normalize(cross(sub(b, a), sub(c, a)));
}

/** The middle of a face. */
export function faceCentre(
  vertices: readonly Vec3[],
  face: readonly number[],
): Vec3 {
  let s: Vec3 = [0, 0, 0];
  for (const i of face) {
    s = [s[0] + vertices[i][0], s[1] + vertices[i][1], s[2] + vertices[i][2]];
  }
  return scale(s, 1 / face.length);
}

/** Reverses any face whose corners run clockwise from outside. */
function orientFaces(solid: Solid): Solid {
  const faces = solid.faces.map((face) => {
    const n = faceNormal(solid.vertices, face);
    return dot(n, faceCentre(solid.vertices, face)) < 0
      ? [...face].reverse()
      : face;
  });
  return { ...solid, faces };
}

/** Scales the corners so the furthest is at distance 1. */
function fitToUnitSphere(solid: Solid): Solid {
  const r = Math.max(...solid.vertices.map(length));
  return { ...solid, vertices: solid.vertices.map((v) => scale(v, 1 / r)) };
}
