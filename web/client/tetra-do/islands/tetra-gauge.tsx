/**
 * The clear button: hold it, and every marked road goes at once.
 *
 * A button rather than the finger coming up, because a trace that clears on release is a trace a
 * player takes the moment it closes — and the moment `a a a` closes is very soon. Marking instead
 * of clearing lets the roads pile up, and the hold puts a price on cashing them in: two seconds of
 * the round, paid once for however many there are.
 *
 * The gauge fills left to right on the game's clock, not this island's. It is the game that clears
 * when it is full, and a recording carries the press and the release rather than the moment of the
 * clear, so a replay shows the same gauge rising for the same two seconds.
 *
 * Its own island for the same reason the solid is one: the fill moves every frame while it is held,
 * and the board next door should not hear about it.
 */

import { clientEntry, css, type Handle, on } from "@remix-run/ui";

import { refuseDoubleTap } from "../../gestures.ts";
import { game } from "../game.ts";
import { ink, surface } from "../palette.ts";

export const TetraGauge = clientEntry(
  import.meta.url,
  function TetraGauge(handle: Handle) {
    if (typeof requestAnimationFrame !== "undefined") {
      const stop = game.onFrame(() => {
        handle.update();
      });
      handle.signal.addEventListener("abort", stop, { once: true });
    }

    let pressed = false;
    const press = (down: boolean): void => {
      if (pressed === down) return;
      pressed = down;
      game.holdClear(down);
    };

    return () => {
      const roads = game.roads.length;
      const live = game.phase === "playing" || game.phase === "teaching";
      const usable = live && !game.replaying && roads > 0;
      const gauge = game.gauge;

      return (
        <button
          type="button"
          disabled={!usable && !game.holding}
          aria-label={`印の付いた道を消す（長押し）。${roads}本`}
          mix={[
            buttonStyle,
            ...refuseDoubleTap(),
            on("pointerdown", (event) => {
              if (!usable) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              press(true);
            }),
            on("pointerup", () => press(false)),
            on("pointercancel", () => press(false)),
            on("lostpointercapture", () => press(false)),
            on("keydown", (event) => {
              if (event.repeat || !usable) return;
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                press(true);
              }
            }),
            on("keyup", (event) => {
              if (event.key === " " || event.key === "Enter") press(false);
            }),
            on("blur", () => press(false)),
            // A long press on a phone would otherwise offer to select the label.
            on("contextmenu", (event) => event.preventDefault()),
          ]}
        >
          <span
            mix={fillStyle}
            style={{ transform: `scaleX(${gauge})` }}
            aria-hidden="true"
          />
          <span mix={labelStyle}>
            {roads === 0
              ? "道をなぞると、ここで消せます"
              : `長押しで ${roads} 本の道を消す`}
          </span>
        </button>
      );
    };
  },
);

// --- styles -----------------------------------------------------------------

const buttonStyle = css({
  position: "relative",
  width: "100%",
  height: "2.6rem",
  overflow: "hidden",
  font: "inherit",
  fontSize: "0.9rem",
  fontWeight: 700,
  cursor: "pointer",
  borderRadius: "10px",
  border: `1px solid ${ink.good}`,
  background: surface.board,
  color: ink.text,
  // A hold, not a tap: no scrolling, no selection, no callout.
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
  "&:disabled": {
    cursor: "default",
    borderColor: surface.edge,
    color: ink.muted,
  },
});

/** The gauge: the button's own width, scaled from the left edge. */
const fillStyle = css({
  position: "absolute",
  inset: "0",
  transformOrigin: "left center",
  background: ink.good,
  opacity: 0.45,
  pointerEvents: "none",
});

const labelStyle = css({
  position: "relative",
  pointerEvents: "none",
});
