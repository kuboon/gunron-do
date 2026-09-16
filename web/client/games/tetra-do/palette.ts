/**
 * The game's own colours.
 *
 * The site's tokens are a document's — a light page with a blue link — and this screen is a board
 * you play on in the dark, so it brings its own palette rather than bending the site's. They are
 * plain strings because half of them are painted by CSS and half are handed to SVG attributes,
 * and an SVG `fill` cannot read a custom property that a mixin declared on an ancestor.
 */

/** `a`, `b`, `c`: one colour per floor corner, used for the mark, the letter and the axis. */
export const OP_COLORS: readonly string[] = ["#f4c152", "#6cc4b0", "#ef7a9c"];

/** The screen: the background, the board it sits on, and the cells on the board. */
export const surface = {
  ink: "#1e2640",
  board: "#28335a",
  cell: "#34406a",
  cellActive: "#48558a",
  edge: "#46527e",
} as const;

/** Type, at the three weights the screen uses it. */
export const ink = {
  text: "#edeff7",
  muted: "#9aa3c0",
  good: "#9be58f",
  bad: "#ff8a65",
} as const;

/**
 * The solid's four faces.
 *
 * Four different values rather than one with shading, because the whole point of the drawing is
 * that you can tell *which* face is facing you — a lit single colour would leave two orientations
 * looking the same.
 */
export const FACE_COLORS: readonly string[] = [
  "#8fa2e6",
  "#e9ecf6",
  "#56649f",
  "#b7c0e3",
];
