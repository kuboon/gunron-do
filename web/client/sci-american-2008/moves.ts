/**
 * The three puzzles' moves, as data: no DOM, so the rules can be checked on their own.
 *
 * M₁₂ and M₂₄ are permutations of positions. A move `perm` rearranges a state `a` into
 * `apply(a, perm)`, where the new `j`th entry is the old `perm[j]`th. Dotto is a 24 × 24 table of
 * integers, and its moves act on the table's columns.
 *
 * Where the article's figures could not be checked, the data is a reconstruction that meets the
 * article's conditions — see "再現について" in `server/sci-american-2008/rules.md`.
 */

/** One of the two permutation puzzles. */
export interface PermGame {
  id: "m12" | "m24";
  title: string;
  n: number;
  /** How many random moves a shuffle is. */
  scrambleLen: number;
  /** Whether the puzzle is small enough to solve outright for a hint. */
  hint: boolean;
  rule: string;
  order: string;
  solved: readonly number[];
  moves: readonly PermMove[];
}

export interface PermMove {
  jp: string;
  sub: string;
  desc: string;
  perm: readonly number[];
  key: string;
  /** Which way round the circle a tile travels, for the animation. */
  dir?: 1 | -1;
  /** The move that undoes this one, so a shuffle never wastes a step; `null` when there is none. */
  inv: number | null;
}

/** `new[j] = a[p[j]]`. */
export const apply = <T>(a: readonly T[], p: readonly number[]): T[] =>
  p.map((i) => a[i]);

export const invPerm = (p: readonly number[]): number[] => {
  const q: number[] = [];
  p.forEach((v, j) => q[v] = j);
  return q;
};

export const sameArr = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a.every((v, i) => v === b[i]);

/** M₂₄'s swap: every position paired with the other circle of its colour. */
export const S24: readonly number[] = [
  9,
  16,
  6,
  4,
  3,
  17,
  2,
  11,
  18,
  0,
  23,
  7,
  13,
  12,
  19,
  22,
  1,
  5,
  8,
  14,
  21,
  20,
  15,
  10,
];
const R24 = Array.from(
  { length: 24 },
  (_, j) => j < 23 ? (j + 22) % 23 : 23,
);
const L24 = Array.from({ length: 24 }, (_, j) => j < 23 ? (j + 1) % 23 : 23);

export const GAMES: Readonly<Record<"m12" | "m24", PermGame>> = {
  m12: {
    id: "m12",
    title: "M<sub>12</sub> パズル",
    n: 12,
    scrambleLen: 70,
    hint: true,
    rule: "1〜12を昇順に戻します。使える操作は2つだけです。",
    order: "とりうる並びは 95,040 通り",
    solved: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    moves: [
      {
        jp: "逆順",
        sub: "INVERT（I）",
        desc: "並びを逆にする",
        perm: [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
        key: "i",
        inv: 0,
      },
      {
        jp: "綾織り",
        sub: "MERGE（M）",
        desc: "先頭と末尾から交互に取って並べ直す（1, 12, 2, 11…の順）",
        perm: [0, 11, 1, 10, 2, 9, 3, 8, 4, 7, 5, 6],
        key: "m",
        inv: null,
      },
    ],
  },
  m24: {
    id: "m24",
    title: "M<sub>24</sub> パズル",
    n: 24,
    scrambleLen: 140,
    hint: false,
    rule:
      "円周の1〜23と、外側の0を元の位置に戻します。円の内側の小さな数字が、その位置に入るべき数です。",
    order: "とりうる並びは 244,823,040 通り",
    solved: Array.from({ length: 24 }, (_, x) => x < 23 ? x + 1 : 0),
    moves: [
      {
        jp: "左回り",
        sub: "←",
        desc: "円を1目盛り反時計回りに回す。外の0は動かない",
        perm: L24,
        key: "arrowleft",
        dir: -1,
        inv: 1,
      },
      {
        jp: "右回り",
        sub: "→",
        desc: "円を1目盛り時計回りに回す。外の0は動かない",
        perm: R24,
        key: "arrowright",
        dir: 1,
        inv: 0,
      },
      {
        jp: "入れ替え",
        sub: "S",
        desc: "同じ色の円にある数どうしを交換する",
        perm: S24,
        key: "s",
        inv: 2,
      },
    ],
  },
};

/**
 * Every state's distance from solved, breadth first over the inverse moves. Only for M₁₂:
 * 95,040 states is a moment, M₂₄'s 244,823,040 is not.
 */
export function distances(game: PermGame): Map<string, number> {
  const key = (a: readonly number[]) => String.fromCharCode(...a);
  const d = new Map([[key(game.solved), 0]]);
  const invs = game.moves.map((m) => invPerm(m.perm));
  let frontier: number[][] = [game.solved.slice()];
  let depth = 0;
  while (frontier.length) {
    depth++;
    const next: number[][] = [];
    for (const a of frontier) {
      for (const q of invs) {
        const b = apply(a, q);
        const k = key(b);
        if (!d.has(k)) {
          d.set(k, depth);
          next.push(b);
        }
      }
    }
    frontier = next;
  }
  return d;
}

export const stateKey = (a: readonly number[]): string =>
  String.fromCharCode(...a);

// --- Dotto ------------------------------------------------------------------

export type Table = number[][];

/**
 * The Dotto board: which number heads each column, its colour (yellow or blue), the starting
 * table, and the two column permutations `R` and `M` act by.
 */
export const DT = {
  label: [
    10,
    1,
    18,
    6,
    3,
    7,
    21,
    22,
    5,
    4,
    8,
    12,
    13,
    14,
    15,
    20,
    19,
    9,
    0,
    11,
    2,
    17,
    23,
    16,
  ],
  color: "yybbyybbyybbyybbyybbyybb",
  B: [
    [8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [2, 2, 2, 2, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 2, 2, 2, 0, 2, 0, 0, 2, 2, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [2, 0, 0, 2, 2, 2, 0, 0, 2, 2, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 0, 2, 0, 2, 2, 0, 2, 0, 2, 0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0],
    [0, 2, 0, 2, 2, 2, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0],
    [0, 2, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0],
    [2, 2, 0, 0, 0, 2, 2, 0, 2, 2, 0, 0, 0, 0, 0, 0, 2, 0, 0, 2, 0, 0, 0, 0],
    [2, 0, 0, 0, 2, 2, 2, 0, 0, 0, 2, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0],
    [0, 0, 2, 0, 0, 2, 0, 0, 2, 2, 2, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0],
    [2, 0, 2, 2, 0, 0, 2, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0],
    [-3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ] as Table,
  rperm: [
    19,
    20,
    16,
    5,
    9,
    10,
    7,
    22,
    3,
    8,
    17,
    12,
    13,
    14,
    23,
    6,
    15,
    0,
    18,
    11,
    4,
    2,
    1,
    21,
  ],
  mperm: [
    1,
    0,
    3,
    2,
    5,
    4,
    7,
    6,
    9,
    8,
    11,
    10,
    13,
    12,
    15,
    14,
    17,
    16,
    19,
    18,
    21,
    20,
    23,
    22,
  ],
} as const;

const moveColumns = (X: Table, perm: readonly number[]): Table =>
  X.map((row) => {
    const n = new Array<number>(24);
    for (let d = 0; d < 24; d++) n[perm[d]] = row[d];
    return n;
  });

export const dR = (X: Table): Table => moveColumns(X, DT.rperm);
export const dM = (X: Table): Table => moveColumns(X, DT.mperm);
export const dS = (X: Table): Table =>
  X.map((row) => row.map((v, c) => c < 8 ? -v : v));
export const dT = (X: Table): Table =>
  X.map((row) => {
    const n = row.slice();
    for (let t = 0; t < 6; t++) {
      const b = 4 * t;
      const sum = row[b] + row[b + 1] + row[b + 2] + row[b + 3];
      for (let i = 0; i < 4; i++) {
        const v = row[b + i] - sum / 2;
        n[b + i] = t === 0 ? -v : v;
      }
    }
    return n;
  });

export interface TableMove {
  jp: string;
  sub: string;
  key: string;
  f: (X: Table) => Table;
  desc: string;
}

export const D_MOVES: readonly TableMove[] = [
  {
    jp: "右回り",
    sub: "R",
    key: "r",
    f: dR,
    desc: "円を1目盛り回す。0の列は動かず、1→2→…→23→1と列が移る",
  },
  {
    jp: "入れ替え",
    sub: "M",
    key: "m",
    f: dM,
    desc: "各テトラッドで、黄色の列どうし・青の列どうしを入れ替える",
  },
  {
    jp: "符号反転",
    sub: "S",
    key: "s",
    f: dS,
    desc: "最初の8列（最初の2テトラッド）の符号を変える",
  },
  {
    jp: "テトラッド",
    sub: "T",
    key: "t",
    f: dT,
    desc:
      "各行・各テトラッドで、4つの数の和の半分を各数から引く。そのあと最初のテトラッドの列の符号を変える",
  },
];

export const tablesEqual = (A: Table, B: Table): boolean =>
  A.every((r, i) => r.every((v, j) => v === B[i][j]));

/** Whether the table is back where it started. */
export const tableSolved = (X: Table): boolean => tablesEqual(X, DT.B);

/** Whether the first row is down to a single ±8 — from there R, M and S alone finish it. */
export const firstRowIsEight = (X: Table): boolean =>
  X[0].filter((v) => v !== 0).length === 1;
