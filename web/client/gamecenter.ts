/**
 * [GameCenter](https://ga-cen.kbn.one): the hub a game's achievements are recorded on.
 *
 * A game takes part by describing itself — its name, its icon, and the achievements a player can
 * earn — in a JSON manifest in its page's `<head>`, which the hub reads from the published URL.
 * That manifest's shape is this file's; what any one game declares is that game's business, next
 * to its rules.
 *
 * No imports, and nothing that runs: the page renders the manifest on the server, and a game's
 * island reads the same ids in a browser. A module that pulled in the router to say where the icon
 * is would be one an island could not import.
 */

/**
 * Whose games these are, as the hub knows them.
 *
 * The hub's own identifier for the site's author, not a name: the account it names is the one that
 * approves a registration, which is what makes the manifest's claim to it true. Every game on this
 * site shares it.
 */
export const GAMECENTER_AUTHOR = "7499d00d-fcff-4630-91a0-c034893c8d08";

/** One achievement, as the manifest declares it. */
export interface Achievement {
  /** Unique within the game. What an unlock names. */
  key: string;
  title: string;
  description: string;
  points: number;
  /** Kept secret — title and description both — until the player has it. */
  hidden: boolean;
}

/** A game, as the hub reads it. See `https://ga-cen.kbn.one/schema/gamecenter.json`. */
export interface GameCenterManifest {
  $schema: string;
  /** The game's slug, unique among this author's games. */
  id: string;
  author: string;
  title: string;
  description: string;
  /** Relative to the page's URL, so a preview deploy points at its own copy. */
  icon: string;
  achievements: readonly Achievement[];
}

/**
 * The name the SDK and the claim page know a game by: `{author}/{id}`.
 *
 * @param id The game's slug
 * @returns Its full id
 */
export function gameCenterId(id: string): string {
  return `${GAMECENTER_AUTHOR}/${id}`;
}

/**
 * The manifest as it goes in the page: JSON, with every `<` escaped.
 *
 * A `<script>`'s text is not HTML-escaped — which is what lets JSON sit there as JSON — so the one
 * thing that could end it early is `</script>` inside a string. `<` is the same character to
 * a JSON parser and nothing at all to an HTML one.
 *
 * @param manifest The game's manifest
 * @returns The `<script>`'s text
 */
export function manifestJson(manifest: GameCenterManifest): string {
  return JSON.stringify(manifest, null, 2).replaceAll("<", "\\u003c");
}
