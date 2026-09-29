/**
 * The three puzzles' screen, drawn straight into the DOM.
 *
 * This began as a single self-contained page, and it stays one: the board is a few dozen absolutely
 * placed tiles animated by hand, and the Dotto table is 576 cells rewritten on every move, which is
 * work for the DOM rather than for a component tree. The island hands this a box and calls `start`
 * once it is in a browser; everything it adds lives inside that box, and `stop` takes its listeners
 * away again.
 *
 * The styles are scoped under `.sa08` and read the site's colour tokens, so the puzzles follow the
 * site's light and dark themes rather than carrying a palette of their own.
 */

import {
  apply,
  D_MOVES,
  distances,
  dR,
  DT,
  firstRowIsEight,
  GAMES,
  type PermGame,
  S24,
  sameArr,
  stateKey,
  type Table,
  tableSolved,
} from "./moves.ts";

const MARKUP = `
<div class="tabs" role="tablist" aria-label="パズルの種類">
  <button role="tab" id="sa08-tab-m12" data-g="m12" aria-selected="true">M<sub>12</sub></button>
  <button role="tab" id="sa08-tab-m24" data-g="m24" aria-selected="false">M<sub>24</sub></button>
  <button role="tab" id="sa08-tab-dotto" data-g="dotto" aria-selected="false">Dotto</button>
</div>

<section class="card" data-el="panel" role="tabpanel">
  <div class="ghead">
    <h2 data-el="gtitle"></h2>
    <p data-el="grule"></p>
    <p class="order" data-el="gorder"></p>
  </div>
  <div class="board-wrap"><div data-el="board" class="board" role="img"></div></div>
  <div class="status"><span data-el="count"></span><span class="msg" data-el="msg" aria-live="polite"></span></div>
  <div class="moves" data-el="moves"></div>
  <div class="tools">
    <button class="tool" data-el="undo" type="button">ひとつ戻す</button>
    <button class="tool" data-el="restart" type="button">最初の配置に戻す</button>
    <button class="tool" data-el="reshuffle" type="button">新しくシャッフル</button>
    <button class="tool" data-el="hint" type="button" hidden>ヒント</button>
    <label class="check"><input type="checkbox" data-el="homeMark">正しい位置に印を付ける</label>
  </div>
</section>

<section class="card" data-el="dpanel" role="tabpanel" aria-labelledby="sa08-tab-dotto" hidden>
  <div class="ghead">
    <h2>Dotto（Co<sub>0</sub>）</h2>
    <p>24×24 の数の表を、最初の表に戻します。使える操作は4つです。</p>
    <p class="order">コンウェイ群 Co<sub>0</sub> の元を、表の変化として見せています（位数 8,315,553,613,086,720,000）</p>
  </div>
  <div class="mwrap"><table class="mx" data-el="mx" aria-label="24行24列の数の表"></table></div>
  <p class="dnote">下の番号を2つ続けてクリックすると、1つ目の番号の列が2つ目の番号の位置へ、円の回転で移ります。縦線で区切られた4列がテトラッドです。</p>
  <div class="status"><span data-el="dcount"></span><span class="msg" data-el="dmsg" aria-live="polite"></span></div>
  <div class="moves" data-el="dmoves"></div>
  <div class="tools">
    <button class="tool" data-el="dundo" type="button">ひとつ戻す</button>
    <button class="tool" data-el="drestart" type="button">最初の配置に戻す</button>
    <button class="tool" data-el="dreshuffle" type="button">新しくシャッフル</button>
    <label class="check"><input type="checkbox" data-el="dMatch">元の表と一致するマスに色を付ける</label>
  </div>
  <details class="notes">
    <summary>攻略のヒント</summary>
    <ul>
      <li>どの操作をしても、各行の数の2乗和は変わりません（1行目は64、ほかの行は32）。</li>
      <li>1行目に 8（または −8）を出せれば、あとは M<sub>24</sub> の操作（R, M）と符号反転（S）だけの問題になります。</li>
      <li>元の表に戻ったとき、対角線上の数はすべて正になっています。</li>
      <li>符号だけが違い、間違っているのが8列だけなら、その8列は R と M だけで最初の8列に移せます。そのあと S で直せます。</li>
    </ul>
  </details>
</section>

<p class="keys">キーボード：M<sub>12</sub> は I（逆順）・M（綾織り）、M<sub>24</sub> は ←・→・S、Dotto は R・M・S・T。どれも U でひとつ戻す。</p>
`;

const STYLE = `
.sa08{
  --surface:var(--card); --ink:var(--fg); --line:var(--border); --accent-ink:var(--on-accent);
  --neg:#B4236B; --tile:#FFFFFF; --shadow:rgba(27,35,80,.45);
  --serif:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;
  line-height:1.65;
}
@media (prefers-color-scheme: dark){
  .sa08{ --neg:#FF7FB6; --tile:#1D2549; --shadow:rgba(0,0,0,.75); }
}
.sa08 sub{font-size:.7em;line-height:0}
.sa08 .tabs{display:inline-flex;gap:4px;padding:4px;border:1.5px solid var(--ink);border-radius:999px;background:var(--surface);margin-bottom:16px}
.sa08 .tabs button{font:inherit;font-family:var(--serif);font-weight:800;font-size:1.05rem;padding:6px 26px;border:0;border-radius:999px;background:transparent;color:var(--ink);cursor:pointer;touch-action:manipulation}
.sa08 .tabs button[aria-selected="true"]{background:var(--ink);color:var(--bg)}
.sa08 button:focus-visible,.sa08 input:focus-visible,.sa08 summary:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.sa08 .card{background:var(--surface);border:1.5px solid var(--ink);border-radius:18px;padding:20px 16px 18px}
.sa08 .ghead h2{font-family:var(--serif);font-weight:800;font-size:1.35rem;margin:0 0 4px}
.sa08 .ghead p{margin:0;font-size:.92rem}
.sa08 .ghead .order{color:var(--muted);font-size:.85rem;margin-top:2px}
.sa08 .board-wrap{margin:18px auto 6px;width:100%}
.sa08 .board{position:relative;width:100%;margin:0 auto;user-select:none;-webkit-user-select:none}
.sa08 .tile{position:absolute;left:0;top:0;display:grid;place-items:center;line-height:1;font-family:var(--serif);font-weight:800;color:var(--ink);
  background:color-mix(in srgb,var(--c,#888) 16%,var(--tile));border-radius:10px;
  box-shadow:inset 0 -6px 0 var(--c,#888),0 9px 14px -10px var(--shadow);will-change:transform}
.sa08 .round .tile{border-radius:50%;background:var(--tile);box-shadow:0 5px 8px -5px var(--shadow)}
.sa08 .show-home .tile.home{outline:3px solid var(--accent);outline-offset:2px}
.sa08 .slot{position:absolute;left:0;top:0;border-radius:50%;border:4px solid var(--c);background:color-mix(in srgb,var(--c) 16%,transparent)}
.sa08 .plabel{position:absolute;left:0;top:0;display:grid;place-items:center;line-height:1;color:var(--muted);font-weight:500;font-variant-numeric:tabular-nums;pointer-events:none}
.sa08 .slot.hi{box-shadow:0 0 0 3px var(--surface),0 0 0 6px var(--c)}
.sa08 .status{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin:10px 2px 14px;min-height:1.7em}
.sa08 .status b{font-family:var(--serif);font-size:1.25rem}
.sa08 .msg{color:var(--muted);font-size:.9rem;text-align:right}
.sa08 .msg.done{color:var(--accent);font-weight:700}
.sa08 .moves{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.sa08 .mv{font:inherit;text-align:left;padding:10px 14px 10px;border:1.5px solid var(--ink);border-radius:14px;background:var(--bg);color:var(--ink);cursor:pointer;touch-action:manipulation;display:grid;gap:1px;transition:transform .08s}
.sa08 .mv:active{transform:translateY(2px)}
.sa08 .mv .jp{font-family:var(--serif);font-weight:800;font-size:1.15rem}
.sa08 .mv .sub{font-size:.75rem;color:var(--muted)}
.sa08 .mv .desc{font-size:.8rem;line-height:1.45;margin-top:2px}
.sa08 .mv.hint{outline:3px solid var(--accent);outline-offset:2px;background:color-mix(in srgb,var(--accent) 14%,var(--bg))}
.sa08 .tools{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;margin-top:14px}
.sa08 .tool{font:inherit;font-size:.88rem;padding:6px 12px;border:1.5px solid var(--line);border-radius:999px;background:transparent;color:var(--ink);cursor:pointer;touch-action:manipulation}
.sa08 .tool:hover{border-color:var(--ink)}
.sa08 .tool[hidden]{display:none}
.sa08 .check{display:inline-flex;align-items:center;gap:6px;font-size:.88rem;margin-left:auto;cursor:pointer}
.sa08 .check input{width:18px;height:18px;accent-color:var(--accent)}
.sa08 .notes{margin-top:20px;font-size:.88rem;color:var(--muted)}
.sa08 .notes summary{cursor:pointer;color:var(--ink);font-weight:700}
.sa08 .notes ul{margin:8px 0 0;padding-left:1.2em}
.sa08 .notes li{margin:4px 0}
.sa08 .keys{margin-top:14px;font-size:.82rem;color:var(--muted)}
.sa08 .mwrap{overflow-x:auto;margin:14px -4px 4px;padding:4px 4px 10px;-webkit-overflow-scrolling:touch}
.sa08 .mx{border-collapse:separate;border-spacing:0;margin:0 auto;font-variant-numeric:tabular-nums;font-size:12.5px;line-height:1}
.sa08 .mx td{width:23px;min-width:23px;height:22px;padding:0;text-align:center;color:var(--ink);font-weight:500;border-bottom:1px solid color-mix(in srgb,var(--line) 50%,transparent)}
.sa08 .mx td.z{color:color-mix(in srgb,var(--muted) 40%,transparent)}
.sa08 .mx td.neg{color:var(--neg);font-weight:700}
.sa08 .mx td.dg{background:color-mix(in srgb,var(--accent) 13%,transparent)}
.sa08 .dmatch .mx td.ok{background:color-mix(in srgb,var(--accent) 26%,transparent)}
.sa08 .mx td.tl,.sa08 .mx th.tl{border-left:2px solid var(--ink)}
.sa08 .mx td.tr,.sa08 .mx th.tr{border-right:2px solid var(--ink)}
.sa08 .mx tr:first-child td{border-top:2px solid var(--ink)}
.sa08 .mx th{padding:5px 0 0;font-weight:400}
.sa08 .mx th button{font:inherit;font-size:11px;font-weight:700;width:21px;height:22px;padding:0;border:0;border-radius:6px;color:#1B2350;cursor:pointer;touch-action:manipulation}
.sa08 .mx th.y button{background:#F2C94C}
.sa08 .mx th.b button{background:#86A6F6}
.sa08 .mx th button.pick{outline:3px solid var(--accent);outline-offset:1px}
.sa08 .dnote{margin:2px 2px 0;font-size:.82rem;color:var(--muted)}
@media (prefers-reduced-motion:reduce){.sa08 .mv{transition:none}}
`;

interface Layout {
  W: number;
  tw: number;
  th: number;
  h: number;
  font: number;
  d: number;
  R: number;
  cx: number;
  cy: number;
  pos: (i: number) => { x: number; y: number; a?: number };
}

/**
 * Builds the puzzles inside `host` and starts them.
 *
 * @param host The box to draw into; it is taken over whole
 * @returns What undoes it: the listeners on the document, the resize watcher, a running animation
 */
export function start(host: HTMLElement): () => void {
  const abort = new AbortController();
  const signal = abort.signal;

  host.classList.add("sa08");
  const style = document.createElement("style");
  style.textContent = STYLE;
  const root = document.createElement("div");
  root.innerHTML = MARKUP;
  host.append(style, root);

  const el = <T extends HTMLElement = HTMLElement>(name: string): T =>
    root.querySelector(`[data-el="${name}"]`) as T;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- the two permutation puzzles ------------------------------------------

  const board = el("board");
  let cfg: PermGame = GAMES.m12;
  let state: number[] = [];
  let startState: number[] = [];
  let hist: number[][] = [];
  let moveCount = 0;
  let tilePos: Record<number, number> = {};
  let tileEls: Record<number, HTMLElement> = {};
  let slotEls: HTMLElement[] = [];
  let labelEls: HTMLElement[] = [];
  let L: Layout | null = null;
  let anim: { items: ((e: number) => void)[]; raf: number } | null = null;
  let lastW = 0;
  let distCache: Map<string, number> | null = null;
  let mode: "m12" | "m24" | "dotto" = "m12";
  const saved: Partial<
    Record<string, {
      state: number[];
      startState: number[];
      hist: number[][];
      moveCount: number;
    }>
  > = {};

  function computeLayout(): Layout {
    const W = board.clientWidth || 320;
    if (cfg.id === "m12") {
      const cols = W >= 560 ? 12 : 6, gap = 8;
      const tw = Math.min(58, (W - (cols - 1) * gap) / cols), th = tw * 1.28;
      const rows = 12 / cols, total = cols * tw + (cols - 1) * gap;
      const offX = (W - total) / 2;
      return {
        W,
        tw,
        th,
        h: rows * th + (rows - 1) * gap,
        font: tw * 0.52,
        d: 0,
        R: 0,
        cx: 0,
        cy: 0,
        pos: (i) => ({
          x: offX + (i % cols) * (tw + gap) + tw / 2,
          y: Math.floor(i / cols) * (th + gap) + th / 2,
        }),
      };
    }
    const size = Math.min(W, 460), R = size * 0.42, d = R * 0.225;
    const r2 = R + d * 1.25;
    const cx = W / 2, cy = r2 + d / 2 + 4, tw = d * 0.76;
    const pos = (i: number) => {
      const a = i < 23 ? 15 * (i + 1) : 0, r = i < 23 ? R : r2;
      const rad = a * Math.PI / 180;
      return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad), a };
    };
    return {
      W,
      tw,
      th: tw,
      d,
      R,
      cx,
      cy,
      h: cy + R + d / 2 + 4,
      font: tw * 0.5,
      pos,
    };
  }

  function place(t: HTMLElement, x: number, y: number): void {
    t.style.transform = `translate3d(${x - L!.tw / 2}px,${y - L!.th / 2}px,0)`;
  }

  function applyLayout(): void {
    L = computeLayout();
    const l = L;
    lastW = board.clientWidth;
    board.style.height = l.h + "px";
    slotEls.forEach((s, i) => {
      s.style.width = s.style.height = l.d + "px";
      const p = l.pos(i);
      s.style.transform = `translate3d(${p.x - l.d / 2}px,${
        p.y - l.d / 2
      }px,0)`;
    });
    labelEls.forEach((t, i) => {
      const w = l.d * 0.62;
      t.style.width = t.style.height = w + "px";
      t.style.fontSize = l.d * 0.36 + "px";
      let x: number, y: number;
      if (i < 23) {
        const a = 15 * (i + 1) * Math.PI / 180, r = l.R - l.d * 0.98;
        x = l.cx + r * Math.sin(a);
        y = l.cy - r * Math.cos(a);
      } else {
        const p = l.pos(23);
        x = p.x + l.d * 0.95;
        y = p.y;
      }
      t.style.transform = `translate3d(${x - w / 2}px,${y - w / 2}px,0)`;
    });
    for (const lab of Object.keys(tileEls).map(Number)) {
      const t = tileEls[lab];
      t.style.width = l.tw + "px";
      t.style.height = l.th + "px";
      t.style.fontSize = l.font + "px";
      const p = l.pos(tilePos[lab]);
      place(t, p.x, p.y);
    }
  }

  function buildBoard(): void {
    board.innerHTML = "";
    tileEls = {};
    slotEls = [];
    labelEls = [];
    board.classList.toggle("round", cfg.id === "m24");
    if (cfg.id === "m24") {
      const colorOf = new Array<number>(24);
      let colors = 0;
      for (let i = 0; i < 24; i++) {
        if (colorOf[i] === undefined) colorOf[i] = colorOf[S24[i]] = colors++;
      }
      for (let i = 0; i < 24; i++) {
        const s = document.createElement("div");
        s.className = "slot";
        const k = colorOf[i];
        s.style.setProperty("--c", `hsl(${k * 30} 72% ${k % 2 ? 62 : 46}%)`);
        s.addEventListener(
          "pointerenter",
          () => slotEls[S24[i]].classList.add("hi"),
        );
        s.addEventListener(
          "pointerleave",
          () => slotEls[S24[i]].classList.remove("hi"),
        );
        board.appendChild(s);
        slotEls.push(s);
      }
      for (let i = 0; i < 24; i++) {
        const t = document.createElement("div");
        t.className = "plabel";
        t.textContent = String(cfg.solved[i]);
        board.appendChild(t);
        labelEls.push(t);
      }
    }
    for (const lab of cfg.solved) {
      const t = document.createElement("div");
      t.className = "tile";
      t.textContent = String(lab);
      if (cfg.id === "m12") {
        t.style.setProperty("--c", `hsl(${(lab - 1) * 30} 68% 55%)`);
      }
      board.appendChild(t);
      tileEls[lab] = t;
    }
  }

  function markHome(): void {
    cfg.solved.forEach((lab, i) => {
      tileEls[lab].classList.toggle("home", state[i] === lab);
    });
  }

  function syncPositions(): void {
    tilePos = {};
    state.forEach((lab, i) => tilePos[lab] = i);
    applyLayout();
    markHome();
    board.setAttribute("aria-label", "現在の並び：" + state.join("、"));
  }

  function snap(): void {
    if (!anim) return;
    cancelAnimationFrame(anim.raf);
    anim.items.forEach((f) => f(1));
    anim = null;
  }

  function moveTiles(next: number[], dir: number | undefined): void {
    snap();
    const l = L!;
    const items: ((e: number) => void)[] = [];
    const nextIdx: Record<number, number> = {};
    next.forEach((lab, i) => nextIdx[lab] = i);
    for (const lab of Object.keys(nextIdx).map(Number)) {
      const from = tilePos[lab], to = nextIdx[lab];
      if (from === to) continue;
      const t = tileEls[lab], pf = l.pos(from), pt = l.pos(to);
      if (dir && cfg.id === "m24" && from < 23 && to < 23) {
        const a0 = pf.a!;
        let a1 = pt.a!;
        if (dir > 0) { while (a1 <= a0) a1 += 360; }
        else while (a1 >= a0) a1 -= 360;
        items.push((e) => {
          const a = (a0 + (a1 - a0) * e) * Math.PI / 180;
          place(t, l.cx + l.R * Math.sin(a), l.cy - l.R * Math.cos(a));
        });
      } else {
        items.push((e) =>
          place(t, pf.x + (pt.x - pf.x) * e, pf.y + (pt.y - pf.y) * e)
        );
      }
    }
    tilePos = {};
    next.forEach((lab, i) => tilePos[lab] = i);
    markHome();
    board.setAttribute("aria-label", "現在の並び：" + next.join("、"));
    if (reduce || !items.length) {
      items.forEach((f) => f(1));
      return;
    }
    const t0 = performance.now(), dur = 240;
    const a = { items, raf: 0 };
    anim = a;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      items.forEach((f) => f(e));
      if (t < 1) a.raf = requestAnimationFrame(step);
      else if (anim === a) anim = null;
    };
    a.raf = requestAnimationFrame(step);
  }

  const isSolved = (s: readonly number[]) => sameArr(s, cfg.solved);

  function makeScramble(): number[] {
    for (;;) {
      let s = cfg.solved.slice(), last = -1;
      for (let k = 0; k < cfg.scrambleLen; k++) {
        let mi: number;
        do mi = Math.floor(Math.random() * cfg.moves.length); while (
          last >= 0 && cfg.moves[last].inv === mi
        );
        s = apply(s, cfg.moves[mi].perm);
        last = mi;
      }
      if (!isSolved(s)) return s;
    }
  }

  function updateStatus(msg = "", done = false): void {
    el("count").innerHTML = `手数 <b>${moveCount}</b>`;
    const m = el("msg");
    m.textContent = msg;
    m.classList.toggle("done", done);
    const undo = el<HTMLButtonElement>("undo");
    undo.disabled = hist.length === 0;
    undo.style.opacity = hist.length ? "1" : ".45";
  }

  function clearHint(): void {
    root.querySelectorAll(".mv.hint").forEach((b) =>
      b.classList.remove("hint")
    );
  }

  function loadState(s: readonly number[], keepStart = false): void {
    snap();
    state = s.slice();
    if (!keepStart) startState = s.slice();
    hist = [];
    moveCount = 0;
    syncPositions();
    clearHint();
    updateStatus();
  }

  function doMove(mi: number): void {
    const mv = cfg.moves[mi];
    hist.push(state);
    state = apply(state, mv.perm);
    moveCount++;
    clearHint();
    moveTiles(state, mv.dir);
    if (isSolved(state)) {
      updateStatus(`完成！ ${moveCount} 手で戻しました`, true);
    } else updateStatus();
  }

  function undo(): void {
    if (!hist.length) return;
    state = hist.pop()!;
    moveCount--;
    clearHint();
    moveTiles(state, 0);
    updateStatus();
  }

  function showHint(): void {
    if (!cfg.hint) return;
    if (!distCache) {
      el("msg").textContent = "計算中…";
      distCache = distances(cfg);
    }
    const cur = distCache.get(stateKey(state))!;
    clearHint();
    if (cur === 0) {
      updateStatus("もう完成しています", true);
      return;
    }
    for (let mi = 0; mi < cfg.moves.length; mi++) {
      const nb = apply(state, cfg.moves[mi].perm);
      if (distCache.get(stateKey(nb)) === cur - 1) {
        el("moves").querySelectorAll(".mv")[mi].classList.add("hint");
        updateStatus(`最短あと ${cur} 手。次は「${cfg.moves[mi].jp}」`);
        return;
      }
    }
  }

  function buildMoves(): void {
    const wrap = el("moves");
    wrap.innerHTML = "";
    cfg.moves.forEach((m, mi) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mv";
      b.innerHTML =
        `<span class="jp">${m.jp}</span><span class="sub">${m.sub}</span><span class="desc">${m.desc}</span>`;
      b.addEventListener("click", () => doMove(mi));
      wrap.appendChild(b);
    });
  }

  // --- Dotto ------------------------------------------------------------------

  const dCells: HTMLTableCellElement[][] = [];
  const dLabBtns: HTMLButtonElement[] = [];
  const D: {
    X: Table | null;
    start: Table | null;
    hist: Table[];
    count: number;
    pick: number | null;
  } = { X: null, start: null, hist: [], count: 0, pick: null };

  function dBuild(): void {
    const tbl = el<HTMLTableElement>("mx");
    tbl.innerHTML = "";
    const tb = document.createElement("tbody");
    for (let r = 0; r < 24; r++) {
      const tr = document.createElement("tr");
      dCells[r] = [];
      for (let c = 0; c < 24; c++) {
        const td = document.createElement("td");
        if (c % 4 === 0) td.classList.add("tl");
        if (c === 23) td.classList.add("tr");
        if (r === c) td.classList.add("dg");
        tr.appendChild(td);
        dCells[r][c] = td;
      }
      tb.appendChild(tr);
    }
    const lr = document.createElement("tr");
    for (let c = 0; c < 24; c++) {
      const th = document.createElement("th");
      th.className = DT.color[c] === "y" ? "y" : "b";
      if (c % 4 === 0) th.classList.add("tl");
      if (c === 23) th.classList.add("tr");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = String(DT.label[c]);
      b.setAttribute("aria-label", "列の番号 " + DT.label[c]);
      b.addEventListener("click", () => dPickLabel(DT.label[c]));
      th.appendChild(b);
      lr.appendChild(th);
      dLabBtns[c] = b;
    }
    tb.appendChild(lr);
    tbl.appendChild(tb);
  }

  function dRender(): void {
    const X = D.X!;
    let same = 0;
    for (let r = 0; r < 24; r++) {
      for (let c = 0; c < 24; c++) {
        const v = X[r][c], td = dCells[r][c];
        td.textContent = v === 0 ? "·" : String(v);
        td.classList.toggle("z", v === 0);
        td.classList.toggle("neg", v < 0);
        const ok = v === DT.B[r][c];
        td.classList.toggle("ok", ok);
        if (ok) same++;
      }
    }
    el("dcount").innerHTML = `手数 <b>${D.count}</b>`;
    const m = el("dmsg");
    if (tableSolved(X)) {
      m.textContent = `完成！ ${D.count} 手で戻しました`;
      m.classList.add("done");
    } else {
      m.classList.remove("done");
      m.textContent = firstRowIsEight(X)
        ? "1行目が ±8 になりました。あとは R・M・S だけで戻せます"
        : `元の表と一致するマス ${same} / 576`;
    }
    const dundo = el<HTMLButtonElement>("dundo");
    dundo.disabled = D.hist.length === 0;
    dundo.style.opacity = D.hist.length ? "1" : ".45";
    dLabBtns.forEach((b, c) =>
      b.classList.toggle("pick", D.pick === DT.label[c])
    );
  }

  function dApply(f: (X: Table) => Table): void {
    D.hist.push(D.X!);
    D.X = f(D.X!);
    D.count++;
    D.pick = null;
    dRender();
  }

  function dPickLabel(n: number): void {
    if (n === 0 || D.pick === n) {
      D.pick = null;
      dRender();
      return;
    }
    if (D.pick === null) {
      D.pick = n;
      dRender();
      return;
    }
    const k = ((n - D.pick) % 23 + 23) % 23;
    dApply((X) => {
      for (let i = 0; i < k; i++) X = dR(X);
      return X;
    });
  }

  function dUndo(): void {
    if (!D.hist.length) return;
    D.X = D.hist.pop()!;
    D.count--;
    D.pick = null;
    dRender();
  }

  function dScramble(): Table {
    for (;;) {
      let X = DT.B.map((r) => r.slice()), last = -1;
      for (let i = 0; i < 160; i++) {
        let k: number;
        do k = Math.floor(Math.random() * 4); while (k === last && k !== 0);
        X = D_MOVES[k].f(X);
        last = k;
      }
      if (!tableSolved(X) && !firstRowIsEight(X)) return X;
    }
  }

  function dLoad(X: Table, keepStart = false): void {
    D.X = X.map((r) => r.slice());
    if (!keepStart) D.start = X.map((r) => r.slice());
    D.hist = [];
    D.count = 0;
    D.pick = null;
    dRender();
  }

  function dInit(): void {
    const wrap = el("dmoves");
    wrap.innerHTML = "";
    for (const m of D_MOVES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mv";
      b.innerHTML =
        `<span class="jp">${m.jp}</span><span class="sub">${m.sub}</span><span class="desc">${m.desc}</span>`;
      b.addEventListener("click", () => dApply(m.f));
      wrap.appendChild(b);
    }
    dBuild();
    dLoad(dScramble());
  }

  // --- tabs and wiring --------------------------------------------------------

  function selectGame(id: "m12" | "m24" | "dotto"): void {
    snap();
    if (mode !== "dotto" && state.length) {
      saved[cfg.id] = { state, startState, hist, moveCount };
    }
    mode = id;
    root.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.g === id))
    );
    if (id === "dotto") {
      el("panel").hidden = true;
      el("dpanel").hidden = false;
      if (!D.X) dInit();
      return;
    }
    el("dpanel").hidden = true;
    el("panel").hidden = false;
    cfg = GAMES[id];
    el("panel").setAttribute("aria-labelledby", "sa08-tab-" + id);
    el("gtitle").innerHTML = cfg.title;
    el("grule").textContent = cfg.rule;
    el("gorder").textContent = cfg.order;
    el("hint").hidden = !cfg.hint;
    buildMoves();
    buildBoard();
    L = computeLayout();
    const sv = saved[id];
    if (sv) {
      state = sv.state.slice();
      startState = sv.startState;
      hist = sv.hist;
      moveCount = sv.moveCount;
      syncPositions();
      clearHint();
      const done = isSolved(state);
      updateStatus(done ? `完成！ ${moveCount} 手で戻しました` : "", done);
    } else {
      loadState(makeScramble());
    }
  }

  root.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) =>
    b.addEventListener(
      "click",
      () => selectGame(b.dataset.g as "m12" | "m24" | "dotto"),
    )
  );
  el("undo").addEventListener("click", undo);
  el("restart").addEventListener("click", () => loadState(startState, true));
  el("reshuffle").addEventListener("click", () => loadState(makeScramble()));
  el("hint").addEventListener("click", showHint);
  el<HTMLInputElement>("homeMark").addEventListener(
    "change",
    (e) =>
      board.classList.toggle(
        "show-home",
        (e.target as HTMLInputElement).checked,
      ),
  );
  el("dundo").addEventListener("click", dUndo);
  el("drestart").addEventListener("click", () => dLoad(D.start!, true));
  el("dreshuffle").addEventListener("click", () => dLoad(dScramble()));
  el<HTMLInputElement>("dMatch").addEventListener(
    "change",
    (e) =>
      el("dpanel").classList.toggle(
        "dmatch",
        (e.target as HTMLInputElement).checked,
      ),
  );

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select")) return;
    const k = e.key.toLowerCase();
    if (mode === "dotto") {
      if (k === "u") return dUndo();
      const di = D_MOVES.findIndex((m) => m.key === k);
      if (di >= 0) {
        e.preventDefault();
        dApply(D_MOVES[di].f);
      }
      return;
    }
    if (k === "u") return undo();
    const mi = cfg.moves.findIndex((m) => m.key === k);
    if (mi >= 0) {
      e.preventDefault();
      doMove(mi);
    }
  }, { signal });

  const resized = () => {
    if (board.clientWidth !== lastW) applyLayout();
  };
  const watcher = new ResizeObserver(resized);
  watcher.observe(board);

  selectGame("m12");

  return () => {
    abort.abort();
    watcher.disconnect();
    snap();
    style.remove();
    root.remove();
    host.classList.remove("sa08");
  };
}
