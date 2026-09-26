/**
 * 群シューター's screen: the 3D arena, and everything printed over it.
 *
 * The arena itself is not this island's to draw. It renders one box, keeps it (`data-rmx-preserve-dom`)
 * and, once it is in a browser, hands it to `engine.ts` — loaded then and only then, so three.js is
 * never part of the page's first download, and never loaded on the server at all.
 *
 * What this island does draw is the HUD, from `game`: the score and lives across the top, what
 * the aim is on — the enemy, its group, how far from home, and the spot a round would land on —
 * the buttons a phone fires with, and the cards between rounds. It redraws when the game says
 * something changed — a shot, a kill, a new aim — and not every frame; the engine's own overlay
 * does the per-frame work.
 */

import { clientEntry, css, type Handle, on, ref } from "@remix-run/ui";

import { refuseZoomGestures } from "../../gestures.ts";
import { CANNON_COOLDOWN, game, MAX_LIFE } from "../game.ts";
import { type Spin, SPINS, SPOT_NAMES } from "../groups.ts";
import {
  DANGER,
  GOLD,
  INK,
  NIGHT,
  SHOT_COLORS,
  SHOT_GLYPHS,
  SHOT_NAMES,
  SPECIES_COLORS,
} from "../palette.ts";
import { sound } from "../sound.ts";

/** How long the banner for a new wave stays up. */
const BANNER_MS = 2400;

export const GunArena = clientEntry(
  import.meta.url,
  function GunArena(handle: Handle) {
    let host: HTMLElement | null = null;
    let stop: (() => void) | null = null;
    let starting = false;
    let failed = false;
    let banner: { wave: number; until: number } | null = null;
    let lastWave = -1;
    let cannonShots = 0;
    let wasReady = true;

    const unsubscribe = game.subscribe(() => {
      if (game.phase === "playing" && game.wave !== lastWave) {
        lastWave = game.wave;
        banner = { wave: game.wave, until: Date.now() + BANNER_MS };
        setTimeout(() => handle.update(), BANNER_MS + 20);
      }
      const ready = game.cannonCooldown <= 0;
      if (wasReady && !ready) cannonShots += 1;
      wasReady = ready;
      handle.update();
    });
    handle.signal.addEventListener("abort", () => {
      unsubscribe();
      stop?.();
      stop = null;
    }, { once: true });

    function attach(node: Element | null): void {
      if (node === null) {
        stop?.();
        stop = null;
        return;
      }
      if (host === node) return;
      host = node as HTMLElement;
      refuseZoomGestures(node, handle.signal);
      if (starting) return;
      starting = true;
      import("../engine.ts")
        .then((engine) => {
          if (handle.signal.aborted || host === null) return;
          stop = engine.start(host);
        })
        .catch((error) => {
          console.error(error);
          failed = true;
          handle.update();
        });
    }

    /** Starts (or restarts, or resumes) a run. */
    function launch(): void {
      sound.unlock();
      if (game.phase === "paused") game.resume();
      else game.start();
    }

    function press(command: Spin | "cannon") {
      return on<HTMLElement>("pointerdown", (event) => {
        event.preventDefault();
        sound.unlock();
        game.command(command);
      });
    }

    return () => {
      const aim = game.aim;
      const enemy = aim?.enemy ?? null;
      const spot = aim !== null ? enemy!.species.spots[aim.spot] : null;
      const hint = enemy !== null ? game.hintFor(enemy) : null;
      const left = enemy !== null ? enemy.species.depth[enemy.state] : 0;
      const playing = game.phase === "playing";
      const ready = game.cannonCooldown <= 0;
      const showBanner = playing && banner !== null &&
        Date.now() < banner.until;
      const suggested = (spin: Spin): boolean =>
        hint !== null && aim !== null && hint.spot === aim.spot &&
        hint.spin === spin;

      return (
        <div mix={rootStyle}>
          <div
            mix={[stageStyle, ref(attach)]}
            data-rmx-preserve-dom
            aria-label="群シューターの戦場"
            role="img"
          >
            {
              /*
              One fixed child, and it matters. A box whose rendered children are none gets emptied
              wholesale (`textContent = ""`) every time the island redraws, which would take the
              engine's canvas with it; a box with one child is diffed child by child, and the
              canvas the engine appended after it is left alone.
            */
            }
            <span hidden />
          </div>

          {failed
            ? (
              <p mix={failStyle}>
                3D の描画を始められませんでした。WebGL
                に対応したブラウザで開いてください。
              </p>
            )
            : null}

          {/* The top bar: lives, score, wave. */}
          <div mix={topStyle}>
            <div mix={livesStyle} aria-label={`残り ${game.life}`}>
              {Array.from(
                { length: MAX_LIFE },
                (_, i) => (
                  <span
                    key={i}
                    mix={i < game.life ? heartStyle : heartLostStyle}
                  >
                    ◆
                  </span>
                ),
              )}
            </div>
            <div mix={scoreStyle}>
              <span mix={scoreLabelStyle}>SCORE</span>
              <span mix={scoreValueStyle}>{game.score.toLocaleString()}</span>
            </div>
            <div mix={waveStyle}>
              <span>WAVE {game.wave + 1}</span>
              <span mix={waveTitleStyle}>{game.waveTitle}</span>
            </div>
            <button
              type="button"
              mix={[
                muteStyle,
                on("click", () => {
                  sound.toggle();
                  handle.update();
                }),
              ]}
              aria-label={sound.muted ? "音を出す" : "音を消す"}
            >
              {sound.muted ? "🔇" : "🔊"}
            </button>
          </div>

          {playing && game.combo >= 2
            ? (
              <div mix={comboStyle} key={`combo-${game.combo}`}>
                {game.combo} COMBO ×{Math.min(game.combo, 10)}
              </div>
            )
            : null}

          {/* What the aim is on: the enemy, how far from home, and the spot a round would hit. */}
          {playing && enemy !== null && spot !== null
            ? (
              <div mix={targetStyle}>
                <div mix={targetHeadStyle}>
                  <span
                    mix={targetNameStyle}
                    style={{ color: SPECIES_COLORS[enemy.species.id] }}
                  >
                    {enemy.species.label}
                  </span>
                  <span mix={targetShapeStyle}>
                    {enemy.species.shape}・位数 {enemy.species.order}
                    {enemy.boss ? `・のこり ${enemy.lives} 回` : ""}
                  </span>
                  <span
                    mix={leftStyle}
                    key={`left-${enemy.id}-${left}`}
                    style={{ color: left === 0 ? GOLD : INK.text }}
                  >
                    {left === 0 ? "e" : `あと ${left} 発`}
                  </span>
                </div>
                {left === 0
                  ? (
                    <div mix={[stateStyle, homeStyle]}>
                      e に戻った！ e砲 で撃て
                    </div>
                  )
                  : (
                    <div mix={stateStyle}>
                      <b>{SPOT_NAMES[spot.kind]}</b>を通る軸で{" "}
                      <b>{360 / spot.fold}°</b>
                      <span mix={mutedStyle}>
                        （{spot.fold} 回で 1 周・位数 {spot.fold}）
                      </span>
                      {aim!.reachable
                        ? null
                        : <b style={{ color: DANGER }}>・裏側には届かない</b>}
                    </div>
                  )}
                {left !== 0 && game.hintLevel === 2
                  ? (
                    <div mix={hintStyle}>
                      光る輪を、その向きの弾で撃て
                    </div>
                  )
                  : left !== 0 && game.hintLevel === 1
                  ? (
                    <div mix={hintStyle}>
                      白い線がこの敵の回転軸。同じ軸で逆に回せば e
                    </div>
                  )
                  : null}
              </div>
            )
            : null}

          {/* The weapons: the buttons a phone fires with, and a key legend with a mouse. */}
          {playing
            ? (
              <div mix={weaponsStyle}>
                {SPINS.map((spin) => (
                  <button
                    key={spin}
                    type="button"
                    mix={[
                      shotButtonStyle,
                      suggested(spin) ? suggestedStyle : null,
                      press(spin),
                    ]}
                    aria-label={SHOT_NAMES[spin]}
                    style={{ color: SHOT_COLORS[spin] }}
                  >
                    <span mix={glyphStyle}>{SHOT_GLYPHS[spin]}</span>
                    <span mix={shotNameStyle}>{SHOT_NAMES[spin]}</span>
                    <kbd mix={kbdStyle}>
                      {spin === "ccw" ? "左クリック" : "右クリック"}
                    </kbd>
                  </button>
                ))}
                <button
                  type="button"
                  mix={[
                    cannonStyle,
                    ready ? cannonReadyStyle : null,
                    press("cannon"),
                  ]}
                  aria-label="e砲"
                >
                  <span
                    key={`charge-${cannonShots}`}
                    mix={chargeStyle}
                    style={{ animationDuration: `${CANNON_COOLDOWN}s` }}
                  />
                  <span mix={cannonLabelStyle}>e砲</span>
                  <kbd mix={kbdStyle}>Space</kbd>
                </button>
              </div>
            )
            : null}

          {showBanner && banner !== null
            ? (
              <div mix={bannerStyle} key={`banner-${banner.wave}`}>
                <div mix={bannerWaveStyle}>
                  {game.waveTitle.startsWith("A₅")
                    ? "⚠ WARNING ⚠"
                    : `WAVE ${banner.wave + 1}`}
                </div>
                <div mix={bannerTitleStyle}>{game.waveTitle}</div>
              </div>
            )
            : playing && game.clearing
            ? (
              <div mix={bannerStyle} key={`clear-${game.wave}`}>
                <div mix={bannerWaveStyle}>WAVE {game.wave + 1}</div>
                <div mix={[bannerTitleStyle, clearTitleStyle]}>CLEAR!</div>
              </div>
            )
            : null}

          {game.phase === "title"
            ? (
              <div mix={panelStyle}>
                <h1 mix={logoStyle}>群シューター</h1>
                <p mix={leadStyle}>
                  敵を撃って回し、<b style={{ color: GOLD }}>e</b>{" "}
                  の面を砲台へ向けて立たせたら{" "}
                  <b style={{ color: GOLD }}>e砲</b> でとどめ。
                </p>
                <ul mix={howStyle}>
                  <li>
                    <b>当てた場所が回転の軸</b>
                    になる。面の真ん中・頂点・辺の真ん中のどこかで、その軸のまわりに
                    ひとコマ回る
                  </li>
                  <li>
                    弾は {glyph("ccw")} 左回し と {glyph("cw")}{" "}
                    右回し（砲台から見た向き）。点線の枠が e の定位置
                  </li>
                  <li>
                    どの敵も「ある軸のまわりの回転」。<b>同じ軸で逆に回せば</b>
                    {" "}
                    e に戻る。それが逆元
                  </li>
                  <li>
                    e 以外に e砲 を当てると{" "}
                    <b style={{ color: DANGER }}>反発</b>
                    してさらに回る。赤い弾は撃ち落とせ
                  </li>
                  <li mix={fineOnlyStyle}>
                    マウスで場所を指す・左クリック ↺ / 右クリック ↻・Space で
                    e砲・Esc で一時停止
                  </li>
                  <li mix={coarseOnlyStyle}>
                    敵の場所をタップで狙う・下のボタンで撃つ
                  </li>
                </ul>
                <button type="button" mix={[startStyle, on("click", launch)]}>
                  出撃
                </button>
                {game.best > 0
                  ? (
                    <p mix={bestStyle}>
                      ハイスコア {game.best.toLocaleString()}
                    </p>
                  )
                  : null}
              </div>
            )
            : game.phase === "paused"
            ? (
              <div mix={panelStyle}>
                <h2 mix={panelTitleStyle}>一時停止</h2>
                <button type="button" mix={[startStyle, on("click", launch)]}>
                  再開
                </button>
              </div>
            )
            : game.phase === "over"
            ? (
              <div mix={panelStyle}>
                <h2 mix={[panelTitleStyle, overTitleStyle]}>GAME OVER</h2>
                <dl mix={resultStyle}>
                  <div>
                    <dt>スコア</dt>
                    <dd>{game.score.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>撃破</dt>
                    <dd>{game.kills}</dd>
                  </div>
                  <div>
                    <dt>最短撃破</dt>
                    <dd>{game.perfects}</dd>
                  </div>
                  <div>
                    <dt>最大コンボ</dt>
                    <dd>{game.maxCombo}</dd>
                  </div>
                </dl>
                <p mix={bestStyle}>
                  {game.score >= game.best && game.score > 0
                    ? "ハイスコア更新！"
                    : `ハイスコア ${game.best.toLocaleString()}`}
                  ・WAVE {game.wave + 1} まで到達
                </p>
                <button type="button" mix={[startStyle, on("click", launch)]}>
                  もう一度
                </button>
              </div>
            )
            : null}
        </div>
      );
    };
  },
);

/** A round's glyph, in its colour. */
function glyph(spin: Spin) {
  return <b style={{ color: SHOT_COLORS[spin] }}>{SHOT_GLYPHS[spin]}</b>;
}

// --- styles -----------------------------------------------------------------

const font =
  '"Hiragino Maru Gothic ProN", "BIZ UDPGothic", "Yu Gothic", system-ui, sans-serif';

const rootStyle = css({
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  background: NIGHT,
  color: INK.text,
  fontFamily: font,
  userSelect: "none",
  WebkitUserSelect: "none",
});

const stageStyle = css({
  position: "absolute",
  inset: 0,
  touchAction: "none",
});

const failStyle = css({
  position: "absolute",
  inset: "40% 1rem auto",
  textAlign: "center",
  color: INK.muted,
});

const topStyle = css({
  position: "absolute",
  top: "max(0.6rem, env(safe-area-inset-top))",
  left: "max(0.8rem, env(safe-area-inset-left))",
  right: "max(0.8rem, env(safe-area-inset-right))",
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  pointerEvents: "none",
  textShadow: "0 0 10px rgba(0,0,0,0.8)",
});

const livesStyle = css({ display: "flex", gap: "0.15rem", fontSize: "1.1rem" });
const heartStyle = css({ color: "#ff4fd8", textShadow: "0 0 8px #ff4fd8" });
const heartLostStyle = css({ color: "rgba(255,255,255,0.15)" });

const scoreStyle = css({ display: "grid", lineHeight: 1 });
const scoreLabelStyle = css({
  fontSize: "0.6rem",
  letterSpacing: "0.2em",
  color: INK.muted,
});
const scoreValueStyle = css({
  fontSize: "1.5rem",
  fontWeight: 900,
  fontVariantNumeric: "tabular-nums",
  color: GOLD,
  textShadow: `0 0 12px ${GOLD}`,
});

const waveStyle = css({
  marginLeft: "auto",
  display: "grid",
  justifyItems: "end",
  lineHeight: 1.2,
  fontSize: "0.75rem",
  letterSpacing: "0.12em",
  color: INK.muted,
});
const waveTitleStyle = css({
  color: INK.text,
  fontWeight: 700,
  letterSpacing: "0.04em",
});

const muteStyle = css({
  pointerEvents: "auto",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "999px",
  width: "2.2rem",
  height: "2.2rem",
  cursor: "pointer",
  fontSize: "1rem",
});

const comboStyle = css({
  position: "absolute",
  top: "3.6rem",
  left: "50%",
  transform: "translateX(-50%)",
  fontSize: "1.3rem",
  fontWeight: 900,
  color: "#7df9ff",
  textShadow: "0 0 12px #29e7ff",
  letterSpacing: "0.08em",
  animation: "gs-combo .35s cubic-bezier(.2,1.8,.4,1)",
  pointerEvents: "none",
  "@keyframes gs-combo": {
    from: { transform: "translateX(-50%) scale(1.8)", opacity: 0.2 },
    to: { transform: "translateX(-50%) scale(1)", opacity: 1 },
  },
});

const targetStyle = css({
  position: "absolute",
  left: "max(0.8rem, env(safe-area-inset-left))",
  bottom: "max(0.8rem, env(safe-area-inset-bottom))",
  width: "min(calc(100vw - 19rem), 26rem)",
  display: "grid",
  justifyItems: "start",
  "@media (max-width: 40rem)": {
    left: "50%",
    transform: "translateX(-50%)",
    width: "calc(100vw - 1.6rem)",
    bottom: "calc(max(0.8rem, env(safe-area-inset-bottom)) + 5.6rem)",
    justifyItems: "center",
  },
  gap: "0.2rem",
  padding: "0.45rem 0.8rem",
  borderRadius: "0.8rem",
  background: "rgba(10, 6, 20, 0.7)",
  pointerEvents: "none",
});
const targetHeadStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "0.6rem",
  flexWrap: "wrap",
});
const targetNameStyle = css({ fontSize: "1.3rem", fontWeight: 900 });
const targetShapeStyle = css({ fontSize: "0.75rem", color: INK.muted });
const mutedStyle = css({ color: INK.muted, fontSize: "0.75rem" });
const stateStyle = css({ fontSize: "0.9rem", color: INK.text });
const homeStyle = css({
  color: GOLD,
  fontWeight: 900,
  fontSize: "1.05rem",
  animation: "gs-home-blink .4s ease-in-out infinite alternate",
  "@keyframes gs-home-blink": { to: { opacity: 0.55 } },
});
const hintStyle = css({ fontSize: "0.8rem", color: "#9dffb0" });

const weaponsStyle = css({
  position: "absolute",
  right: "max(0.8rem, env(safe-area-inset-right))",
  bottom: "max(0.8rem, env(safe-area-inset-bottom))",
  display: "flex",
  alignItems: "flex-end",
  gap: "0.5rem",
});

const shotButtonStyle = css({
  display: "grid",
  justifyItems: "center",
  alignContent: "center",
  width: "4.6rem",
  height: "4.6rem",
  borderRadius: "1rem",
  border: "2px solid rgba(255,255,255,0.18)",
  background: "rgba(10, 4, 24, 0.55)",
  backdropFilter: "blur(4px)",
  cursor: "pointer",
  touchAction: "none",
  boxShadow: "0 0 14px rgba(0,0,0,0.6)",
  "&[aria-pressed=true]": {
    boxShadow: "0 0 16px currentColor, inset 0 0 12px currentColor",
  },
  "&:active": { transform: "scale(0.92)" },
});
const glyphStyle = css({ fontSize: "1.9rem", lineHeight: 1.1 });
const shotNameStyle = css({ fontSize: "0.65rem", fontWeight: 700 });
const kbdStyle = css({
  fontFamily: "inherit",
  fontSize: "0.6rem",
  color: INK.muted,
  "@media (pointer: coarse)": { display: "none" },
});

const cannonStyle = css({
  position: "relative",
  display: "grid",
  placeItems: "center",
  width: "6rem",
  height: "6rem",
  borderRadius: "50%",
  border: `3px solid rgba(255, 210, 63, 0.35)`,
  background:
    "radial-gradient(circle, rgba(255,210,63,0.12), rgba(10,4,24,0.6) 70%)",
  color: "rgba(255, 210, 63, 0.5)",
  cursor: "pointer",
  touchAction: "none",
  overflow: "hidden",
  "&:active": { transform: "scale(0.94)" },
});
const cannonReadyStyle = css({
  color: GOLD,
  borderColor: GOLD,
  boxShadow: `0 0 22px ${GOLD}, inset 0 0 18px rgba(255,210,63,0.5)`,
  animation: "gs-ready 1s ease-in-out infinite alternate",
  "@keyframes gs-ready": {
    to: { boxShadow: `0 0 34px ${GOLD}, inset 0 0 26px rgba(255,210,63,0.7)` },
  },
});
const chargeStyle = css({
  position: "absolute",
  inset: 0,
  background: "rgba(255,210,63,0.22)",
  transformOrigin: "bottom",
  animation: "gs-charge linear forwards",
  "@keyframes gs-charge": {
    from: { transform: "scaleY(0)" },
    to: { transform: "scaleY(1)" },
  },
});
const cannonLabelStyle = css({
  position: "relative",
  fontSize: "1.5rem",
  fontWeight: 900,
  textShadow: "0 0 12px currentColor",
});

const bannerStyle = css({
  position: "absolute",
  top: "28%",
  left: 0,
  right: 0,
  textAlign: "center",
  pointerEvents: "none",
  animation: `gs-banner ${BANNER_MS}ms ease-out forwards`,
  "@keyframes gs-banner": {
    "0%": {
      opacity: 0,
      transform: "scaleX(3) scaleY(0.2)",
      filter: "blur(8px)",
    },
    "12%": { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
    "80%": { opacity: 1, transform: "scale(1)" },
    "100%": { opacity: 0, transform: "scale(1.2)", filter: "blur(4px)" },
  },
});
const bannerWaveStyle = css({
  fontSize: "0.95rem",
  letterSpacing: "0.5em",
  color: "#ff4fd8",
  textShadow: "0 0 10px #ff4fd8",
});
const bannerTitleStyle = css({
  fontSize: "clamp(2rem, 8vw, 4.2rem)",
  fontWeight: 900,
  letterSpacing: "0.06em",
  background: "linear-gradient(180deg, #fff 10%, #ffd23f 55%, #ff4fd8 95%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  filter: "drop-shadow(0 0 12px rgba(255, 79, 216, 0.7))",
});

const panelStyle = css({
  position: "absolute",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(92vw, 30rem)",
  maxHeight: "90%",
  overflow: "auto",
  padding: "1.5rem 1.4rem",
  borderRadius: "1.2rem",
  background: "rgba(12, 5, 30, 0.82)",
  border: "1px solid rgba(255, 79, 216, 0.4)",
  boxShadow:
    "0 0 40px rgba(255, 79, 216, 0.25), inset 0 0 30px rgba(41, 231, 255, 0.08)",
  backdropFilter: "blur(6px)",
  textAlign: "center",
});
const logoStyle = css({
  margin: "0 0 0.6rem",
  fontSize: "clamp(2.2rem, 9vw, 3.4rem)",
  fontWeight: 900,
  letterSpacing: "0.08em",
  background: "linear-gradient(180deg, #fff 5%, #29e7ff 45%, #ff4fd8 95%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  filter: "drop-shadow(0 0 16px rgba(41, 231, 255, 0.6))",
});
const leadStyle = css({ margin: "0 0 0.9rem", lineHeight: 1.7 });
const howStyle = css({
  margin: "0 0 1.2rem",
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: "0.45rem",
  fontSize: "0.82rem",
  lineHeight: 1.6,
  color: INK.muted,
  textAlign: "left",
});
const fineOnlyStyle = css({ "@media (pointer: coarse)": { display: "none" } });
const coarseOnlyStyle = css({ "@media (pointer: fine)": { display: "none" } });
const startStyle = css({
  font: "inherit",
  fontSize: "1.3rem",
  fontWeight: 900,
  letterSpacing: "0.3em",
  padding: "0.7rem 2.4rem 0.7rem 2.7rem",
  borderRadius: "999px",
  border: "none",
  cursor: "pointer",
  color: "#1a0826",
  background: "linear-gradient(90deg, #29e7ff, #ff4fd8)",
  boxShadow: "0 0 24px rgba(255, 79, 216, 0.6)",
  "&:hover": { filter: "brightness(1.15)" },
  "&:active": { transform: "scale(0.96)" },
});
const bestStyle = css({
  margin: "0.9rem 0 0",
  fontSize: "0.8rem",
  color: INK.muted,
});
const panelTitleStyle = css({
  margin: "0 0 1rem",
  fontSize: "1.8rem",
  letterSpacing: "0.1em",
});
const overTitleStyle = css({ color: DANGER, textShadow: `0 0 16px ${DANGER}` });
const resultStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "0.8rem",
  margin: "0 0 0.4rem",
  "& div": { display: "grid", gap: "0.1rem" },
  "& dt": { fontSize: "0.75rem", color: INK.muted },
  "& dd": {
    margin: 0,
    fontSize: "1.6rem",
    fontWeight: 900,
    fontVariantNumeric: "tabular-nums",
  },
});
const clearTitleStyle = css({
  background: "linear-gradient(180deg, #fff 10%, #7dffea 55%, #29e7ff 95%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  filter: "drop-shadow(0 0 12px rgba(41, 231, 255, 0.7))",
});

const leftStyle = css({
  fontSize: "1.3rem",
  fontWeight: 900,
  lineHeight: 1.1,
  fontVariantNumeric: "tabular-nums",
  animation: "gs-left .3s cubic-bezier(.2,1.8,.4,1)",
  "@keyframes gs-left": {
    from: { transform: "scale(1.5)", opacity: 0.3 },
    to: { transform: "scale(1)", opacity: 1 },
  },
});

/** The button the advice points at: lit, and breathing, so the eye goes to it. */
const suggestedStyle = css({
  borderColor: "currentColor",
  boxShadow: "0 0 18px currentColor, inset 0 0 14px currentColor",
  animation: "gs-suggest .6s ease-in-out infinite alternate",
  "@keyframes gs-suggest": {
    to: { boxShadow: "0 0 6px currentColor, inset 0 0 4px currentColor" },
  },
});
