/**
 * What one cell looks like, in one place.
 *
 * The board draws twenty-five of these and the tutorial draws a handful, and they have to be the
 * same picture: the tutorial is teaching the player to read the board, so a tutorial that drew its
 * own approximation would be teaching them to read something else.
 *
 * `islands/_lib/` rather than `islands/`, because the asset build takes every `islands/*.tsx` as a
 * browser entry point and this is not one — it is a piece several of them share.
 */

import { css, type RemixNode } from "@remix-run/ui";

import { OP_COLORS, surface } from "../../games/tetra-do/palette.ts";
import {
  type Op,
  opBase,
  opDirection,
  opLabel,
} from "../../games/tetra-do/rotation.ts";

/**
 * Where each letter's mark sits in the cell's triangle: `a` bottom right, `b` bottom left, `c`
 * top.
 *
 * The triangle is the `e` face seen from the front, and these are where its three corners draw on
 * screen — so a cell's mark and the same corner of the solid above it are in the same place.
 */
export const MARK_POSITIONS: readonly (readonly [number, number])[] = [
  [86, 77],
  [14, 77],
  [50, 15],
];

/**
 * One cell's face: the `e` face's triangle, with the corner this move turns about marked.
 *
 * Filled for a clockwise turn, hollow for its inverse — the same distinction the letter makes,
 * said twice, because at a glance the mark is what a player reads and the letter is what they
 * check.
 *
 * @param op The move the cell holds
 */
export function cellGlyph(op: Op): RemixNode {
  const base = opBase(op);
  const color = OP_COLORS[base];
  const inverse = opDirection(op) < 0;
  const [markX, markY] = MARK_POSITIONS[base];

  return (
    <svg
      viewBox="0 0 100 100"
      mix={glyphStyle}
      role="img"
      aria-label={opLabel(op)}
    >
      <polygon
        points="50,15 14,77 86,77"
        fill="none"
        stroke={color}
        stroke-width="3.5"
        stroke-linejoin="round"
        opacity=".8"
      />
      <circle
        cx={markX}
        cy={markY}
        r="10"
        fill={inverse ? surface.cell : color}
        stroke={color}
        stroke-width="4"
      />
      <text
        x="50"
        y="63"
        text-anchor="middle"
        font-size={inverse ? 22 : 26}
        font-weight="bold"
        fill={color}
      >
        {opLabel(op)}
      </text>
    </svg>
  );
}

const glyphStyle = css({ display: "block", width: "100%", height: "100%" });
