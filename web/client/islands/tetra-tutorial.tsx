/**
 * The walkthrough: five pages that teach the board, shown once and then on request.
 *
 * It opens itself on a first visit and sits over the "how to play" card, so closing it leaves the
 * player exactly where they would have been — looking at the card with the start button on it.
 *
 * The pictures are the board's own cells, imported rather than redrawn. The whole job here is to
 * teach someone to read a cell at a glance, and a drawing that was nearly the cell would teach
 * them to read the drawing.
 *
 * It stays out of the way of a recording. A shared replay opens playing, and an overlay over a
 * round already in progress is a curtain across the thing the link was sent for; a first-time
 * visitor who arrives that way gets the walkthrough when they press 自分で挑戦.
 */

import { clientEntry, css, type Handle, on } from "@remix-run/ui";

import { cellGlyph } from "./_lib/cell.tsx";
import { ink, OP_COLORS, surface } from "../games/tetra-do/palette.ts";
import type { Op } from "../games/tetra-do/rotation.ts";
import { tutorial } from "../games/tetra-do/tutorial.ts";

/** `a b c a⁻¹ b⁻¹ c⁻¹`, by the index the rest of the game uses. */
const A = 0 as Op;
const B = 1 as Op;
const C = 2 as Op;
const A_INV = 3 as Op;

/** How many pages there are, which is also how the dots are drawn. */
const PAGES = 5;

export const TetraTutorial = clientEntry(
  import.meta.url,
  function TetraTutorial(handle: Handle) {
    let page = 0;

    const stop = tutorial.subscribe(() => {
      handle.update();
    });
    handle.signal.addEventListener("abort", stop, { once: true });

    // A first visit opens it. Not on a recording's URL, and not once it has been dismissed — and
    // not on the server, where there is no URL to read and no preference to read it against.
    if (typeof location !== "undefined") {
      const watching = new URLSearchParams(location.search).has("rec");
      if (!watching && !tutorial.dismissed) tutorial.show();
    }

    /** Moves `by` pages, within the ones that exist. */
    function turn(by: number): void {
      page = Math.min(PAGES - 1, Math.max(0, page + by));
      handle.update();
    }

    function finish(): void {
      page = 0;
      tutorial.close();
    }

    return () => {
      if (!tutorial.open) return null;
      const last = page === PAGES - 1;

      return (
        <div mix={overlayStyle} role="dialog" aria-label="遊び方">
          <div mix={cardStyle}>
            {page === 0
              ? (
                <>
                  <h2 mix={titleStyle}>マスは「回す操作」</h2>
                  <div mix={rowStyle}>
                    {[A, A_INV, B, C].map((op) => (
                      <span key={op} mix={cellStyle}>{cellGlyph(op)}</span>
                    ))}
                  </div>
                  <p mix={textStyle}>
                    1マスが、正四面体を120°回す操作ひとつです。
                    塗りつぶしの点は時計回り、白抜きの点（<code>
                      a⁻¹
                    </code>）は反時計回り。
                  </p>
                  <p mix={textStyle}>
                    三角形の中で点が置かれている位置が、立体のどの角を軸に回すかを表します。
                    <b style={{ color: OP_COLORS[2] }}>c</b> は上、
                    <b style={{ color: OP_COLORS[0] }}>a</b> は右下、
                    <b style={{ color: OP_COLORS[1] }}>b</b>{" "}
                    は左下——立体の角の並びと同じです。
                  </p>
                </>
              )
              : null}

            {page === 1
              ? (
                <>
                  <h2 mix={titleStyle}>隣をつないでなぞる</h2>
                  <div mix={rowStyle}>
                    <span mix={cellStyle}>{cellGlyph(A)}</span>
                    <span mix={arrowStyle}>→</span>
                    <span mix={cellStyle}>{cellGlyph(B)}</span>
                    <span mix={arrowStyle}>→</span>
                    <span mix={cellStyle}>{cellGlyph(C)}</span>
                  </div>
                  <p mix={textStyle}>
                    上下左右に隣り合うマスを、指でつないでなぞります。斜めはつながりません。
                  </p>
                  <p mix={textStyle}>
                    なぞった順に回転が重なり、立体がその場で回ります。
                    一つ前のマスに指を戻せば、その手は取り消せます。
                  </p>
                </>
              )
              : null}

            {page === 2
              ? (
                <>
                  <h2 mix={titleStyle}>元の向きに戻れば消える</h2>
                  <div mix={rowStyle}>
                    <span mix={cellStyle}>{cellGlyph(A)}</span>
                    <span mix={cellStyle}>{cellGlyph(A)}</span>
                    <span mix={cellStyle}>{cellGlyph(A)}</span>
                    <span mix={orStyle}>／</span>
                    <span mix={cellStyle}>{cellGlyph(A)}</span>
                    <span mix={cellStyle}>{cellGlyph(B)}</span>
                    <span mix={cellStyle}>{cellGlyph(C)}</span>
                  </div>
                  <p mix={textStyle}>
                    指を離したとき立体が元の向き——<code>e</code>{" "}
                    が正面——なら、なぞった道が消えます。
                  </p>
                  <p mix={textStyle}>
                    最短は3手で、種類はこの2つだけ。<b>同じ字を3つ</b>か、<b>
                      a→b→c の順
                    </b>です。<code>a c b</code> の順では戻りません。
                  </p>
                </>
              )
              : null}

            {page === 3
              ? (
                <>
                  <h2 mix={titleStyle}>打ち消しは数に入らない</h2>
                  <div mix={rowStyle}>
                    <span mix={cellStyle}>{cellGlyph(A)}</span>
                    <span mix={cellStyle}>{cellGlyph(A_INV)}</span>
                  </div>
                  <p mix={textStyle}>
                    隣り合う <code>a</code> と <code>a⁻¹</code>{" "}
                    は互いに打ち消します。なぞっている線が細い破線に変わるので、指を離す前に分かります。
                  </p>
                  <p mix={textStyle}>
                    この2マスだけをなぞっても消えますが、成立には数えません。
                    長い道の途中に挟めば、離れた場所の形まで一度に拾えます——打ち消した分は数に入りません。
                  </p>
                </>
              )
              : null}

            {page === 4
              ? (
                <>
                  <h2 mix={titleStyle}>数えるものと、60秒</h2>
                  <ul mix={listStyle}>
                    <li>
                      <b>消去</b> — 消えたマスの数（打ち消しを除く）
                    </li>
                    <li>
                      <b>成立</b> — 元の向きに戻った回数
                    </li>
                    <li>
                      <b>最長</b> — 一度に成立した最長の道
                    </li>
                  </ul>
                  <p mix={textStyle}>
                    持ち時間は60秒。「始める」のあと 3・2・1 で始まります。
                  </p>
                  <p mix={textStyle}>
                    使えないマスは<b>ダブルタップ</b>で1つだけ消せます。
                    条件はなく、何にも数えません。減るのは時間だけです。
                  </p>
                </>
              )
              : null}

            <div mix={dotsStyle} aria-hidden="true">
              {Array.from(
                { length: PAGES },
                (_, i) => (
                  <i
                    key={i}
                    mix={i === page ? [dotStyle, dotOnStyle] : [dotStyle]}
                  />
                ),
              )}
            </div>

            <div mix={navStyle}>
              <button
                type="button"
                disabled={page === 0}
                mix={[
                  quietStyle,
                  on<HTMLButtonElement>("click", () => turn(-1)),
                ]}
              >
                戻る
              </button>
              <button
                type="button"
                mix={[
                  primaryStyle,
                  on<HTMLButtonElement>("click", () => {
                    if (last) finish();
                    else turn(1);
                  }),
                ]}
              >
                {last ? "とじる" : "次へ"}
              </button>
            </div>

            <label mix={skipStyle}>
              <input
                type="checkbox"
                defaultChecked={tutorial.dismissed}
                mix={on<HTMLInputElement>("change", (event) => {
                  tutorial.remember(event.currentTarget.checked);
                })}
              />
              今後表示しない
            </label>
          </div>
        </div>
      );
    };
  },
);

// --- styles -----------------------------------------------------------------

/** Over the "how to play" card, which is at 10: closing this reveals that. */
const overlayStyle = css({
  position: "fixed",
  inset: "0",
  zIndex: 20,
  display: "grid",
  placeItems: "center",
  padding: "1.25rem",
  overflow: "auto",
  background: "rgba(14, 19, 34, 0.97)",
});

const cardStyle = css({
  width: "min(100%, 24rem)",
  lineHeight: 1.75,
});

const titleStyle = css({
  margin: "0 0 0.75rem",
  fontSize: "1.3rem",
});

const textStyle = css({
  margin: "0 0 0.75rem",
  color: "#cbd1e4",
  fontSize: "0.95rem",
  "& code": {
    background: "rgba(237, 239, 247, 0.1)",
    color: ink.text,
    padding: "0.05rem 0.3rem",
    borderRadius: "4px",
    fontSize: "0.9em",
  },
  "& b": { color: ink.text },
});

const listStyle = css({
  margin: "0 0 0.75rem",
  paddingLeft: "1.1rem",
  color: "#cbd1e4",
  fontSize: "0.95rem",
  "& b": { color: ink.text },
});

/** The cells, at the size they are on the board rather than shrunk to fit a paragraph. */
const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  flexWrap: "wrap",
  margin: "0 0 1rem",
});

const cellStyle = css({
  display: "block",
  width: "3.2rem",
  height: "3.2rem",
  padding: "0.25rem",
  borderRadius: "10px",
  background: surface.cell,
});

const arrowStyle = css({ color: ink.muted, fontSize: "1.1rem" });
const orStyle = css({
  color: ink.muted,
  fontSize: "1.1rem",
  margin: "0 0.2rem",
});

const dotsStyle = css({
  display: "flex",
  gap: "0.35rem",
  margin: "1.25rem 0 0",
});

const dotStyle = css({
  width: "0.45rem",
  height: "0.45rem",
  borderRadius: "50%",
  background: surface.edge,
});

const dotOnStyle = css({ background: ink.text });

const navStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  margin: "0.5rem 0 0",
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

const quietStyle = css({
  font: "inherit",
  cursor: "pointer",
  padding: "0.6rem 1.1rem",
  borderRadius: "10px",
  border: `1px solid ${surface.edge}`,
  background: "transparent",
  color: ink.text,
  "&:active": { transform: "translateY(1px)" },
  "&:disabled": { opacity: 0.35, cursor: "not-allowed" },
});

const skipStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  margin: "1rem 0 0",
  color: ink.muted,
  fontSize: "0.85rem",
  cursor: "pointer",
});
