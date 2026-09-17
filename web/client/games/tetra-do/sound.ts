/**
 * The game's noises, synthesised rather than downloaded.
 *
 * Every sound here is a few oscillators and an envelope, which is worth a word of explanation:
 * the site is static files on a CDN and the game is four islands and a few kilobytes of board, so
 * a folder of samples would be the largest thing on the page by an order of magnitude. Web Audio
 * can make a blip, an arpeggio and a thud out of arithmetic, and those are the only three shapes
 * this game needs.
 *
 * Two rules the browser imposes shape the API. A context created before a gesture starts
 * suspended, so the context is made on the first sound rather than at import — by which time the
 * player has pressed "start". And a sound that cannot be turned off is a sound that gets the tab
 * muted, so {@link Sound.toggle} is on the screen and remembered.
 *
 * The pitches come off a pentatonic ladder, which is the cheap way to make a run of notes that
 * cannot sound wrong: the player hears a trace get longer as the ladder climbs, and no
 * combination of steps lands on a sour interval.
 */

/** Semitones above the root, in the five-note scale everything here is built from. */
const PENTATONIC = [0, 2, 4, 7, 9];

/** The root, in Hz: A3. Low enough that a long trace can climb two octaves and stay musical. */
const ROOT = 220;

/** Master level. Quiet on purpose — a puzzle game is played next to other things. */
const MASTER = 0.16;

/** Where the preference is kept between visits. */
const STORAGE_KEY = "tetra-do:sound";

/** One note, as the synth takes it. */
interface Note {
  /** Hz. */
  freq: number;
  /** Seconds from now. */
  delay?: number;
  /** Seconds. */
  duration?: number;
  type?: OscillatorType;
  /** Relative to the master level. */
  gain?: number;
  /** Hz to glide to over the note's life, for a rise or a fall. */
  sweepTo?: number;
}

/** The ladder, as a frequency. */
function pitch(step: number): number {
  const octave = Math.floor(step / PENTATONIC.length);
  const degree = PENTATONIC[
    ((step % PENTATONIC.length) + PENTATONIC.length) %
    PENTATONIC.length
  ];
  return ROOT * Math.pow(2, octave + degree / 12);
}

class Sound {
  #context: AudioContext | null = null;
  #enabled = true;
  #loaded = false;

  /** Whether sounds play. Read on every call, so toggling is immediate. */
  get enabled(): boolean {
    this.#load();
    return this.#enabled;
  }

  /** Turns the sound on or off, and remembers which. */
  toggle(): boolean {
    this.#load();
    this.#enabled = !this.#enabled;
    try {
      localStorage.setItem(STORAGE_KEY, this.#enabled ? "on" : "off");
    } catch {
      // A browser with storage blocked still gets the toggle, just not the memory of it.
    }
    if (this.#enabled) this.step(0);
    return this.#enabled;
  }

  #load(): void {
    if (this.#loaded) return;
    this.#loaded = true;
    try {
      this.#enabled = localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      this.#enabled = true;
    }
  }

  /**
   * The audio context, made on first use.
   *
   * Not at import: a context created before the player has touched anything starts suspended, and
   * some browsers never resume one that was never allowed to start.
   */
  #ctx(): AudioContext | null {
    if (!this.enabled) return null;
    if (typeof AudioContext === "undefined") return null;
    this.#context ??= new AudioContext();
    if (this.#context.state === "suspended") void this.#context.resume();
    return this.#context;
  }

  /** Plays a handful of notes. Each is an oscillator and an envelope, and nothing else. */
  #play(notes: readonly Note[]): void {
    const ctx = this.#ctx();
    if (ctx === null) return;

    for (const note of notes) {
      const start = ctx.currentTime + (note.delay ?? 0);
      const duration = note.duration ?? 0.12;
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();

      oscillator.type = note.type ?? "triangle";
      oscillator.frequency.setValueAtTime(note.freq, start);
      if (note.sweepTo !== undefined) {
        oscillator.frequency.exponentialRampToValueAtTime(
          note.sweepTo,
          start + duration,
        );
      }

      // A short attack and an exponential tail: the shape of anything struck or plucked. Ramping
      // to a small positive value rather than zero is what `exponentialRamp` requires.
      const level = MASTER * (note.gain ?? 1);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(level, start + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      oscillator.connect(envelope).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }
  }

  /**
   * A cell joining the trace: one rung up the ladder per cell that counts.
   *
   * @param depth The trace's reduced length, less one — cancelled pairs are not on the ladder
   */
  step(depth: number): void {
    this.#play([{
      freq: pitch(depth),
      duration: 0.07,
      gain: 0.5,
      type: "triangle",
    }]);
  }

  /**
   * A cell leaving the trace again, as the finger backs out of it.
   *
   * @param depth The reduced length that is left, which can be more than before: backing out of
   * a move that was cancelling one restores the rung it was hiding
   */
  back(depth: number): void {
    this.#play([{
      freq: pitch(Math.max(0, depth)) / 2,
      duration: 0.06,
      gain: 0.35,
      type: "sine",
    }]);
  }

  /**
   * A trace that came home: an arpeggio as long as the trace, over a thump.
   *
   * @param length The reduced length — what the trace scored on
   */
  clear(length: number): void {
    const notes: Note[] = [{
      // The weight under it. A sine sweeping down reads as a thud rather than a note.
      freq: 160,
      sweepTo: 60,
      duration: 0.22,
      gain: 1.1,
      type: "sine",
    }];

    const count = Math.min(6, length);
    for (let i = 0; i < count; i++) {
      notes.push({
        freq: pitch(4 + i * 2),
        delay: 0.05 * i,
        duration: 0.26 - 0.02 * i,
        gain: 0.55,
        type: "triangle",
      });
    }
    // The long ones get a bell on top, an octave up, so a six lands differently from a three.
    if (length >= 5) {
      notes.push({
        freq: pitch(4 + count * 2) * 2,
        delay: 0.05 * count,
        duration: 0.5,
        gain: 0.3,
        type: "sine",
      });
    }

    this.#play(notes);
  }

  /** A trace that did not: short, low, and over. Nothing is lost, and it should not sound like it. */
  cancel(): void {
    this.#play([
      { freq: 150, sweepTo: 90, duration: 0.14, gain: 0.6, type: "square" },
    ]);
  }

  /**
   * The clock, once a second, while it is nearly out.
   *
   * @param secondsLeft What the clock reads, which is also how high the tick sits
   */
  tick(secondsLeft: number): void {
    this.#play([{
      freq: 660 + Math.max(0, 10 - secondsLeft) * 40,
      duration: 0.05,
      gain: 0.45,
      type: "square",
    }]);
  }

  /** Time. Three notes down, and the last one hangs. */
  over(): void {
    this.#play([
      { freq: pitch(6), duration: 0.3, gain: 0.7 },
      { freq: pitch(4), delay: 0.14, duration: 0.3, gain: 0.7 },
      { freq: pitch(1), delay: 0.28, duration: 0.9, gain: 0.8, type: "sine" },
    ]);
  }
}

/** The one instrument, shared by every island the way the game itself is. */
export const sound: Sound = new Sound();
