/**
 * 群シューター's colours: the rounds, the enemies, the night they come out of.
 *
 * Neon on near-black, because everything that matters glows and the bloom pass makes glowing
 * things bleed light — so the colour a thing is drawn in is also how bright its halo is. The three
 * rounds get the three most different hues there are, since a player has to tell a ↺ tracer from a
 * ↻ one out of the corner of an eye.
 */

import type { Shot, SpeciesId } from "./groups.ts";

/** The document behind the canvas, and the fog the enemies come out of. */
export const NIGHT = "#07030f";

/** Each round's colour: tracer, sparks, button. */
export const SHOT_COLORS: Readonly<Record<Shot, string>> = {
  ccw: "#ff4fd8",
  cw: "#29e7ff",
  flip: "#a3ff3c",
};

/** How each round is written on its button and in the hint. */
export const SHOT_GLYPHS: Readonly<Record<Shot, string>> = {
  ccw: "↺",
  cw: "↻",
  flip: "⇅",
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

/** The faces that are not the `e` face, in turn. */
export const FACE_COLORS: readonly string[] = [
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
  "#f97316",
  "#22c55e",
  "#ef4444",
  "#06b6d4",
  "#d946ef",
  "#84cc16",
  "#6366f1",
  "#f43f5e",
];

/** A hurt. */
export const DANGER = "#ff2e4d";

/** Text on the HUD. */
export const INK = { text: "#f4f1ff", muted: "#a59cc9" } as const;
