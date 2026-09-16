/**
 * Score, longest trace, and the time running out.
 *
 * On the frame clock rather than on the moves, because the bar has to empty smoothly between one
 * touch and the next — and because a round that ends does so on a frame, not on anything a player
 * did. It is a handful of nodes, which is what makes re-rendering it sixty times a second fine
 * here and not fine for the board.
 */

import { clientEntry, css, type Handle } from "@remix-run/ui";

import { game, LOW_TIME_MS, ROUND_MS } from "../games/tetra-do/game.ts";
import { ink, surface } from "../games/tetra-do/palette.ts";

export const TetraHud = clientEntry(
  import.meta.url,
  function TetraHud(handle: Handle) {
    if (typeof requestAnimationFrame !== "undefined") {
      const stop = game.onFrame(() => {
        handle.update();
      });
      handle.signal.addEventListener("abort", stop, { once: true });
    }

    return () => {
      const remaining = game.timeLeft;
      const low = remaining < LOW_TIME_MS;

      return (
        <div mix={hudStyle}>
          <div mix={rowStyle}>
            <span>
              得点<b mix={valueStyle}>{game.score}</b>
            </span>
            <span mix={rightStyle}>
              最長<b mix={valueStyle}>{game.longest}</b>
            </span>
          </div>
          <div
            mix={barStyle}
            role="progressbar"
            aria-label="残り時間"
            aria-valuemin={0}
            aria-valuemax={Math.round(ROUND_MS / 1000)}
            aria-valuenow={Math.ceil(remaining / 1000)}
          >
            <i
              mix={low ? [fillStyle, lowStyle] : [fillStyle]}
              style={{ width: `${(remaining / ROUND_MS) * 100}%` }}
            />
          </div>
        </div>
      );
    };
  },
);

// --- styles -----------------------------------------------------------------

const hudStyle = css({ display: "grid", gap: "0.4rem" });

const rowStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "0.75rem",
  fontSize: "0.9rem",
  color: ink.muted,
});

const valueStyle = css({
  color: ink.text,
  fontSize: "1.35rem",
  fontVariantNumeric: "tabular-nums",
  marginLeft: "0.35rem",
});

const rightStyle = css({ marginLeft: "auto" });

const barStyle = css({
  height: "6px",
  borderRadius: "3px",
  background: surface.board,
  overflow: "hidden",
});

const fillStyle = css({
  display: "block",
  height: "100%",
  background: ink.text,
});

const lowStyle = css({ background: ink.bad });
