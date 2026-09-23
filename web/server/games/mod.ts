/**
 * The games' rules: the Markdown, and what turns it into a page.
 *
 * One file per game, named after its slug, sitting right here — so the files this reads are its
 * own siblings and `import.meta.dirname` is the only path involved. `client/games.ts` is what says
 * which slugs exist; a request for anything else is not a game, and is answered as such by the
 * router rather than by trying to open a file whose name came from a URL.
 *
 * Everything Markdown is here: the front-matter shape, the parser, the file read, and the
 * Markdown-to-nodes step. `@kuboon/md` and `@std/front-matter` are imported from nowhere else,
 * which is what keeps Markdown out of the generator — it serves what this site's own code returns.
 *
 * The rules are a route like any other page rather than a file served off disk, which is also why
 * a `.md` file is safe to keep beside the source: nothing serves this directory.
 */

import { markdownToHast, tocFromHast } from "@kuboon/md";
import { hastToRemix } from "@kuboon/md/hast_to_remix.ts";
import type { RemixNode } from "@remix-run/ui";
import { extract } from "@std/front-matter/yaml";

import { type Game, games } from "../../client/games.ts";
import type { TocEntry } from "../../client/pages/rules.tsx";
import { routes } from "../../client/routes.ts";
import { ogImage } from "../og/mod.ts";

/** Where the Markdown is: right here, next to this file. */
const rulesDir = import.meta.dirname!;

/** A game's rules, read off disk. */
export interface Rules {
  game: Game;
  /** What the page and its card are titled, from the file's front matter. */
  title: string;
  /** One line, for the description and the card. */
  summary: string;
  /** The body, already a node tree. */
  body: RemixNode;
  /** The body's headings, for the contents at the top of the page. */
  toc: TocEntry[];
}

/**
 * Reads and renders one game's rules.
 *
 * The slug is checked against the games this site has rather than sanitised, which is the stronger
 * of the two: a name that is not in the list never becomes a file name at all.
 *
 * `@kuboon/md` parses GitHub-flavored Markdown into a sanitized hast tree (heading anchors,
 * Shiki-highlighted code, tables) and `hastToRemix` converts it to `@remix-run/ui` elements. That
 * converter is its own entry point, so importing `@kuboon/md` does not put a UI framework into the
 * graph of anyone who only wants HTML out.
 *
 * The contents come out of the same tree, from `tocFromHast`: it reads the `id` each heading was
 * already given rather than slugging the text a second time, so a contents link and the heading it
 * points at cannot disagree about what the heading is called.
 *
 * Read on each request rather than cached, so editing the Markdown in the dev server is a reload
 * away — there is one file per game, and the build reads each of them once.
 *
 * @param game The game whose rules to read
 * @returns Its rules, or `null` when the file is missing
 */
export async function readRules(game: Game): Promise<Rules | null> {
  const text = await Deno.readTextFile(`${rulesDir}/${game.slug}.md`)
    .catch(() => null);
  if (text === null) return null;

  const { attrs, body } = extract(text);
  const front = attrs as Record<string, unknown>;
  const hast = await markdownToHast(body);

  return {
    game,
    title: typeof front.title === "string"
      ? front.title
      : `${game.title}のルール`,
    summary: typeof front.summary === "string"
      ? front.summary
      : game.description,
    body: hastToRemix(hast) as RemixNode,
    toc: tocFromHast(hast),
  };
}

/**
 * The path a game's rules are served from.
 *
 * The site's paths are file-shaped — that is how the host indexes them, and how a card is filed —
 * so the slug goes in as it is on disk, not as `href()` percent-encodes it for a link.
 */
function rulesPath(game: Game): string {
  return decodeURIComponent(routes.rules.href({ game: game.slug }));
}

/**
 * One social card per game's rules, registered up front.
 *
 * The build asks for a card without visiting the page it belongs to, so registering has to happen
 * as the routes are wired rather than as a page is served. What the card says is worked out if and
 * when someone asks for the image, which is why the file is read inside the callback and not here.
 */
const images = new Map<string, string>(
  games.map((game) => [
    game.slug,
    ogImage(rulesPath(game), async () => {
      const rules = await readRules(game);
      return {
        eyebrow: game.title,
        title: rules?.title ?? `${game.title}のルール`,
        description: rules?.summary ?? game.description,
      };
    }),
  ]),
);

/** The card for a game's rules, as registered above. */
export function rulesImage(game: Game): string | null {
  return images.get(game.slug) ?? null;
}
