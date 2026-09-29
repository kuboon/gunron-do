/**
 * Every URL this site answers, in one place.
 *
 * `router.ts` maps these to the controllers that render them, and everything that links reads
 * `routes.tetraDo.href()` rather than rebuilding `${base}/tetra-do` at each call site — so a path
 * is written once and a rename is one edit.
 *
 * The map is built with the deploy prefix as its base, which is what makes the hrefs correct under
 * a repo sub-path or a PR preview URL without anyone remembering to prepend anything —
 * `route('', …)` gives `/tetra-do` and `route('/repo/preview', …)` gives `/repo/preview/tetra-do`.
 * It is also why `home` needs no special case: the base alone is the home path, trailing slash and
 * all.
 *
 * A game gets two routes: the game itself, and the page that explains it. The first is named one
 * game at a time, because a game is a screen someone wrote rather than a row in a table — while
 * the second is `:game`, because every game's rules are the same page with a different Markdown
 * file behind it. `games.ts` is the list both of them are kept honest against.
 */

import { get, route } from "@remix-run/fetch-router/routes";

import { base } from "./base.ts";

export const routes = route(base, {
  home: get("/"),
  /** テトラ道, full screen. One line per game, as each one arrives. */
  tetraDo: get("/tetra-do"),
  /**
   * The template og.kbn.one fills in for a shared round — see `server/tetra-do/share.ts`.
   *
   * A route rather than a file under `client/static/`, because what it says is built from the
   * game's own colours, score names and address. It sits beside the game it is about, and the
   * share URL names it from here, so a rename is one edit like every other path.
   */
  tetraDoOg: get("/tetra-do/og.json"),
  /** 群シューター, full screen. */
  gunShooter: get("/gun-shooter"),
  /** Any game's rules, from `rules.md` in its directory under `server/`. */
  rules: get("/:game/rules"),
});
