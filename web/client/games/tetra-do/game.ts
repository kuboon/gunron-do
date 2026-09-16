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
  opInverse,
  type Quat,
  reducedLength,
  slerp,
} from "./rotation.ts";
import { sound } from "./sound.ts";

/** The board is square, and small enough that every cell is in reach of a thumb. */
export const WIDTH = 5;
export const HEIGHT = 5;

/** One round. Long enough to find a few long traces, short enough to want the next round. */
export const ROUND_MS = 90_000;

/** Where the time bar starts reading as nearly over. */
export const LOW_TIME_MS = 15_000;

/** Where it starts counting out loud, and the screen starts pressing. */
export const URGENT_MS = 10_000;

/** Where the round is in its life, which is also which overlay is up. */
export type Phase = "ready" | "playing" | "over";

/**
 * A number that just moved, for the HUD to make a fuss about.
 *
 * The board used to say what happened in a line of prose under it. It says it with the numbers
 * now: the score and the longest trace jump when they change, and the clock does when a miss takes
 * five seconds off it. One of these is what makes that happen — the text to float, and when, so
 * the HUD can work out how far along the animation is on the frame it is drawing.
 */
/** One cleared cell, as the sparks coming off it need it. */
export interface BurstCell {
  /** Where it was on the board. */
  index: number;
  /** What it held, which is what colour its sparks are. */
  op: Op;
}

/**
 * The sparks a clear throws, one handful per cell that went.
 *
 * The cells are copied rather than looked up later, because by the time the sparks are half way
 * out the board has closed over the holes and those positions hold different cells.
 */
export interface Burst {
  /** New with every clear, so the board can tell one burst's sparks from the next's. */
  id: number;
  cells: readonly BurstCell[];
  /** How big a deal it was. How many sparks that is worth is the board's to decide. */
  strength: "medium" | "large";
}

/**
 * How hard something knocked the board.
 *
 * A name rather than a number of pixels: how important the event was is the game's to say, and
 * how far that moves the board is the board's.
 */
export type Knock = "cancel" | "medium" | "large";

/** A knock to the board, and which one it is. */
export interface Shake {
  id: number;
  strength: Knock;
}

export interface Pop {
  /** New with every pop, so the HUD can tell a second one from the first. */
  id: number;
  /** What it says: `+25`, `7`, `−5秒`. */
  text: string;
  /** When it happened, on the clock the frame loop runs on. */
  at: number;
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
const POP_MS = 260;

/** How long the sparks off a cleared cell live. Their own animation is a shade shorter. */
const BURST_MS = 780;

/** How long the board shakes. Long enough to feel, short enough not to be in the way. */
const SHAKE_MS = 340;

/**
 * The hold on a clear, in milliseconds: the whole game stops for a moment.
 *
 * A freeze frame is the cheapest way to make a hit land — the eye reads the pause as weight. It
 * stops the clock as well as the animation, which is a few hundredths of a second in the
 * player's favour and worth it.
 */
const HIT_STOP_MS = { medium: 60, large: 110 } as const;

/** A trace long enough to be worth the full treatment. */
const LARGE_CLEAR = 5;

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
  #scorePop: Pop | null = null;
  #longestPop: Pop | null = null;
  #popId = 0;
  #burst: Burst | null = null;
  #shake: Shake | null = null;
  #effectId = 0;
  #hitStop = 0;
  #spokenSecond = 0;
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
  /** The score's last jump, or `null` if nothing has scored yet this round. */
  get scorePop(): Pop | null {
    return this.#scorePop;
  }
  /** The last time the longest trace was beaten. */
  get longestPop(): Pop | null {
    return this.#longestPop;
  }
  /** The sparks thrown by the cells that just cleared, or `null` between clears. */
  get burst(): Burst | null {
    return this.#burst;
  }
  /** The board's current knock, or `null` when it is still. */
  get shake(): Shake | null {
    return this.#shake;
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
    this.#scorePop = null;
    this.#longestPop = null;
    this.#burst = null;
    this.#shake = null;
    this.#hitStop = 0;
    this.#spokenSecond = 0;
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
    sound.step(0);
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
      sound.back(this.#path.length);
      if (this.#live) this.#turn(opInverse(this.#cells[last].op), TURN_MS);
      this.#emit();
      return;
    }

    if (
      this.#path.includes(index) || !adjacent(index, last) ||
      this.#leaving(index)
    ) return;
    this.#path.push(index);
    sound.step(this.#path.length - 1);
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
    if (isIdentity(compose(word)) && reduced >= MIN_REDUCED_LENGTH) {
      this.#clear(reduced);
      return;
    }

    // Everything else is the same thing to a player: the trace did not clear, so it is undone.
    // It costs nothing but the time it took — a trace that only cancels itself, and one that
    // simply does not come home, are both just traces that are not there any more.
    this.#cancel();
  }

  /** Whether a cell is mid-clear, and so not part of the board any more. */
  #leaving(index: number): boolean {
    return this.#popping.has(this.#cells[index].id);
  }

  /**
   * A trace that came home, and everything that goes off at once because it did.
   *
   * Seven things, inside a tenth of a second: the score jumps, the cells shrink, sparks come off
   * them, the board takes a knock, the floor flashes under the solid, the game holds still for a
   * moment, and the arpeggio runs. None of them is much on its own; together they are the reason
   * to look for a long trace rather than three short ones — which is also why every one of them
   * is bigger for a long trace than a short one.
   *
   * @param reduced The trace's length once the cancellations are out: what it scored on
   */
  #clear(reduced: number): void {
    const gain = reduced * reduced;
    const record = reduced > this.#longest;
    const tier = reduced >= LARGE_CLEAR ? "large" : "medium";

    this.#score += gain;
    this.#clears += 1;
    this.#longest = Math.max(this.#longest, reduced);
    this.#scorePop = this.#pop(`+${gain}`);
    // An arrow rather than the bare number: beside a number that already says `6`, a floating `6`
    // reads as a second score rather than as the one that just moved.
    if (record) this.#longestPop = this.#pop(`↑${reduced}`);
    this.#queue.push({ kind: "flash" });

    const removed = new Set(this.#path);
    this.#popping = new Set([...removed].map((index) => this.#cells[index].id));
    this.#burst = {
      id: ++this.#effectId,
      cells: [...removed].map((index) => ({
        index,
        op: this.#cells[index].op,
      })),
      strength: tier,
    };
    this.#knock(tier);
    this.#hitStop = HIT_STOP_MS[tier];
    sound.clear(reduced);

    this.#path = [];
    this.#emit();

    setTimeout(() => {
      this.#collapse(removed);
      this.#popping = new Set();
      this.#emit();
    }, POP_MS);

    const burstId = this.#burst.id;
    setTimeout(() => {
      // Only if nothing has cleared since: a burst that was replaced is not this one's to clear.
      if (this.#burst?.id !== burstId) return;
      this.#burst = null;
      this.#emit();
    }, BURST_MS);
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

  /**
   * A trace that did not clear, undone.
   *
   * It costs nothing but the seconds it took to draw. A time penalty on top would punish the
   * thing the game wants a player to do — try a long trace and find out — so what is left is
   * the smallest knock the board can give and a sound that is over before it is noticed.
   */
  #cancel(): void {
    this.#misses += 1;
    this.#path = [];
    this.#rightSolid();
    this.#knock("cancel");
    sound.cancel();
    this.#emit();
  }

  /**
   * Knocks the board, and lets it settle.
   *
   * The strength goes to the renderer and the decay is in the animation, so a knock always ends
   * — this flag is only how the next one gets to start again.
   *
   * @param strength How hard, as a name the board turns into pixels
   */
  #knock(strength: Knock): void {
    const id = ++this.#effectId;
    this.#shake = { id, strength };
    setTimeout(() => {
      if (this.#shake?.id === id) {
        this.#shake = null;
        this.#emit();
      }
    }, SHAKE_MS);
  }

  /** A number's next jump, stamped so the HUD can age it. */
  #pop(text: string): Pop {
    return { id: ++this.#popId, text, at: performance.now() };
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

    // The hold after a clear. Everything stops — the clock, the solid, the sparks' own clock is
    // the browser's — and the frame still goes out, so the freeze is a frame the player sees
    // rather than a stall they feel.
    if (this.#hitStop > 0) {
      this.#hitStop -= dt;
    } else if (this.#phase === "playing") {
      this.#timeLeft -= dt;
      this.#countdown();
      if (this.#timeLeft <= 0) {
        this.#timeLeft = 0;
        this.#phase = "over";
        this.#path = [];
        sound.over();
        this.#emit();
      }
      this.#advance(dt);
    } else {
      this.#advance(dt);
    }

    for (const listener of this.#frameListeners) listener();
    this.#frame = requestAnimationFrame(this.#tick);
  };

  /** Once a second, out loud, for the last ten of them. */
  #countdown(): void {
    if (this.#timeLeft > URGENT_MS) return;
    const seconds = Math.ceil(this.#timeLeft / 1000);
    if (seconds === this.#spokenSecond || seconds <= 0) return;
    this.#spokenSecond = seconds;
    sound.tick(seconds);
  }

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
