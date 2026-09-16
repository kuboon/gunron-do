/**
 * The deploy prefix, computed once.
 *
 * The Pages workflow passes the full public URL in `BASE_URL`; locally it is unset and the site is
 * served from the root. Everything that emits a URL reads it from here — the routes, and through
 * them every page — which is why it sits in `client/` with them.
 *
 * It reads the variable off `globalThis` rather than through `Deno.env` because nothing in
 * `client/` is type-checked with `deno.ns`: a file here may not name a runtime the browser does not
 * have. Nothing is lost by that. The prefix is a render-time value — by the time a browser sees a
 * page the prefix is already in its HTML — so a browser has no variable to read and no use for one.
 */

import { normalizeBase } from "@remix-kbn/ssg/site";

/** The two runtimes this runs in: one has an environment, the other has none. */
type MaybeDeno = { Deno?: { env: { get(key: string): string | undefined } } };

/** URL path prefix the site is mounted under, without a trailing slash (e.g. `''` or `/repo`). */
export const base: string = normalizeBase(
  (globalThis as unknown as MaybeDeno).Deno?.env.get("BASE_URL"),
);
