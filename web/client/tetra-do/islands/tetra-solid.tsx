/**
 * The solid, drawn where the game says it is.
 *
 * Its own island because of how often it changes: a turn runs at sixty frames a second, and every
 * one of those frames would otherwise be a re-render of twenty-five cells that did not move. Here
 * it is a dozen nodes, and the board next door hears nothing.
 *
 * The drawing is see-through on purpose. Four opaque faces would hide three of themselves, and the
 * whole question the picture answers — which of the twelve rotations are you in — is a question
 * about all four at once. The `e` on the home face is the other half of that answer: a player
 * learns to look for it rather than reading the score line to find out whether the trace closed.
 *
 * Nothing here computes geometry; `tetra-do/solid.ts` does, and this places what it returns.
 */

import { clientEntry, css, type Handle } from "@remix-run/ui";

import { refuseDoubleTap } from "../../gestures.ts";

import { game, URGENT_MS } from "../game.ts";
import { ink, OP_COLORS, surface } from "../palette.ts";
import type { Shape } from "../rotation.ts";
import { buildScene, VIEW_BOX } from "../solid.ts";

/** The lit colour of the `e` the moment a turn lands home. */
const GLOW_COLOR = "#ffe27a";

/**
 * A colour for each name the clear can be called, so the shout reads before it is read.
 *
 * The three forms worth learning each get one of the board's three colours; the plain longer
 * answers are the quiet green.
 */
const SHOUT_COLORS: Record<Shape, string> = {
  "巡回": OP_COLORS[1],
  "半回転": OP_COLORS[2],
  "共役": OP_COLORS[0],
  "三連": ink.text,
  "4手": ink.good,
  "5手": ink.good,
  "6手": ink.good,
};

export const TetraSolid = clientEntry(
  import.meta.url,
  function TetraSolid(handle: Handle) {
    // The clock lives with the listeners, so subscribing is also what starts it — and only in a
    // browser: the server renders one still frame of the home orientation and has no clock at all.
    if (typeof requestAnimationFrame !== "undefined") {
      const stop = game.onFrame(() => {
        handle.update();
      });
      handle.signal.addEventListener("abort", stop, { once: true });
    }

    return () => {
      const scene = buildScene(game.orientation, game.axis);
      const { flash, glow } = game;
      const shout = game.shout;
      // The first name sets the colour of the burst behind the words; the rarest name leads.
      const lead = shout?.shapes.find((shape) => shape in RARE) ??
        shout?.shapes[0];
      // The face the `e` is on: the one a clear is about, and so the one a clear lights.
      const markFace = scene.faces.find((face) => face.markTransform !== null);

      // The big number over the solid: three, two, one on the way in, then the last ten seconds.
      // Same number in the same place, so the one teaches you to read the other.
      const count = game.phase === "counting"
        ? Math.ceil(game.leadIn / 1000)
        : game.phase === "playing" && game.timeLeft <= URGENT_MS
        ? Math.ceil(game.timeLeft / 1000)
        : null;
      // Spikes as each second lands and decays: a beat rather than a blink.
      const ms = game.phase === "counting" ? game.leadIn : game.timeLeft;
      const beat = Math.pow(((ms % 1000) + 1000) % 1000 / 1000, 3);

      return (
        <div mix={[wrapStyle, ...refuseDoubleTap()]}>
          {count === null ? null : (
            <span
              mix={game.phase === "counting"
                ? [countStyle]
                : [countStyle, urgentCountStyle]}
              style={{
                transform: `translate(-50%, -50%) scale(${1 + 0.3 * beat})`,
                opacity: 0.65 + 0.35 * beat,
              }}
              aria-hidden="true"
            >
              {count}
            </span>
          )}

          {
            /*
            The shout is two layers. The burst — rays and rings — goes behind the solid, like the
            count: it is light, and the solid is see-through, so it reads through the faces. The
            words go over the solid: behind it the faces wash them out to nothing, and a name you
            have to squint for is not a shout. Both are keyed on the shout, so a second clear
            starts the whole thing again, and all of it is CSS, so none of it costs the frame loop.
          */
          }
          {shout === null || lead === undefined ? null : (
            <div
              key={`burst-${shout.id}`}
              mix={shoutStyle}
              style={{ "--shout": SHOUT_COLORS[lead] }}
              aria-hidden="true"
            >
              <i mix={raysStyle} />
              <i mix={ringStyle} />
              <i mix={[ringStyle, ringLateStyle]} />
            </div>
          )}

          <svg
            viewBox={VIEW_BOX}
            mix={solidStyle}
            // A push outward on a clear, fading with the flash: the solid reacting to the thing it
            // just did, rather than only reporting it.
            style={{ transform: `scale(${1 + 0.07 * flash})` }}
            role="img"
            aria-label="正四面体のいまの向き"
          >
            <defs>
              <filter id="tetra-glow" x="-1" y="-1" width="3" height="3">
                <feGaussianBlur stdDeviation=".09" />
              </filter>
            </defs>

            {scene.axis
              ? (
                <line
                  x1={scene.axis.x1}
                  y1={scene.axis.y1}
                  x2={scene.axis.x2}
                  y2={scene.axis.y2}
                  stroke={scene.axis.color}
                  stroke-width=".05"
                  stroke-dasharray=".12 .08"
                />
              )
              : null}

            {scene.markers.map((marker) => (
              <g key={marker.name}>
                <circle
                  cx={marker.x}
                  cy={marker.y}
                  r=".2"
                  fill={marker.color}
                />
                <text
                  x={marker.x}
                  y={marker.y + 0.08}
                  text-anchor="middle"
                  font-size=".24"
                  font-weight="bold"
                  fill={surface.ink}
                >
                  {marker.name}
                </text>
              </g>
            ))}

            {/* Back faces first: in SVG the order they are written is the order they are painted. */}
            {scene.faces.map((face) => (
              <g key={face.index}>
                <polygon
                  points={face.points}
                  fill={face.fill}
                  fill-opacity={face.front ? 0.5 : 0.35}
                  stroke={ink.text}
                  stroke-opacity={face.front ? 0.9 : 0.35}
                  stroke-width=".035"
                  stroke-linejoin="round"
                />
                {face.markTransform
                  ? (
                    <>
                      {glow > 0 && face.front
                        ? (
                          <>
                            <polygon
                              points={face.points}
                              fill="#fff1a8"
                              fill-opacity={0.35 * glow * glow}
                            />
                            <text
                              transform={face.markTransform}
                              x="0"
                              y=".3"
                              text-anchor="middle"
                              font-size=".95"
                              font-weight="bold"
                              font-style="italic"
                              fill={GLOW_COLOR}
                              stroke={GLOW_COLOR}
                              stroke-width=".12"
                              filter="url(#tetra-glow)"
                              opacity={glow * glow}
                            >
                              e
                            </text>
                          </>
                        )
                        : null}
                      <text
                        transform={face.markTransform}
                        x="0"
                        y=".3"
                        text-anchor="middle"
                        font-size=".95"
                        font-weight="bold"
                        font-style="italic"
                        fill={ink.text}
                        fill-opacity={face.front ? 1 : 0.4}
                      >
                        e
                      </text>
                    </>
                  )
                  : null}
              </g>
            ))}

            {
              /*
            The clear, on the face it is about. The `e` face is already washed and blooming from
            the glow underneath; this is the rim that goes round it, drawn last so it sits over
            everything, and it is what says *cleared* rather than merely *home*.
          */
            }
            {flash > 0 && markFace !== undefined
              ? (
                <polygon
                  points={markFace.points}
                  fill="none"
                  stroke={ink.good}
                  stroke-width={0.05 + 0.13 * flash}
                  stroke-linejoin="round"
                  opacity={flash}
                />
              )
              : null}
          </svg>

          {shout === null || lead === undefined ? null : (
            <div
              key={`words-${shout.id}`}
              mix={shoutStyle}
              style={{ "--shout": SHOUT_COLORS[lead] }}
              aria-live="polite"
            >
              <span mix={wordsStyle}>
                {shout.shapes.map((shape, i) => (
                  <b
                    key={i}
                    mix={wordStyle}
                    style={{
                      color: SHOUT_COLORS[shape],
                      fontSize: shout.shapes.length > 2
                        ? "clamp(1.8rem, 11vw, 2.8rem)"
                        : "clamp(2.6rem, 17vw, 4.4rem)",
                      animationDelay: `${i * 90}ms`,
                    }}
                  >
                    {shape}
                  </b>
                ))}
              </span>
            </div>
          )}
        </div>
      );
    };
  },
);

// --- styles -----------------------------------------------------------------

/** The names worth leading with when a clear has several. */
const RARE: Partial<Record<Shape, true>> = {
  "共役": true,
  "半回転": true,
  "巡回": true,
};

/** The solid's own box, so the count can be laid over the middle of it. */
const wrapStyle = css({
  position: "relative",
  width: "100%",
  height: "100%",
});

/** Positioned, and after the count in the markup, so the solid is drawn over it. */
const solidStyle = css({
  position: "relative",
  display: "block",
  width: "100%",
  height: "100%",
  transformOrigin: "center",
});

/**
 * The count, over the solid.
 *
 * Big, in the middle, and *behind* it: it is a number you read out of the corner of your eye
 * while looking at something else, so it has to be large enough not to need looking at — and
 * behind the solid, because the `e` you are watching is the thing it must not cover.
 */
const countStyle = css({
  position: "absolute",
  left: "50%",
  top: "50%",
  fontSize: "clamp(4rem, 26vw, 8rem)",
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1,
  color: ink.text,
  textShadow: `0 0 1.5rem ${surface.ink}`,
  pointerEvents: "none",
  userSelect: "none",
});

/** The same number once it is the round running out, which is a different thing to feel. */
const urgentCountStyle = css({ color: ink.bad });

/**
 * The shout's box: the middle of the solid, behind it, and out of the way of the pointer.
 *
 * `overflow: visible` on purpose: the rays are meant to run past the edge of the box.
 */
const shoutStyle = css({
  position: "absolute",
  inset: "0",
  display: "grid",
  placeItems: "center",
  pointerEvents: "none",
  userSelect: "none",
});

/** A fan of rays, turning as it opens and gone by the time the words have settled. */
const raysStyle = css({
  position: "absolute",
  left: "50%",
  top: "50%",
  width: "150%",
  aspectRatio: "1",
  borderRadius: "50%",
  background:
    "repeating-conic-gradient(from 0deg, var(--shout) 0deg 6deg, transparent 6deg 24deg)",
  maskImage: "radial-gradient(circle, #000 8%, transparent 62%)",
  WebkitMaskImage: "radial-gradient(circle, #000 8%, transparent 62%)",
  "@keyframes tetra-rays": {
    "0%": {
      transform: "translate(-50%, -50%) rotate(0deg) scale(0.2)",
      opacity: 0,
    },
    "15%": { opacity: 0.85 },
    "100%": {
      transform: "translate(-50%, -50%) rotate(55deg) scale(1.05)",
      opacity: 0,
    },
  },
  animation: "tetra-rays 1300ms cubic-bezier(.15,.7,.3,1) forwards",
  "@media (prefers-reduced-motion: reduce)": { animation: "none", opacity: 0 },
});

/** A ring that leaves the middle at speed. A second, later one follows it out. */
const ringStyle = css({
  position: "absolute",
  left: "50%",
  top: "50%",
  width: "60%",
  aspectRatio: "1",
  borderRadius: "50%",
  border: "0.35rem solid var(--shout)",
  "@keyframes tetra-shout-ring": {
    "0%": { transform: "translate(-50%, -50%) scale(0.15)", opacity: 1 },
    "100%": { transform: "translate(-50%, -50%) scale(1.9)", opacity: 0 },
  },
  animation: "tetra-shout-ring 700ms cubic-bezier(.1,.75,.3,1) forwards",
  "@media (prefers-reduced-motion: reduce)": { animation: "none", opacity: 0 },
});

const ringLateStyle = css({ animationDelay: "120ms", opacity: 0 });

/** The words, stacked: one line per answer that was not a triple. */
const wordsStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.1rem",
});

/**
 * One name: slammed in too big and too fast, overshoots small, settles, holds, and lifts off.
 *
 * The slam is the point. It lands at three times its size, a little turned, then snaps down — the
 * same overshoot the score uses, taken further — and the glow and the dark edge are what keep it
 * readable over a solid and a burst of rays at once.
 */
const wordStyle = css({
  fontWeight: 900,
  letterSpacing: "0.06em",
  lineHeight: 1.05,
  whiteSpace: "nowrap",
  WebkitTextStroke: `0.18rem ${surface.ink}`,
  paintOrder: "stroke fill",
  textShadow: "0 0 0.9rem currentColor, 0 0.25rem 1.2rem rgba(0,0,0,0.6)",
  "@keyframes tetra-word": {
    "0%": { transform: "scale(3) rotate(-9deg)", opacity: 0 },
    "14%": { transform: "scale(0.86) rotate(3deg)", opacity: 1 },
    "24%": { transform: "scale(1.12) rotate(-1deg)", opacity: 1 },
    "34%": { transform: "scale(1) rotate(0deg)", opacity: 1 },
    "74%": { transform: "scale(1) rotate(0deg)", opacity: 1 },
    "100%": { transform: "scale(1.15) translateY(-40%)", opacity: 0 },
  },
  animation: "tetra-word 1300ms cubic-bezier(.2,.7,.3,1) both",
  "@media (prefers-reduced-motion: reduce)": {
    animation: "tetra-word-still 1300ms linear both",
  },
  "@keyframes tetra-word-still": {
    "0%, 80%": { opacity: 1 },
    "100%": { opacity: 0 },
  },
});
