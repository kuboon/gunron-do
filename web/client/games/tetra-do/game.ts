/**
 * The game itself: one object, three islands reading it.
 *
 * The board, the trace, the clock and the solid's orientation are one state — a cell you touch
 * turns the solid, the turn that lands home clears the cell, and clearing it moves the clock — so
 * they live together here rather than in whichever island happens to draw them. What the islands
 * get is a view of it and two ways to be told it changed: {@link TetraDo.subscribe} for the moves,
 * and {@link TetraDo.onFrame} for the animation, which is the difference between re-rendering
 * twenty-five cells on a touch and re-rendering one solid sixty times a second.
 *
 * The clock is the frame loop, and the frame loop belongs to whoever is listening: it starts with
 * the first `onFrame` and stops with the last, so the page costs nothing once it is closed and a
 * mounted island never has to remember to start it.
 *
 * Nothing here touches the DOM. That is what lets the rules be read — and tested — without a
 * browser, and it is why the island below can be a plain render function over these getters.
 */

import {
  compose,
  IDENTITY,
  isIdentity,
  MIN_REDUCED_LENGTH,
  multiply,
  type Op,
  OP_ROTATIONS,
  opBase,
  opDirection,
  opInverse,
  type Quat,
  reducedLength,
  slerp,
} from "./rotation.ts";

/** The board is square, and small enough that every cell is in reach of a thumb. */
export const WIDTH = 5;
export const HEIGHT = 5;

/** One round. Long enough to find a few long traces, short enough to want the next round. */
export const ROUND_MS = 90_000;

/** What a trace that does not come home costs. */
export const MISS_PENALTY_MS = 5_000;

/** Where the time bar starts reading as nearly over. */
export const LOW_TIME_MS = 15_000;

/** Where the round is in its life, which is also which overlay is up. */
export type Phase = "ready" | "playing" | "over";

/** A line under the board: what just happened, and how it went. */
export interface Message {
  text: string;
  tone: "" | "good" | "bad";
}

/**
 * A cell, with an identity of its own.
 *
 * The identity is the point: a cell that falls into another row is the *same* cell in a new place,
 * and one that drops in from above is a new one. Keyed on `id`, the renderer moves the first and
 * inserts the second, so the gravity and the refill animate because they are true rather than
 * because anything here drew them.
 */
export interface Cell {
  id: number;
  op: Op;
}

type Listener = () => void;

/** A queued piece of the solid's animation: a turn to make, or a flash to show. */
type Step =
  | {
    kind: "turn";
    to: Quat;
    /** The corner being turned about, drawn as an axis while it runs. */
    axis: number | null;
    duration: number;
    delay: number;
  }
  | { kind: "flash" };

/** How long one turn takes when nothing is queued behind it. */
const TURN_MS = 200;

/** A turn during the after-the-fact replay, where the whole trace has to play out. */
const REPLAY_TURN_MS = 110;

/** The pause before the solid gives up and rights itself after a trace that did not clear. */
const RIGHTING_DELAY_MS = 200;
const RIGHTING_MS = 260;

/** How long a cleared cell takes to shrink away, before the board closes over it. */
const POP_MS = 220;

/** How long the board shakes its head after a miss. */
const SHAKE_MS = 300;

/** A seeded generator, so a date can be a board. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, to turn a seed string into the number the generator wants. */
function hash(text: string): number {
  let h = 2166136261;
  for (const character of text) {
    h ^= character.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Today, as the string that names today's board. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export class TetraDo {
  #cells: Cell[] = [];
  #nextId = 0;
  #path: number[] = [];
  #popping = new Set<number>();

  #score = 0;
  #longest = 0;
  #clears = 0;
  #misses = 0;
  #timeLeft = ROUND_MS;
  #phase: Phase = "ready";
  #message: Message = { text: "", tone: "" };
  #shaking = false;
  #daily = true;
  #seedLabel = "";

  /** Whether the solid turns under your finger, or waits and checks your answer afterwards. */
  #live = true;

  #random: () => number = mulberry32(1);

  // The solid: where it is drawn, where it is headed, and what is queued between the two.
  #shown: Quat = IDENTITY;
  #target: Quat = IDENTITY;
  #queue: Step[] = [];
  #current: (Step & { kind: "turn" }) & { from: Quat; t: number } | null = null;
  #axis: number | null = null;
  #flash = 0;
  #glow = 0;

  #listeners = new Set<Listener>();
  #frameListeners = new Set<Listener>();
  #frame: number | null = null;
  #last = 0;

  constructor() {
    // Something to look at behind the "how to play" card. It is never played, so any seed will do.
    this.#fill();
  }

  // --- what the islands read -------------------------------------------------

  get cells(): readonly Cell[] {
    return this.#cells;
  }
  /** The cells being traced, in the order they were touched. */
  get path(): readonly number[] {
    return this.#path;
  }
  /** The moves the trace spells, in the order they apply. */
  get word(): readonly Op[] {
    return this.#path.map((index) => this.#cells[index].op);
  }
  get score(): number {
    return this.#score;
  }
  get longest(): number {
    return this.#longest;
  }
  get clears(): number {
    return this.#clears;
  }
  get misses(): number {
    return this.#misses;
  }
  get timeLeft(): number {
    return Math.max(0, this.#timeLeft);
  }
  get phase(): Phase {
    return this.#phase;
  }
  get message(): Message {
    return this.#message;
  }
  /** True for the moment after a miss, which is the board shaking its head. */
  get shaking(): boolean {
    return this.#shaking;
  }
  get live(): boolean {
    return this.#live;
  }
  get seedLabel(): string {
    return this.#seedLabel;
  }
  /**
   * The cells on their way out, by id.
   *
   * They are still on the board while they shrink: taking them out first would leave the grid
   * twenty-two cells long for a fifth of a second, and every cell below the gap would slide
   * sideways into it and back out again.
   */
  get popping(): ReadonlySet<number> {
    return this.#popping;
  }
  /** Where the solid is drawn right now — part-way through a turn, most of the time. */
  get orientation(): Quat {
    return this.#shown;
  }
  /** The corner currently being turned about, for the axis line. */
  get axis(): number | null {
    return this.#axis;
  }
  /** `1` just after a clear, fading to `0`: the ring around the floor. */
  get flash(): number {
    return this.#flash;
  }
  /** `1` when a turn lands home, fading to `0`: the `e` lighting up. */
  get glow(): number {
    return this.#glow;
  }

  // --- starting and stopping -------------------------------------------------

  /** Starts the board everyone gets today. */
  startDaily(): void {
    const date = today();
    this.#start(`daily-${date}`, `${date} の盤面`, true);
  }

  /** Starts a board nobody has seen. */
  startRandom(): void {
    const seed = Math.random().toString(36).slice(2, 8);
    this.#start(`random-${seed}`, `ランダム ${seed}`, false);
  }

  /** Plays again, in the same spirit as the round that just ended. */
  replay(): void {
    if (this.#daily) this.startDaily();
    else this.startRandom();
  }

  /** Turns the solid under the finger, or saves it for the answer. */
  setLive(live: boolean): void {
    this.#live = live;
    this.#emit();
  }

  #start(seed: string, label: string, daily: boolean): void {
    this.#random = mulberry32(hash(seed));
    this.#seedLabel = label;
    this.#daily = daily;
    this.#cells = [];
    this.#fill();
    this.#path = [];
    this.#score = 0;
    this.#longest = 0;
    this.#clears = 0;
    this.#misses = 0;
    this.#timeLeft = ROUND_MS;
    this.#phase = "playing";
    this.#message = { text: "元の向きに戻る経路をなぞる", tone: "" };
    this.#resetSolid();
    this.#emit();
  }

  #fill(): void {
    while (this.#cells.length < WIDTH * HEIGHT) this.#cells.push(this.#deal());
  }

  #deal(): Cell {
    return { id: this.#nextId++, op: Math.floor(this.#random() * 6) as Op };
  }

  // --- tracing ---------------------------------------------------------------

  /** Starts a trace at a cell. */
  beginTrace(index: number): void {
    if (this.#phase !== "playing" || this.#leaving(index)) return;
    this.#path = [index];
    if (this.#live) {
      this.#resetSolid();
      this.#turn(this.#cells[index].op, TURN_MS);
    }
    this.#emit();
  }

  /**
   * Carries the trace into a cell, or back out of the last one.
   *
   * Stepping back onto the cell before last is an undo — the finger retracing its own path — and
   * it takes the solid back with it, which is what makes a long trace something you can feel your
   * way through rather than having to plan.
   */
  extendTrace(index: number): void {
    if (this.#phase !== "playing" || this.#path.length === 0) return;
    const last = this.#path[this.#path.length - 1];
    if (index === last) return;

    if (this.#path.length >= 2 && index === this.#path[this.#path.length - 2]) {
      this.#path.pop();
      if (this.#live) this.#turn(opInverse(this.#cells[last].op), TURN_MS);
      this.#emit();
      return;
    }

    if (
      this.#path.includes(index) || !adjacent(index, last) ||
      this.#leaving(index)
    ) return;
    this.#path.push(index);
    if (this.#live) this.#turn(this.#cells[index].op, TURN_MS);
    this.#emit();
  }

  /** Lifts the finger, and judges what was traced. */
  endTrace(): void {
    if (this.#phase !== "playing") return;
    const word = this.word;
    if (word.length === 0) return;

    // With the solid held back, the whole trace plays out now as the answer to it.
    if (!this.#live) {
      this.#resetSolid();
      for (const op of word) this.#turn(op, REPLAY_TURN_MS);
    }

    if (word.length < 2) {
      this.#path = [];
      this.#rightSolid();
      this.#emit();
      return;
    }

    const reduced = reducedLength(word);
    if (isIdentity(compose(word))) {
      if (reduced >= MIN_REDUCED_LENGTH) this.#clear(reduced);
      else {
        this.#message = { text: "打ち消し合うだけの経路は消えない", tone: "" };
        this.#path = [];
        this.#rightSolid();
        this.#emit();
      }
      return;
    }

    this.#miss(word);
  }

  /** Whether a cell is mid-clear, and so not part of the board any more. */
  #leaving(index: number): boolean {
    return this.#popping.has(this.#cells[index].id);
  }

  #clear(reduced: number): void {
    const gain = reduced * reduced;
    this.#score += gain;
    this.#clears += 1;
    this.#longest = Math.max(this.#longest, reduced);
    this.#message = {
      text: `+${gain}　長さ ${reduced} で元の向き`,
      tone: "good",
    };
    this.#queue.push({ kind: "flash" });

    const removed = new Set(this.#path);
    this.#popping = new Set([...removed].map((index) => this.#cells[index].id));
    this.#path = [];
    this.#emit();

    setTimeout(() => {
      this.#collapse(removed);
      this.#popping = new Set();
      this.#emit();
    }, POP_MS);
  }

  /**
   * Takes the cleared cells out, and lets the ones above them fall.
   *
   * Column by column from the bottom, keeping what survived in order and dealing the rest. The
   * cells that fall keep their ids, so what the renderer sees is the same cells in new rows.
   */
  #collapse(removed: ReadonlySet<number>): void {
    for (let x = 0; x < WIDTH; x++) {
      const survivors: Cell[] = [];
      for (let y = HEIGHT - 1; y >= 0; y--) {
        const index = y * WIDTH + x;
        if (!removed.has(index)) survivors.push(this.#cells[index]);
      }
      for (let y = HEIGHT - 1, k = 0; y >= 0; y--, k++) {
        this.#cells[y * WIDTH + x] = survivors[k] ?? this.#deal();
      }
    }
  }

  #miss(word: readonly Op[]): void {
    this.#misses += 1;
    this.#timeLeft -= MISS_PENALTY_MS;

    // The signed letter count, mod 3, survives every rearrangement of a word — so when it is not
    // zero the trace could not have come home however it was traced, and saying so is a better
    // hint than "wrong".
    let twist = 0;
    for (const op of word) twist += opDirection(op);
    this.#message = {
      text: twist % 3 !== 0
        ? "時計回りと反時計回りの数の差が3の倍数でない　−5秒"
        : "元の向きに戻っていない　−5秒",
      tone: "bad",
    };

    this.#path = [];
    this.#rightSolid();
    this.#shake();
    this.#emit();
  }

  /**
   * Shakes the board, and stops.
   *
   * A flag rather than a class the island toggles by hand: the animation runs while it is set, and
   * turning it off again is what lets the next miss run it again.
   */
  #shake(): void {
    this.#shaking = true;
    setTimeout(() => {
      this.#shaking = false;
      this.#emit();
    }, SHAKE_MS);
  }

  // --- the solid -------------------------------------------------------------

  #resetSolid(): void {
    this.#queue = [];
    this.#current = null;
    this.#shown = IDENTITY;
    this.#target = IDENTITY;
    this.#axis = null;
  }

  #turn(op: Op, duration: number): void {
    this.#target = multiply(OP_ROTATIONS[op], this.#target);
    this.#queue.push({
      kind: "turn",
      to: this.#target,
      axis: opBase(op),
      duration,
      delay: 0,
    });
  }

  /** Puts the solid back on its feet after a trace that went nowhere. */
  #rightSolid(): void {
    this.#target = IDENTITY;
    this.#queue.push({
      kind: "turn",
      to: IDENTITY,
      axis: null,
      duration: RIGHTING_MS,
      delay: RIGHTING_DELAY_MS,
    });
  }

  // --- the clock -------------------------------------------------------------

  /**
   * Subscribes to the moves: a cell touched, a trace judged, a round started or over.
   *
   * @param listener Called after every change to the board or the score
   * @returns A function that unsubscribes
   */
  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Subscribes to the animation, and starts the clock while anyone is.
   *
   * The round's time runs on this loop too: with nobody watching there is no round to run, which
   * is why stopping it with the last listener is right rather than merely tidy.
   *
   * @param listener Called once per frame, after the solid and the clock have moved
   * @returns A function that unsubscribes, stopping the clock if it was the last one
   */
  onFrame(listener: Listener): () => void {
    this.#frameListeners.add(listener);
    if (this.#frame === null) {
      this.#last = performance.now();
      this.#frame = requestAnimationFrame(this.#tick);
    }
    return () => {
      this.#frameListeners.delete(listener);
      if (this.#frameListeners.size === 0 && this.#frame !== null) {
        cancelAnimationFrame(this.#frame);
        this.#frame = null;
      }
    };
  }

  #tick = (now: number): void => {
    // Clamped, so a backgrounded tab does not come back and eat the round in one frame.
    const dt = Math.min(64, now - this.#last);
    this.#last = now;

    if (this.#phase === "playing") {
      this.#timeLeft -= dt;
      if (this.#timeLeft <= 0) {
        this.#timeLeft = 0;
        this.#phase = "over";
        this.#path = [];
        this.#emit();
      }
    }

    this.#advance(dt);
    for (const listener of this.#frameListeners) listener();
    this.#frame = requestAnimationFrame(this.#tick);
  };

  /** Moves the solid one frame along whatever it is doing. */
  #advance(dt: number): void {
    if (this.#current === null) {
      const next = this.#queue.shift();
      if (next?.kind === "flash") this.#flash = 1;
      else if (next !== undefined) {
        this.#current = { ...next, from: this.#shown, t: 0 };
      }
    }

    const current = this.#current;
    if (current !== null) {
      if (current.delay > 0) current.delay -= dt;
      else {
        // Turns hurry when they are stacked up, so a fast trace stays under the finger instead of
        // falling a second behind it.
        const duration = Math.max(
          60,
          current.duration - this.#queue.length * 30,
        );
        current.t += dt / duration;
        const t = Math.min(1, current.t);
        this.#shown = slerp(current.from, current.to, ease(t));
        this.#axis = current.axis;
        if (current.t >= 1) {
          this.#shown = current.to;
          // Landing home is worth pointing out — but only when it was a move that put it there,
          // not when the solid merely righted itself after a miss.
          if (current.axis !== null && isIdentity(current.to)) this.#glow = 1;
          this.#current = null;
          this.#axis = null;
        }
      }
    }

    if (this.#flash > 0) this.#flash = Math.max(0, this.#flash - dt / 500);
    if (this.#glow > 0) this.#glow = Math.max(0, this.#glow - dt / 800);
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

/** Whether two cells share an edge. Traces go along edges, never through a corner. */
export function adjacent(a: number, b: number): boolean {
  const dx = Math.abs((a % WIDTH) - (b % WIDTH));
  const dy = Math.abs(Math.floor(a / WIDTH) - Math.floor(b / WIDTH));
  return dx + dy === 1;
}

/** Slow in, slow out. A turn that starts and stops abruptly reads as a jump. */
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * The game, as the page's one instance.
 *
 * A module-level singleton for the same reason the three islands can be three islands: they are
 * separate browser entry points compiled as one graph, so this module is emitted once and all
 * three hold the same object. Compile them apart and each would get a board of its own.
 */
export const game: TetraDo = new TetraDo();
