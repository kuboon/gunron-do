/**
 * A game's rules.
 *
 * The body arrives already rendered, from `server/games/` — this places it and dresses it with
 * `proseStyle`, which is the one mixin that reaches into markup it did not write. Text only: the
 * page places no client entry, so the rules ship no JavaScript at all.
 *
 * It ends with the way back into the game, because that is what someone reading the rules is on
 * their way to.
 */

import { css, type RemixNode } from "@remix-run/ui";

import type { Game } from "../games.ts";
import { buttonStyle, proseStyle } from "../theme.ts";
import { color } from "../tokens.ts";

export interface RulesProps {
  game: Game;
  /** The Markdown body, already a node tree. */
  body: RemixNode;
}

/**
 * @param props The game these rules belong to, and its rendered Markdown
 * @returns The rules page
 */
export default function Rules(props: RulesProps): RemixNode {
  const { game, body } = props;

  return (
    <article mix={proseStyle}>
      <h1>{game.title}のルール</h1>
      <p mix={leadStyle}>{game.tagline}</p>
      {body}
      <p>
        <a mix={buttonStyle} href={game.href}>あそぶ →</a>
      </p>
    </article>
  );
}

// --- styles -----------------------------------------------------------------

const leadStyle = css({
  fontSize: "1.1rem",
  color: color.muted,
  marginTop: "-0.5rem",
});
