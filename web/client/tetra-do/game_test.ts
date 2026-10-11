/// <reference lib="deno.ns" />

import { deepStrictEqual, equal } from "node:assert/strict";

import { adjacent, isRoad, type Noises, outcome, TetraDo } from "./game.ts";
import type { Move } from "./record.ts";
import type { Op } from "./rotation.ts";

const [a, b, c] = [0, 1, 2] as Op[];

const SILENT: Noises = {
  step() {},
  back() {},
  mark() {},
  clear() {},
  swap() {},
  cancel() {},
  tick() {},
  over() {},
  music() {},
};

/**
 * ```
 *    0 a   1 a   2 a   3 a   4 b
 *    5 b   6 b   7 b   8 c   9 c
 *   10 a  11 a  12 a  13 b  14 c
 *   15 c  16 c  17 c  18 a  19 b
 *   20 b  21 b  22 b  23 a  24 c
 * ```
 */
// deno-fmt-ignore
const BOARD: readonly Op[] = [
  a, a, a, a, b,
  b, b, b, c, c,
  a, a, a, b, c,
  c, c, c, a, b,
  b, b, b, a, c,
];

function board(): TetraDo {
  const game = new TetraDo(SILENT);
  game.teach(BOARD);
  return game;
}

function trace(game: TetraDo, cells: readonly number[]): void {
  game.beginTrace(cells[0]);
  for (const cell of cells.slice(1)) game.extendTrace(cell);
  game.endTrace();
}

const ops = (game: TetraDo) => game.cells.map((cell) => cell.op);

Deno.test("a trace that comes home is marked, not cleared", () => {
  const game = board();
  trace(game, [0, 1, 2]);
  equal(game.roads.length, 1);
  deepStrictEqual(game.roads[0].path, [0, 1, 2]);
  equal(game.cleared, 0);
  deepStrictEqual(ops(game), BOARD);
});

Deno.test("several roads can be marked at once", () => {
  const game = board();
  trace(game, [0, 1, 2]);
  trace(game, [10, 11, 12]);
  equal(game.roads.length, 2);
});

Deno.test("a trace that does not come home marks nothing", () => {
  const game = board();
  trace(game, [0, 1, 6]);
  equal(game.roads.length, 0);
});

Deno.test("a road run over by a newer one is unmarked", () => {
  const game = board();
  trace(game, [0, 1, 2]);
  trace(game, [10, 11, 12]);
  trace(game, [1, 2, 3]);
  deepStrictEqual(game.roads.map((road) => road.path), [
    [10, 11, 12],
    [1, 2, 3],
  ]);
});

Deno.test("a failed trace over a road leaves the road marked", () => {
  const game = board();
  trace(game, [0, 1, 2]);
  trace(game, [1, 2, 7]);
  deepStrictEqual(game.roads.map((road) => road.path), [[0, 1, 2]]);
});

Deno.test("stepping from home onto a road's start joins the two", () => {
  const game = board();
  trace(game, [10, 11, 12]);
  // b b b comes home at 5, and 10 below it is where the road starts.
  trace(game, [7, 6, 5, 10]);
  equal(game.roads.length, 1);
  deepStrictEqual(game.roads[0].path, [7, 6, 5, 10, 11, 12]);
  equal(game.roads[0].closings, 2);
  equal(game.roads[0].reduced, 6);
  equal(game.path.length, 0);
});

Deno.test("stepping onto a road's start when not home does not join", () => {
  const game = board();
  trace(game, [10, 11, 12]);
  trace(game, [6, 5, 10]);
  deepStrictEqual(game.roads.map((road) => road.path), [[10, 11, 12]]);
});

Deno.test("a swap unmarks the roads it moved a cell of", () => {
  const game = board();
  trace(game, [0, 1, 2]);
  trace(game, [10, 11, 12]);
  trace(game, [2, 7]);
  deepStrictEqual(game.roads.map((road) => road.path), [[10, 11, 12]]);
});

Deno.test("holding the button clears every road and scores them", () => {
  const game = board();
  trace(game, [0, 1, 2]);
  trace(game, [10, 11, 12]);
  game.holdClear(true);
  game.runToEnd();
  equal(game.roads.length, 0);
  equal(game.cleared, 6);
  equal(game.solved, 2);
  equal(game.combo, 1);
  // Six cells went and six were dealt.
  equal(game.cells.length, 25);
});

Deno.test("letting go early clears nothing", () => {
  const game = board();
  trace(game, [0, 1, 2]);
  game.holdClear(true);
  game.holdClear(false);
  game.runToEnd();
  equal(game.roads.length, 1);
  equal(game.cleared, 0);
});

Deno.test("holding with nothing marked does nothing", () => {
  const game = board();
  game.holdClear(true);
  equal(game.holding, false);
});

Deno.test("a recorded hold replays into the same clear", () => {
  // Find any three-cell road on the day's board, then record marking it and holding the button.
  const date = "2026-10-11";
  const probe = new TetraDo(SILENT);
  probe.start(date);
  const word = (path: number[]) => path.map((i) => probe.cells[i].op);
  let found: number[] | null = null;
  for (let i = 0; i < 25 && found === null; i++) {
    for (
      const j of [i - 5, i + 5, i % 5 ? i - 1 : -1, i % 5 < 4 ? i + 1 : -1]
    ) {
      if (j < 0 || j >= 25 || !adjacent(i, j)) continue;
      for (
        const k of [j - 5, j + 5, j % 5 ? j - 1 : -1, j % 5 < 4 ? j + 1 : -1]
      ) {
        if (k < 0 || k >= 25 || k === i || !adjacent(j, k)) continue;
        if (isRoad(word([i, j, k]))) found = [i, j, k];
      }
    }
  }
  if (found === null) throw new Error(`no three-cell road on ${date}`);

  const moves: Move[] = [
    { at: 100, kind: "begin", value: found[0] },
    { at: 200, kind: "extend", value: found[1] },
    { at: 300, kind: "extend", value: found[2] },
    { at: 400, kind: "end", value: 0 },
    { at: 500, kind: "hold", value: 1 },
    { at: 3_000, kind: "hold", value: 0 },
  ];
  deepStrictEqual(outcome(date, moves), { cleared: 3, solved: 1, combo: 1 });

  // Let go before the two seconds are up, and nothing is cleared.
  const early = moves.with(5, { at: 2_000, kind: "hold", value: 0 });
  deepStrictEqual(outcome(date, early), { cleared: 0, solved: 0, combo: 0 });
});
