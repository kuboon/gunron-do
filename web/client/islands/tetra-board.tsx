/**
 * The board, and the finger on it.
 *
 * A trace is one gesture — press, drag, release — so the pointer handlers live on the board as a
 * whole rather than on each cell: once the pointer is captured, the cells a finger crosses are
 * worked out from where it is, not from what it happens to be over. That is also what gives each
 * cell a dead zone at its corners, so cutting the corner between two cells picks up neither.
 *
 * The cells are keyed by the identity the game gives them, which is what makes the board move
 * without anything here animating it: a cell that falls into the row below is the same key in a
 * new place, so `animateLayout` slides it, and a cell dealt into the top is a new key, so
 * `animateEntrance` drops it in. Cleared cells are gone from the state the moment they clear, and
 * `animateExit` is what keeps them on screen long enough to see them go.
 *
 * What it reads is the game; what it writes is three calls on it. No rule is decided here.
 */

import { clientEntry, css, type Handle, on, ref } from "@remix-run/ui";
import {
  animateEntrance,
  animateExit,
  animateLayout,
} from "@remix-run/ui/animation";

import { game, HEIGHT, WIDTH } from "../games/tetra-do/game.ts";
import { ink, OP_COLORS, surface } from "../games/tetra-do/palette.ts";
import {
  type Op,
  opBase,
  opDirection,
  opLabel,
  reducedLength,
} from "../games/tetra-do/rotation.ts";

/**
 * The board's own measurements, in pixels.
 *
 * Shared by the stylesheet and the hit test below, which is why they are constants rather than
 * numbers written into the mixin: a gap the CSS knows and the geometry does not is a gap that
 * makes every touch land one cell to the left.
 */
const BOARD_PADDING = 6;
const CELL_GAP = 6;

/** How far from a cell's centre still counts as that cell, as a fraction of its size. */
const CELL_REACH = 0.42;

/** Where each letter's mark sits in the cell's triangle: `a` right, `b` top, `c` left. */
const MARK_POSITIONS: readonly (readonly [number, number])[] = [
  [86, 77],
  [50, 15],
  [14, 77],
];

export const TetraBoard = clientEntry(
  import.meta.url,
  function TetraBoard(handle: Handle) {
    let board: HTMLElement | null = null;
    let width = 0;
    let height = 0;
    let tracing = false;

    const stop = game.subscribe(() => {
      handle.update();
    });
    handle.signal.addEventListener("abort", stop, { once: true });

    /** Remembers the board's size, so the trace line can be drawn over it. */
    function measure(): void {
      if (board === null) return;
      const rect = board.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    }

    /** The size of one cell, from the board's width and the gaps between them. */
    function cellSize(): number {
      return (width - BOARD_PADDING * 2 - CELL_GAP * (WIDTH - 1)) / WIDTH;
    }

    /** Which cell a point is on, or `null` for a gap, an edge, or off the board. */
    function cellAt(clientX: number, clientY: number): number | null {
      if (board === null) return null;
      const rect = board.getBoundingClientRect();
      width = rect.width;
      height = rect.height;

      const size = cellSize();
      const step = size + CELL_GAP;
      const x = clientX - rect.left - BOARD_PADDING;
      const y = clientY - rect.top - BOARD_PADDING;
      const column = Math.floor(x / step);
      const row = Math.floor(y / step);
      if (column < 0 || row < 0 || column >= WIDTH || row >= HEIGHT) {
        return null;
      }

      const distance = Math.hypot(
        x - (column * step + size / 2),
        y - (row * step + size / 2),
      );
      return distance > size * CELL_REACH ? null : row * WIDTH + column;
    }

    /** The middle of a cell, in the board's own pixels. */
    function center(index: number): [number, number] {
      const size = cellSize();
      const step = size + CELL_GAP;
      return [
        BOARD_PADDING + (index % WIDTH) * step + size / 2,
        BOARD_PADDING + Math.floor(index / WIDTH) * step + size / 2,
      ];
    }

    function attach(node: Element | null): void {
      board = node as HTMLElement | null;
      if (node === null || typeof ResizeObserver === "undefined") return;

      // The line is drawn in pixels, so it has to be told when the board stops being the size it
      // was — a phone turning on its side, or the two-column layout taking over.
      const observer = new ResizeObserver(() => {
        measure();
        handle.update();
      });
      observer.observe(node);
      handle.signal.addEventListener("abort", () => observer.disconnect(), {
        once: true,
      });
    }

    return () => {
      const path = game.path;
      const word = game.word;
      const reduced = reducedLength(word);

      return (
        <div mix={game.shaking ? [wrapStyle, shakeStyle] : [wrapStyle]}>
          <div
            mix={[
              boardStyle,
              ref(attach),
              on("pointerdown", (event) => {
                const index = cellAt(event.clientX, event.clientY);
                if (index === null) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                tracing = true;
                measure();
                game.beginTrace(index);
              }),
              on("pointermove", (event) => {
                if (!tracing) return;
                const index = cellAt(event.clientX, event.clientY);
                if (index !== null) game.extendTrace(index);
              }),
              on("pointerup", () => {
                if (!tracing) return;
                tracing = false;
                game.endTrace();
              }),
              on("pointercancel", () => {
                if (!tracing) return;
                tracing = false;
                game.endTrace();
              }),
              // A long press on a phone would otherwise offer to select the board.
              on("contextmenu", (event) => event.preventDefault()),
            ]}
          >
            {game.cells.map((cell, index) => (
              <div
                key={cell.id}
                mix={[
                  cellStyle,
                  animateEntrance({
                    opacity: 0,
                    transform: "translateY(-40%)",
                    duration: 220,
                  }),
                  animateExit({
                    opacity: 0,
                    transform: "scale(0.2)",
                    duration: 200,
                  }),
                  animateLayout(),
                ]}
              >
                <div
                  mix={path.includes(index)
                    ? [faceStyle, faceTracedStyle]
                    : [faceStyle]}
                >
                  {glyph(cell.op)}
                </div>
              </div>
            ))}
          </div>

          {path.length >= 2 && width > 0
            ? (
              <svg
                mix={lineStyle}
                viewBox={`0 0 ${width} ${height}`}
                aria-hidden="true"
              >
                <polyline
                  points={path
                    .map((index) => center(index).join(","))
                    .join(" ")}
                  fill="none"
                  stroke={ink.text}
                  stroke-opacity=".55"
                  stroke-width={Math.max(4, cellSize() * 0.13)}
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            )
            : null}

          <p mix={wordStyle} aria-live="polite">
            {word.map((op, position) => (
              <span
                key={`${position}-${op}`}
                style={{ color: OP_COLORS[opBase(op)] }}
              >
                {opLabel(op)}
              </span>
            ))}
            {word.length > 0
              ? (
                <small mix={lengthStyle}>
                  長さ {word.length}
                  {reduced !== word.length ? `（打ち消し後 ${reduced}）` : ""}
                </small>
              )
              : null}
          </p>

          <p
            mix={game.message.tone === "good"
              ? [messageStyle, goodStyle]
              : game.message.tone === "bad"
              ? [messageStyle, badStyle]
              : [messageStyle]}
            aria-live="polite"
          >
            {game.message.text}
          </p>
        </div>
      );
    };
  },
);

/**
 * One cell's face: the floor triangle, with the corner this move turns about marked.
 *
 * Filled for a clockwise turn, hollow for its inverse — the same distinction the letter makes,
 * said twice, because at a glance the mark is what a player reads and the letter is what they
 * check.
 */
function glyph(op: Op) {
  const base = opBase(op);
  const color = OP_COLORS[base];
  const inverse = opDirection(op) < 0;
  const [markX, markY] = MARK_POSITIONS[base];

  return (
    <svg
      viewBox="0 0 100 100"
      mix={glyphStyle}
      role="img"
      aria-label={opLabel(op)}
    >
      <polygon
        points="50,15 14,77 86,77"
        fill="none"
        stroke={color}
        stroke-width="3.5"
        stroke-linejoin="round"
        opacity=".8"
      />
      <circle
        cx={markX}
        cy={markY}
        r="10"
        fill={inverse ? surface.cell : color}
        stroke={color}
        stroke-width="4"
      />
      <text
        x="50"
        y="63"
        text-anchor="middle"
        font-size={inverse ? 22 : 26}
        font-weight="bold"
        fill={color}
      >
        {opLabel(op)}
      </text>
    </svg>
  );
}

// --- styles -----------------------------------------------------------------

const wrapStyle = css({
  position: "relative",
  display: "grid",
  gap: "0.5rem",
});

const shakeStyle = css({
  "@keyframes tetra-shake": {
    "25%": { transform: "translateX(-6px)" },
    "75%": { transform: "translateX(6px)" },
  },
  animation: "tetra-shake 300ms",
});

const boardStyle = css({
  display: "grid",
  gridTemplateColumns: `repeat(${WIDTH}, 1fr)`,
  gap: `${CELL_GAP}px`,
  padding: `${BOARD_PADDING}px`,
  borderRadius: "14px",
  background: surface.board,
  // The finger is drawing, not scrolling, and a long press is not a text selection.
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
});

const cellStyle = css({ aspectRatio: "1" });

const faceStyle = css({
  width: "100%",
  height: "100%",
  borderRadius: "10px",
  background: surface.cell,
  transition: "transform 120ms, background 120ms",
});

const faceTracedStyle = css({
  transform: "scale(0.9)",
  background: surface.cellActive,
});

const glyphStyle = css({ display: "block", width: "100%", height: "100%" });

/** Over the board, and out of the way of the pointer handlers underneath. */
const lineStyle = css({
  position: "absolute",
  inset: "0",
  pointerEvents: "none",
});

const wordStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.1rem 0.4rem",
  minHeight: "1.6em",
  margin: 0,
  fontSize: "1.05rem",
  fontWeight: 700,
});

const lengthStyle = css({
  color: ink.muted,
  fontSize: "0.8rem",
  fontWeight: 400,
  marginLeft: "0.3rem",
});

const messageStyle = css({
  minHeight: "1.5em",
  margin: 0,
  fontSize: "0.95rem",
  color: ink.muted,
});

const goodStyle = css({ color: ink.good });
const badStyle = css({ color: ink.bad });
