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

/** What to look for, when the shortest path is not the one wanted. */
export interface Search {
  /** Take the longest path found rather than the shortest. */
  longest?: boolean;
  /** Columns whose top cell is unknown, and so cannot be part of the answer. */
  avoidColumns?: readonly number[];
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

  const better = (path: number[]): boolean =>
    best === null ||
    (search.longest ? path.length > best.length : path.length < best.length);

  const walk = (path: number[]): void => {
    if (!search.longest && best !== null && path.length >= best.length) return;
    const word = path.map((index) => ops[index]);

    if (
      path.length >= MIN_REDUCED_LENGTH &&
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

/** The board after one cell is taken out of it: its column falls, and the top is new. */
function afterErasing(ops: readonly Op[], cell: number): Op[] {
  const x = cell % WIDTH;
  const y = Math.floor(cell / WIDTH);
  const next = [...ops];
  for (let row = y; row >= 1; row--) {
    next[row * WIDTH + x] = ops[(row - 1) * WIDTH + x];
  }
  // The top of that column is dealt fresh, and nothing here can know what it will be.
  return next;
}

/**
 * A cell worth being rid of: one low enough that the fall is visible, and one that opens a path.
 *
 * The lesson is not "you may delete a cell" but what deleting one is *for* — the column drops, and
 * cells that were nowhere near each other end up side by side. So the cell is chosen by looking at
 * the board it leaves behind: the one whose going opens up the longest trace.
 *
 * The cell dealt into the top of that column is unknowable from here, so the path is found without
 * it. Whatever turns up there can only add to what is already promised.
 *
 * @param ops What every cell holds, by index
 * @returns The cell to be rid of, or `null` when taking one changes nothing
 */
export function findErasable(ops: readonly Op[]): number | null {
  let best: { cell: number; length: number } | null = null;

  // From the bottom up: a cell in the top row has nothing above it to fall.
  for (let y = HEIGHT - 1; y >= 1; y--) {
    for (let x = 0; x < WIDTH; x++) {
      const cell = y * WIDTH + x;
      const path = findClearing(afterErasing(ops, cell), {
        longest: true,
        avoidColumns: [x],
      });
      if (path === null) continue;
      if (best === null || path.length > best.length) {
        best = { cell, length: path.length };
      }
      // Long enough to be worth the lesson; no need to keep looking.
      if (best.length >= MAX_DEPTH) return best.cell;
    }
  }
  return best?.cell ?? null;
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
