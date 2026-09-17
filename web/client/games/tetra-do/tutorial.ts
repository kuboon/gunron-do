/**
 * The walkthrough: three things to do on the real board, in order.
 *
 * It was five pages of prose once, and prose turned out to be the wrong medium for it. Nothing
 * written down conveys *the solid turns as your finger moves and the path vanishes when it comes
 * home* — you have to watch it happen under your own hand. So the lesson is the board: the real
 * one, with the real rules, minus the clock.
 *
 * A step points at some cells and waits for them to be gone. That one test covers all three
 * lessons — a path that comes home, a pair that cancels, a cell tapped twice — because all three
 * end the same way, with the cells the player was pointed at no longer there. Nothing here has to
 * know *how* they went, which is what keeps this file from being a second copy of the rules.
 *
 * The preference lives in `localStorage`, read once and lazily: this module is imported by islands
 * that also render on the server, where there is no storage to read and nothing to decide yet.
 */

import { game } from "./game.ts";
import { findClearing, findErasable, findPair } from "./hint.ts";

/** Where the preference is kept between visits. */
const STORAGE_KEY = "tetra-do:tutorial";

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
    ask: "邪魔なマスは2回叩くと消えます。",
    done: "上のマスが落ちてきました。",
  },
  {
    ask: "道がつながりました。なぞってみよう。",
    done: "長い道ほど「最長」が伸びます。",
  },
];

class Tutorial {
  #running = false;
  /** Which step, or `STEPS.length` once they are all done. */
  #at = 0;
  /** The cell ids the current step is waiting to see the back of. */
  #awaiting: number[] = [];
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
    this.#awaiting = [];
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
    const erasable = this.#at === 2 ? findErasable(ops) : null;
    const cells = this.#at === 0
      ? findClearing(ops)
      : this.#at === 1
      ? findPair(ops)
      : this.#at === 2
      ? (erasable === null ? null : [erasable])
      // After the fall: the longest path the board now holds, which is the one the fall opened.
      : findClearing(ops, { longest: true });

    // A board with nothing of this kind on it — rare, and not worth stalling the lesson over.
    if (cells === null) {
      this.#at += 1;
      if (this.#at < STEPS.length) this.#ask();
      else game.setHint([]);
      return;
    }

    this.#awaiting = cells.map((index) => game.cells[index].id);
    game.setHint(cells);
  }

  /**
   * The step is done when the cells it pointed at are gone, however they went.
   *
   * The next step is asked for on the board as it stands *after* the cells have fallen, not as it
   * stood when they popped — so this waits for the board to have closed over the gap.
   */
  #check(): void {
    if (!this.#running || this.#awaiting.length === 0) return;
    if (game.popping.size > 0) return;
    const there = new Set(game.cells.map((cell) => cell.id));
    if (this.#awaiting.some((id) => there.has(id))) return;

    this.#awaiting = [];
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
