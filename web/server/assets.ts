/**
 * The browser modules, compiled as one graph.
 *
 * Every entrypoint below goes into a single `Deno.bundle({ codeSplitting: true })` call, which is
 * the point: a module two of them import — the Remix UI runtime, a shared store — is emitted once,
 * into a chunk both import, so it is one module at runtime rather than two copies with two states.
 *
 * The entries are globbed rather than listed: an island is a file in a directory, and that is the
 * decision — unlike a route, which is a URL someone chose. `Deno.bundle` still wants them one by
 * one, so `@remix-kbn/assets-deno` expands the pattern at startup, sorted, and fails on a
 * pattern that matches nothing.
 *
 * Every path here is under `client/`: this is the server compiling the browser's half of the site,
 * and the browser's half is a directory.
 */

import { createAssetServer } from "@remix-kbn/assets-deno";

import { base } from "../client/base.ts";

/** The directory every entrypoint below, and every `clientEntry()` id, is resolved against. */
const clientDir = new URL("../client/", import.meta.url);

/** Where the chunks are served, and where `entryUrl()` resolves against. */
export const assetsPath = `${base}/assets`;

export const assets = await createAssetServer({
  rootDir: decodeURIComponent(clientDir.pathname),
  entrypoints: [
    // The client runtime. Every page that hydrates loads this one; the islands ride in the chunks
    // it shares with them.
    "hydration.ts",
    // Every island, by where it is rather than by name. A file appearing in this directory is the
    // decision; naming it again here would only be a second place to keep it. `islands/_lib/` is
    // left out by depth, which is a better rule than the underscore.
    "islands/*.tsx",
    // Showcase: delete this line when you delete the showcase — see README.
    "islands/showcase/*.tsx",
  ],
  basePath: assetsPath,
  mode: "bundle",
  // Source maps would double the file count of a static deploy for no gain; the sources are on
  // GitHub.
  bundle: { sourcemap: "none" },
});
