/**
 * Score, longest trace, and the time running out — and what it looks like when one of them moves.
 *
 * The board used to explain itself in a line of prose underneath it. It does not any more, so the
 * numbers have to carry it: a clear throws `+25` up off the score, beating the longest trace
 * throws the new length off that one, and a miss throws `−5秒` off the clock. What each of them
 * does is say *where* it happened, which a line of text under the board could not.
 *
 * The animation is arithmetic rather than a keyframe: this island already re-renders on the game's
 * frame clock, so the age of a pop is a number it has on the frame it is drawing, and the scale
 * and the fade fall out of it. Nothing has to be started, stopped, or cleaned up, and a second
 * clear that lands mid-animation restarts it rather than queueing behind it.
 */

import { clientEntry, css, type Handle } from "@remix-run/ui";

import {
  game,
  LOW_TIME_MS,
  type Pop,
  ROUND_MS,
} from "../games/tetra-do/game.ts";
import { ink, OP_COLORS, surface } from "../games/tetra-do/palette.ts";

/** How long a pop lives. Long enough to read, short enough to be gone by the next trace. */
const POP_MS = 900;

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
      const now = performance.now();
      const remaining = game.timeLeft;
      const low = remaining < LOW_TIME_MS;

      const score = age(game.scorePop, now);
      const longest = age(game.longestPop, now);
      const time = age(game.timePop, now);

      return (
        <div mix={hudStyle}>
          <div mix={rowStyle}>
            <span mix={statStyle}>
              得点
              <b mix={valueStyle} style={{ transform: bump(score) }}>
                {game.score}
              </b>
              {score === null ? null : (
                <span
                  mix={popStyle}
                  style={{ ...float(score, -0.5), color: ink.good }}
                >
                  {game.scorePop?.text}
                </span>
              )}
            </span>

            <span mix={[statStyle, rightStyle]}>
              最長
              <b mix={valueStyle} style={{ transform: bump(longest) }}>
                {game.longest}
              </b>
              {longest === null ? null : (
                <span
                  mix={[popStyle, popLeftStyle]}
                  style={{ ...float(longest, -0.5), color: OP_COLORS[0] }}
                >
                  {game.longestPop?.text}
                </span>
              )}
            </span>
          </div>

          <div mix={barWrapStyle}>
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
            {time === null ? null : (
              <span
                mix={[popStyle, timePopStyle]}
                style={{ ...float(time, 0.4), color: ink.bad }}
              >
                {game.timePop?.text}
              </span>
            )}
          </div>
        </div>
      );
    };
  },
);

// --- the pop, as arithmetic --------------------------------------------------

/**
 * How far along a pop is, or `null` once it is over.
 *
 * @param pop The number's last jump, from the game
 * @param now The frame's timestamp
 * @returns `0` to `1`, or `null` when there is nothing to draw
 */
function age(pop: Pop | null, now: number): number | null {
  if (pop === null) return null;
  const t = (now - pop.at) / POP_MS;
  return t >= 0 && t < 1 ? t : null;
}

/**
 * Overshoot, then settle. The ⅓ of a second where a pop earns the word.
 *
 * @param t How far along, `0` to `1`
 * @returns The scale, back past its resting size and down to it
 */
function overshoot(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = Math.min(1, t / 0.28) - 1;
  return 0.45 + 0.55 * (1 + c3 * x * x * x + c1 * x * x);
}

/** The number's own nudge: up and back, so it reads as having been hit. */
function bump(t: number | null): string {
  if (t === null) return "scale(1)";
  return `scale(${1 + 0.22 * Math.sin(Math.PI * Math.min(1, t / 0.32))})`;
}

/**
 * The floating text: it pops out, drifts, and fades in the last third.
 *
 * It drifts sideways-and-up beside its number rather than straight over it, because the row of
 * numbers has the title right above it — a pop that rose far enough to be noticed would land on
 * the game's own name. The clock's pop falls instead: it is a loss, and there is room below.
 *
 * @param t How far along, `0` to `1`
 * @param rise How far to drift, in rem — negative is up
 */
function float(
  t: number,
  rise: number,
): { transform: string; opacity: number } {
  return {
    transform: `translateY(${rise * t}rem) scale(${overshoot(t)})`,
    opacity: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4,
  };
}

// --- styles -----------------------------------------------------------------

const hudStyle = css({ display: "grid", gap: "0.4rem" });

const rowStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "0.75rem",
  fontSize: "0.9rem",
  color: ink.muted,
});

/** The anchor a pop floats from, so it lands over its own number. */
const statStyle = css({ position: "relative" });

const valueStyle = css({
  display: "inline-block",
  color: ink.text,
  fontSize: "1.35rem",
  fontVariantNumeric: "tabular-nums",
  marginLeft: "0.35rem",
  transformOrigin: "center bottom",
});

const rightStyle = css({ marginLeft: "auto" });

/**
 * Out of the flow, above the number it belongs to.
 *
 * Absolute because a pop must not move the layout it pops out of: the score sliding sideways for
 * a fifth of a second would undo the point of drawing attention to it.
 */
const popStyle = css({
  position: "absolute",
  left: "calc(100% + 0.4rem)",
  bottom: "0.1em",
  fontSize: "1.05rem",
  fontWeight: 700,
  whiteSpace: "nowrap",
  pointerEvents: "none",
  transformOrigin: "left bottom",
});

/** The same, on the other side: the longest trace sits at the right edge of the row. */
const popLeftStyle = css({
  left: "auto",
  right: "calc(100% + 0.4rem)",
  transformOrigin: "right bottom",
});

const barWrapStyle = css({ position: "relative" });

/** Under the bar, where nothing else is. */
const timePopStyle = css({
  left: "auto",
  right: "0",
  bottom: "auto",
  top: "calc(100% + 0.2rem)",
  fontSize: "0.95rem",
  transformOrigin: "right top",
});

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
