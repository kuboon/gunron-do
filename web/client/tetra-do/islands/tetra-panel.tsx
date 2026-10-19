/**
 * The panel that covers the board between rounds.
 *
 * Three things wear the same shape: the board before a round starts, a recording before it plays,
 * and the same recording once it has ended — which is also what a round the player just finished
 * turns into, at the URL that replays it. All three are the same question — *what happens next*
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

import {
  createShareButtons,
  type ShareButtonsElement,
} from "@kuboon/share-element";
import {
  clientEntry,
  css,
  type Handle,
  on,
  ref,
  type RemixNode,
} from "@remix-run/ui";

import { game, type Outcome, outcome } from "../game.ts";
import { ink, OP_COLORS, surface } from "../palette.ts";
import { decodeMoves, encodeMoves, type Move } from "../record.ts";
import { boardUrl, playUrl, readSession, type Session } from "../session.ts";
import { shareCardUrl } from "../share.ts";
import { tutorial } from "../tutorial.ts";
import { unlocks } from "../unlocks.ts";

/** How far the recording in the URL has got. */
type Recording =
  | { state: "none" }
  | { state: "loading" }
  | {
    state: "ready";
    /** The round as the URL carries it, for the link that shows it to somebody else. */
    rec: string;
    moves: readonly Move[];
    result: Outcome;
  }
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

    // GameCenter, as early as there is a page: a player sent here by the hub carries a launch token
    // in the URL, and the SDK takes it out of the address bar as it starts.
    if (session !== null) unlocks.start();

    // Held apart from `session` so the decode below can name it inside a callback.
    const rec = session?.rec ?? null;

    let recording: Recording = { state: rec === null ? "none" : "loading" };
    /** Whether this page dealt the round that is on it, rather than being opened onto one. */
    let played = false;
    /** Whether the round that just ended has been written into the address bar. */
    let finished = false;

    if (session !== null && rec !== null) {
      decodeMoves(rec).then((moves) => {
        recording = moves === null ? { state: "bad" } : {
          state: "ready",
          rec,
          moves,
          // What the round comes to, run through with nobody watching. A few milliseconds, so the
          // panel can say it before anyone presses play.
          result: outcome(session.date, moves),
        };
        handle.update();
      });
    }

    const stop = game.subscribe(() => {
      if (game.phase !== "over") finished = false;
      else if (!game.replaying && !finished) {
        finished = true;
        finish();
      }
      handle.update();
    });
    handle.signal.addEventListener("abort", stop, { once: true });

    /**
     * Turns the round that just ended into its own URL, and shows it as any recording is shown.
     *
     * The address is the round — the day, and what was done on it — so the moment a round is over
     * the page is at the link that replays it, with the panel a visitor to that link would see.
     * Pushed rather than replaced: the board the player started from is still one step back.
     */
    function finish(): void {
      const date = game.date;
      const moves = [...game.moves];
      const result: Outcome = {
        cleared: game.cleared,
        solved: game.solved,
        combo: game.combo,
      };
      played = true;
      recording = { state: "loading" };
      void encodeMoves(moves).then((rec) => {
        if (handle.signal.aborted) return;
        recording = { state: "ready", rec, moves, result };
        history.pushState(null, "", boardUrl(date, rec));
        handle.update();
      });
    }

    // The page is a single document with the address changed under it, so the back button has to
    // be told what the address now means. Reloading is the one answer that is always right: the
    // page reads its URL on the way in, and every address this page writes is one it can read.
    if (session !== null) {
      const back = () => location.reload();
      addEventListener("popstate", back);
      handle.signal.addEventListener(
        "abort",
        () => removeEventListener("popstate", back),
        { once: true },
      );
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

    const stopUnlocks = unlocks.subscribe(() => {
      handle.update();
    });
    handle.signal.addEventListener("abort", stopUnlocks, { once: true });

    return () => {
      if (session === null) return null;
      // The lesson is the board itself, so the panel has to be off it.
      if (tutorial.running) return null;

      // A round that is over is shown while the link to it is still being built.
      if (game.phase === "over" && recording.state === "loading") return null;

      // A recording that has not started, and the numbers it is about to reach — and the same panel
      // when a round is over, whether it was played just now or played back, because the round is
      // the same one and so is what can be done with it: watch it, take it on, or send it to
      // somebody.
      if (
        recording.state === "ready" &&
        (game.phase === "ready" && !game.replaying || game.phase === "over")
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
                リプレイを再生
              </button>
              <a
                mix={secondaryLinkStyle}
                data-rmx-document
                href={playUrl(session.date)}
              >
                自分で挑戦
              </a>
            </div>
            {shareRow(
              shareCardUrl(session.date, recording.rec, recording.result),
              () => {
                if (played) unlocks.shared();
              },
            )}
            {claim()}
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
                のような単純な打ち消しはスコアになりません（成立をまたぐ場合は打ち消しになりません）
              </li>
              <li>
                6手以内に一度は戻さないと、その道は無効です（打ち消しは数えません）
              </li>
              <li>2マスなぞると、中身に関わらずその2マスが入れ替わります</li>
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

      return null;
    };
  },
);

/**
 * The share row under リプレイを再生.
 *
 * `@kuboon/share-element`'s `<share-buttons>`, built by hand rather than written as a tag: it is a
 * custom element and the JSX here knows the DOM's own elements only, so calling the package's
 * constructor is the honest way round — cheaper than a declaration file that teaches the compiler
 * about one tag.
 *
 * The `url` is given rather than left to the row's default, which is this page's own address. The
 * address is the round and would work, but a link is read by a crawler before it is read by a
 * person, and what a crawler finds here is the game's card — the same picture for every round ever
 * played. `shareCardUrl` builds the link that carries *this* round's numbers instead.
 *
 * The box is filled once, when it goes in. It is empty as far as the reconciler knows, and a render
 * leaves an element with no children of its own alone. `data-rmx-preserve-dom` does the same for a
 * frame reload, which is the other thing that could take the row back.
 *
 * `data-share-row` is what the unlayered rules in `static/app.css` key off — the package injects
 * its own defaults unlayered, and unlayered CSS outranks every `@layer`, so a `css(...)` mixin
 * cannot reach them.
 *
 * @param url What the buttons share
 * @param onShare Called when any of the buttons is pressed
 * @returns The row's own box, filled once it is in the document
 */
function shareRow(url: string, onShare: () => void): RemixNode {
  return (
    <div
      mix={[shareStyle, ref((node) => fillShareRow(node, url, onShare))]}
      data-rmx-preserve-dom
      data-share-row
    />
  );
}

/**
 * Puts the buttons in the box, and tells them what they share.
 *
 * @param node The box
 * @param url What the buttons share
 * @param onShare Called when any of the buttons is pressed
 */
function fillShareRow(node: Element, url: string, onShare: () => void): void {
  let row = node.firstElementChild as ShareButtonsElement | null;
  if (row === null) {
    row = createShareButtons();
    row.addEventListener("click", onShare);
    node.append(row);
  }
  row.url = url;
}

/**
 * The link that records what was earned on GameCenter, when anything is waiting.
 *
 * Only there for a player the hub has not vouched for — one who came in from the hub has each
 * unlock recorded as it happens, and has nothing waiting. A link, not a page opened for them: the
 * claim page lists what it is about to record, and a player should choose to go and see.
 *
 * @returns The link, or nothing
 */
function claim(): RemixNode {
  const href = unlocks.claimUrl;
  if (href === null) return null;
  return (
    <p mix={noteStyle}>
      <a mix={claimStyle} href={href}>
        実績を GameCenter に記録する（{unlocks.pending}件）
      </a>
    </p>
  );
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
        <dt>コンボ</dt>
        <dd>{result.combo}</dd>
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

const claimStyle = css({
  color: ink.text,
  textUnderlineOffset: "2px",
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
