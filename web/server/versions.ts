/**
 * The version badges on the showcase page.
 *
 * They read the workspace's own import map, so they never drift from what the build actually
 * resolves. Reading a file is why this is here rather than in the page: `client/` is checked
 * without `deno.ns`, and a page may not open a file even when it only ever renders on a server.
 *
 * Showcase: delete this file when you delete the showcase — see README.
 */

import type { Version } from "../client/pages/showcase.tsx";

/**
 * Reads the versions the site is built against.
 *
 * @returns One badge per package, plus the running Deno
 */
export function versions(): Version[] {
  return [
    { label: "@remix-run/ui", value: resolved("@remix-run/ui") },
    { label: "@remix-kbn/ssg", value: resolved("@remix-kbn/ssg") },
    { label: "Deno", value: Deno.version.deno },
  ];
}

/**
 * The version an import-map entry pins.
 *
 * @param specifier The bare specifier, as the map names it
 * @returns The version, or an em dash when the map cannot be read
 */
function resolved(specifier: string): string {
  try {
    const config = JSON.parse(
      Deno.readTextFileSync(new URL("../deno.json", import.meta.url)),
    ) as { imports?: Record<string, string> };
    const entry = (config.imports ?? {})[specifier];
    return typeof entry === "string"
      ? entry.replace(/^[a-z]+:.*@\^?/, "")
      : "—";
  } catch {
    return "—";
  }
}
