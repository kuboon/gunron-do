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

/**
 * The shortest path on this board that comes home without leaning on a cancellation.
 *
 * Shortest because it is the one a player can hold in their head while they trace it, and without
 * cancellations because a first lesson should not be teaching the exception at the same time.
 *
 * @param ops What every cell holds, by index
 * @returns The cells to trace, in order, or `null` if this board has none
 */
export function findClearing(ops: readonly Op[]): number[] | null {
  let best: number[] | null = null;

  const walk = (path: number[]): void => {
    if (best !== null && path.length >= best.length) return;
    const word = path.map((index) => ops[index]);

    if (
      path.length >= MIN_REDUCED_LENGTH &&
      reducedLength(word) === path.length &&
      isIdentity(compose(word))
    ) {
      best = [...path];
      return;
    }
    if (path.length >= MAX_DEPTH) return;

    for (const next of neighbours(path[path.length - 1])) {
      if (path.includes(next)) continue;
      path.push(next);
      walk(path);
      path.pop();
    }
  };

  for (let i = 0; i < ops.length; i++) walk([i]);
  return best;
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

/**
 * A cell to be rid of.
 *
 * Any cell will do — that is the whole point of the move being taught — so this picks one that is
 * not in the way of anything else being pointed at.
 *
 * @param ops What every cell holds, by index
 * @param busy Cells already spoken for
 * @returns A cell index
 */
export function findSpare(ops: readonly Op[], busy: readonly number[]): number {
  for (let i = 0; i < ops.length; i++) if (!busy.includes(i)) return i;
  return 0;
}
