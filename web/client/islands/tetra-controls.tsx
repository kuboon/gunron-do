/**
 * The buttons, the two cards that book-end a round, and the link the round leaves behind.
 *
 * Together because they are the same thing at different moments: every one of them starts a
 * round, changes how one is played, or says what became of one. Keeping them out of the board's
 * island also keeps the board's re-render to the board — pressing a button here does not touch a
 * cell.
 *
 * This is also where the URL is read. A page with no day in it is not a page: `readSession`
 * replaces it with today's before anything else happens. A page with a recording in it is a round
 * to watch rather than one to play, and the card says so.
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
    let link: string | null = null;
    let copied = false;

    if (session?.rec) {
      decodeMoves(session.rec).then((moves) => {
        recording = moves === null
          ? { state: "bad" }
          : { state: "ready", moves };
        handle.update();
      });
    }

    const stop = game.subscribe(() => {
      handle.update();
    });
    handle.signal.addEventListener("abort", stop, { once: true });

    /** Builds the link to this round and puts it on the clipboard, where that is allowed. */
    async function share(): Promise<void> {
      if (session === null) return;
      link = shareUrl(session.date, await encodeMoves(game.moves));
      copied = false;
      handle.update();
      try {
        await navigator.clipboard.writeText(link);
        copied = true;
      } catch {
        // No clipboard, or no permission: the link is on screen to copy by hand.
      }
      handle.update();
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
          <button
            type="button"
            disabled={game.replaying}
            aria-pressed={game.live ? "true" : "false"}
            mix={buttonMix(game.live, () => game.setLive(!game.live))}
          >
            なぞり中に立体を回す
          </button>
          <a mix={linkButtonStyle} href={boardUrl(todayInTokyo())}>
            今日の盤面
          </a>
        </div>

        {game.phase === "ready" && session !== null
          ? (
            <div mix={overlayStyle}>
              <div mix={cardStyle}>
                {recording.state === "ready"
                  ? (
                    <>
                      <h2 mix={cardTitleStyle}>記録の再生</h2>
                      <p mix={cardTextStyle}>
                        {session.date}{" "}
                        の盤面で遊んだ記録です。同じ盤面を自分でも遊べます。
                      </p>
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
                        再生する
                      </button>
                      <p mix={cardTextStyle}>
                        <a mix={quietLinkStyle} href={boardUrl(session.date)}>
                          この盤面を自分で遊ぶ →
                        </a>
                      </p>
                    </>
                  )
                  : (
                    <>
                      <h2 mix={cardTitleStyle}>遊び方</h2>
                      <p mix={cardTextStyle}>
                        マスは、床の三角形の頂点{" "}
                        <b style={{ color: OP_COLORS[0] }}>a</b>{" "}
                        <b style={{ color: OP_COLORS[1] }}>b</b>{" "}
                        <b style={{ color: OP_COLORS[2] }}>c</b>{" "}
                        のまわりに正四面体を120°回す操作です。塗りつぶしの点は時計回り、白抜きの点（<code>
                          a⁻¹
                        </code>{" "}
                        など）は反時計回りです。
                      </p>
                      <p mix={cardTextStyle}>
                        上下左右に隣り合うマスをなぞると、その順に回転が重なります。四面体が元の向きに戻る経路なら、指を離したときに消えます。
                      </p>
                      <p mix={cardTextStyle}>
                        得点は、隣り合う打ち消し（<code>a a⁻¹</code>{" "}
                        など）を除いた長さの2乗です。打ち消し合っている部分は、なぞっている線が細い破線になります。戻らない経路は消えないだけで、時間は減りません。
                      </p>
                      <p mix={cardTextStyle}>
                        「なぞり中に立体を回す」をオフにすると、立体は指を離してから答え合わせとして動きます。
                      </p>
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
                    </>
                  )}
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
                <p mix={bigStyle}>{game.score}</p>
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
                      <p mix={cardTextStyle}>
                        <a mix={quietLinkStyle} href={boardUrl(session.date)}>
                          この盤面を自分で遊ぶ →
                        </a>
                      </p>
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
                        mix={[
                          secondaryStyle,
                          on("click", () => {
                            void share();
                          }),
                        ]}
                      >
                        この試合のURL
                      </button>
                      {link === null ? null : (
                        <p mix={cardNoteStyle}>
                          {copied
                            ? "コピーしました。"
                            : "長押しでコピーできます。"}
                          <br />
                          <a mix={shareLinkStyle} href={link}>{link}</a>
                        </p>
                      )}
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

/** How the round went, on one line. */
function summary(): string {
  return [
    game.date,
    `消去 ${game.clears} 回`,
    `最長 ${game.longest}`,
    `不成立 ${game.misses} 回`,
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

/** The same, for the two that are links because they change the URL rather than the round. */
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

const quietLinkStyle = css({
  color: ink.muted,
  fontSize: "0.9rem",
});

/** The link itself, which is long and is meant to be selected rather than read. */
const shareLinkStyle = css({
  display: "inline-block",
  marginTop: "0.25rem",
  color: ink.text,
  fontSize: "0.7rem",
  wordBreak: "break-all",
  lineHeight: 1.4,
});
