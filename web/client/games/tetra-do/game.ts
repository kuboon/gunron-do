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
  chain,
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
import { type Move, TICK_MS } from "./record.ts";
import { sound } from "./sound.ts";

/**
 * The noises the rules make, as the game asks for them.
 *
 * An interface rather than the module directly, because the rules also run with the screen and
 * the speakers switched off: {@link outcome} plays a recording through as fast as it can to find
 * out what it comes to, and a hundred rounds of arpeggios in half a second is not the answer.
 */
export interface Noises {
  step(depth: number): void;
  back(depth: number): void;
  clear(length: number): void;
  cancel(): void;
  tick(seconds: number): void;
  over(): void;
}

/** The noises, with nobody listening. */
const SILENCE: Noises = {
  step() {},
  back() {},
  clear() {},
  cancel() {},
  tick() {},
  over() {},
};

/** The board is square, and small enough that every cell is in reach of a thumb. */
export const WIDTH = 5;
export const HEIGHT = 5;

/** One round. Long enough to find a few long traces, short enough to want the next round. */
export const ROUND_MS = 60_000;

/** Three, two, one: the pause between pressing start and the clock starting. */
export const LEAD_IN_MS = 3_000;

/** Where the time bar starts reading as nearly over. */
export const LOW_TIME_MS = 15_000;

/** Where it starts counting out loud, and the screen starts pressing. */
export const URGENT_MS = 10_000;

/**
 * Where the round is in its life, which is also which overlay is up.
 *
 * `counting` is the three seconds before the clock starts: the board is on screen and readable,
 * and nothing it does counts yet. `teaching` is the walkthrough: the board is real and answers to
 * a finger exactly as it will in a round, but the clock is not running and nothing is at stake.
 */
export type Phase = "ready" | "teaching" | "counting" | "playing" | "over";

/**
 * A number that just moved, for the HUD to make a fuss about.
 *
 * The board used to say what happened in a line of prose under it. It says it with the numbers
 * now: the score and the longest trace jump when they change. One of these is what makes that
 * happen — the text to float, and when, so the HUD can work out how far along the animation is on
 * the frame it is drawing.
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
  /** What it says: `+25`, or `↑7`. */
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

/**
 * How long one turn takes when nothing is queued behind it.
 *
 * Slow enough to read. The solid always turns under the finger now, so this is the price of
 * watching it: a player who follows every turn pays for the look in the only currency the round
 * has, which is the clock.
 */
const TURN_MS = 300;

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

/** Two taps on one cell within this long are one gesture: erase it. */
const DOUBLE_TAP_MS = 320;

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

export class TetraDo {
  #cells: Cell[] = [];
  #nextId = 0;
  #path: number[] = [];
  #popping = new Set<number>();

  /** How many cells have been taken off the board by a trace that counted. */
  #cleared = 0;
  /** The longest counted trace, in cells. */
  #longest = 0;
  /** How many traces came home. */
  #solved = 0;
  #timeLeft = ROUND_MS;
  /** What is left of the lead-in, while one is running. */
  #leadIn = 0;
  #phase: Phase = "ready";
  #clearedPop: Pop | null = null;
  #longestPop: Pop | null = null;
  /** The last single-cell tap, for spotting the second one. */
  #lastTap: { index: number; at: number } | null = null;
  /** Whether the gesture in progress has ever been more than one cell, and so is not a tap. */
  #dragged = false;
  /** Cells the walkthrough is pointing at, for the board to ring. */
  #hint: readonly number[] = [];
  #popId = 0;
  #burst: Burst | null = null;
  #shake: Shake | null = null;
  #effectId = 0;
  #hitStop = 0;
  #spokenSecond = 0;
  /** The last lead-in second counted out loud, so each is counted once. */
  #spokenLead = 0;
  /** The board's day, as it is written in the URL. */
  #date = "";
  /** What the player did this round, for the link at the end of it. */
  #moves: Move[] = [];
  /** What a recorded round has left to do, while one is being played back. */
  #pending: Move[] = [];
  #replaying = false;
  /** Whether a replay is being held where it is. Only a replay can be. */
  #paused = false;

  #random: () => number = mulberry32(1);

  // The solid: where it is drawn, where it is headed, and what is queued between the two.
  #shown: Quat = IDENTITY;
  #target: Quat = IDENTITY;
  #queue: Step[] = [];
  #current: (Step & { kind: "turn" }) & { from: Quat; t: number } | null = null;
  #axis: number | null = null;
  #flash = 0;
  #glow = 0;

  /**
   * The game's own clock, in milliseconds since the round began.
   *
   * Not the wall's: it stops when the game stops — through a hit-stop, through a pause — and the
   * things that happen a fixed time after an event hang off it rather than off `setTimeout`. That
   * is what makes a pause during a clear hold the board where it is, and what lets a recording be
   * played through at any speed at all and come to the same thing.
   */
  #clock = 0;
  /** What the clock owes, and when. */
  #due: { at: number; run: () => void }[] = [];

  #listeners = new Set<Listener>();
  #frameListeners = new Set<Listener>();
  #frame: number | null = null;
  #last = 0;

  /** Where this game's noises go. */
  readonly #noises: Noises;

  /**
   * @param noises Where to send the sounds. Left out, they go to the speakers.
   */
  constructor(noises: Noises = sound) {
    this.#noises = noises;
    // Something to look at behind the "how to play" card. It is never played, so any seed will do.
    this.#fill();
  }

  /**
   * Moves the game on by `dt` milliseconds, which is the whole of what time does to it.
   *
   * Split out from the frame loop so that something other than a frame loop can drive it — a
   * recording run through at speed, with nobody watching.
   *
   * @param dt Milliseconds since the last step
   */
  #step(dt: number): void {
    // The hold after a clear. Everything stops — the clock, the solid, the sparks' own clock is
    // the browser's — and the frame still goes out, so the freeze is a frame the player sees
    // rather than a stall they feel.
    if (this.#paused) {
      // A held recording still animates — the solid keeps its momentum and the sparks finish —
      // but the clock does not move, so nothing new is delivered and nothing runs out.
      this.#advance(dt);
    } else if (this.#hitStop > 0) {
      this.#hitStop -= dt;
    } else if (this.#phase === "counting") {
      // The board is up and readable, and nothing on it counts yet. The clock has not started,
      // so a recording's first move cannot land early either.
      this.#settle(dt);
      this.#leadIn -= dt;
      this.#countIn();
      if (this.#leadIn <= 0) {
        this.#leadIn = 0;
        this.#phase = "playing";
        this.#emit();
      }
      this.#advance(dt);
    } else if (this.#phase === "teaching") {
      // Everything the board does, none of what the clock does. A lesson cannot run out.
      this.#settle(dt);
      this.#advance(dt);
    } else if (this.#phase === "playing") {
      this.#settle(dt);
      this.#timeLeft -= dt;
      this.#countdown();
      if (this.#replaying) this.#playback();
      if (this.#timeLeft <= 0) {
        this.#timeLeft = 0;
        this.#phase = "over";
        this.#path = [];
        this.#noises.over();
        this.#emit();
      }
      this.#advance(dt);
    } else {
      this.#settle(dt);
      this.#advance(dt);
    }
  }

  /**
   * Runs this round to its end as fast as the arithmetic allows, drawing nothing.
   *
   * The step is the recording's own resolution, so no two moves can land in the same step that
   * were written down as different times. Used by {@link outcome}; a game being played has a
   * frame loop for this.
   */
  runToEnd(): void {
    // Enough steps for the lead-in and the round, and then some: the loop ends on the phase, and
    // the count is only here so that a bug cannot hang the page.
    const limit = (LEAD_IN_MS + ROUND_MS) / TICK_MS + 1000;
    for (let i = 0; i < limit && this.#phase !== "over"; i++) {
      this.#step(TICK_MS);
    }
  }

  /** Runs the jobs the clock owes, having moved it on. */
  #settle(dt: number): void {
    this.#clock += dt;
    for (;;) {
      const i = this.#due.findIndex((job) => job.at <= this.#clock);
      if (i < 0) return;
      const [job] = this.#due.splice(i, 1);
      job.run();
    }
  }

  /**
   * Puts a job on the game's clock.
   *
   * @param ms How far ahead, in game time
   * @param run What to do then
   */
  #later(ms: number, run: () => void): void {
    this.#due.push({ at: this.#clock + ms, run });
  }

  // --- what the islands read -------------------------------------------------

  get cells(): readonly Cell[] {
    return this.#cells;
  }
  /**
   * Whether the trace in progress has already gone too far to count.
   *
   * Read by the board, which draws a spoiled trace the way it draws a cancelled pair: dim and
   * dashed, meaning *this is worth nothing*. Said while the finger is still down, because a rule
   * a player only meets when they lift is a rule they cannot play around.
   */
  get broken(): boolean {
    return this.#path.length > 0 && chain(this.word).broken;
  }

  /** How many cells the trace has gone since the solid was last home. */
  get since(): number {
    return this.#path.length === 0 ? 0 : chain(this.word).since;
  }

  /** The cells being traced, in the order they were touched. */
  get path(): readonly number[] {
    return this.#path;
  }
  /** The moves the trace spells, in the order they apply. */
  get word(): readonly Op[] {
    return this.#path.map((index) => this.#cells[index].op);
  }
  /** Cells taken off the board by traces that counted. */
  get cleared(): number {
    return this.#cleared;
  }
  /** The longest counted trace, in cells. */
  get longest(): number {
    return this.#longest;
  }
  /** How many traces came home. */
  get solved(): number {
    return this.#solved;
  }
  get timeLeft(): number {
    return Math.max(0, this.#timeLeft);
  }
  get phase(): Phase {
    return this.#phase;
  }
  /** The score's last jump, or `null` if nothing has scored yet this round. */
  get clearedPop(): Pop | null {
    return this.#clearedPop;
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
  /** Milliseconds left of the lead-in: `3000` down to `0`, and `0` once the round is running. */
  get leadIn(): number {
    return this.#leadIn;
  }
  /** The board's day. Also the seed, and half of what a round's link is made of. */
  get date(): string {
    return this.#date;
  }
  /** Whether what is on screen is a recording rather than a game. */
  get replaying(): boolean {
    return this.#replaying;
  }
  /** Whether the recording is being held where it is. */
  get paused(): boolean {
    return this.#paused;
  }
  /** The cells the walkthrough is asking for, which the board rings. Empty the rest of the time. */
  get hint(): readonly number[] {
    return this.#hint;
  }
  /** Everything the player did this round, in order. */
  get moves(): readonly Move[] {
    return this.#moves;
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
  /** `1` just after a clear, fading to `0`: the rim lighting up around the `e` face. */
  get flash(): number {
    return this.#flash;
  }
  /** `1` when a turn lands home, fading to `0`: the `e` lighting up. */
  get glow(): number {
    return this.#glow;
  }

  // --- starting and stopping -------------------------------------------------

  /**
   * Starts the board a day names.
   *
   * The date is the seed, so the same day is the same board for everyone — and, with the moves,
   * half of what a round's link is made of. Nothing here knows where the date came from; the URL
   * is read in `session.ts`, and this takes what it found.
   *
   * @param date The board's day, as `YYYY-MM-DD`
   */
  start(date: string): void {
    this.#begin(date);
    this.#emit();
  }

  /**
   * Plays a recorded round back on its own board.
   *
   * The moves are delivered by the clock in {@link onFrame} rather than by a timer of their own,
   * so they land where they landed: the recording's times are on the game's clock, and so is the
   * playback. A frame that arrives late moves them all together or not at all.
   *
   * @param date The board the round was played on
   * @param moves What the player did, in order
   */
  startReplay(date: string, moves: readonly Move[]): void {
    this.#begin(date);
    this.#replaying = true;
    this.#pending = [...moves];
    this.#emit();
  }

  /**
   * Hands over the board to be practised on: real cells, real rules, no clock.
   *
   * The same board the player is about to be given, because the lesson is the game rather than a
   * picture of it. Whatever they do to it here is undone when the round starts, which deals itself
   * from the day all over again.
   */
  teach(): void {
    this.#phase = "teaching";
    this.#emit();
  }

  /**
   * Points the board at some cells, or at none.
   *
   * @param cells Which cells to ring
   */
  setHint(cells: readonly number[]): void {
    this.#hint = cells;
    this.#emit();
  }

  /** The same board again, from the top. */
  restart(): void {
    this.start(this.#date);
  }

  /**
   * Lays out the board a day names, without starting the clock.
   *
   * What the "how to play" card sits on top of, so the board behind it is the one the player is
   * about to be given rather than a placeholder that changes the moment they press the button.
   *
   * @param date The board's day
   */
  preview(date: string): void {
    this.#begin(date);
    this.#phase = "ready";
    this.#emit();
  }

  /**
   * Holds a recording where it is, or lets it go on.
   *
   * Only a recording pauses. A round being played has a clock the player is racing, and stopping
   * that clock is not a feature — it is the way out of the game.
   *
   * @param paused Whether to hold it
   */
  setPaused(paused: boolean): void {
    if (!this.#replaying) return;
    this.#paused = paused;
    this.#emit();
  }

  #begin(date: string): void {
    this.#random = mulberry32(hash(`daily-${date}`));
    this.#date = date;
    this.#moves = [];
    this.#pending = [];
    this.#replaying = false;
    this.#paused = false;
    this.#cells = [];
    this.#fill();
    this.#path = [];
    this.#cleared = 0;
    this.#longest = 0;
    this.#solved = 0;
    this.#lastTap = null;
    this.#dragged = false;
    this.#hint = [];
    this.#timeLeft = ROUND_MS;
    this.#phase = "playing";
    this.#clearedPop = null;
    this.#longestPop = null;
    this.#burst = null;
    this.#shake = null;
    this.#hitStop = 0;
    this.#spokenSecond = 0;
    this.#clock = 0;
    this.#due = [];
    this.#resetSolid();
    this.#phase = "counting";
    this.#leadIn = LEAD_IN_MS;
    this.#spokenLead = 0;
  }

  // --- the record ------------------------------------------------------------

  /**
   * Writes down what just happened, stamped on the game's own clock.
   *
   * Nothing is written while a recording is playing: the moves are already on the page, and a
   * replay that recorded itself would hand back a copy of its own input.
   */
  #write(kind: Move["kind"], value: number): void {
    if (this.#replaying) return;
    this.#moves.push({ at: ROUND_MS - this.#timeLeft, kind, value });
  }

  /** Delivers everything a recording had due by now. */
  #playback(): void {
    const elapsed = ROUND_MS - this.#timeLeft;
    while (this.#pending.length > 0 && this.#pending[0].at <= elapsed) {
      const move = this.#pending.shift()!;
      switch (move.kind) {
        case "begin":
          this.#beginTrace(move.value);
          break;
        case "extend":
          this.#extendTrace(move.value);
          break;
        case "end":
          this.#endTrace();
          break;
        case "erase":
          this.#erase(move.value);
          break;
        case "live":
          // Retired: the solid always turns under the finger now. Recordings made before that
          // still carry the setting, and they still play — it only ever changed the animation,
          // never what the trace was worth.
          break;
      }
    }
  }

  #fill(): void {
    while (this.#cells.length < WIDTH * HEIGHT) this.#cells.push(this.#deal());
  }

  #deal(): Cell {
    return { id: this.#nextId++, op: Math.floor(this.#random() * 6) as Op };
  }

  // --- tracing ---------------------------------------------------------------

  /** Whether the board is answering to a finger: a round being played, or one being taught on. */
  #live(): boolean {
    return this.#phase === "playing" || this.#phase === "teaching";
  }

  /** Starts a trace at a cell. */
  beginTrace(index: number): void {
    if (this.#replaying) return;
    this.#write("begin", index);
    this.#beginTrace(index);
  }

  #beginTrace(index: number): void {
    if (!this.#live() || this.#leaving(index)) return;
    this.#path = [index];
    this.#dragged = false;
    this.#noises.step(0);
    this.#resetSolid();
    this.#turn(this.#cells[index].op, TURN_MS);
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
    if (this.#replaying) return;
    this.#write("extend", index);
    this.#extendTrace(index);
  }

  #extendTrace(index: number): void {
    if (!this.#live() || this.#path.length === 0) return;
    const last = this.#path[this.#path.length - 1];
    if (index === last) return;

    if (this.#path.length >= 2 && index === this.#path[this.#path.length - 2]) {
      this.#path.pop();
      this.#noises.back(reducedLength(this.word));
      this.#turn(opInverse(this.#cells[last].op), TURN_MS);
      this.#emit();
      return;
    }

    if (
      this.#path.includes(index) || !adjacent(index, last) ||
      this.#leaving(index)
    ) return;
    this.#path.push(index);
    // From here this gesture is a trace, whatever it ends up being: the finger has visibly left
    // the cell it started on. So it is not a tap, and it breaks any tap still waiting for a
    // partner — two taps with a trace between them are two gestures the player watched happen
    // separately, and reading them as one double tap erases a cell nobody asked about.
    this.#dragged = true;
    this.#lastTap = null;
    // The ladder climbs with what the trace is worth, not with how long it is: a move that
    // cancels the one before it adds nothing to the score, so it adds nothing to the pitch —
    // and undoes the last rung, which is the same thing the dashed line says.
    // The ladder climbs with what the trace is worth. A trace that has gone too far to close is
    // worth nothing from here on, so it stops climbing — the same thing the dimmed line says, in
    // the ear rather than the eye.
    this.#noises.step(
      this.broken ? 0 : Math.max(0, reducedLength(this.word) - 1),
    );
    this.#turn(this.#cells[index].op, TURN_MS);
    this.#emit();
  }

  /** Lifts the finger, and judges what was traced. */
  endTrace(): void {
    if (this.#replaying) return;
    this.#write("end", 0);
    this.#endTrace();
  }

  #endTrace(): void {
    if (!this.#live()) return;
    const word = this.word;
    if (word.length === 0) return;

    // One cell is a tap, not a trace. Two of them on the same cell in quick succession are the
    // way to be rid of a cell you cannot use — the one move in the game that asks nothing of the
    // group and gives nothing back.
    if (word.length < 2) {
      const index = this.#path[0];
      this.#path = [];
      this.#rightSolid();
      if (!this.#dragged && this.#doubleTapped(index)) {
        this.#write("erase", index);
        this.#erase(index);
        return;
      }
      this.#emit();
      return;
    }

    const reduced = reducedLength(word);

    // Nothing but cancellations: `a a⁻¹`, or several such pairs in a row. It comes home because
    // it never went anywhere, so it is not an answer and counts as nothing — but it is allowed
    // to take those cells off the board.
    if (reduced === 0) {
      this.#undo();
      return;
    }

    // Home, long enough to be an answer, and closed often enough along the way. The last of the
    // three is what keeps length worth something: see `MAX_OPEN`.
    if (
      isIdentity(compose(word)) && reduced >= MIN_REDUCED_LENGTH &&
      !chain(word).broken
    ) {
      this.#solve(reduced);
      return;
    }

    // Everything else is the same thing to a player: the trace did not clear, so it is undone.
    // It costs nothing but the time it took — a trace that only cancels itself, and one that
    // simply does not come home, are both just traces that are not there any more.
    this.#cancel();
  }

  /**
   * Whether this tap is the second one on the same cell, soon enough to be one gesture.
   *
   * Timed on `#clock` rather than on what is left of the round. Both are the game's own time —
   * which is what makes a recording tap twice exactly where it tapped twice — but the round's
   * clock does not run during a lesson, and a window measured against a clock that is not moving
   * is not a window: there, every second tap on a cell was the second half of a double tap,
   * however long ago and whatever else had happened in between. `#clock` moves in every phase.
   *
   * A replay never asks: the erase is in the recording as itself, and asking again would double
   * it.
   *
   * @param index The cell that was tapped
   */
  #doubleTapped(index: number): boolean {
    if (this.#replaying || this.#leaving(index)) return false;
    const at = this.#clock;
    const last = this.#lastTap;
    this.#lastTap = { index, at };
    if (last === null || last.index !== index) return false;
    if (at - last.at > DOUBLE_TAP_MS) return false;
    // Spent: a third tap starts a new pair rather than erasing again.
    this.#lastTap = null;
    this.#hint = [];
    return true;
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
  /**
   * A trace that came home.
   *
   * What it counts for is its reduced length: the cancelling pairs inside it did nothing, so
   * they add nothing. Padding a trace with `a a⁻¹` walks the same answer the long way round,
   * and the long way round is worth what the short way was.
   *
   * @param reduced The trace's length with the cancellations taken out
   */
  #solve(reduced: number): void {
    const tier = reduced >= LARGE_CLEAR ? "large" : "medium";
    const record = reduced > this.#longest;

    this.#solved += 1;
    this.#cleared += reduced;
    this.#longest = Math.max(this.#longest, reduced);
    this.#clearedPop = this.#pop(`+${reduced}`);
    // An arrow rather than the bare number: beside a number that already says `6`, a floating
    // `6` reads as a second count rather than as the one that just moved.
    if (record) this.#longestPop = this.#pop(`↑${reduced}`);
    this.#queue.push({ kind: "flash" });

    this.#burst = {
      id: ++this.#effectId,
      cells: this.#path.map((index) => ({
        index,
        op: this.#cells[index].op,
      })),
      strength: tier,
    };
    this.#knock(tier);
    this.#hitStop = HIT_STOP_MS[tier];
    this.#noises.clear(reduced);

    this.#take(this.#path);
    this.#path = [];
    this.#emit();

    const burstId = this.#burst.id;
    this.#later(BURST_MS, () => {
      // Only if nothing has cleared since: a burst that was replaced is not this one's to clear.
      if (this.#burst?.id !== burstId) return;
      this.#burst = null;
      this.#emit();
    });
  }

  /**
   * Cells that undo each other, taken off the board without ceremony.
   *
   * It counts for nothing — not the cells, not a trace that came home. The pair was never worth
   * anything; being allowed to clear it is the whole of what it gets.
   */
  #undo(): void {
    this.#noises.clear(2);
    this.#take(this.#path);
    this.#path = [];
    this.#emit();
  }

  /**
   * One cell, gone, because the player asked twice.
   *
   * It counts for nothing at all: not the cells, not the length, not a trace that came home. It
   * is a way of clearing a cell that is in the way, and the cost is the time it takes.
   *
   * @param index The cell to take
   */
  #erase(index: number): void {
    if (!this.#live() || this.#leaving(index)) return;
    this.#noises.back(1);
    this.#take([index]);
    this.#emit();
  }

  /** Takes cells off the board: they pop where they are, then the column falls into the gap. */
  #take(indices: readonly number[]): void {
    const removed = new Set(indices);
    this.#popping = new Set(
      [...removed].map((index) => this.#cells[index].id),
    );
    this.#later(POP_MS, () => {
      this.#collapse(removed);
      this.#popping = new Set();
      this.#emit();
    });
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
    this.#path = [];
    this.#rightSolid();
    this.#knock("cancel");
    this.#noises.cancel();
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
    this.#later(SHAKE_MS, () => {
      if (this.#shake?.id === id) {
        this.#shake = null;
        this.#emit();
      }
    });
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

    this.#step(dt);

    for (const listener of this.#frameListeners) listener();
    this.#frame = requestAnimationFrame(this.#tick);
  };

  /** Three, two, one — each counted once, on the way in. */
  #countIn(): void {
    const seconds = Math.ceil(this.#leadIn / 1000);
    if (seconds === this.#spokenLead || seconds <= 0) return;
    this.#spokenLead = seconds;
    this.#noises.tick(seconds);
  }

  /** Once a second, out loud, for the last ten of them. */
  #countdown(): void {
    if (this.#timeLeft > URGENT_MS) return;
    const seconds = Math.ceil(this.#timeLeft / 1000);
    if (seconds === this.#spokenSecond || seconds <= 0) return;
    this.#spokenSecond = seconds;
    this.#noises.tick(seconds);
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

/** What a round came to: the three numbers, and nothing about how it looked getting there. */
export interface Outcome {
  cleared: number;
  solved: number;
  longest: number;
}

/**
 * What a recording comes to, worked out without drawing it.
 *
 * The rules never needed a screen, and now they do not need the wall's clock either: everything
 * that happens a fixed time after something else hangs off the game's own clock, so the whole
 * round can be stepped through in a few milliseconds. That is what lets a shared link say what
 * the round was worth before anyone presses play.
 *
 * @param date The board the round was played on
 * @param moves What the player did, in order
 * @returns The three numbers the round ends on
 */
export function outcome(date: string, moves: readonly Move[]): Outcome {
  const run = new TetraDo(SILENCE);
  run.startReplay(date, moves);
  run.runToEnd();
  return { cleared: run.cleared, solved: run.solved, longest: run.longest };
}
