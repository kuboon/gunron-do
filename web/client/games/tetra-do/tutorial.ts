/**
 * The walkthrough: three things to do on the real board, in order.
 *
 * It was five pages of prose once, and prose turned out to be the wrong medium for it. Nothing
 * written down conveys *the solid turns as your finger moves and the path vanishes when it comes
 * home* — you have to watch it happen under your own hand. So the lesson is the board: the real
 * one, with the real rules, minus the clock.
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
import { findClearing, findPair, findSwappable } from "./hint.ts";

/** Where the preference is kept between visits. */
const STORAGE_KEY = "tetra-do:tutorial";

/** What a step is waiting to see happen to the cells it pointed at. */
type Awaiting =
  | { kind: "gone"; ids: number[] }
  | { kind: "moved"; ids: number[]; at: number[] };

/** What a step asks for, and what to say once it has been done. */
export interface Step {
  /** The instruction, before the player has done it. */
  ask: string;
  /** What just happened, said once they have. */
  done: string;
}

const STEPS: readonly Step[] = [
  {
    ask: "光ったマスを順になぞってみよう。",
    done: "テトラが元の向きに戻り、道が消えました。",
  },
  {
    ask: "この2マスは打ち消し合います。なぞってみよう。",
    done: "消えましたが、スコアには入りません。",
  },
  {
    ask: "この2マスを順になぞると、入れ替わります。",
    done: "入れ替わって、道がつながりました。",
  },
  {
    ask: "できた道をなぞってみよう。",
    // What the number did, not what it should have been. The path this step points at is whatever
    // the board is holding, and most of them come home once — a line promising two would be the
    // lesson telling the player something the board just did not do.
    done: "なぞりの中で戻った回数が、そのまま「成立」です。",
  },
];

class Tutorial {
  #running = false;
  /** Which step, or `STEPS.length` once they are all done. */
  #at = 0;
  /** What the current step is waiting for the board to do. */
  #awaiting: Awaiting | null = null;
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
    const done = this.#at > 0 ? STEPS[this.#at - 1].done : "";
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

  /** Takes the board and asks for the first thing. */
  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#at = 0;
    game.teach();
    this.#watching ??= game.subscribe(() => this.#check());
    this.#ask();
    this.#emit();
  }

  /**
   * Gives the board back, done or not.
   *
   * The board is dealt again on the way out: a lesson leaves holes in it, and the round that
   * follows should be the day's board rather than the day's board minus the practice.
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

  /** Points at whatever this step is about, on the board as it stands now. */
  #ask(): void {
    const ops = game.cells.map((cell) => cell.op);
    const cells = this.#at === 0
      ? findClearing(ops)
      : this.#at === 1
      ? findPair(ops)
      : this.#at === 2
      ? findSwappable(ops)
      // After the swap: the longest path the board now holds, which is the one the swap opened.
      : findClearing(ops, { longest: true });

    // A board with nothing of this kind on it — rare, and not worth stalling the lesson over.
    if (cells === null) {
      this.#at += 1;
      if (this.#at < STEPS.length) this.#ask();
      else game.setHint([]);
      return;
    }

    // Three of the four steps end with the cells gone. The swap ends with them still there and
    // somewhere else, so that one watches for the move instead.
    const ids = cells.map((index) => game.cells[index].id);
    this.#awaiting = this.#at === 2
      ? { kind: "moved", ids, at: [...cells] }
      : { kind: "gone", ids };
    game.setHint(cells);
  }

  /**
   * The step is done when the cells it pointed at are gone, however they went.
   *
   * The next step is asked for on the board as it stands *after* the cells have fallen, not as it
   * stood when they popped — so this waits for the board to have closed over the gap.
   */
  #check(): void {
    const waiting = this.#awaiting;
    if (!this.#running || waiting === null) return;
    if (game.popping.size > 0) return;

    if (waiting.kind === "gone") {
      const there = new Set(game.cells.map((cell) => cell.id));
      if (waiting.ids.some((id) => there.has(id))) return;
    } else {
      const at = (id: number) => game.cells.findIndex((cell) => cell.id === id);
      if (waiting.ids.every((id, i) => at(id) === waiting.at[i])) return;
    }

    this.#awaiting = null;
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
