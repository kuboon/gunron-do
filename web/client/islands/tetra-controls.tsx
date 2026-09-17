/**
 * The buttons, and the two cards that book-end a round.
 *
 * Together because they are the same thing at different moments: every one of them starts a
 * round, changes how one is played, or says what became of one. Keeping them out of the board's
 * island also keeps the board's re-render to the board — pressing a button here does not touch a
 * cell.
 *
 * This is also where the URL is read. A page with no day in it is not a page: `readSession`
 * replaces it with today's before anything else happens. A page with a recording in it is not a
 * board to play but a round to watch, and it starts watching itself — the player already pressed
 * a button to get here, and asking them to press another one is asking twice.
 *
 * Anything that changes the URL leaves through a document navigation, marked `data-rmx-document`.
 * The page is its URL: the day decides the board, and the board is laid out once, when the island
 * starts. A frame reload would swap the HTML under a game that is still running on the old day.
 *
 * The rules are on the first card rather than behind a link, because they are four sentences and
 * a player who has to leave to read them has already lost the round. The longer version lives in
 * the rules page, which is Markdown, and which nobody has to open to play.
 */

import { clientEntry, css, type Handle, on } from "@remix-run/ui";

import { game } from "../games/tetra-do/game.ts";
import { ink, OP_COLORS, surface } from "../games/tetra-do/palette.ts";
import {
  decodeMoves,
  encodeMoves,
  type Move,
} from "../games/tetra-do/record.ts";
import {
  boardUrl,
  readSession,
  type Session,
  shareUrl,
  todayInTokyo,
} from "../games/tetra-do/session.ts";
import { sound } from "../games/tetra-do/sound.ts";

/** How far the recording in the URL has got. */
type Recording =
  | { state: "none" }
  | { state: "loading" }
  | { state: "ready"; moves: readonly Move[] }
  | { state: "bad" };

export const TetraControls = clientEntry(
  import.meta.url,
  function TetraControls(handle: Handle) {
    // On the server there is no URL to read and nothing to redirect; the card renders as it would
    // for a page that has not decided yet, and hydration settles it.
    const session: Session | null = typeof location === "undefined"
      ? null
      : readSession();

    // The board behind the card is the one the player is about to be handed.
    if (session !== null) game.preview(session.date);

    let recording: Recording = { state: session?.rec ? "loading" : "none" };
    /** Set while the link to a finished round is being built, so the button is pressed once. */
    let leaving = false;

    // A recording in the URL plays as soon as it has decoded. Until then there is no card: the
    // few milliseconds it takes are not worth a flash of the rules.
    if (session !== null && session.rec !== null) {
      decodeMoves(session.rec).then((moves) => {
        if (moves === null) {
          recording = { state: "bad" };
        } else {
          recording = { state: "ready", moves };
          game.startReplay(session.date, moves);
        }
        handle.update();
      });
    }

    const stop = game.subscribe(() => {
      handle.update();
    });
    handle.signal.addEventListener("abort", stop, { once: true });

    /** Leaves for this round's own URL, which is the round: the day, and what was done on it. */
    async function replay(): Promise<void> {
      if (session === null || leaving) return;
      leaving = true;
      handle.update();
      location.href = shareUrl(session.date, await encodeMoves(game.moves));
    }

    return () => (
      <>
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
            {sound.enabled ? "音あり" : "音なし"}
          </button>
          {game.replaying
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
              <>
                <button
                  type="button"
                  aria-pressed={game.live ? "true" : "false"}
                  mix={buttonMix(game.live, () => game.setLive(!game.live))}
                >
                  なぞり中に立体を回す
                </button>
                <a
                  mix={linkButtonStyle}
                  data-rmx-document
                  href={boardUrl(todayInTokyo())}
                >
                  今日の盤面
                </a>
              </>
            )}
        </div>

        {game.phase === "ready" && session !== null &&
            recording.state !== "loading"
          ? (
            <div mix={overlayStyle}>
              <div mix={cardStyle}>
                <h2 mix={cardTitleStyle}>遊び方</h2>
                <p mix={cardTextStyle}>
                  1マスは、正四面体を頂点{" "}
                  <b style={{ color: OP_COLORS[0] }}>a</b>{" "}
                  <b style={{ color: OP_COLORS[1] }}>b</b>{" "}
                  <b style={{ color: OP_COLORS[2] }}>c</b>{" "}
                  のまわりに120°回す操作。塗りつぶしは時計回り、白抜き（<code>
                    a⁻¹
                  </code>）は反時計回り。
                </p>
                <ul mix={cardListStyle}>
                  <li>隣り合うマスをなぞると、回転が順に重なる。</li>
                  <li>
                    指を離したとき四面体が<b>
                      元の向き
                    </b>なら、なぞった道が消える。
                  </li>
                  <li>
                    <code>a</code> <code>a⁻¹</code>{" "}
                    のように打ち消し合うマスも消えるが、数には入らない。
                  </li>
                  <li>ダブルタップで1マスだけ消せる。</li>
                </ul>
                <button
                  type="button"
                  mix={[
                    primaryStyle,
                    on("click", () => game.start(session.date)),
                  ]}
                >
                  {session.date} の盤面で始める
                </button>
                {recording.state === "bad"
                  ? (
                    <p mix={cardNoteStyle}>
                      URL の記録が読めませんでした。盤面だけ開いています。
                    </p>
                  )
                  : null}
              </div>
            </div>
          )
          : null}

        {game.phase === "over" && session !== null
          ? (
            <div mix={overlayStyle}>
              <div mix={cardStyle}>
                <h2 mix={cardTitleStyle}>
                  {game.replaying ? "再生おわり" : "終了"}
                </h2>
                <p mix={bigStyle}>{game.cleared}</p>
                <p mix={cardTextStyle}>{summary()}</p>

                {game.replaying
                  ? (
                    <>
                      <button
                        type="button"
                        mix={[
                          primaryStyle,
                          on("click", () => {
                            if (recording.state === "ready") {
                              game.startReplay(session.date, recording.moves);
                            }
                          }),
                        ]}
                      >
                        もう一度再生
                      </button>
                      <a
                        mix={secondaryLinkStyle}
                        data-rmx-document
                        href={boardUrl(session.date)}
                      >
                        自分で挑戦
                      </a>
                    </>
                  )
                  : (
                    <>
                      <button
                        type="button"
                        mix={[primaryStyle, on("click", () => game.restart())]}
                      >
                        もう一度
                      </button>
                      <button
                        type="button"
                        disabled={leaving}
                        mix={[
                          secondaryStyle,
                          on<HTMLButtonElement>("click", () => {
                            void replay();
                          }),
                        ]}
                      >
                        {leaving ? "…" : "リプレイ"}
                      </button>
                      <p mix={cardNoteStyle}>
                        「リプレイ」を押すと、この試合をなぞり直す URL{" "}
                        に移ります。そのアドレスを渡せば、相手も同じ試合を見られます。
                      </p>
                    </>
                  )}
              </div>
            </div>
          )
          : null}
      </>
    );
  },
);

/** How the round went, on one line. The big number above it is the cells. */
function summary(): string {
  return [
    game.date,
    `消去 ${game.cleared} マス`,
    `成立 ${game.solved} 回`,
    `最長 ${game.longest}`,
  ].join("　");
}

/** A toggle button's mixins: pressed or not, and what it does. */
function buttonMix(pressed: boolean, act: () => void) {
  const click = on<HTMLButtonElement>("click", act);
  return pressed ? [buttonStyle, pressedStyle, click] : [buttonStyle, click];
}

// --- styles -----------------------------------------------------------------

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

const overlayStyle = css({
  position: "fixed",
  inset: "0",
  zIndex: 10,
  display: "grid",
  placeItems: "center",
  padding: "1.25rem",
  overflow: "auto",
  background: "rgba(20, 26, 46, 0.93)",
});

const cardStyle = css({
  maxWidth: "24rem",
  lineHeight: 1.75,
});

const cardTitleStyle = css({
  margin: "0 0 0.5rem",
  fontSize: "1.3rem",
});

const cardTextStyle = css({
  margin: "0 0 0.75rem",
  color: "#cbd1e4",
  fontSize: "0.95rem",
  // The site's base layer paints `code` for a light document; on the card it has to be a chip cut
  // out of the dark rather than a white one laid on it.
  "& code": {
    background: "rgba(237, 239, 247, 0.1)",
    color: ink.text,
    padding: "0.05rem 0.3rem",
    borderRadius: "4px",
    fontSize: "0.9em",
  },
});

/** The rules, as four lines you can take in at a glance rather than three paragraphs. */
const cardListStyle = css({
  margin: "0 0 0.75rem",
  paddingLeft: "1.1rem",
  color: "#cbd1e4",
  fontSize: "0.95rem",
  lineHeight: 1.75,
  "& li": { marginBottom: "0.15rem" },
  "& b": { color: ink.text },
  "& code": {
    background: "rgba(237, 239, 247, 0.1)",
    color: ink.text,
    padding: "0.05rem 0.3rem",
    borderRadius: "4px",
    fontSize: "0.9em",
  },
});

const cardNoteStyle = css({
  margin: "0.75rem 0 0",
  color: ink.muted,
  fontSize: "0.8rem",
  lineHeight: 1.6,
});

const bigStyle = css({
  margin: "0 0 0.5rem",
  fontSize: "2.4rem",
  fontVariantNumeric: "tabular-nums",
});

const primaryStyle = css({
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
  marginTop: "0.5rem",
  marginRight: "0.5rem",
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
  marginTop: "0.5rem",
  padding: "0.6rem 1.1rem",
  borderRadius: "10px",
  border: `1px solid ${surface.edge}`,
  background: "transparent",
  color: ink.text,
  "&:active": { transform: "translateY(1px)" },
});

/** The secondary button's twin, for the one that is a link because it changes the URL. */
const secondaryLinkStyle = css({
  display: "inline-block",
  font: "inherit",
  textDecoration: "none",
  marginTop: "0.5rem",
  marginLeft: "0.5rem",
  padding: "0.6rem 1.1rem",
  borderRadius: "10px",
  border: `1px solid ${surface.edge}`,
  color: ink.text,
  "&:active": { transform: "translateY(1px)" },
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
