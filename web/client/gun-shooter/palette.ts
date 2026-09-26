/**
 * 群シューター's colours: the rounds, the enemies, the night they come out of.
 *
 * The enemies are matte and lit like objects, so their faces and the `e` on one of them read at a
 * glance; only the effects — tracers, sparks, blasts — are bright enough to glow. The two rounds
 * get two hues far apart, since a player has to tell a ↺ tracer from a ↻ one out of the corner of
 * an eye.
 */

import type { SpeciesId, Spin } from "./groups.ts";

/** The document behind the canvas, and the fog the enemies come out of. */
export const NIGHT = "#07030f";

/** Each round's colour: tracer, sparks, button. */
export const SHOT_COLORS: Readonly<Record<Spin, string>> = {
  ccw: "#ff4fd8",
  cw: "#29e7ff",
};

/** How each round is written on its button and in the hint. */
export const SHOT_GLYPHS: Readonly<Record<Spin, string>> = {
  ccw: "↺",
  cw: "↻",
};

/** How each round is called. */
export const SHOT_NAMES: Readonly<Record<Spin, string>> = {
  ccw: "左回し",
  cw: "右回し",
};

/** The `e` face, and the e砲 that finishes what it starts. */
export const GOLD = "#ffd23f";

/** Each enemy's own colour: its outline, its name in the HUD. */
export const SPECIES_COLORS: Readonly<Record<SpeciesId, string>> = {
  D3: "#29e7ff",
  D4: "#a3ff3c",
  A4: "#ff4fd8",
  S4: "#ff8a3d",
  A5: "#b58cff",
};

/**
 * The faces that are not the `e` face, in turn: soft and mid-dark, so the white `e` face is the
 * brightest thing on every enemy.
 */
export const FACE_COLORS: readonly string[] = [
  "#4a6fa5",
  "#a5566f",
  "#3f8f86",
  "#7a5ea8",
  "#b0773f",
  "#5a8f48",
  "#a84848",
  "#3f86a8",
  "#9a5a9a",
  "#7f8f3f",
  "#5a5fa8",
  "#a85a6a",
];

/** The `e` face: white, with the letter in ink. */
export const E_FACE = "#fbf8ef";
export const E_INK = "#141018";

/** A hurt. */
export const DANGER = "#ff2e4d";

/** Text on the HUD. */
export const INK = { text: "#f4f1ff", muted: "#a59cc9" } as const;
