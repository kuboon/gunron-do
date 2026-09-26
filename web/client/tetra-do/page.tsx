/**
 * テトラ道 — the game, with the screen to itself.
 *
 * The page is a layout and six islands: the solid, the clock, the board, the panel that covers
 * the board between rounds, the buttons, and the label saying which board this is. Nothing
 * of the game is decided here; the modules beside this file hold the rules and the islands read
 * them, which is what lets this file be the one place that says where each part goes.
 *
 * Why four islands rather than one. A turn of the solid runs at sixty frames a second and a board
 * re-render is twenty-five cells, so the two are split along the line that matters — what changes
 * per frame, and what changes per touch. They still agree because every one of them holds the same
 * `game`: the islands are separate browser entry points compiled as one graph, so that module is
 * emitted once and shared rather than copied into four chunks with four boards in them.
 *
 * The shell is dropped (`chrome: "bare"`) because on a phone the board should be as wide as the
 * phone. That is also why the page asks for `viewport-fit=cover` and pads with the safe-area
 * insets: laying out to the edges is only safe once the notch and the home indicator are known,
 * and they read as zero until a page opts in.
 */

import { css, type RemixNode } from "@remix-run/ui";

import { TetraBoard } from "./islands/tetra-board.tsx";
import { TetraControls } from "./islands/tetra-controls.tsx";
import { TetraHud } from "./islands/tetra-hud.tsx";
import { TetraSeed } from "./islands/tetra-seed.tsx";
import { TetraPanel } from "./islands/tetra-panel.tsx";
import { TetraSolid } from "./islands/tetra-solid.tsx";
import { findGame } from "../games.ts";
import { GAMECENTER_AUTHOR, type GameCenterManifest } from "../gamecenter.ts";
import { ACHIEVEMENTS, GAMECENTER_ID } from "./achievements.ts";
import { ink, surface } from "./palette.ts";
import { routes } from "../routes.ts";

const game = findGame("tetra-do")!;

/**
 * Just the game's name on the card, with `gunron-do` as the eyebrow above it.
 *
 * The `<title>` still carries both — a browser tab and a search result need to say where they
 * are — but a card has a picture doing that job, and a title that says the site's name twice is
 * a title with half its room wasted.
 */
export const title = `${game.title} — gunron-do`;
export const ogTitle: string = game.title;

/** The card is the game: the solid with its `e` lit, and the trace that got it there. */
export const art = "tetra-do";
export const description = game.description;

/** Islands, so the runtime boots. */
export const hydrate = true;

/** The screen is the game, and the game is dark. */
export const chrome = "bare" as const;
export const background: string = surface.ink;

/**
 * The game as GameCenter reads it: its name, its icon, and what can be earned in it.
 *
 * The icon is the site's own favicon — the tetrahedron, in the board's colours — named relative to
 * this page, which is how the hub resolves it. `static/favicon.svg` from `/tetra-do` is
 * `/static/favicon.svg`, and from a preview deploy's `/{branch}/tetra-do` it is that deploy's copy.
 */
export const gamecenter: GameCenterManifest = {
  $schema: "https://ga-cen.kbn.one/schema/gamecenter.json",
  id: GAMECENTER_ID,
  author: GAMECENTER_AUTHOR,
  title: game.title,
  description: game.tagline,
  icon: "static/favicon.svg",
  achievements: ACHIEVEMENTS,
};

/** What makes `env(safe-area-inset-*)` report anything other than zero. */
export const viewport =
  "width=device-width, initial-scale=1, viewport-fit=cover";

export default function TetraDoPage(): RemixNode {
  return (
    <div mix={screenStyle}>
      <header mix={headStyle}>
        <h1 mix={titleStyle}>{game.title}</h1>
        <TetraSeed />
      </header>

      <div mix={hudAreaStyle}>
        <TetraHud />
      </div>
      <div mix={solidAreaStyle}>
        <TetraSolid />
      </div>
      <div mix={boardAreaStyle}>
        <TetraBoard />
      </div>
      {
        /*
        The same grid cell as the board, so the panel covers the board and nothing else: the
        clock, the solid and the buttons stay where they are and stay readable. A grid area holds
        as many children as you give it, and they stack in the order they are written.
      */
      }
      <div mix={panelAreaStyle}>
        <TetraPanel />
      </div>
      <div mix={controlsAreaStyle}>
        <TetraControls />
      </div>

      <nav mix={navStyle}>
        <a mix={linkStyle} href={game.rulesHref}>ルールを読む</a>
        <a mix={linkStyle} href={routes.home.href()}>gunron-do</a>
      </nav>
    </div>
  );
}

// --- styles -----------------------------------------------------------------

/**
 * One column on a phone, two on anything wider.
 *
 * The board keeps its measure in both — a cell has to stay thumb-sized — so the width the wide
 * layout buys goes to the solid, which is the thing worth looking at while a trace is being drawn.
 *
 * `100svh` rather than `100vh` or `100dvh`: the small viewport is the one that is correct while
 * the browser's own chrome is at its largest, so the board never sits under it, and the layout does
 * not reflow every time a toolbar collapses mid-trace.
 */
const screenStyle = css({
  minHeight: "100svh",
  display: "grid",
  alignContent: "start",
  gap: "0.6rem",
  width: "min(94vw, 27rem)",
  marginInline: "auto",
  paddingTop: "max(0.75rem, env(safe-area-inset-top))",
  paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
  color: ink.text,
  // Said on the document too, in `Layout`, and said again here on every box inside the page.
  // Two reasons for the repetition: an engine may treat `touch-action` on the root and the body
  // as the viewport's rather than an element's, and WebKit has not always looked past the element
  // a tap actually landed on. At zero specificity, so it is a floor rather than a ceiling — the
  // board sets `none` over the top of it, which is what a trace needs.
  touchAction: "manipulation",
  ":where(&) :where(*)": { touchAction: "manipulation" },
  fontFamily:
    '"Hiragino Maru Gothic ProN", "BIZ UDPGothic", "Yu Gothic", system-ui, sans-serif',
  gridTemplateAreas: `"head" "hud" "solid" "board" "controls" "nav"`,

  "@media (min-width: 52rem)": {
    width: "min(96vw, 56rem)",
    gridTemplateColumns: "1fr 27rem",
    columnGap: "2rem",
    gridTemplateAreas:
      `"head head" "solid hud" "solid board" "solid controls" "solid nav"`,
  },
});

const headStyle = css({
  gridArea: "head",
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
});

const titleStyle = css({
  margin: 0,
  fontSize: "1.25rem",
  letterSpacing: "0.04em",
});

const navStyle = css({
  gridArea: "nav",
  display: "flex",
  gap: "1.25rem",
  marginTop: "0.4rem",
  fontSize: "0.85rem",
});

const linkStyle = css({
  color: ink.muted,
  textDecoration: "none",
  "&:hover": { color: ink.text, textDecoration: "underline" },
});

const hudAreaStyle = css({ gridArea: "hud" });
const boardAreaStyle = css({ gridArea: "board" });

/** Over the board, and only the board. Empty and untouchable when there is no panel up. */
const panelAreaStyle = css({
  gridArea: "board",
  position: "relative",
  display: "grid",
  pointerEvents: "none",
  "& > *": { pointerEvents: "auto" },
});
const controlsAreaStyle = css({ gridArea: "controls" });

/**
 * The solid's box.
 *
 * A share of the screen on a phone, and a square beside the board on a desktop — either way it is
 * given a size rather than taking one from its contents, because an SVG with no intrinsic size
 * would otherwise collapse to nothing inside a grid.
 */
const solidAreaStyle = css({
  gridArea: "solid",
  height: "30svh",
  minHeight: "10rem",

  "@media (min-width: 52rem)": {
    height: "auto",
    aspectRatio: "1",
    alignSelf: "start",
    position: "sticky",
    top: "1rem",
  },
});
