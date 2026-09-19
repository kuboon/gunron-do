/**
 * The walkthrough: four things to do on a board built to show them.
 *
 * It was five pages of prose once, and prose turned out to be the wrong medium for it. Nothing
 * written down conveys *the solid turns as your finger moves and the path vanishes when it comes
 * home* — you have to watch it happen under your own hand. So the lesson is the board: real
 * cells, real rules, minus the clock.
 *
 * The board is this file's rather than the day's. A lesson taught on whatever a day dealt has to
 * go looking for something roughly like each step and take what it finds, and the last step wants
 * a trace that comes home *twice* — six cells at the very least. A search that stops five deep,
 * which is as far as a first lesson should ask anyone to read, can never return one. So that step
 * pointed at whatever short path was lying around and its closing line said something true about
 * the rules instead of something true about what had just happened. Naming the board is what lets
 * the line say what the player watched.
 *
 * Where each step sits is part of the layout. The first two clear cells in the left three columns
 * and the last two live in the right two, which those clears never move — a column with nothing
 * taken out of it keeps every cell it had. So the cells the last two steps point at are the cells
 * they were laid out as, and what falls in behind the cleared ones is scenery.
 *
 * A step points at some cells and waits for the board to answer. Three of the four end the same
 * way — the cells the player was pointed at are gone — so one test covers a path that comes home,
 * a pair that cancels, and the path a swap opened. The swap itself is the odd one: nothing goes,
 * two things change places, so that step watches for the cells to have moved instead. Neither test
 * asks *how*, which is what keeps this file from being a second copy of the rules.
 *
 * The preference lives in `localStorage`, read once and lazily: this module is imported by islands
 * that also render on the server, where there is no storage to read and nothing to decide yet.
 */

import { game } from "./game.ts";
import type { Op } from "./rotation.ts";

/** Where the preference is kept between visits. */
const STORAGE_KEY = "tetra-do:tutorial";

/** What a step is waiting to see happen to the cells it pointed at. */
interface Awaiting {
  /** Gone, or moved: which of the two is this step being done. */
  kind: "gone" | "moved";
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
 * Arranged, not dealt. Reading across the top three columns: `a b c` for the first step, and the
 * `a` `a⁻¹` under it for the second. The right two columns hold the last two steps — a `c` and a
 * `b` side by side at row three, which is the pair to swap, and the six cells
 * `3 4 9 8 13 14` they finish, which spell `a b c a c b` now and `a b c a b c` once those two have
 * changed places. That word comes home at its third cell and again at its sixth, which is the
 * whole of what the last step is for.
 */
// deno-fmt-ignore
const BOARD: readonly Op[] = [
  A,  B,  C,  A,  B,
  A,  Ai, Bi, A,  C,
  Ci, B,  Ai, C,  B,
  Bi, C,  A,  Bi, Ci,
  C,  Ai, Bi, A,  B,
];

/** What a step asks for, where it is, and what to say once it has been done. */
export interface Step {
  /** The instruction, before the player has done it. */
  ask: string;
  /** What just happened, said once they have. */
  done: string;
  /** The cells to point at, in the order they are to be traced. */
  cells: readonly number[];
  /** What those cells hold when the step comes round, which is what makes it this step. */
  word: readonly Op[];
}

const STEPS: readonly Step[] = [
  {
    ask: "光ったマスを順になぞってみよう。",
    done: "テトラが元の向きに戻り、道が消えました。",
    cells: [0, 1, 2],
    word: [A, B, C],
  },
  {
    ask: "この2マスは打ち消し合います。なぞってみよう。",
    done: "消えましたが、スコアには入りません。",
    cells: [5, 6],
    word: [A, Ai],
  },
  {
    ask: "打ち消し以外は入れ替わります。なぞってみよう。",
    done: "入れ替わって、道がつながりました。",
    cells: [13, 14],
    word: [C, B],
  },
  {
    ask: "できた道をなぞってみよう。",
    done: "1回のなぞりで2回戻りました。成立が2つ増えて、コンボは2です。",
    // The swap has happened by the time this step is asked for, so the last two read the other way
    // round from how the board above was laid out.
    cells: [3, 4, 9, 8, 13, 14],
    word: [A, B, C, A, B, C],
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
    const ask = this.#at >= STEPS.length
      ? "これで遊べます。"
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

    // Three of the four steps end with the cells gone. The swap ends with them still there and
    // somewhere else, so that one watches for the move instead.
    const cells = [...step.cells];
    const ids = cells.map((index) => game.cells[index].id);
    this.#awaiting = {
      kind: this.#at === 2 ? "moved" : "gone",
      ids,
      at: cells,
    };
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
