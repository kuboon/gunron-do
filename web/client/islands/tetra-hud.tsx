/**
 * Score, longest trace, and the time running out — and what it looks like when one of them moves.
 *
 * The board used to explain itself in a line of prose underneath it. It does not any more, so the
 * numbers carry it: a clear throws `+25` off the score, and beating the longest trace throws the
 * new length off that one. What each of them does is say *where* it happened, which a line of
 * text under the board could not.
 *
 * The animation is arithmetic rather than a keyframe: this island already re-renders on the game's
 * frame clock, so the age of a pop is a number it has on the frame it is drawing, and the scale
 * and the fade fall out of it. Nothing has to be started, stopped, or cleaned up, and a second
 * clear that lands mid-animation restarts it rather than queueing behind it.
 *
 * The last ten seconds are this island's other job. The clock counts them out loud, and the
 * screen says the same thing without a word: the edges pull in red on every beat, harder as the
 * number falls. It is the one effect here that is *meant* to be uncomfortable, which is also why
 * it holds still for anyone who asked for less motion.
 */

import { clientEntry, css, type Handle } from "@remix-run/ui";

import {
  game,
  LOW_TIME_MS,
  type Pop,
  ROUND_MS,
  URGENT_MS,
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

    // Read once: a player who asked for less motion gets the pressure as a steady tint rather
    // than a pulse on every second.
    const calm = typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    return () => {
      const now = performance.now();
      const remaining = game.timeLeft;
      const low = remaining < LOW_TIME_MS;
      const urgent = game.phase === "playing" && remaining <= URGENT_MS;

      // Spikes on each second and decays: the shape of a beat rather than a blink.
      const sinceBeat = ((1000 - (remaining % 1000)) % 1000) / 1000;
      const beat = calm ? 0.35 : Math.pow(1 - sinceBeat, 3);
      const depth = 1 - remaining / URGENT_MS;

      const score = age(game.scorePop, now);
      const longest = age(game.longestPop, now);

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

          {urgent
            ? (
              <div
                mix={vignetteStyle}
                style={{ opacity: 0.16 + 0.34 * depth + 0.22 * beat }}
              />
            )
            : null}

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
            {urgent
              ? (
                <span
                  mix={countdownStyle}
                  style={{
                    transform: `scale(${1 + 0.35 * beat})`,
                    opacity: 0.7 + 0.3 * beat,
                  }}
                >
                  {Math.ceil(remaining / 1000)}
                </span>
              )
              : null}
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

/**
 * The seconds, under the right end of the bar, once there are few enough to count.
 *
 * On the beat rather than smooth: a number that grows and settles twice a second is harder to
 * ignore than one that merely changes, which is the point of it being there at all.
 */
const countdownStyle = css({
  position: "absolute",
  right: "0",
  top: "calc(100% + 0.1rem)",
  fontSize: "1.45rem",
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  color: ink.bad,
  pointerEvents: "none",
  transformOrigin: "right top",
});

/**
 * The red closing in from the edges of the screen.
 *
 * Fixed and over everything, because the pressure is on the player rather than on the board —
 * and it is a shadow inside the viewport rather than a wash over it, so the board stays as
 * readable on the last second as on the first.
 */
const vignetteStyle = css({
  position: "fixed",
  inset: "0",
  zIndex: 5,
  pointerEvents: "none",
  // A gradient with a clear middle rather than a shadow across the whole viewport: the pressure
  // has to be felt at the edges of the eye while the board stays exactly as readable as it was.
  background:
    `radial-gradient(ellipse at center, transparent 42%, ${ink.bad} 128%)`,
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
