/**
 * Every URL this site answers, in one place.
 *
 * `router.ts` maps these to the controllers that render them, and everything that links reads
 * `routes.about.href()` rather than rebuilding `${base}/about` at each call site — so a path is
 * written once and a rename is one edit.
 *
 * The map is built with the deploy prefix as its base, which is what makes the hrefs correct under
 * a repo sub-path or a PR preview URL without anyone remembering to prepend anything —
 * `route('', …)` gives `/about` and `route('/repo/preview', …)` gives `/repo/preview/about`. It is
 * also why `home` needs no special case: the base alone is the home path, trailing slash and all.
 *
 * The blog's articles are Markdown files discovered at build time, so no list of them belongs here
 * — but the shape of their URL does, and `show` is that shape. `href({ slug })` percent-encodes the
 * slug itself, which is why nothing calling it encodes anything.
 */

import { get, route } from "@remix-run/fetch-router/routes";

import { base } from "./base.ts";

export const routes = route(base, {
  home: get("/"),
  about: get("/about"),
  // Fullscreen demo: delete this route when you delete the demo — see README.
  fullscreen: get("/fullscreen"),
  // Showcase: delete this route when you delete the showcase — see README.
  showcase: get("/showcase"),
  blog: route("blog", {
    index: get("/"),
    /**
     * One article. Articles are Markdown files, so no list of them belongs here — but the shape of
     * their URL does, and `server/blog/` answers this route by reading the file the slug names.
     */
    show: get("/:slug"),
  }),
});
