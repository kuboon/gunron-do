/// <reference lib="deno.ns" />

import { deepStrictEqual as assertEquals } from "node:assert/strict";

import {
  apply,
  D_MOVES,
  distances,
  DT,
  GAMES,
  invPerm,
  type Table,
  tableSolved,
} from "./moves.ts";

Deno.test("M12's two moves reach exactly |M12| = 95,040 orderings", () => {
  assertEquals(distances(GAMES.m12).size, 95_040);
});

Deno.test("each M24 move is a permutation of the 24 positions, and inv names its inverse", () => {
  const game = GAMES.m24;
  for (const move of game.moves) {
    assertEquals([...move.perm].sort((a, b) => a - b), [...Array(24).keys()]);
    if (move.inv !== null) {
      const back = game.moves[move.inv].perm;
      assertEquals(apply(apply(game.solved, move.perm), back), game.solved);
      assertEquals(back, invPerm(move.perm));
    }
  }
});

Deno.test("every Dotto move keeps each row's sum of squares", () => {
  const norms = (X: Table) => X.map((r) => r.reduce((s, v) => s + v * v, 0));
  let X: Table = DT.B.map((r) => r.slice());
  const want = norms(X);
  assertEquals(want, [64, ...Array(23).fill(32)]);
  for (let i = 0; i < 200; i++) {
    X = D_MOVES[i % 4 === 3 ? 3 : (i * 7) % 4].f(X);
    assertEquals(norms(X), want);
  }
});

Deno.test("Dotto's R, M and S are undone by 23, 2 and 2 of themselves", () => {
  const start: Table = DT.B.map((r) => r.slice());
  for (
    const [f, n] of [[D_MOVES[0].f, 23], [D_MOVES[1].f, 2], [
      D_MOVES[2].f,
      2,
    ]] as const
  ) {
    let X = start;
    for (let i = 0; i < n; i++) X = f(X);
    assertEquals(tableSolved(X), true);
  }
});
