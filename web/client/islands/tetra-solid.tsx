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
 * Nothing here computes geometry; `games/tetra-do/solid.ts` does, and this places what it returns.
 */

import { clientEntry, css, type Handle } from "@remix-run/ui";

import { game } from "../games/tetra-do/game.ts";
import { ink, surface } from "../games/tetra-do/palette.ts";
import { buildScene, VIEW_BOX } from "../games/tetra-do/solid.ts";

/** The lit colour of the `e` the moment a turn lands home. */
const GLOW_COLOR = "#ffe27a";

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
      // The face the `e` is on: the one a clear is about, and so the one a clear lights.
      const markFace = scene.faces.find((face) => face.markTransform !== null);

      return (
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
              <circle cx={marker.x} cy={marker.y} r=".2" fill={marker.color} />
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
      );
    };
  },
);

// --- styles -----------------------------------------------------------------

const solidStyle = css({
  display: "block",
  width: "100%",
  height: "100%",
  transformOrigin: "center",
});
