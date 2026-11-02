/**
 * The row under the board of the player X shows inside a post.
 *
 * A replay in somebody's timeline has to be stoppable: it plays sound and runs for a minute, in a
 * frame the reader may have scrolled past without meaning to start. So the bar has what a player
 * has — mute, pause, and a way back to the start — and nothing else. The round's own controls, the
 * lesson and the links into the site are on the game's page and not here.
 */

import { clientEntry, css, type Handle, on } from "@remix-run/ui";

import { game } from "../game.ts";
import { ink, OP_COLORS, surface } from "../palette.ts";
import { sound } from "../sound.ts";

export const TetraPlayerBar = clientEntry(
  import.meta.url,
  function TetraPlayerBar(handle: Handle) {
    const stop = game.subscribe(() => {
      handle.update();
    });
    handle.signal.addEventListener("abort", stop, { once: true });

    // A browser holding the sound back lets it out on the first touch, and the button has to stop
    // asking for one without the game having changed.
    const stopSound = sound.subscribe(() => {
      handle.update();
    });
    handle.signal.addEventListener("abort", stopSound, { once: true });

    return () => {
      // Holding or stopping means something only while the replay is running.
      const running = game.replaying && game.phase === "playing";
      const watching = game.replaying && game.phase !== "over";

      return (
        <div mix={barStyle}>
          <button
            type="button"
            aria-pressed={sound.enabled ? "true" : "false"}
            aria-label={sound.enabled ? "音を消す" : "音を出す"}
            mix={[
              buttonStyle,
              on<HTMLButtonElement>("click", () => {
                sound.toggle();
                handle.update();
              }),
            ]}
          >
            {sound.blocked
              ? "タップで音を出す"
              : sound.enabled
              ? "音あり"
              : "音なし"}
          </button>
          <button
            type="button"
            disabled={!running}
            mix={[
              buttonStyle,
              on<HTMLButtonElement>(
                "click",
                () => game.setPaused(!game.paused),
              ),
            ]}
          >
            {game.paused ? "再開" : "一時停止"}
          </button>
          {
            /*
            `preview` puts the day's board back and the phase back to `ready`, which is the panel the
            recording started from — scoreboard, リプレイを再生 and all.
          */
          }
          <button
            type="button"
            disabled={!watching}
            mix={[
              buttonStyle,
              stopStyle,
              on<HTMLButtonElement>("click", () => game.preview(game.date)),
            ]}
          >
            停止
          </button>
        </div>
      );
    };
  },
);

const barStyle = css({
  display: "flex",
  justifyContent: "center",
  gap: "0.4rem",
});

const buttonStyle = css({
  font: "inherit",
  fontSize: "0.8rem",
  cursor: "pointer",
  padding: "0.3rem 0.7rem",
  borderRadius: "8px",
  border: `1px solid ${surface.edge}`,
  background: surface.board,
  color: ink.text,
  "&:active": { transform: "translateY(1px)" },
  "&:disabled": { opacity: 0.45, cursor: "not-allowed" },
});

const stopStyle = css({
  borderColor: OP_COLORS[0],
  color: OP_COLORS[0],
});
