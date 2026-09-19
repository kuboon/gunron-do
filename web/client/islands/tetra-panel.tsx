/**
 * The panel that covers the board between rounds.
 *
 * Three things wear the same shape: the board before a round starts, a recording before it plays,
 * and the result after either of them ends. All three are the same question — *what happens next*
 * — so all three are the same opaque rectangle laid exactly over the board, with the clock, the
 * solid and the buttons left where they are. A wash over the whole screen dimmed the things the
 * player still wanted to read; this covers only what has nothing to say yet.
 *
 * This is also where the URL is read — read and nothing else. A page with no day in it is
 * today's board, left at the address it was asked for; `readSession` reports that rather than
 * navigating anywhere.
 *
 * And it is what starts a recording. A browser will not let a page make a noise until someone has
 * touched it, so a recording that started itself played in silence; a recording that starts on a
 * button starts inside the touch that asked for it, and the sound comes with it. The button also
 * gets to say what the round was worth first, which is the better trade anyway.
 */

import { createShareButtons } from "@kuboon/share-element";
import {
  clientEntry,
  css,
  type Handle,
  on,
  ref,
  type RemixNode,
} from "@remix-run/ui";

import { game, type Outcome, outcome } from "../games/tetra-do/game.ts";
import { ink, OP_COLORS, surface } from "../games/tetra-do/palette.ts";
import {
  decodeMoves,
  encodeMoves,
  type Move,
} from "../games/tetra-do/record.ts";
import {
  playUrl,
  readSession,
  type Session,
  shareUrl,
} from "../games/tetra-do/session.ts";
import { tutorial } from "../games/tetra-do/tutorial.ts";

/** How far the recording in the URL has got. */
type Recording =
  | { state: "none" }
  | { state: "loading" }
  | { state: "ready"; moves: readonly Move[]; result: Outcome }
  | { state: "bad" };

export const TetraPanel = clientEntry(
  import.meta.url,
  function TetraPanel(handle: Handle) {
    // On the server there is no URL to read, so there is no board to be about yet; the panel
    // renders nothing and hydration settles it.
    const session: Session | null = typeof location === "undefined"
      ? null
      : readSession();

    // The board behind the panel is the one the player is about to be handed.
    if (session !== null) game.preview(session.date);

    let recording: Recording = { state: session?.rec ? "loading" : "none" };
    /** Set while the link to a finished round is being built, so the button is pressed once. */
    let leaving = false;

    if (session !== null && session.rec !== null) {
      decodeMoves(session.rec).then((moves) => {
        recording = moves === null ? { state: "bad" } : {
          state: "ready",
          moves,
          // What the round comes to, run through with nobody watching. A few milliseconds, so the
          // panel can say it before anyone presses play.
          result: outcome(session.date, moves),
        };
        handle.update();
      });
    }

    const stop = game.subscribe(() => {
      handle.update();
    });
    handle.signal.addEventListener("abort", stop, { once: true });

    /** Leaves for this round's own URL, which is the round: the day, and what was done on it. */
    async function share(): Promise<void> {
      if (session === null || leaving) return;
      leaving = true;
      handle.update();
      location.href = shareUrl(session.date, await encodeMoves(game.moves));
    }

    function play(): void {
      if (recording.state !== "ready" || session === null) return;
      game.startReplay(session.date, recording.moves);
    }

    // A first visit is taught rather than told. Not over a recording — a shared round opens on
    // its own panel, and a lesson would be standing in front of it.
    //
    // After the first render rather than during it: hydration matches what the server drew, and
    // the server drew a page with no lesson on it. Starting one here and now would have the
    // islands render something else on their very first pass, and what is already in the document
    // stays where it is rather than being replaced.
    if (session !== null && session.rec === null && !tutorial.dismissed) {
      setTimeout(() => tutorial.start(), 0);
    }

    const stopTutorial = tutorial.subscribe(() => {
      handle.update();
    });
    handle.signal.addEventListener("abort", stopTutorial, { once: true });

    return () => {
      if (session === null) return null;
      // The lesson is the board itself, so the panel has to be off it.
      if (tutorial.running) return null;

      // A recording that has not started, and the numbers it is about to reach.
      if (
        game.phase === "ready" && recording.state === "ready" &&
        !game.replaying
      ) {
        return (
          <div mix={panelStyle}>
            <p mix={eyebrowStyle}>リプレイ</p>
            <p mix={dateStyle}>{session.date} の盤面</p>
            {scoreboard(recording.result)}
            <div mix={buttonsStyle}>
              <button
                type="button"
                mix={[primaryStyle, on<HTMLButtonElement>("click", play)]}
              >
                再生する
              </button>
              <a
                mix={secondaryLinkStyle}
                data-rmx-document
                href={playUrl(session.date)}
              >
                自分で挑戦
              </a>
            </div>
            {shareRow()}
          </div>
        );
      }

      // The board, waiting to be played. No heading: the board is on screen behind it and the
      // button says what pressing it does, so a word saying "how to play" is a word in the way.
      if (game.phase === "ready" && recording.state !== "loading") {
        return (
          <div mix={panelStyle}>
            <ul mix={listStyle}>
              <li>盤面をなぞるとテトラが回ります</li>
              <li>テトラを元通りに戻せる道筋を探そう</li>
              <li>
                <code>a</code> <code>a⁻¹</code>{" "}
                のような単純な打ち消しはスコアになりません
              </li>
              <li>6マス以内に一度は戻さないと、その道は無効です</li>
              <li>ダブルタップで1マス消せます</li>
            </ul>
            {
              /*
              練習 before 始める, and the quieter of the two. A player who has not played before
              reads left to right and finds the thing to do first that has no clock on it; a player
              who has reads neither and presses the one that is coloured in.
            */
            }
            <div mix={buttonsStyle}>
              <button
                type="button"
                mix={[
                  secondaryStyle,
                  on<HTMLButtonElement>("click", () => tutorial.start()),
                ]}
              >
                練習
              </button>
              <button
                type="button"
                mix={[
                  primaryStyle,
                  on<HTMLButtonElement>(
                    "click",
                    () => game.start(session.date),
                  ),
                ]}
              >
                始める
              </button>
            </div>
            {recording.state === "bad"
              ? (
                <p mix={noteStyle}>
                  URL の記録が読めませんでした。盤面だけ開いています。
                </p>
              )
              : null}
          </div>
        );
      }

      // What it came to.
      if (game.phase === "over") {
        return (
          <div mix={panelStyle}>
            <p mix={eyebrowStyle}>
              {game.replaying ? "再生おわり" : "おわり"}
            </p>
            <p mix={dateStyle}>{game.date} の盤面</p>
            {scoreboard({
              cleared: game.cleared,
              solved: game.solved,
              longest: game.longest,
            })}
            <div mix={buttonsStyle}>
              {game.replaying
                ? (
                  <>
                    <button
                      type="button"
                      mix={[primaryStyle, on<HTMLButtonElement>("click", play)]}
                    >
                      もう一度再生
                    </button>
                    <a
                      mix={secondaryLinkStyle}
                      data-rmx-document
                      href={playUrl(session.date)}
                    >
                      自分で挑戦
                    </a>
                  </>
                )
                : (
                  <>
                    <button
                      type="button"
                      mix={[
                        primaryStyle,
                        on<HTMLButtonElement>("click", () => game.restart()),
                      ]}
                    >
                      もう一度
                    </button>
                    <button
                      type="button"
                      disabled={leaving}
                      mix={[
                        secondaryStyle,
                        on<HTMLButtonElement>("click", () => {
                          void share();
                        }),
                      ]}
                    >
                      {leaving ? "…" : "リプレイのURL"}
                    </button>
                  </>
                )}
            </div>
          </div>
        );
      }

      return null;
    };
  },
);

/**
 * The share row under 再生する.
 *
 * `@kuboon/share-element`'s `<share-buttons>`, built by hand rather than written as a tag: it is a
 * custom element and the JSX here knows the DOM's own elements only, so calling the package's
 * constructor is the honest way round — cheaper than a declaration file that teaches the compiler
 * about one tag.
 *
 * No `url` given. The row reads `location.href` at the moment of the click, and the page this
 * panel is on *is* the round: the date and the recording in the address are what put the panel
 * here. Writing the URL out again would be saying the same thing twice, and the copy would be the
 * one that goes wrong.
 *
 * `data-rmx-preserve-dom` because the buttons are not this island's to redraw: without it the
 * reconciler takes the subtree back on the next render and the row is built again on the one
 * after. `data-share-row` is what the unlayered rules in `static/app.css` key off — the package
 * injects its own defaults unlayered, and unlayered CSS outranks every `@layer`, so a `css(...)`
 * mixin cannot reach them.
 *
 * @returns The row's own box, filled once it is in the document
 */
function shareRow(): RemixNode {
  return (
    <div
      mix={[shareStyle, ref(fillShareRow)]}
      data-rmx-preserve-dom
      data-share-row
    />
  );
}

/**
 * Puts the buttons in the box, once.
 *
 * @param node The box, or `null` as it goes away
 */
function fillShareRow(node: Element | null): void {
  if (node === null || node.firstElementChild !== null) return;
  node.append(createShareButtons());
}

/** The three numbers, in the order the clock line puts them. */
function scoreboard(result: Outcome) {
  return (
    <dl mix={scoreStyle}>
      <div>
        <dt>消去</dt>
        <dd>{result.cleared}</dd>
      </div>
      <div>
        <dt>成立</dt>
        <dd>{result.solved}</dd>
      </div>
      <div>
        <dt>最長</dt>
        <dd>{result.longest}</dd>
      </div>
    </dl>
  );
}

// --- styles -----------------------------------------------------------------

/**
 * The panel itself: the board's own rectangle, opaque, with the board's own corners.
 *
 * Opaque rather than translucent because a half-visible board is a board a player tries to read
 * through the panel. It covers the board and only the board, so everything still worth reading —
 * the clock, the solid, the buttons — is not dimmed at all.
 */
const panelStyle = css({
  display: "grid",
  alignContent: "center",
  gap: "0.25rem",
  padding: "1.1rem",
  borderRadius: "16px",
  border: `1px solid ${surface.edge}`,
  background: surface.board,
  overflow: "auto",
});

const eyebrowStyle = css({
  margin: "0",
  color: ink.muted,
  fontSize: "0.8rem",
  letterSpacing: "0.08em",
});

const dateStyle = css({
  margin: "0 0 0.75rem",
  fontSize: "1.2rem",
  fontWeight: 700,
});

/** The rules, as four lines you can take in at a glance rather than three paragraphs. */
const listStyle = css({
  margin: "0 0 1rem",
  paddingLeft: "1.1rem",
  color: "#cbd1e4",
  fontSize: "0.95rem",
  lineHeight: 1.75,
  "& li": { marginBottom: "0.15rem" },
  "& code": {
    background: "rgba(237, 239, 247, 0.1)",
    color: ink.text,
    padding: "0.05rem 0.3rem",
    borderRadius: "4px",
    fontSize: "0.9em",
  },
});

const scoreStyle = css({
  display: "flex",
  gap: "1.5rem",
  margin: "0 0 1.25rem",
  "& div": { display: "grid", gap: "0.1rem" },
  "& dt": { color: ink.muted, fontSize: "0.8rem" },
  "& dd": {
    margin: "0",
    fontSize: "2rem",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  },
});

/**
 * The share row's own box: a rule above it, and the air a second row of buttons needs.
 *
 * What the buttons themselves look like is not here. They are the package's, and the package's
 * defaults are unlayered — see `static/app.css`.
 */
const shareStyle = css({
  marginTop: "1rem",
  paddingTop: "0.9rem",
  borderTop: `1px solid ${surface.edge}`,
});

const noteStyle = css({
  margin: "0.75rem 0 0",
  color: ink.muted,
  fontSize: "0.8rem",
  lineHeight: 1.6,
});

const buttonsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flexWrap: "wrap",
});

const primaryStyle = css({
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
  padding: "0.6rem 1.4rem",
  border: "none",
  borderRadius: "10px",
  background: OP_COLORS[0],
  color: surface.ink,
  "&:active": { transform: "translateY(1px)" },
});

const secondaryStyle = css({
  font: "inherit",
  cursor: "pointer",
  padding: "0.6rem 1.1rem",
  borderRadius: "10px",
  border: `1px solid ${surface.edge}`,
  background: "transparent",
  color: ink.text,
  "&:active": { transform: "translateY(1px)" },
  "&:disabled": { opacity: 0.45, cursor: "not-allowed" },
});

/** The secondary button's twin, for the one that is a link because it changes the URL. */
const secondaryLinkStyle = css({
  display: "inline-block",
  font: "inherit",
  textDecoration: "none",
  padding: "0.6rem 1.1rem",
  borderRadius: "10px",
  border: `1px solid ${surface.edge}`,
  color: ink.text,
  "&:active": { transform: "translateY(1px)" },
});
