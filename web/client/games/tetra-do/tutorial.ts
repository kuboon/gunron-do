/**
 * The walkthrough: six things to do on a board built to show them.
 *
 * It was five pages of prose once, and prose turned out to be the wrong medium for it. Nothing
 * written down conveys *the solid turns as your finger moves and the path vanishes when it comes
 * home* — you have to watch it happen under your own hand. So the lesson is the board: real
 * cells, real rules, minus the clock.
 *
 * The board is this file's rather than the day's. A lesson taught on whatever a day dealt has to
 * go looking for something roughly like each step and take what it finds, and most of these steps
 * are not things a day is holding: a five-cell start with a right way on and a wrong one, a
 * cancelling pair sitting between two ways home. Naming the board is what lets each closing line
 * say what the player just watched rather than what the rules say in general.
 *
 * The six are two lessons. The first pair is the swap and what it is for — two cells change
 * places, and the three above turn into a way home. The other four are a single gesture along one
 * route, because that is the only way to show the last three at all: the rule broken and the line
 * stopping, the same trace rescued by backing off one cell and going the other way, and then a
 * bridge and a second way home without the finger ever coming up. Between them they say what
 * counts, what does not, and what a combo is made of.
 *
 * Those four steps point at the route *from its start*, not at the piece still to be traced. A
 * player who lifts halfway through has to begin again, and the numbers on the board are what tell
 * them where from.
 *
 * A step waits for the board, or for the trace. Clearing and swapping change the board, so those
 * steps watch it; the middle of the gesture changes nothing until it ends, so those steps watch
 * where the finger has been. Neither asks *how*, which is what keeps this file from being a
 * second copy of the rules.
 *
 * The preference lives in `localStorage`, read once and lazily: this module is imported by islands
 * that also render on the server, where there is no storage to read and nothing to decide yet.
 */

import { game } from "./game.ts";
import type { Op } from "./rotation.ts";

/** Where the preference is kept between visits. */
const STORAGE_KEY = "tetra-do:tutorial";

/**
 * What a step is waiting to see happen to the cells it pointed at.
 *
 * `gone` is a trace that cleared them, `moved` a swap, and `traced` the finger simply having been
 * over all of them — which is the one the middle of the lesson needs, because those steps happen
 * inside a single gesture and the board does not change until it ends.
 */
interface Awaiting {
  kind: "gone" | "moved" | "traced";
  /** The cells pointed at, by their own identity rather than by where they are. */
  ids: number[];
  /** Where each of them was when the step began. */
  at: number[];
}

/** Where a step stands, once the board has stopped moving. */
type Standing = "waiting" | "done" | "broken";

/** The six moves, named the way the cells read, so the board below can be looked at. */
const A: Op = 0;
const B: Op = 1;
const C: Op = 2;
const Ai: Op = 3;
const Bi: Op = 4;
const Ci: Op = 5;

/**
 * The board the lesson is taught on.
 *
 * Arranged, not dealt, and laid out as two lessons that keep out of each other's way.
 *
 * The top-left three cells are the first two steps: `a c b`, which is not a way home, until the
 * swap makes it `a b c`, which is. Clearing them takes the top off three columns, and a column
 * with its top taken off keeps every cell below where it was — so the rest of the board is
 * exactly where the rest of the lesson left it.
 *
 * The rest is one route, traced in one gesture, that the last four steps walk along:
 *
 * ```
 *   3 → 8 → 13 → 18 → 23 → 22 → 17 → 12 → 7 → 6 → 11
 *   a   a    b    a    a    b    c   c⁻¹  a⁻¹  c⁻¹  b⁻¹
 *                       ↘ 24 (a)
 * ```
 *
 * Five moves in, the finger is at cell 23 with two ways on. Cell 24 spends the sixth without
 * coming home, which is the rule being broken; cell 22 comes home instead, which is the rule
 * being kept. Then `c` `c⁻¹` cancel each other out — two cells crossed for nothing, which is what
 * a bridge is — and the last three come home again. Nine moves counted out of eleven cells
 * traced, home twice: the whole of what the last three steps are about.
 */
// deno-fmt-ignore
const BOARD: readonly Op[] = [
  A,  C,  B,  A,  Bi,
  B,  Ci, Ai, A,  C,
  Ai, Bi, Ci, B,  Ci,
  C,  A,  C,  A,  B,
  Ai, Bi, B,  A,  A,
];

/** The route the last four steps walk, and the cell that is the wrong way on. */
const ROUTE = [3, 8, 13, 18, 23, 22, 17, 12, 7, 6, 11] as const;
const DEAD = 24;

/** What a step asks for, where it is, and what to say once it has been done. */
export interface Step {
  /** The instruction, before the player has done it. */
  ask: string;
  /** What just happened, said once they have. */
  done: string;
  /** What ends the step. */
  wants: Awaiting["kind"];
  /** The cells to point at, in the order they are to be traced. */
  cells: readonly number[];
  /** What those cells hold when the step comes round, which is what makes it this step. */
  word: readonly Op[];
}

const STEPS: readonly Step[] = [
  {
    ask: "この2マスをなぞってみよう。",
    done: "入れ替わりました。2マスなぞると、いつでも入れ替えです。",
    wants: "moved",
    cells: [1, 2],
    word: [C, B],
  },
  {
    ask: "入れ替わって、上の3マスが道になりました。なぞってみよう。",
    done: "テトラが元の向きに戻り、道が消えました。",
    wants: "gone",
    // After the swap, so the other way round from how the board above was laid out.
    cells: [0, 1, 2],
    word: [A, B, C],
  },
  {
    ask: "長い道も引けます。光った順になぞってみよう。",
    done:
      "6手使っても戻らなかったので、赤で止まりました。この先へは進めません。",
    wants: "traced",
    cells: [...ROUTE.slice(0, 5), DEAD],
    word: [A, A, B, A, A, A],
  },
  {
    ask: "最後の1マスを戻して、今度はこちらへ。",
    done: "元の向きに戻りました。これで「成立」がひとつです。",
    wants: "traced",
    cells: ROUTE.slice(0, 6),
    word: [A, A, B, A, A, B],
  },
  {
    ask: "指は離さず、続けてこの2マスへ。",
    done: "打ち消し合う2マスなので、数には入りません。渡っただけです。",
    wants: "traced",
    cells: ROUTE.slice(0, 8),
    word: [A, A, B, A, A, B, C, Ci],
  },
  {
    ask: "そのまま最後までなぞって、指を離そう。",
    done:
      "2回戻ったので、成立が2つ増えてコンボは2。11マスなぞって消去は9です。",
    wants: "gone",
    cells: ROUTE,
    word: [A, A, B, A, A, B, C, Ci, Ai, Ci, Bi],
  },
];

class Tutorial {
  #running = false;
  /** Which step, or `STEPS.length` once they are all done. */
  #at = 0;
  /** What the current step is waiting for the board to do. */
  #awaiting: Awaiting | null = null;
  /** Whether the board had just to be laid out again, so the restart is said rather than only seen. */
  #relaid = false;
  /** `null` until the preference has been read, so the read happens in a browser. */
  #dismissed: boolean | null = null;
  #listeners = new Set<() => void>();
  #watching: (() => void) | null = null;

  /** Whether the walkthrough has the board. */
  get running(): boolean {
    return this.#running;
  }

  /**
   * What to say right now, or `null` when there is nothing to say.
   *
   * What just happened and what to do next, together. On its own, the line about what happened
   * was replaced by the next instruction before it could be read — and it is the half that does
   * the teaching, because it is the half that arrives at the moment the player is looking.
   */
  get says(): string | null {
    if (!this.#running) return null;
    const done = this.#relaid
      ? "盤面を戻しました。"
      : this.#at > 0
      ? STEPS[this.#at - 1].done
      : "";
    // Nothing left to ask for, so the last line points at where the rest of it is written down.
    // The link it names sits in the page's own nav, under the controls this line is printed in.
    const ask = this.#at >= STEPS.length
      ? "より詳しく知りたい方は↓の「ルールを読む」をどうぞ。"
      : STEPS[this.#at].ask;
    return done === "" ? ask : `${done}\n${ask}`;
  }

  /** Whether every step is done, so the only thing left is to start. */
  get finished(): boolean {
    return this.#running && this.#at >= STEPS.length;
  }

  /** Which step is being worked on, for a row of dots. */
  get at(): number {
    return Math.min(this.#at, STEPS.length);
  }

  /** How many steps there are. */
  get length(): number {
    return STEPS.length;
  }

  /**
   * Whether the player has said they do not want it again.
   *
   * A browser with storage blocked reads as "not dismissed": being shown the walkthrough once per
   * visit is a smaller annoyance than never being shown it at all.
   */
  get dismissed(): boolean {
    if (this.#dismissed === null) {
      try {
        this.#dismissed = localStorage.getItem(STORAGE_KEY) === "off";
      } catch {
        this.#dismissed = false;
      }
    }
    return this.#dismissed;
  }

  /** Lays the lesson's board out and asks for the first thing. */
  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#at = 0;
    this.#relaid = false;
    game.teach(BOARD);
    this.#watching ??= game.subscribe(() => this.#check());
    this.#ask();
    this.#emit();
  }

  /**
   * Gives the board back, done or not.
   *
   * The day's board is dealt on the way out, because what the practice was on was not it: the
   * round that follows should be the day everyone else is playing, whole.
   */
  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#awaiting = null;
    this.#watching?.();
    this.#watching = null;
    game.setHint([]);
    game.preview(game.date);
    this.#emit();
  }

  /**
   * Remembers — or forgets — that it is not wanted.
   *
   * @param dismissed Whether to skip it on the next visit
   */
  remember(dismissed: boolean): void {
    this.#dismissed = dismissed;
    try {
      localStorage.setItem(STORAGE_KEY, dismissed ? "off" : "on");
    } catch {
      // Storage blocked: the choice holds for this visit and is forgotten with the tab.
    }
    this.#emit();
  }

  /**
   * @param listener What to run when any of this changes
   * @returns The way to stop listening
   */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Whether a step's cells are still holding the step. */
  #holds(step: Step): boolean {
    return step.cells.every((index, i) =>
      game.cells[index].op === step.word[i]
    );
  }

  /** Points at this step's cells, once they are still the cells the step is about. */
  #ask(): void {
    const step = STEPS[this.#at];
    if (!this.#holds(step)) {
      this.#relay();
      return;
    }

    const cells = [...step.cells];
    const ids = cells.map((index) => game.cells[index].id);
    this.#awaiting = { kind: step.wants, ids, at: cells };
    game.setHint(cells);
  }

  /**
   * Lays the board out again, after the player wandered off the lesson.
   *
   * A board as dealt carries most of the steps where they were laid out, but not the last one:
   * the trace it asks for is only there once the swap before it has been made. So the lesson
   * picks up at the last step the fresh board can actually hold, which is asked of the board
   * rather than written down.
   */
  #relay(): void {
    this.#awaiting = null;
    this.#relaid = true;
    game.teach(BOARD);
    while (this.#at > 0 && !this.#holds(STEPS[this.#at])) this.#at -= 1;
    this.#ask();
  }

  /**
   * Where the current step stands: still being worked on, done, or off the rails.
   *
   * The rules here are the real ones, so nothing stops a player clearing or swapping something of
   * their own instead of what they were pointed at. When they do, the cells the instruction is
   * about may be somewhere else or gone, and then the instruction on screen is asking for
   * something the board can no longer do — which is a dead end rather than a mistake, and the
   * lesson has to say so rather than wait for it.
   *
   * Done and broken are told apart by the cells themselves rather than by what is in those
   * positions now. A step that wanted them gone is done when all of them have gone and broken
   * when any that is left has moved; a step that wanted them moved is the other way round. Either
   * way, cells sitting where they were put still have to be holding the step — a refill can
   * deal the very move the lesson wanted back into the place it came from.
   */
  #judge(waiting: Awaiting): Standing {
    // The middle of the lesson happens inside one gesture, with nothing cleared and nothing
    // swapped, so those steps ask the trace rather than the board: the finger has been over every
    // cell they pointed at, in whatever order it got there.
    if (waiting.kind === "traced") {
      const path = game.path;
      if (waiting.at.every((index) => path.includes(index))) return "done";
      return this.#holds(STEPS[this.#at]) ? "waiting" : "broken";
    }

    const where = waiting.ids.map((id) =>
      game.cells.findIndex((cell) => cell.id === id)
    );
    const moved = where.some((index, i) => index !== waiting.at[i]);

    if (waiting.kind === "gone") {
      if (where.every((index) => index < 0)) return "done";
      if (moved) return "broken";
    } else if (where.some((index) => index < 0)) {
      return "broken";
    } else if (moved) {
      return "done";
    }

    return this.#holds(STEPS[this.#at]) ? "waiting" : "broken";
  }

  /**
   * Reads the board after every move it makes, and moves the lesson on when it is time.
   *
   * The next step is asked for on the board as it stands *after* the cells have fallen, not as it
   * stood when they popped — so this waits for the board to have closed over the gap.
   */
  #check(): void {
    const waiting = this.#awaiting;
    if (!this.#running || waiting === null) return;
    if (game.popping.size > 0) return;

    const standing = this.#judge(waiting);
    if (standing === "waiting") return;
    if (standing === "broken") {
      this.#relay();
      this.#emit();
      return;
    }

    this.#awaiting = null;
    this.#relaid = false;
    this.#at += 1;
    if (this.#at < STEPS.length) this.#ask();
    else game.setHint([]);
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

export const tutorial: Tutorial = new Tutorial();
