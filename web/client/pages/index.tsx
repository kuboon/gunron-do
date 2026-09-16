/**
 * The front door: what this place is, and every game in it.
 *
 * The list is `games.ts` rather than markup, because the shell's nav and the rules routes read the
 * same list — a game missing from one of the three is the bug this avoids having.
 */

import { css, type RemixNode } from "@remix-run/ui";

import { games } from "../games.ts";
import { buttonStyle, cardStyle } from "../theme.ts";
import { color } from "../tokens.ts";

export const title = "gunron-do — 群論で遊ぶ";
export const description =
  "群を題材にした小さなゲームを置いていく場所。いまのところ「テトラ道」が1つ。";

export default function Home(): RemixNode {
  return (
    <>
      <h1>gunron-do</h1>
      <p mix={leadStyle}>
        群は、覚えるものというより手つきです。ここには、その手つきが身につく小さなゲームを置いていきます。
      </p>

      {games.map((game) => (
        <section key={game.slug} mix={cardStyle}>
          <h2 mix={gameTitleStyle}>{game.title}</h2>
          <p>{game.tagline}</p>
          <p mix={linksStyle}>
            <a mix={buttonStyle} href={game.href}>あそぶ →</a>
            <a href={game.rulesHref}>ルールを読む</a>
          </p>
        </section>
      ))}
    </>
  );
}

// --- styles -----------------------------------------------------------------

const leadStyle = css({
  fontSize: "1.15rem",
  color: color.muted,
});

const gameTitleStyle = css({
  marginTop: 0,
  marginBottom: "0.25rem",
  fontSize: "1.4rem",
});

const linksStyle = css({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "1rem",
});
