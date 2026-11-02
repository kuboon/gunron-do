/**
 * テトラ道 — the replay on its own, for the player X shows inside a post.
 *
 * A Player Card makes X put this page in an iframe under the post. The frame is small — 480
 * square to begin with, and from about 245 to 500 wide on a phone — so nothing here is the game's
 * full screen: no header, no buttons for the player's own round, no links back into the site.
 * Only the solid, the clock, the board and the panel that plays the round back. They are the same
 * islands as the game's page and read the same `game`, so the replay is exactly the one the link
 * carries.
 *
 * The page cannot tell by itself that it is framed, so it says so: `data-player` on the root is
 * what `TetraPanel` looks for. That is the whole difference in behaviour — links open a new tab
 * rather than navigating inside the frame, and the panel leaves out the share row, the GameCenter
 * link and the achievements, none of which belong in somebody else's timeline.
 *
 * The frame's size is the screen's, so the layout is in the viewport's units. The post gives a
 * square, and in a square the solid and the clock share the top and the board takes the rest.
 */

import { css, type RemixNode } from "@remix-run/ui";

import { TetraBoard } from "./islands/tetra-board.tsx";
import { TetraHud } from "./islands/tetra-hud.tsx";
import { TetraPanel } from "./islands/tetra-panel.tsx";
import { TetraSolid } from "./islands/tetra-solid.tsx";
import { findGame } from "../games.ts";
import { ink, surface } from "./palette.ts";

const game = findGame("tetra-do")!;

export const title = `${game.title} — リプレイ`;
export const description = game.description;

/** Islands, so the runtime boots. */
export const hydrate = true;

/** The frame is the screen. */
export const chrome = "bare" as const;
export const background: string = surface.ink;

/** Not a page to be found: the game's own page is. */
export const noindex = true;

export const viewport = "width=device-width, initial-scale=1";

export default function TetraDoPlayerPage(): RemixNode {
  return (
    <div mix={screenStyle} data-player>
      <div mix={solidAreaStyle}>
        <TetraSolid />
      </div>
      <div mix={hudAreaStyle}>
        <TetraHud />
      </div>
      <div mix={boardAreaStyle}>
        <TetraBoard />
        <div mix={panelAreaStyle}>
          <TetraPanel />
        </div>
      </div>
    </div>
  );
}

// --- styles -----------------------------------------------------------------

/**
 * Two rows in the frame's own height: the solid beside the clock, then the board.
 *
 * `svh` and not a fixed size because the frame is whatever X makes it. The board is held to the
 * height it is given — 58 of 100 — and centred, so a frame that is wider than it is tall still
 * has a square board in it.
 */
const screenStyle = css({
  boxSizing: "border-box",
  height: "100svh",
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gridTemplateRows: "minmax(0, 36fr) minmax(0, 64fr)",
  gridTemplateAreas: `"solid hud" "board board"`,
  columnGap: "0.5rem",
  rowGap: "0.35rem",
  padding: "0.4rem",
  color: ink.text,
  fontFamily:
    '"Hiragino Maru Gothic ProN", "BIZ UDPGothic", "Yu Gothic", system-ui, sans-serif',
  overflow: "hidden",
});

const solidAreaStyle = css({ gridArea: "solid", minHeight: 0 });

const hudAreaStyle = css({
  gridArea: "hud",
  minHeight: 0,
  alignSelf: "center",
});

/**
 * The board, as wide as it is tall and no wider than the frame.
 *
 * The panel is laid over it in the same box, exactly as on the game's page, so it covers the
 * board and nothing else.
 */
const boardAreaStyle = css({
  gridArea: "board",
  position: "relative",
  minHeight: 0,
  justifySelf: "center",
  width: "min(100%, 58svh)",
  aspectRatio: "1",
  display: "grid",
});

const panelAreaStyle = css({
  position: "absolute",
  inset: 0,
  display: "grid",
  pointerEvents: "none",
  "& > *": { pointerEvents: "auto" },
});
