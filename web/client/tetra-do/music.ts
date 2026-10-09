/**
 * The tune under a round, written down rather than recorded.
 *
 * Same reasoning as the effects in `sound.ts`: a sample would outweigh the whole game, and
 * `@kuboon/bgm` renders a few lines of MML into a seamless loop in a few milliseconds. The key is
 * A major pentatonic — the ladder the effects climb — so a trace's arpeggio lands on the tune
 * rather than across it.
 *
 * One bar of bass and hi-hat as an intro, then eight bars that loop: long enough not to nag over a
 * one-minute round, short enough to sit under it without asking to be listened to.
 */

import type { Instrument } from "@kuboon/bgm";
import { hihat, kick, musicBox, triangle } from "@kuboon/bgm/instruments";

/** `@0` … `@3` in {@link THEME}. */
export const INSTRUMENTS: readonly Instrument[] = [
  musicBox,
  triangle,
  kick,
  hihat,
];

export const THEME = `
t132
@0 o5 l8 v10 r1 L
  c+ e f+ e c+4 <b4>
  <a4 b >c+ e2
  f+ e c+ e f+4 a4
  e2. r4
  c+ e f+ a f+4 e4
  c+4 <b a b2>
  <a b >c+ e c+4 <b4>
  <a2. r4> ;
@1 o2 l4 v11 a >e< a >e< L
  a >e< a >e<
  f+ >c+< f+ >c+<
  d a d a
  e b e b
  a >e< a >e<
  f+ >c+< f+ >c+<
  d a e b
  a >e< a2 ;
@2 l4 v8 r1 L [c r c r]8 ;
@3 l8 v5 [c]8 L [c c c c c c c c]8
`;
