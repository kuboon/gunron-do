/**
 * Every sound 群シューター makes, synthesised on the spot.
 *
 * No files: each effect is a few oscillators and a burst of noise through an envelope, which is
 * enough for an arcade shooter and costs nothing to download. The context is made on the first
 * sound rather than at import, because a context created before the player has touched anything
 * starts suspended, and the first sound is always the answer to a click.
 *
 * Everything goes through one compressor, so a cannon shot on top of three explosions is loud
 * rather than clipped.
 */

import type { Spin } from "./groups.ts";

const MUTE_KEY = "gun-shooter:muted";

class Sound {
  #ctx: AudioContext | null = null;
  #out: GainNode | null = null;
  #noise: AudioBuffer | null = null;
  #muted = false;

  constructor() {
    try {
      this.#muted = globalThis.localStorage?.getItem(MUTE_KEY) === "1";
    } catch { /* storage may be unavailable */ }
  }

  get muted(): boolean {
    return this.#muted;
  }

  toggle(): void {
    this.#muted = !this.#muted;
    try {
      globalThis.localStorage?.setItem(MUTE_KEY, this.#muted ? "1" : "0");
    } catch { /* storage may be unavailable */ }
    if (this.#out) this.#out.gain.value = this.#muted ? 0 : 0.8;
  }

  /** Wakes the context. Called from a click, where the browser allows it. */
  unlock(): void {
    const ctx = this.#context();
    if (ctx?.state === "suspended") void ctx.resume();
  }

  /** An element round leaving the barrel — each round has its own pitch. */
  shot(spin: Spin): void {
    const base = spin === "ccw" ? 1320 : 1040;
    this.#tone({
      type: "square",
      from: base,
      to: base * 0.35,
      dur: 0.09,
      gain: 0.12,
    });
    this.#noiseBurst({ dur: 0.05, gain: 0.08, freq: 4000 });
  }

  /** A round landing, and the solid turning. */
  hit(): void {
    this.#tone({ type: "triangle", from: 520, to: 880, dur: 0.12, gain: 0.16 });
    this.#noiseBurst({ dur: 0.08, gain: 0.1, freq: 2400 });
  }

  /** The `e` face coming round to the front: the lock-on chime. */
  home(): void {
    const at = this.#now();
    [880, 1318.5, 1760, 2637].forEach((f, i) =>
      this.#tone({
        type: "sine",
        from: f,
        to: f,
        dur: 0.22,
        gain: 0.12,
        at: at + i * 0.055,
      })
    );
  }

  /** An enemy firing an orb: a low warble, so it is heard from behind. */
  enemyShot(): void {
    this.#tone({ type: "sawtooth", from: 220, to: 520, dur: 0.18, gain: 0.08 });
    this.#tone({ type: "square", from: 330, to: 160, dur: 0.22, gain: 0.05 });
  }

  /** An orb popped. */
  pop(): void {
    this.#tone({ type: "square", from: 1800, to: 600, dur: 0.08, gain: 0.1 });
    this.#noiseBurst({ dur: 0.12, gain: 0.14, freq: 3000 });
  }

  /** Nothing in the way. */
  miss(): void {
    this.#noiseBurst({ dur: 0.05, gain: 0.05, freq: 6000 });
  }

  /** The e砲 firing. */
  cannon(): void {
    this.#tone({ type: "sawtooth", from: 180, to: 40, dur: 0.6, gain: 0.3 });
    this.#tone({ type: "square", from: 2400, to: 300, dur: 0.35, gain: 0.08 });
    this.#noiseBurst({ dur: 0.5, gain: 0.25, freq: 900 });
  }

  /** Something destroyed — bigger for a bigger group. */
  explode(big: boolean): void {
    const at = this.#now() + 0.03;
    this.#tone({
      type: "sine",
      from: big ? 140 : 220,
      to: 30,
      dur: big ? 1.2 : 0.6,
      gain: 0.5,
      at,
    });
    this.#noiseBurst({
      dur: big ? 1.4 : 0.7,
      gain: big ? 0.5 : 0.35,
      freq: big ? 500 : 1200,
      at,
    });
  }

  /** The e砲 glancing off something that was not at `e`. */
  bounce(): void {
    this.#tone({ type: "square", from: 300, to: 900, dur: 0.12, gain: 0.14 });
    this.#tone({
      type: "square",
      from: 310,
      to: 120,
      dur: 0.25,
      gain: 0.1,
      at: this.#now() + 0.1,
    });
  }

  /** An enemy getting through. */
  breach(): void {
    this.#tone({ type: "sawtooth", from: 110, to: 45, dur: 0.7, gain: 0.45 });
    this.#noiseBurst({ dur: 0.6, gain: 0.4, freq: 300 });
  }

  /** A wave beginning. */
  wave(boss: boolean): void {
    const at = this.#now();
    const notes = boss
      ? [110, 116.5, 110, 116.5, 110]
      : [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) =>
      this.#tone({
        type: boss ? "sawtooth" : "square",
        from: f,
        to: f,
        dur: boss ? 0.3 : 0.13,
        gain: boss ? 0.2 : 0.09,
        at: at + i * (boss ? 0.32 : 0.09),
      })
    );
  }

  /** A wave cleared. */
  clear(): void {
    const at = this.#now();
    [659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      this.#tone({
        type: "triangle",
        from: f,
        to: f,
        dur: 0.3,
        gain: 0.12,
        at: at + i * 0.07,
      })
    );
  }

  over(): void {
    const at = this.#now();
    [392, 311.1, 261.6, 196].forEach((f, i) =>
      this.#tone({
        type: "sawtooth",
        from: f,
        to: f * 0.98,
        dur: 0.4,
        gain: 0.14,
        at: at + i * 0.28,
      })
    );
  }

  #now(): number {
    return this.#context()?.currentTime ?? 0;
  }

  #context(): AudioContext | null {
    if (this.#ctx !== null) return this.#ctx;
    if (typeof AudioContext === "undefined") return null;
    const ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    const out = ctx.createGain();
    out.gain.value = this.#muted ? 0 : 0.8;
    out.connect(comp);
    comp.connect(ctx.destination);
    this.#ctx = ctx;
    this.#out = out;
    return ctx;
  }

  #tone(o: {
    type: OscillatorType;
    from: number;
    to: number;
    dur: number;
    gain: number;
    at?: number;
  }): void {
    const ctx = this.#context();
    if (ctx === null || this.#out === null || this.#muted) return;
    const at = o.at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), at + o.dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(o.gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
    osc.connect(g);
    g.connect(this.#out);
    osc.start(at);
    osc.stop(at + o.dur + 0.02);
  }

  #noiseBurst(
    o: { dur: number; gain: number; freq: number; at?: number },
  ): void {
    const ctx = this.#context();
    if (ctx === null || this.#out === null || this.#muted) return;
    if (this.#noise === null) {
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.#noise = buf;
    }
    const at = o.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.#noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(o.freq, at);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, o.freq * 0.15),
      at + o.dur,
    );
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.#out);
    src.start(at);
    src.stop(at + o.dur + 0.02);
  }
}

export const sound = new Sound();
