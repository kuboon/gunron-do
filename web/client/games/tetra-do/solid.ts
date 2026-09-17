/**
 * The picture of the solid: where every corner lands on screen, and in what order the faces go
 * down.
 *
 * The drawing answers one question — *which of the twelve rotations are you in right now* — so it
 * is built around the two things that answer it. The floor is fixed: the three corners `a b c`
 * turn about stay where they are, drawn under the solid, because an axis that moved with the solid
 * would tell a player nothing. And one face carries an `e`, so the home orientation is a thing you
 * recognise rather than something the game has to announce.
 *
 * This module is geometry only. It takes an orientation and gives back numbers; the island renders
 * them. Keeping it that way is what lets the same scene be drawn for a still frame and for every
 * frame of a turn without the drawing code knowing which it is doing.
 */

import {
  AXIS_VERTEX,
  fromAxisAngle,
  multiply,
  type Quat,
  rotate,
  type Vec3,
  VERTICES,
} from "./rotation.ts";
import { FACE_COLORS, OP_COLORS } from "./palette.ts";

/** The view box the scene is drawn in — the solid is about two units across, plus room to turn. */
export const VIEW_BOX = "-2.3 -2.1 4.6 4.2";

/** A face of the solid, ready to be a `<polygon>`. */
export interface Face {
  /** The index of the corner this face is opposite, which is also its identity across frames. */
  index: number;
  /** `points` for the polygon, in view-box units. */
  points: string;
  fill: string;
  /** Whether the face is turned toward the viewer, which decides how solid it is painted. */
  front: boolean;
  /** Set on the one face that carries the `e`: the transform that lays text flat on it. */
  markTransform: string | null;
}

/** A corner of the floor triangle: where a move's axis meets the ground. */
export interface Marker {
  x: number;
  y: number;
  name: string;
  color: string;
}

/** Everything one frame of the solid needs, in draw order. */
export interface Scene {
  /** The floor triangle's `points`. */
  floor: string;
  markers: readonly Marker[];
  /** The axis being turned about, while a turn is running. */
  axis:
    | { x1: number; y1: number; x2: number; y2: number; color: string }
    | null;
  /** Back faces first, so painting them in order is the whole of the depth sorting. */
  faces: readonly Face[];
}

// --- the camera --------------------------------------------------------------

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const subtract = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const normalize = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Which way is down. The three corners `a b c` sit on this plane; the fourth starts above it. */
const FLOOR_NORMAL: Vec3 = [1, 1, -1];

/**
 * The camera, as a rotation applied to the world before it is flattened.
 *
 * Built rather than written down: stand the floor plane level first — that is the turn taking its
 * normal to straight down — then tip the result twice, so the drawing looks down at the board from
 * slightly off to one side instead of straight along an axis, where two corners would overlap.
 */
const VIEW: Quat = (() => {
  const n = normalize(FLOOR_NORMAL);
  const down: Vec3 = [0, -1, 0];
  const level = fromAxisAngle(cross(n, down), Math.acos(dot(n, down)));
  const turned = multiply(fromAxisAngle([0, 1, 0], 0.35), level);
  return multiply(fromAxisAngle([1, 0, 0], 0.42), turned);
})();

/** Enough to fill the view box without the corners of a turn clipping. */
const SCALE = 1.05;

/**
 * World point to screen point, keeping the depth.
 *
 * `y` is negated because SVG counts down the screen and the world counts up, and shifted so the
 * floor sits below the middle of the box with the solid above it.
 */
function project(v: Vec3): [number, number, number] {
  const w = rotate(VIEW, v);
  return [w[0] * SCALE, -w[1] * SCALE + 0.35, w[2]];
}

// --- the fixed floor ---------------------------------------------------------

/** Every corner, projected once: at the home orientation they do not move. */
const CORNER_POINTS = VERTICES.map(project);

/** The floor's three, which never move at all — that is the point of them. */
const FLOOR_POINTS = [0, 1, 2].map((i) => CORNER_POINTS[i]);

const FLOOR_CENTER: [number, number] = [
  (FLOOR_POINTS[0][0] + FLOOR_POINTS[1][0] + FLOOR_POINTS[2][0]) / 3,
  (FLOOR_POINTS[0][1] + FLOOR_POINTS[1][1] + FLOOR_POINTS[2][1]) / 3,
];

/** Pushes a floor point out from the centre, so the floor reads as ground under the solid. */
function spread(p: readonly number[]): [number, number] {
  return [
    FLOOR_CENTER[0] + (p[0] - FLOOR_CENTER[0]) * 1.22,
    FLOOR_CENTER[1] + (p[1] - FLOOR_CENTER[1]) * 1.22,
  ];
}

const FLOOR = FLOOR_POINTS.map(spread).map((p) => `${p[0]},${p[1]}`).join(" ");

/**
 * The three letters, each sitting on the corner it turns about.
 *
 * Pushed out from the floor's centre like the floor itself, so a marker sits clear of the solid
 * rather than on top of it — which for the corner at the top means pushed upward, away from the
 * face the `e` is painted on.
 */
const MARKERS: readonly Marker[] = [0, 1, 2].map((k) => {
  const [x, y] = spread(CORNER_POINTS[AXIS_VERTEX[k]]);
  return { x, y, name: ["a", "b", "c"][k], color: OP_COLORS[k] };
});

// --- the solid ---------------------------------------------------------------

/** Each face by the corner it is opposite, which is how a tetrahedron names its four faces. */
const FACES: readonly (readonly number[])[] = [
  [1, 2, 3],
  [0, 2, 3],
  [0, 1, 3],
  [0, 1, 2],
];

/**
 * Where the `e` is painted: the face turned toward the viewer at the home orientation, and the
 * frame laid on it that keeps the letter upright.
 *
 * Worked out once, in the solid's own coordinates, so it turns with the solid afterwards — the
 * letter is on a face, not on the screen.
 */
const MARK = (() => {
  const candidates = FACES.map((corners, index) => {
    const points = corners.map((i) => VERTICES[i]);
    const center = scale(add(add(points[0], points[1]), points[2]), 1 / 3);
    const outward = normalize(subtract(center, VERTICES[index]));

    // Upright means the corner that draws highest on screen points up.
    const top = [...points].sort((a, b) => project(a)[1] - project(b)[1])[0];
    const up = normalize(subtract(top, center));
    let right = cross(up, outward);
    if (project(add(center, right))[0] < project(center)[0]) {
      right = scale(right, -1);
    }

    return { index, center, up, right, depth: rotate(VIEW, outward)[2] };
  });

  return candidates.reduce((best, face) =>
    face.depth > best.depth ? face : best
  );
})();

/** The index of the face carrying the `e`. */
export const MARKED_FACE: number = MARK.index;

/**
 * The scene for one orientation.
 *
 * @param orientation Where the solid is right now — mid-turn, most of the time
 * @param axis The corner being turned about (`0 1 2`), or `null` when nothing is turning
 * @returns The floor, the markers, the axis line and the faces, back to front
 */
export function buildScene(orientation: Quat, axis: number | null): Scene {
  const corners = VERTICES.map((v) => project(rotate(orientation, v)));

  const faces: Face[] = FACES.map((indices, index) => {
    const [a, b, c] = indices.map((i) => corners[i]);
    const opposite = corners[index];

    // Which side of the face the fourth corner is on says which way the face looks: the normal
    // pointing away from it is the outward one, and its depth decides front from back.
    const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let normal = cross(u, w);
    const toOpposite: Vec3 = [
      opposite[0] - a[0],
      opposite[1] - a[1],
      opposite[2] - a[2],
    ];
    if (dot(normal, toOpposite) > 0) normal = scale(normal, -1);

    return {
      index,
      points: [a, b, c].map((p) => `${p[0]},${p[1]}`).join(" "),
      fill: FACE_COLORS[index],
      front: normal[2] > 0,
      markTransform: index === MARK.index ? markTransform(orientation) : null,
    };
  });

  // Back faces first, then by depth: painting them in this order is the whole of the sorting, and
  // it is why the solid can be drawn see-through without anything looking inside out.
  faces.sort((a, b) =>
    Number(a.front) - Number(b.front) ||
    faceDepth(a, corners) - faceDepth(b, corners)
  );

  return {
    floor: FLOOR,
    markers: MARKERS,
    axis: axis === null ? null : axisLine(axis),
    faces,
  };
}

/** The mean depth of a face, for sorting one against another. */
function faceDepth(
  face: Face,
  corners: readonly [number, number, number][],
): number {
  const [a, b, c] = FACES[face.index].map((i) => corners[i]);
  return (a[2] + b[2] + c[2]) / 3;
}

/**
 * The transform that lays the `e` flat on its face.
 *
 * Three projected points are enough: where the face's centre goes, and where one step right and
 * one step up on the face land. That is exactly the six numbers of an SVG matrix, so the letter is
 * drawn upright at the origin and the matrix does the perspective.
 */
function markTransform(orientation: Quat): string {
  const center = project(rotate(orientation, MARK.center));
  const right = project(rotate(orientation, add(MARK.center, MARK.right)));
  const up = project(rotate(orientation, add(MARK.center, MARK.up)));
  return `matrix(${
    [
      right[0] - center[0],
      right[1] - center[1],
      center[0] - up[0],
      center[1] - up[1],
      center[0],
      center[1],
    ].join(" ")
  })`;
}

/** The dashed line through the corner a turn is happening about. */
function axisLine(axis: number): Scene["axis"] {
  const v = VERTICES[AXIS_VERTEX[axis]];
  const far = project(scale(v, 1.45));
  const near = project(scale(v, -0.9));
  return {
    x1: near[0],
    y1: near[1],
    x2: far[0],
    y2: far[1],
    color: OP_COLORS[axis],
  };
}
