/**
 * 群シューター — the game, with the whole screen.
 *
 * One island, because the game is one picture: the arena and the HUD over it. Nothing is decided
 * here; the modules beside this file hold the rules and the island reads them.
 *
 * The shell is dropped (`chrome: "bare"`) and the page is exactly the viewport, because a
 * game played over the whole field is the screen. `viewport-fit=cover` lets the arena run under the notch while
 * the HUD keeps to the safe area.
 */

import { css, type RemixNode } from "@remix-run/ui";

import { findGame } from "../games.ts";
import { routes } from "../routes.ts";
import { GunArena } from "./islands/gun-arena.tsx";
import { INK, NIGHT } from "./palette.ts";

const game = findGame("gun-shooter")!;

export const title = `${game.title} — gunron-do`;
export const ogTitle: string = game.title;
export const description = game.description;

/** The island, so the runtime boots. */
export const hydrate = true;

/** The screen is the game. */
export const chrome = "bare" as const;
export const background: string = NIGHT;

/** What makes `env(safe-area-inset-*)` report anything other than zero. */
export const viewport =
  "width=device-width, initial-scale=1, viewport-fit=cover";

export default function GunShooterPage(): RemixNode {
  return (
    <div mix={screenStyle}>
      <GunArena />
      <nav mix={navStyle}>
        <a mix={linkStyle} href={game.rulesHref}>ルール</a>
        <a mix={linkStyle} href={routes.home.href()}>gunron-do</a>
      </nav>
    </div>
  );
}

// --- styles -----------------------------------------------------------------

/** Exactly the viewport. `100svh` so the browser's own chrome never sits over the HUD. */
const screenStyle = css({
  position: "relative",
  width: "100vw",
  height: "100svh",
  overflow: "hidden",
  background: NIGHT,
});

/** Top left, under the lives: the bottom of the screen belongs to the gun and its buttons. */
const navStyle = css({
  position: "absolute",
  left: "max(0.8rem, env(safe-area-inset-left))",
  top: "calc(max(0.6rem, env(safe-area-inset-top)) + 2.6rem)",
  display: "flex",
  gap: "1rem",
  fontSize: "0.75rem",
  fontFamily: "system-ui, sans-serif",
});

const linkStyle = css({
  color: INK.muted,
  textDecoration: "none",
  "&:hover": { color: INK.text, textDecoration: "underline" },
});
