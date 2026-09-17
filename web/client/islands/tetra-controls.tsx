/**
 * The row of buttons under the board.
 *
 * Only the buttons: what book-ends a round is a panel over the board, and it lives in
 * `tetra-panel.tsx`. What is left here is the handful of switches that stay reachable while a
 * round is running, which is why they are outside the panel rather than on it.
 *
 * The row changes with what the page is doing. A board being played offers the settings and a way
 * back to today; a recording being watched offers a way to hold it and a way to take it on.
 *
 * Anything that changes the URL leaves through a document navigation, marked `data-rmx-document`.
 * The page is its URL: the day decides the board, and the board is laid out once, when the island
 * starts. A frame reload would swap the HTML under a game that is still running on the old day.
 */

import { clientEntry, css, type Handle, on } from "@remix-run/ui";

import { game } from "../games/tetra-do/game.ts";
import { ink, OP_COLORS, surface } from "../games/tetra-do/palette.ts";
import { boardUrl, todayInTokyo } from "../games/tetra-do/session.ts";
import { sound } from "../games/tetra-do/sound.ts";
import { tutorial } from "../games/tetra-do/tutorial.ts";

export const TetraControls = clientEntry(
  import.meta.url,
  function TetraControls(handle: Handle) {
    const stop = game.subscribe(() => {
      handle.update();
    });
    handle.signal.addEventListener("abort", stop, { once: true });

    // The sound button can also change without the game changing: a browser that was holding the
    // sound back lets it out on the first touch, and the button has to stop asking for one.
    const stopSound = sound.subscribe(() => {
      handle.update();
    });
    handle.signal.addEventListener("abort", stopSound, { once: true });

    const stopTutorial = tutorial.subscribe(() => {
      handle.update();
    });
    handle.signal.addEventListener("abort", stopTutorial, { once: true });

    return () => (
      // One root, whatever the row is doing. An island that returns a different element on the
      // client than the server drew leaves the server's behind: the reconciler matches on shape,
      // and a lesson row where a button row used to be is not the same shape.
      <div mix={teachStyle}>
        {tutorial.running ? <p mix={saysStyle}>{tutorial.says}</p> : null}

        <div mix={controlsStyle}>
          <button
            type="button"
            aria-pressed={sound.enabled ? "true" : "false"}
            aria-label={sound.enabled ? "音を消す" : "音を出す"}
            mix={buttonMix(sound.enabled, () => {
              sound.toggle();
              handle.update();
            })}
          >
            {
              /*
              A browser will not let a page make a noise until someone has touched it. That is
              normally settled by the button that starts the round, but a page can be sitting here
              untouched — so on the rare occasion it is still being held back, the button says so.
            */
            }
            {sound.blocked
              ? "タップで音を出す"
              : sound.enabled
              ? "音あり"
              : "音なし"}
          </button>

          {tutorial.running
            ? (
              <>
                <div mix={dotsStyle} aria-hidden="true">
                  {Array.from({ length: tutorial.length }, (_, i) => (
                    <i
                      key={i}
                      mix={i < tutorial.at
                        ? [dotStyle, dotOnStyle]
                        : [dotStyle]}
                    />
                  ))}
                </div>
                {tutorial.finished
                  ? (
                    <button
                      type="button"
                      mix={[
                        startStyle,
                        on<HTMLButtonElement>("click", () => {
                          tutorial.remember(true);
                          tutorial.stop();
                          game.restart();
                        }),
                      ]}
                    >
                      はじめる
                    </button>
                  )
                  : (
                    <button
                      type="button"
                      mix={[
                        buttonStyle,
                        on<HTMLButtonElement>("click", () => {
                          tutorial.remember(true);
                          tutorial.stop();
                        }),
                      ]}
                    >
                      とばす
                    </button>
                  )}
              </>
            )
            : game.replaying
            ? (
              <>
                <span mix={badgeStyle} role="status">リプレイ中</span>
                <button
                  type="button"
                  disabled={game.phase !== "playing"}
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
                <a
                  mix={linkButtonStyle}
                  data-rmx-document
                  href={boardUrl(game.date)}
                >
                  自分で挑戦
                </a>
              </>
            )
            : (
              <a
                mix={linkButtonStyle}
                data-rmx-document
                href={boardUrl(todayInTokyo())}
              >
                今日の盤面
              </a>
            )}
        </div>
      </div>
    );
  },
);

/** A toggle button's mixins: pressed or not, and what it does. */
function buttonMix(pressed: boolean, act: () => void) {
  const click = on<HTMLButtonElement>("click", act);
  return pressed ? [buttonStyle, pressedStyle, click] : [buttonStyle, click];
}

// --- styles -----------------------------------------------------------------

/** The lesson's line and its own row of buttons, in the space the buttons usually have. */
const teachStyle = css({
  display: "grid",
  gap: "0.6rem",
});

const saysStyle = css({
  margin: "0",
  // What happened and what to do next, one per line, and a fixed height so the row below does not
  // jump every time the lesson moves on.
  whiteSpace: "pre-line",
  minHeight: "3.2rem",
  color: ink.text,
  fontSize: "0.9rem",
  lineHeight: 1.55,
});

const dotsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  marginRight: "0.4rem",
});

const dotStyle = css({
  width: "0.45rem",
  height: "0.45rem",
  borderRadius: "50%",
  background: surface.edge,
});

const dotOnStyle = css({ background: OP_COLORS[0] });

/** The one that ends the lesson and starts the round, so it looks like the round's own button. */
const startStyle = css({
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
  padding: "0.5rem 1.2rem",
  border: "none",
  borderRadius: "10px",
  background: OP_COLORS[0],
  color: surface.ink,
  "&:active": { transform: "translateY(1px)" },
});

const controlsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
});

const buttonStyle = css({
  font: "inherit",
  fontSize: "0.9rem",
  cursor: "pointer",
  padding: "0.5rem 0.9rem",
  borderRadius: "10px",
  border: `1px solid ${surface.edge}`,
  background: surface.board,
  color: ink.text,
  "&:active": { transform: "translateY(1px)" },
  "&:disabled": { opacity: 0.45, cursor: "not-allowed" },
});

/** The same, for the ones that are links because they change the URL rather than the round. */
const linkButtonStyle = css({
  font: "inherit",
  fontSize: "0.9rem",
  textDecoration: "none",
  padding: "0.5rem 0.9rem",
  borderRadius: "10px",
  border: `1px solid ${surface.edge}`,
  background: surface.board,
  color: ink.text,
  "&:active": { transform: "translateY(1px)" },
});

const pressedStyle = css({
  background: ink.text,
  color: surface.ink,
  borderColor: ink.text,
});

/** Not a button: it says what the page is doing, next to the buttons that change it. */
const badgeStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  fontSize: "0.9rem",
  padding: "0.5rem 0.9rem",
  borderRadius: "10px",
  border: `1px solid ${OP_COLORS[0]}`,
  color: OP_COLORS[0],
  "&::before": {
    content: '""',
    width: "0.45rem",
    height: "0.45rem",
    borderRadius: "50%",
    background: OP_COLORS[0],
  },
});
