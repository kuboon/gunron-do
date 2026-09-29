/**
 * Scientific American 2008 の3つのパズル — M₁₂, M₂₄ and Dotto, on one page.
 *
 * The page is the site's ordinary shell: a heading, where the puzzles come from, and one island
 * that draws all three behind tabs. The puzzles themselves are in `puzzles.ts` and their moves in
 * `moves.ts`, beside this file.
 */

import { css, type RemixNode } from "@remix-run/ui";

import { findGame } from "../games.ts";
import { color } from "../tokens.ts";
import { Sa08Puzzles } from "./islands/sa08-puzzles.tsx";
import { SOURCE } from "./source.ts";

const game = findGame("sci-american-2008")!;

export const title = `${game.title} — gunron-do`;
export const ogTitle: string = game.title;
export const description = game.description;

/** The island, so the runtime boots. */
export const hydrate = true;

export default function SciAmerican2008Page(): RemixNode {
  return (
    <>
      <h1 mix={titleStyle}>{game.title}</h1>
      <p mix={leadStyle}>
        Scientific American 2008年7月号「Simple Groups at Play」（日経サイエンス
        2008年10月号に翻訳掲載）で紹介された3つのパズル（M<sub>12</sub>、M
        <sub>24</sub>、Dotto）を再現しました。
      </p>
      <p mix={sourceStyle}>
        出典：<a href={SOURCE.href}>{SOURCE.label}</a>
        {" ・ "}
        <a href={game.rulesHref}>ルールと再現について</a>
      </p>
      <Sa08Puzzles />
    </>
  );
}

// --- styles -----------------------------------------------------------------

const titleStyle = css({ marginBottom: "0.4rem" });

const leadStyle = css({
  marginTop: 0,
  color: color.muted,
  fontSize: "0.95rem",
});

const sourceStyle = css({
  fontSize: "0.9rem",
  marginBottom: "1.2rem",
});
