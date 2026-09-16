/**
 * The buttons, and the two cards that book-end a round.
 *
 * Together because they are the same thing at different moments: every one of them starts a round,
 * changes how one is played, or reports how one went. Keeping them out of the board's island also
 * keeps the board's re-render to the board — pressing a button here does not touch a cell.
 *
 * The rules are on the first card rather than behind a link, because they are four sentences and a
 * player who has to leave to read them has already lost the round. The longer version lives in the
 * rules page, which is Markdown, and which nobody has to open to play.
 */

import { clientEntry, css, type Handle, on } from "@remix-run/ui";

import { game } from "../games/tetra-do/game.ts";
import { ink, OP_COLORS, surface } from "../games/tetra-do/palette.ts";

export const TetraControls = clientEntry(
  import.meta.url,
  function TetraControls(handle: Handle) {
    const stop = game.subscribe(() => {
      handle.update();
    });
    handle.signal.addEventListener("abort", stop, { once: true });

    return () => (
      <>
        <div mix={controlsStyle}>
          <button
            type="button"
            aria-pressed={game.live ? "true" : "false"}
            mix={game.live
              ? [
                buttonStyle,
                pressedStyle,
                on("click", () => game.setLive(false)),
              ]
              : [buttonStyle, on("click", () => game.setLive(true))]}
          >
            なぞり中に立体を回す
          </button>
          <button
            type="button"
            mix={[buttonStyle, on("click", () => game.startRandom())]}
          >
            ランダム盤面
          </button>
          <button
            type="button"
            mix={[buttonStyle, on("click", () => game.startDaily())]}
          >
            今日の盤面
          </button>
        </div>

        {game.phase === "ready"
          ? (
            <div mix={overlayStyle}>
              <div mix={cardStyle}>
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
                  など）を除いた長さの2乗です。打ち消し合っている部分は、なぞっている線が細い破線になります。除いた長さが3未満の経路は消えません。外れると5秒減ります。
                </p>
                <p mix={cardTextStyle}>
                  「なぞり中に立体を回す」をオフにすると、立体は指を離してから答え合わせとして動きます。
                </p>
                <button
                  type="button"
                  mix={[primaryStyle, on("click", () => game.startDaily())]}
                >
                  今日の盤面で始める
                </button>
              </div>
            </div>
          )
          : null}

        {game.phase === "over"
          ? (
            <div mix={overlayStyle}>
              <div mix={cardStyle}>
                <h2 mix={cardTitleStyle}>終了</h2>
                <p mix={bigStyle}>{game.score}</p>
                {/* One string: an ideographic space against a JSX line break is trimmed away. */}
                <p mix={cardTextStyle}>{summary()}</p>
                <button
                  type="button"
                  mix={[primaryStyle, on("click", () => game.replay())]}
                >
                  もう一度
                </button>
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
    game.seedLabel,
    `消去 ${game.clears} 回`,
    `最長 ${game.longest}`,
    `ミス ${game.misses} 回`,
  ].join("　");
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
  padding: "0.6rem 1.4rem",
  border: "none",
  borderRadius: "10px",
  background: OP_COLORS[0],
  color: surface.ink,
  "&:active": { transform: "translateY(1px)" },
});
