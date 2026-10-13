/// <reference lib="deno.ns" />

import { deepStrictEqual, equal } from "node:assert/strict";

import {
  answerShapes,
  chain,
  type Op,
  traceLength,
  traceReduction,
} from "./rotation.ts";

const [a, b, c, A, B, C] = [0, 1, 2, 3, 4, 5] as Op[];

Deno.test("a cancelling pair across a closing does not cancel", () => {
  // Two answers back to back, the second the first undone. Reduced as one word it was nothing.
  const word = [a, b, c, C, B, A];
  equal(traceLength(word), 6);
  equal(chain(word).closings, 2);
  equal(chain(word).broken, false);
});

Deno.test("the same letter either side of a closing does not cancel", () => {
  const word = [a, a, a, A, A, A];
  equal(traceLength(word), 6);
  equal(chain(word).closings, 2);
});

Deno.test("a bridge between two answers is still struck out", () => {
  const word = [a, b, c, a, A, a, b, c];
  deepStrictEqual(traceReduction(word).cancelled, [
    false,
    false,
    false,
    true,
    true,
    false,
    false,
    false,
  ]);
  equal(traceLength(word), 6);
  equal(chain(word).closings, 2);
});

Deno.test("a pair inside an answer is still struck out", () => {
  const word = [a, a, A, b, c];
  deepStrictEqual(traceReduction(word).cancelled, [
    false,
    true,
    true,
    false,
    false,
  ]);
  equal(traceLength(word), 3);
  equal(chain(word).closings, 1);
});

Deno.test("nothing but cancelling pairs is worth nothing", () => {
  const word = [a, A, b, B];
  equal(traceLength(word), 0);
  equal(chain(word).closings, 0);
});

Deno.test("answers are named by their shape", () => {
  deepStrictEqual(answerShapes([a, a, a]), ["三連"]);
  deepStrictEqual(answerShapes([B, B, B]), ["三連"]);
  deepStrictEqual(answerShapes([a, b, c]), ["巡回"]);
  deepStrictEqual(answerShapes([b, c, a]), ["巡回"]);
  deepStrictEqual(answerShapes([C, B, A]), ["逆巡回"]);
  deepStrictEqual(answerShapes([A, C, B]), ["逆巡回"]);
  deepStrictEqual(answerShapes([a, B, a, B]), ["クライン"]);
  // a (a c a⁻¹) c: the b of a b c made by conjugation.
  deepStrictEqual(answerShapes([a, a, c, A, c]), ["共役"]);
  // A four-move answer with a sandwich is a conjugation too: a c a⁻¹ is b, so this is b b⁻¹.
  deepStrictEqual(answerShapes([a, c, A, B]), ["共役"]);
  deepStrictEqual(answerShapes([c, b, C, A]), ["共役"]);
  // Six-move answers with a sandwich are 共役 as well; two of them side by side are a ダブル共役.
  deepStrictEqual(answerShapes([a, a, b, A, A, C]), ["共役"]);
  deepStrictEqual(answerShapes([a, c, A, C, A, c]), ["ダブル共役"]);
  deepStrictEqual(answerShapes([a, a, b, a, a, b]), ["6手"]);
  // A four-move answer that is a three-move one with a move written as two is only a 4手.
  deepStrictEqual(answerShapes([a, a, C, B]), ["4手"]);
  deepStrictEqual(answerShapes([a, C, B, a]), ["4手"]);
  // A cancelling pair inside an answer does not change its shape.
  deepStrictEqual(answerShapes([a, b, B, a, a]), ["三連"]);
  // One shape per answer, in order.
  deepStrictEqual(answerShapes([a, b, c, C, C, C]), ["巡回", "三連"]);
  // Not home: no answer, no shape.
  deepStrictEqual(answerShapes([a, b]), []);
});
