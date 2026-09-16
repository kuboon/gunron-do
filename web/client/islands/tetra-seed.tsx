/**
 * Which board this is: today's date, or the six characters of a random one.
 *
 * Small enough to look like it belongs in the HUD, and in the header instead because that is where
 * it answers its question — a player reads it when they want to know whether the board they are
 * looking at is the one everybody else got today. It is an island of its own only because the
 * header around it is not one; a page cannot know which board a round is on until a round starts.
 */

import { clientEntry, css, type Handle } from "@remix-run/ui";

import { game } from "../games/tetra-do/game.ts";
import { ink } from "../games/tetra-do/palette.ts";

export const TetraSeed = clientEntry(
  import.meta.url,
  function TetraSeed(handle: Handle) {
    const stop = game.subscribe(() => {
      handle.update();
    });
    handle.signal.addEventListener("abort", stop, { once: true });

    return () => <span mix={seedStyle}>{game.seedLabel}</span>;
  },
);

// --- styles -----------------------------------------------------------------

const seedStyle = css({
  color: ink.muted,
  fontSize: "0.8rem",
});
