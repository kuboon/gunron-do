/**
 * The games, as the site knows them.
 *
 * One entry per game: what it is called, what it is, and where the two pages that make it up are.
 * The home page lists this, the shell links it, and `server/rules.ts` answers a rules request by
 * looking its slug up here — so adding a game is an entry here, a page, and a Markdown file, and
 * nothing has to be remembered in a fourth place.
 *
 * It is in `client/` because it is mostly text to render and two hrefs, and because the server may
 * read anything here while nothing here may read the server.
 */

import { routes } from "./routes.ts";

/** One game: the screen you play, and the page that explains it. */
export interface Game {
  /** The URL segment, and the name of its directories: `client/{slug}/` and `server/{slug}/`. */
  slug: string;
  title: string;
  /** One line, on the home page and under the title. */
  tagline: string;
  /** What it is, for the `<head>` and the social card. */
  description: string;
  /** The game itself. */
  href: string;
  /** Its rules. */
  rulesHref: string;
}

export const games: readonly Game[] = [
  {
    slug: "tetra-do",
    title: "テトラ道",
    tagline: "正四面体が元の向きに戻る経路を、盤面からなぞって探す。",
    description:
      "正四面体を120°ずつ回す操作が並んだ盤面を指でなぞり、回転が打ち消し合って" +
      "元の向きに戻る経路を探すパズル。群 A₄ の関係式を、指で覚える。",
    href: routes.tetraDo.href(),
    rulesHref: routes.rules.href({ game: "tetra-do" }),
  },
  {
    slug: "gun-shooter",
    title: "群シューター",
    tagline: "当てた場所が回転の軸。逆元で e に戻して e砲。",
    description:
      "D₃・D₄・A₄・S₄・A₅ の立体が砲台に迫ってくるシューティング。面・頂点・辺のどこに当てるかで" +
      "回転の軸が決まる。同じ軸で逆に回す、つまり逆元を撃って敵を単位元 e に戻し、e砲でとどめ。",
    href: routes.gunShooter.href(),
    rulesHref: routes.rules.href({ game: "gun-shooter" }),
  },
];

/**
 * The game a slug names.
 *
 * @param slug A URL segment, as it arrived from the router — possibly nothing
 * @returns The game, or `null` when no game goes by that name
 */
export function findGame(slug: string | undefined): Game | null {
  return games.find((game) => game.slug === slug) ?? null;
}
