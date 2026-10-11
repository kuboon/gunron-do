/**
 * The tune under a round, written down rather than recorded.
 *
 * Same reasoning as the effects in `sound.ts`: a sample would outweigh the whole game, and
 * `@kuboon/bgm` renders a few lines of MML into a seamless loop in a few milliseconds. The key is
 * A major — the ladder the effects climb is its pentatonic — so a trace's arpeggio lands on the
 * tune rather than across it.
 *
 * Slow and quiet on purpose: a music box turning over the chords, a triangle carrying a melody of
 * long notes, and a hi-hat on the off-beats. The round is a minute of thinking, and the tune is
 * there to fill the silence, not to hurry anyone. One bar of the music box alone as an intro, then
 * eight bars that loop — A, C♯m, D, E, F♯m, D, E, A.
 */

import type { Instrument } from "@kuboon/bgm";
import { hihat, musicBox, triangle } from "@kuboon/bgm/instruments";

/** `@0` … `@2` in {@link THEME}. */
export const INSTRUMENTS: readonly Instrument[] = [musicBox, triangle, hihat];

export const THEME = `
t100
@0 l8 v8 o4 a o5 c+ e a e c+ e c+ L
  o4 a o5 c+ e a e c+ e c+
  o4 g+ o5 c+ e g+ e c+ e c+
  o4 a o5 d f+ a f+ d f+ d
  o4 b o5 e g+ b g+ e g+ e
  o4 a o5 c+ f+ a f+ c+ f+ c+
  o4 a o5 d f+ a f+ d f+ d
  o4 b o5 e g+ b g+ e g+ e
  o4 a o5 c+ e a e c+ e c+ ;
@1 v9 o5 r1 L
  e2 c+4 e4
  g+2. e4
  f+4 e4 d4 f+4
  e1
  c+4 e4 f+4 a4
  a2 f+4 e4
  e4 f+4 g+4 b4
  a1 ;
@1 v10 o2 r1 L
  a2 o3 e2 o2
  o3 c+2 g+2 o2
  d2 a2
  e2 b2
  f+2 o3 c+2 o2
  d2 a2
  e2 b2
  a1 ;
@2 v4 r1 L [r8 c8]32
`;
