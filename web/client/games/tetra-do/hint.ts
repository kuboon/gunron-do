/**
 * Finding something on the board worth pointing at.
 *
 * The walkthrough hands the player a real board and asks them to trace a real path on it, so
 * something has to know which path. That is this: a search over the board for the shapes the
 * lessons are about — one that comes home, one that cancels itself, one that is in the way.
 *
 * The search is small enough to be uninteresting. Twenty-five starting cells, four ways out of
 * each, and a depth of six: a few thousand words at worst, each checked by multiplying at most six
 * quaternions. It runs once when a lesson begins.
 */

import {
  compose,
  isIdentity,
  MIN_REDUCED_LENGTH,
  type Op,
  opInverse,
  reducedLength,
} from "./rotation.ts";

/** The board is square, and these have to agree with the game's. */
const WIDTH = 5;
const HEIGHT = 5;

/** How deep the search goes. Longer paths exist; they are not what a first lesson wants. */
const MAX_DEPTH = 5;

/** The cells up, down, left and right of one. */
function neighbours(index: number): number[] {
  const x = index % WIDTH;
  const y = Math.floor(index / WIDTH);
  const around: [number, number][] = [[x - 1, y], [x + 1, y], [x, y - 1], [
    x,
    y + 1,
  ]];
  return around
    .filter(([a, b]) => a >= 0 && b >= 0 && a < WIDTH && b < HEIGHT)
    .map(([a, b]) => b * WIDTH + a);
}

/** A trace that comes home on its own, with no cancellation holding it up. */
function clears(word: readonly Op[]): boolean {
  return word.length >= MIN_REDUCED_LENGTH &&
    reducedLength(word) === word.length && isIdentity(compose(word));
}

/** What to look for, when the shortest path is not the one wanted. */
export interface Search {
  /** Take the longest path found rather than the shortest. */
  longest?: boolean;
  /** Columns whose top cell is unknown, and so cannot be part of the answer. */
  avoidColumns?: readonly number[];
  /** Cells the path has to touch at least one of, when it has to be *about* something. */
  through?: readonly number[];
}

/**
 * A path on this board that comes home without leaning on a cancellation.
 *
 * Shortest by default, because that is the one a player can hold in their head while they trace
 * it; longest on request, for the lesson that is about length. Never with a cancellation in it —
 * a lesson should not be teaching the exception at the same time as the rule.
 *
 * @param ops What every cell holds, by index
 * @param search What kind of path to look for
 * @returns The cells to trace, in order, or `null` if this board has none
 */
export function findClearing(
  ops: readonly Op[],
  search: Search = {},
): number[] | null {
  let best: number[] | null = null;
  // A column to avoid means its top cell, which is the only one that can be unknown — and in the
  // top row the cell's index is the column's number.
  const forbidden = new Set(search.avoidColumns ?? []);
  const required = search.through;

  const better = (path: number[]): boolean =>
    best === null ||
    (search.longest ? path.length > best.length : path.length < best.length);

  const walk = (path: number[]): void => {
    if (!search.longest && best !== null && path.length >= best.length) return;
    const word = path.map((index) => ops[index]);

    if (
      path.length >= MIN_REDUCED_LENGTH &&
      (required === undefined ||
        required.some((cell) => path.includes(cell))) &&
      reducedLength(word) === path.length &&
      isIdentity(compose(word)) &&
      better(path)
    ) {
      best = [...path];
      if (!search.longest) return;
    }
    if (path.length >= MAX_DEPTH) return;

    for (const next of neighbours(path[path.length - 1])) {
      if (path.includes(next) || forbidden.has(next)) continue;
      path.push(next);
      walk(path);
      path.pop();
    }
  };

  for (let i = 0; i < ops.length; i++) {
    if (forbidden.has(i)) continue;
    walk([i]);
  }
  return best;
}

/**
 * A pair worth changing places: two neighbours whose swap opens up a path.
 *
 * The lesson is not "you may swap two cells" but what a swap is *for*. Both cells stay on the
 * board — nothing is thrown away and nothing unknown arrives — so the only question a swap asks
 * is *which two*, and the answer is whichever pair leaves the longest trace behind it. That makes
 * it a thing to read rather than a thing to tap, which is what the move is here to be.
 *
 * Two cells that hold the same move are skipped: swapping them is a gesture with nothing to show
 * for it, and a lesson should not be teaching one.
 *
 * @param ops What every cell holds, by index
 * @returns The two cells to trace, in order, or `null` when no swap opens anything
 */
export function findSwappable(ops: readonly Op[]): number[] | null {
  let best: { pair: number[]; length: number } | null = null;

  for (let a = 0; a < ops.length; a++) {
    for (const b of neighbours(a)) {
      // Each pair once, and never two cells holding the same move: swapping those is a gesture
      // with nothing to show for it, and a lesson should not be teaching one.
      if (b < a || ops[a] === ops[b]) continue;

      const after = [...ops];
      [after[a], after[b]] = [after[b], after[a]];

      // A path that goes through one of the two, so the swap is what it is about. Asking instead
      // for the board's longest path to get longer does not work: the search stops at `MAX_DEPTH`,
      // so on a board that already holds a five the answer is always no.
      const path = findClearing(after, { longest: true, through: [a, b] });
      if (path === null) continue;

      // And the same cells must not already clear the other way round, or the swap did nothing.
      if (clears(path.map((cell) => ops[cell]))) continue;

      if (best === null || path.length > best.length) {
        best = { pair: [a, b], length: path.length };
      }
      // Long enough to be worth the lesson; no need to keep looking.
      if (best.length >= MAX_DEPTH) return best.pair;
    }
  }
  return best?.pair ?? null;
}

/**
 * Two cells side by side that undo each other.
 *
 * @param ops What every cell holds, by index
 * @returns The pair, or `null` if this board has none
 */
export function findPair(ops: readonly Op[]): number[] | null {
  for (let i = 0; i < ops.length; i++) {
    for (const j of neighbours(i)) {
      if (ops[j] === opInverse(ops[i])) return [i, j];
    }
  }
  return null;
}
