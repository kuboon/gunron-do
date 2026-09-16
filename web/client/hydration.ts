/**
 * The client runtime, started once per document.
 *
 * `run()` walks the document for the hydration markers `renderToStream` emitted and hydrates each
 * one, importing the module the server named for it. That name is a real URL by the time it
 * reaches here — `assets.ts` resolved it during render — so this hook is the whole of it.
 *
 * The shell loads this as a `<script type="module">` on any page that hydrates, and on no other:
 * an article places no client entry, so it ships no JavaScript at all.
 */

import { run } from "@remix-run/ui";

run({
  loadModule: async (moduleUrl, exportName) => {
    const module = await import(moduleUrl) as Record<string, unknown>;
    const picked = module[exportName];
    if (typeof picked !== "function") {
      throw new Error(
        `Module "${moduleUrl}" has no function export "${exportName}".`,
      );
    }
    return picked;
  },
});
