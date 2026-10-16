/**
 * テトラ道's achievements: what the manifest declares, and what earns each one.
 *
 * One list, read twice. The page puts it in the GameCenter manifest, and `gamecenter.ts` watches the
 * game against it in a browser — so a key the hub knows is always one the game can unlock, and a
 * threshold is written once, next to the words that describe it.
 *
 * Only real rounds count. A lesson is scored so its steps can be shown, and a recording is somebody
 * else's round being played back; neither is the player doing anything, so neither earns anything
 * but the achievements that are about them.
 */

import type { Achievement } from "../gamecenter.ts";
import type { Shape } from "./rotation.ts";

/** The game's slug on the hub — the same as the site's. */
export const GAMECENTER_ID = "tetra-do";

/** What a round has come to, as the game reports it. */
export interface RoundSoFar {
  cleared: number;
  solved: number;
  combo: number;
}

/**
 * An achievement that a round's numbers earn, and the numbers that earn it.
 *
 * Checked as the round goes rather than at its end, so it pops the moment it is earned — and a
 * round that is abandoned half way still counts for what it did.
 */
interface RoundAchievement extends Achievement {
  earned(round: RoundSoFar): boolean;
}

/**
 * The combos.
 *
 * Two is the first thing the rules page calls a combo, and eight is the ceiling: an answer is three
 * cells at the least and the board has twenty-five. Five and eight are hidden — a player should
 * find out there is a ceiling by running into it.
 */
const COMBOS: readonly RoundAchievement[] = [
  {
    key: "combo_2",
    title: "コンボ",
    description: "1回のなぞりで2回成立させる",
    points: 20,
    hidden: false,
    earned: (round) => round.combo >= 2,
  },
  {
    key: "combo_3",
    title: "3コンボ",
    description: "1回のなぞりで3回成立させる",
    points: 30,
    hidden: false,
    earned: (round) => round.combo >= 3,
  },
  {
    key: "combo_5",
    title: "5コンボ",
    description: "1回のなぞりで5回成立させる",
    points: 50,
    hidden: true,
    earned: (round) => round.combo >= 5,
  },
  {
    key: "combo_8",
    title: "上限",
    description: "1回のなぞりで8回成立させる。これより上はありません",
    points: 100,
    hidden: true,
    earned: (round) => round.combo >= 8,
  },
];

/**
 * An achievement that a named shape earns: a clear shouted as that 役, counted when the round ends.
 *
 * Sent with the round's 消去 as its score, like {@link HIGH_SCORE} — so the hub shows the best round
 * each 役 was found in. A round given up half way sends none of them.
 *
 * 三連 has none — it is silent, and 「はじめての成立」 is already the first of it. The common
 * forms are open; the ones a player has to go looking for are hidden, so finding the word on the
 * solid is the first they hear of it.
 */
interface ShapeAchievement extends Achievement {
  shape: Shape;
}

export const SHAPE_ACHIEVEMENTS: readonly ShapeAchievement[] = [
  {
    key: "shape_loop",
    shape: "巡回",
    title: "巡回",
    description: "3つの別々の頂点を回って戻る（a b c のような形）で成立させる",
    points: 20,
    hidden: false,
  },
  {
    key: "shape_loop_back",
    shape: "逆巡回",
    title: "逆巡回",
    description: "巡回を逆向きに回って成立させる",
    points: 20,
    hidden: false,
  },
  {
    key: "shape_klein",
    shape: "クライン",
    title: "クライン",
    description: "4手で戻る形（a b a b のような形）で成立させる",
    points: 30,
    hidden: false,
  },
  {
    key: "shape_conjugate",
    shape: "共役",
    title: "共役",
    description: "x y x⁻¹ を含む形で成立させる",
    points: 30,
    hidden: false,
  },
  {
    key: "shape_conjugate_triple",
    shape: "共役三連",
    title: "共役三連",
    description: "三連を共役でくるんだ5手で成立させる",
    points: 50,
    hidden: true,
  },
  {
    key: "shape_conjugate_loop",
    shape: "共役巡回",
    title: "共役巡回",
    description: "巡回を共役でくるんだ5手で成立させる",
    points: 50,
    hidden: true,
  },
  {
    key: "shape_conjugate_loop_back",
    shape: "共役逆巡回",
    title: "共役逆巡回",
    description: "逆巡回を共役でくるんだ5手で成立させる",
    points: 50,
    hidden: true,
  },
  {
    key: "shape_double_conjugate",
    shape: "ダブル共役",
    title: "ダブル共役",
    description: "共役を2か所に入れた6手で成立させる",
    points: 80,
    hidden: true,
  },
  {
    key: "shape_4",
    shape: "4手",
    title: "4手",
    description: "クラインでも共役でもない4手で成立させる",
    points: 10,
    hidden: false,
  },
  {
    key: "shape_5",
    shape: "5手",
    title: "5手",
    description: "どの形にも当てはまらない5手で成立させる",
    points: 40,
    hidden: false,
  },
  {
    key: "shape_6",
    shape: "6手",
    title: "6手",
    description: "どの形にも当てはまらない6手で成立させる",
    points: 60,
    hidden: false,
  },
];

/** What one round's numbers earn, in the order they are likely to come. */
export const ROUND_ACHIEVEMENTS: readonly RoundAchievement[] = [
  {
    key: "first_clear",
    title: "はじめての成立",
    description: "テトラを元の向きに戻す",
    points: 10,
    hidden: false,
    earned: (round) => round.solved >= 1,
  },
  ...COMBOS,
  {
    key: "solved_10",
    title: "10回成立",
    description: "1ラウンドで10回成立させる",
    points: 30,
    hidden: false,
    earned: (round) => round.solved >= 10,
  },
  {
    key: "cleared_50",
    title: "50マス消去",
    description: "1ラウンドで50マス消す",
    points: 30,
    hidden: false,
    earned: (round) => round.cleared >= 50,
  },
  {
    key: "cleared_100",
    title: "100マス消去",
    description: "1ラウンドで100マス消す",
    points: 60,
    hidden: false,
    earned: (round) => round.cleared >= 100,
  },
];

/**
 * The one that carries a score.
 *
 * Earned by playing a round to the end, and sent again whenever a round beats the best — the hub
 * keeps the highest score it is told, so this is the player's record for 消去, kept where they can
 * see it.
 */
export const HIGH_SCORE: Achievement = {
  key: "high_score",
  title: "消去の最高記録",
  description: "60秒を最後まで遊ぶ。1ラウンドで消したマスの最高記録が残ります",
  points: 10,
  hidden: false,
};

/** The walkthrough, done to the end. */
export const TUTORIAL: Achievement = {
  key: "tutorial",
  title: "練習修了",
  description: "練習を最後までやる",
  points: 10,
  hidden: false,
};

/** A round turned into a link — the only way one reaches anybody else. */
export const SHARE: Achievement = {
  key: "share",
  title: "記録を残す",
  description: "遊んだラウンドのリプレイのURLを作る",
  points: 10,
  hidden: false,
};

/** Somebody's round, watched to the end. */
export const REPLAY: Achievement = {
  key: "replay",
  title: "見て学ぶ",
  description: "リプレイを最後まで再生する",
  points: 10,
  hidden: false,
};

/**
 * Every achievement, in the order the hub lists them: the way in first, then the round's own, the 役, then
 * the ones about sharing a round.
 */
export const ACHIEVEMENTS: readonly Achievement[] = [
  TUTORIAL,
  ...ROUND_ACHIEVEMENTS.map(({ earned: _, ...achievement }) => achievement),
  ...SHAPE_ACHIEVEMENTS.map(({ shape: _, ...achievement }) => achievement),
  HIGH_SCORE,
  SHARE,
  REPLAY,
];
