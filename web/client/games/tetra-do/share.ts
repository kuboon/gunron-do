/**
 * The link a player hands to somebody else.
 *
 * Not this page's own address. A round's URL says everything a reader needs — the board and the
 * moves — but it says it to a browser, and a link posted anywhere is read first by a crawler that
 * wants a picture and a sentence. This site is static, so it cannot draw a picture per round: the
 * `og:image` in the page's HTML is the game's card, the same one for every round ever played.
 *
 * So the shared link goes the long way round, through [og.kbn.one](https://og.kbn.one/). It is
 * handed the address of this site's template — `server/og/share.ts`, published beside this page as
 * `og.json` — and the values to fill it with, and it answers a crawler with a card carrying this
 * round's three numbers, and a human with a redirect to the board. The player never sees it; what
 * they copy is a URL that shows the round to whoever they send it to.
 *
 * The template is named from the page this runs on rather than from a constant, so a preview
 * deploy shares its own template and its own board rather than production's. That is also why the
 * path is worked out here and not read from `routes.ts`: this module is in an island, the routes
 * are built on the router, and the router is server code that a browser cannot be handed.
 */

import type { Outcome } from "./game.ts";

/** The service that fills the template in. Its `/share` page is what a shared URL points at. */
const SERVICE = "https://og.kbn.one/share";

/**
 * The URL for a finished round, with its numbers on it.
 *
 * `rec` rides along because the service puts it back into the board's address when it sends a
 * human on; it is not one of the template's `vars`, so it never reaches the image itself.
 *
 * Runs in a browser only — the page it is on is what says where the template lives.
 *
 * @param date The board's day
 * @param rec The round, encoded
 * @param result What the round came to
 * @returns An absolute URL to share
 */
export function shareCardUrl(
  date: string,
  rec: string,
  result: Outcome,
): string {
  const url = new URL(SERVICE);
  url.searchParams.set("tmpl", templateAddress());
  url.searchParams.set("date", date);
  url.searchParams.set("rec", rec);
  url.searchParams.set("cleared", String(result.cleared));
  url.searchParams.set("solved", String(result.solved));
  url.searchParams.set("combo", String(result.combo));
  return url.href;
}

/**
 * Where the template is, as the service wants it: host and path, no scheme.
 *
 * Beside the page — `/tetra-do` is the game and `/tetra-do/og.json` is its template — so whatever
 * prefix a deploy is under, the page carries it and the template inherits it. A trailing slash and
 * the `.html` a static host will also answer to are taken off first, so the three addresses the
 * same page can be reached at all name the same file.
 *
 * @returns `host/path`
 */
function templateAddress(): string {
  const page = globalThis.location.pathname
    .replace(/\/+$/, "")
    .replace(/\.html$/, "");
  return `${globalThis.location.host}${page}/og.json`;
}
