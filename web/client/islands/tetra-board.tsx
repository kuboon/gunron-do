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
 * `animateEntrance` drops it in. A cleared cell is neither — it shrinks where it stands, and the
 * board closes over it only once it has gone. Animating it out of the grid instead would leave
 * the grid a different length for as long as the animation ran, and every cell after the gap
 * would slide into it and back out again.
 *
 * The line the finger leaves is the one place the scoring is visible while it can still be
 * changed, which is the moment it is worth knowing. It says four things. A link that counts is
 * the full line. A link between two moves that cancel each other is a bridge — it scores nothing,
 * it costs nothing against the six, and it gets the finger across — so it is drawn hollow, as two
 * rails with the road missing, and its cells keep their own surface. A trace that has gone too
 * far to come home is thin, dim and dashed all the way along, because none of it is worth
 * anything now. And the stretch that actually spent the allowance is that dashed line in the bad
 * colour, ending where the allowance ran out — which is the difference between telling a player
 * their trace is dead and telling them where they killed it.
 *
 * What it reads is the game; what it writes is three calls on it. No rule is decided here.
 */

import { clientEntry, css, type Handle, on, ref } from "@remix-run/ui";
import { animateEntrance, animateLayout } from "@remix-run/ui/animation";

import { cellGlyph } from "./_lib/cell.tsx";
import { refuseDoubleTap, refuseZoomGestures } from "./_lib/gestures.ts";
import {
  type Burst,
  type BurstCell,
  game,
  HEIGHT,
  WIDTH,
} from "../games/tetra-do/game.ts";
import { ink, OP_COLORS, surface } from "../games/tetra-do/palette.ts";
import { freeReduction, opBase } from "../games/tetra-do/rotation.ts";

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
      if (node === null) return;

      // The board is the one place on the page that has already given up scrolling, so it is the
      // one place that can refuse a touch outright — and refusing it is what keeps a double tap
      // the game's rather than the browser's.
      refuseZoomGestures(node, handle.signal);

      if (typeof ResizeObserver === "undefined") return;

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
      const popping = game.popping;
      // Which of the traced cells cancel each other out. They are what the line goes dim for, so
      // a trace that is all cancellation looks like what it is before the finger comes up.
      const { cancelled } = freeReduction(game.word);

      const broken = game.broken;
      const overrun = game.overrun;
      const shake = game.shake;
      const burst = game.burst;
      const hint = game.hint;

      return (
        <div
          mix={shake ? [wrapStyle, knockStyles[shake.strength]] : [wrapStyle]}
        >
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
              // And a double tap would otherwise offer to zoom in on it. Nothing in the game
              // answers to one any more, but a board is still a thing fingers land on twice in
              // quick succession, and the zoom that follows is the browser answering a question
              // nobody asked. `refuseDoubleTap` is the whole of it.
              ...refuseDoubleTap(),
            ]}
          >
            {game.cells.map((cell, index) => (
              <div
                key={cell.id}
                mix={hint.includes(index)
                  ? [
                    cellStyle,
                    hintStyle,
                    animateEntrance({
                      opacity: 0,
                      transform: "translateY(-40%)",
                      duration: 220,
                    }),
                    animateLayout(),
                  ]
                  : [
                    cellStyle,
                    animateEntrance({
                      opacity: 0,
                      transform: "translateY(-40%)",
                      duration: 220,
                    }),
                    animateLayout(),
                  ]}
              >
                <div
                  mix={faceMix(
                    popping.has(cell.id),
                    path.indexOf(index),
                    cancelled,
                  )}
                >
                  {cellGlyph(cell.op)}
                  {
                    /*
                    Which one first. `a b c` comes home and `a c b` does not, so a lesson that
                    only lit the three cells would be asking for something it had not said.
                  */
                  }
                  {hint.length > 1 && hint.includes(index)
                    ? (
                      <span mix={orderStyle} aria-hidden="true">
                        {hint.indexOf(index) + 1}
                      </span>
                    )
                    : null}
                </div>
              </div>
            ))}
          </div>

          {burst === null ? null : (
            <div
              key={`flash-${burst.id}`}
              mix={flashStyles[burst.strength]}
            />
          )}

          {(path.length >= 2 || burst !== null) && width > 0
            ? (
              <svg
                mix={lineStyle}
                viewBox={`0 0 ${width} ${height}`}
                aria-hidden="true"
              >
                {burst === null
                  ? null
                  : burst.cells.flatMap((cell) =>
                    sparks(cell, burst, center(cell.index), cellSize())
                  )}
                {path.slice(1).map((to, step) => {
                  // Four things a link can be, and the line says which.
                  //
                  // A trace that has gone too far without coming home is dead, whatever it does
                  // next, and the player has to see that while the finger is still down — a rule
                  // you only meet on lifting is a rule you cannot play around. Dim, thin, dashed:
                  // cut.
                  //
                  // Dead everywhere is not the same as wrong everywhere, though, and a line that
                  // only said *dead* left the player to work out which rule they had broken and
                  // where. So the stretch that actually spent the allowance is drawn in the bad
                  // colour, and the line stops at the far end of it: past that cell there is
                  // nothing a move could buy, and a line that went on growing would suggest
                  // otherwise. The stretches before it stay dim — worth nothing, because the
                  // trace is, but not the part that went wrong.
                  //
                  // Both ends, not either: the step from a move that counts into one that does
                  // not is still the trace going somewhere. Only the link between two struck-out
                  // moves is a bridge — it scores nothing and costs nothing, and it carries the
                  // finger to the other side. So it is drawn as the road's two edges without the
                  // road: unbroken, because it connects, and hollow, because nothing of it counts.
                  if (overrun !== null && step >= overrun.to) return null;
                  const from = center(path[step]);
                  const dead = broken;
                  const spent = overrun !== null && step >= overrun.from;
                  const bridging = !dead && cancelled[step] &&
                    cancelled[step + 1];
                  const [x2, y2] = center(to);
                  const key = `${path[step]}-${to}`;
                  if (bridging) {
                    // Perpendicular to the step, so the two rails stay a rail's width apart
                    // whichever way the finger went.
                    const [dx, dy] = [x2 - from[0], y2 - from[1]];
                    const run = Math.hypot(dx, dy) || 1;
                    const [nx, ny] = [
                      (-dy / run) * cellSize() * 0.05,
                      (dx / run) * cellSize() * 0.05,
                    ];
                    return [1, -1].map((side) => (
                      <line
                        key={`${key}-${side}`}
                        x1={from[0] + nx * side}
                        y1={from[1] + ny * side}
                        x2={x2 + nx * side}
                        y2={y2 + ny * side}
                        stroke={ink.muted}
                        stroke-opacity={0.55}
                        stroke-width={Math.max(2, cellSize() * 0.035)}
                        stroke-linecap="round"
                      />
                    ));
                  }
                  return (
                    <line
                      key={key}
                      x1={from[0]}
                      y1={from[1]}
                      x2={x2}
                      y2={y2}
                      stroke={spent ? ink.bad : dead ? ink.muted : ink.text}
                      stroke-opacity={spent ? 0.85 : dead ? 0.4 : 0.7}
                      stroke-width={Math.max(4, cellSize() * 0.13) *
                        (dead ? 0.6 : 1)}
                      stroke-dasharray={dead
                        ? `${cellSize() * 0.09} ${cellSize() * 0.09}`
                        : undefined}
                      stroke-linecap="round"
                    />
                  );
                })}
              </svg>
            )
            : null}
        </div>
      );
    };
  },
);

/**
 * What comes off one cleared cell: a ring, and a handful of sparks in the cell's own colour.
 *
 * CSS animations rather than SVG's own `<animate>`, which looks like the obvious choice and is a
 * trap: SMIL times from the start of the *document's* timeline, so an animation element inserted
 * a minute into a round begins already finished. A CSS animation starts when the element does.
 *
 * Each spark's direction is baked into a custom property and the keyframes are shared, so a burst
 * of a hundred sparks is one rule and a hundred inline values rather than a hundred rules. The
 * direction comes from the spark's own index rather than from `Math.random`, so a board that
 * re-renders mid-flight draws the same burst rather than scattering it again.
 *
 * @param cell Which cell went, and what it held
 * @param burst The burst it belongs to, for the key and the count
 * @param center Where the cell was, in the overlay's pixels
 * @param size The width of a cell, which is the scale all of this is in
 */
function sparks(
  cell: BurstCell,
  burst: Burst,
  [cx, cy]: [number, number],
  size: number,
) {
  const color = OP_COLORS[opBase(cell.op)];

  const count = SPARKS[burst.strength];

  const flying = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + cell.index * 0.7;
    const reach = size * (0.85 + 0.75 * (((i * 7) % 5) / 4));
    const radius = size * 0.12 * (1 - (i % 3) * 0.16);

    return (
      <circle
        key={`${burst.id}-${cell.index}-${i}`}
        mix={sparkStyle}
        cx={cx}
        cy={cy}
        r={radius.toFixed(2)}
        fill={color}
        style={{
          "--tetra-dx": `${(Math.cos(angle) * reach).toFixed(1)}px`,
          "--tetra-dy": `${(Math.sin(angle) * reach).toFixed(1)}px`,
        }}
      />
    );
  });

  return [
    <circle
      key={`${burst.id}-${cell.index}-ring`}
      mix={shockStyle}
      cx={cx}
      cy={cy}
      r={(size * 0.42).toFixed(2)}
      fill="none"
      stroke={color}
      stroke-width={(size * 0.16).toFixed(2)}
    />,
    ...flying,
  ];
}

/** How many sparks a cleared cell throws, by how much the clear was worth. */
const SPARKS = { medium: 10, large: 16 } as const;

/**
 * A cell's face: on its way out, traced, traced-but-cancelled, or none of those.
 *
 * The cancelled one matters as much as the traced one. A trace that only undoes itself scores
 * nothing, and the board is where that has to be visible — a player following the letters would
 * have to reduce the word in their head to see it coming.
 *
 * @param leaving Whether the cell is mid-clear
 * @param step Where the cell sits in the trace, or `-1` when it is not in it
 * @param cancelled One flag per step of the trace
 */
function faceMix(
  leaving: boolean,
  step: number,
  cancelled: readonly boolean[],
) {
  if (leaving) return [faceStyle, facePoppingStyle];
  if (step < 0) return [faceStyle];
  return cancelled[step]
    ? [faceStyle, faceCancelledStyle]
    : [faceStyle, faceTracedStyle];
}

// --- styles -----------------------------------------------------------------

const wrapStyle = css({
  position: "relative",
  display: "grid",
  gap: "0.5rem",
});

/**
 * The swings of a knock, decaying to nothing.
 *
 * Each swing is a fraction of the one before it, so the board always comes back to where it was
 * and a knock never becomes its new resting place.
 *
 * @param amplitude Pixels at the first swing
 */
function swings(amplitude: number) {
  const at = (x: number, y: number) =>
    `translate3d(${(amplitude * x).toFixed(2)}px, ${
      (amplitude * y).toFixed(2)
    }px, 0)`;

  return {
    "0%": { transform: "translate3d(0, 0, 0)" },
    "15%": { transform: at(-1, 0.4) },
    "32%": { transform: at(0.8, -0.35) },
    "50%": { transform: at(-0.55, 0.2) },
    "68%": { transform: at(0.34, -0.12) },
    "84%": { transform: at(-0.16, 0) },
    "100%": { transform: "translate3d(0, 0, 0)" },
  };
}

/** The curve of a hit: fast out, slow back. */
const KNOCK = "340ms cubic-bezier(.36,.07,.19,.97)";

/** Shake is the first thing to go for a player who asked for less motion. */
const STILL = {
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
};

/**
 * One rule per strength, because a keyframe rule needs a name it can be written down with.
 *
 * Three sizes is the whole scale: a trace that did not clear barely nudges the board, an
 * ordinary clear knocks it, and a long one hits it.
 */
const knockStyles = {
  cancel: css({
    "@keyframes tetra-knock-cancel": swings(4),
    animation: `tetra-knock-cancel ${KNOCK}`,
    ...STILL,
  }),
  medium: css({
    "@keyframes tetra-knock-medium": swings(7),
    animation: `tetra-knock-medium ${KNOCK}`,
    ...STILL,
  }),
  large: css({
    "@keyframes tetra-knock-large": swings(11),
    animation: `tetra-knock-large ${KNOCK}`,
    ...STILL,
  }),
} as const;

const boardStyle = css({
  display: "grid",
  gridTemplateColumns: `repeat(${WIDTH}, 1fr)`,
  gap: `${CELL_GAP}px`,
  padding: `${BOARD_PADDING}px`,
  borderRadius: "14px",
  background: surface.board,
  // The finger is drawing, not scrolling, and a long press is not a text selection. On the cells
  // as well as the board: the page sets a `manipulation` floor over everything inside it, and a
  // touch that lands on a cell has to be the board's, not the page's.
  touchAction: "none",
  "& *": { touchAction: "none" },
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
});

/**
 * A cell the walkthrough is pointing at.
 *
 * A pulse rather than a static ring: the instruction is under the board and the cells are what the
 * eye is on, so the board has to be the thing that says "here", and a still outline on a board of
 * outlines is not a thing that says anything.
 */
const hintStyle = css({
  // Between two thicknesses rather than between a ring and nothing: a ring that goes away half
  // the time is a ring a player has to wait for.
  "@keyframes tetra-hint": {
    "0%, 100%": { boxShadow: `0 0 0 2px ${OP_COLORS[0]}` },
    "50%": { boxShadow: `0 0 0 5px ${OP_COLORS[0]}` },
  },
  borderRadius: "12px",
  animation: "tetra-hint 1.1s ease-in-out infinite",
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none",
    boxShadow: `0 0 0 3px ${OP_COLORS[0]}`,
  },
});

/** The number on a hinted cell: which one to touch first. */
const orderStyle = css({
  position: "absolute",
  top: "-0.35rem",
  left: "-0.35rem",
  width: "1.15rem",
  height: "1.15rem",
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  background: OP_COLORS[0],
  color: surface.ink,
  fontSize: "0.7rem",
  fontWeight: 700,
  lineHeight: 1,
});

const cellStyle = css({ aspectRatio: "1" });

const faceStyle = css({
  position: "relative",
  width: "100%",
  height: "100%",
  borderRadius: "10px",
  background: surface.cell,
  // On the face rather than on the cell around it, because that one is what `animateLayout` moves
  // — two transforms on one element, and the one that does not know about the other wins.
  transition:
    "transform 120ms, background 120ms, box-shadow 120ms, opacity 200ms",
});

const faceTracedStyle = css({
  transform: "scale(0.9)",
  background: surface.cellActive,
});

/**
 * Traced, but undone by a neighbour: stepped on, not taken.
 *
 * It keeps the cell's own surface rather than sinking to the board's. A cell the trace cancelled
 * is a pier the finger crossed, not a hole it fell through — and it is still there to be used
 * afterwards, which a hole would not be.
 */
const faceCancelledStyle = css({
  transform: "scale(0.9)",
  background: surface.cell,
  // The same hollow the line is drawn with: an outline where a filled cell would be, so the cell
  // and the link across it say one thing rather than two.
  boxShadow: `inset 0 0 0 2px ${ink.muted}`,
  opacity: 0.8,
});

/** Cleared, and shrinking away in the slot it still holds. */
const facePoppingStyle = css({
  transform: "scale(0.2)",
  opacity: 0,
});

/**
 * A spark: out along its own direction, shrinking, and gone.
 *
 * `transform-box: fill-box` is what makes `scale` shrink the spark about itself; an SVG element's
 * transform origin is otherwise the corner of the user space, which would fling it across the
 * board instead.
 */
const sparkStyle = css({
  transformBox: "fill-box",
  transformOrigin: "center",
  "@keyframes tetra-spark": {
    "0%": { transform: "translate(0, 0) scale(0.5)", opacity: 1 },
    "12%": { transform: "translate(0, 0) scale(1.15)", opacity: 1 },
    "60%": { opacity: 1 },
    "100%": {
      transform: "translate(var(--tetra-dx), var(--tetra-dy)) scale(0.12)",
      opacity: 0,
    },
  },
  animation: "tetra-spark 720ms cubic-bezier(.12,.7,.25,1) forwards",
  "@media (prefers-reduced-motion: reduce)": { animation: "none", opacity: 0 },
});

/** The ring the cell leaves behind: out fast, thin, and gone before the sparks are. */
const shockStyle = css({
  transformBox: "fill-box",
  transformOrigin: "center",
  "@keyframes tetra-shock": {
    "0%": { transform: "scale(0.3)", opacity: 1 },
    "30%": { opacity: 0.75 },
    "100%": { transform: "scale(2.6)", opacity: 0 },
  },
  animation: "tetra-shock 520ms cubic-bezier(.1,.75,.3,1) forwards",
  "@media (prefers-reduced-motion: reduce)": { animation: "none", opacity: 0 },
});

/**
 * The light the whole board takes on a clear.
 *
 * Keyed on the burst, so a second clear restarts it rather than being swallowed by the first.
 * Short and weak: it is there to make the board part of the event rather than to be looked at.
 */
const flashStyles = {
  medium: css({
    position: "absolute",
    inset: "0",
    borderRadius: "14px",
    pointerEvents: "none",
    background: ink.text,
    "@keyframes tetra-flash-medium": {
      "0%": { opacity: 0.1 },
      "100%": { opacity: 0 },
    },
    animation: "tetra-flash-medium 200ms ease-out forwards",
    "@media (prefers-reduced-motion: reduce)": {
      animation: "none",
      opacity: 0,
    },
  }),
  large: css({
    position: "absolute",
    inset: "0",
    borderRadius: "14px",
    pointerEvents: "none",
    background: ink.text,
    "@keyframes tetra-flash-large": {
      "0%": { opacity: 0.22 },
      "18%": { opacity: 0.16 },
      "100%": { opacity: 0 },
    },
    animation: "tetra-flash-large 320ms ease-out forwards",
    "@media (prefers-reduced-motion: reduce)": {
      animation: "none",
      opacity: 0,
    },
  }),
} as const;

/** Over the board, and out of the way of the pointer handlers underneath. */
const lineStyle = css({
  position: "absolute",
  inset: "0",
  pointerEvents: "none",
});
