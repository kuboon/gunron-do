/**
 * The site, wired by hand.
 *
 * Route definitions live in `routes.ts` and this file maps them to the pages that render them —
 * the shape a Remix app has. `pageAction` is the whole of the mapping: a page module exports a
 * component and its title, and that is a response.
 *
 * The pages it renders live in `client/`, along with the islands they place: everything the
 * browser is ever given, in the half of the workspace that is type-checked without `deno.ns`. This
 * half has the runtime — the file reads, the bundler, the environment — and hands the other half
 * what it needs to render.
 *
 * The rest of the site is mapped the same way as a page. The browser modules and the files under
 * `client/static/` are directories rather than pages, so each is one wildcard route handing off to
 * the thing that serves it; the Markdown articles are not a directory at all here — `blog/` answers
 * its routes like any other page.
 *
 * So what is exported is a plain `@remix-run/fetch-router` router. `deno serve router.ts` runs it
 * as the dev server and the build crawls the same object; both need only `fetch`. Nothing here is a
 * framework convention — the directory names, the routes and the deploy rules are all stated here.
 */

import { createRouter, type RouterContext } from "@remix-run/fetch-router";
import { render } from "@remix-run/render-middleware";
import type { RemixNode } from "@remix-run/ui";
import { createFileTree, githubPages } from "@remix-kbn/ssg/site";
import type { FileServerBehavior } from "@remix-kbn/ssg/site";

import { assets, assetsPath } from "./assets.ts";
import { ogImage, ogPaths, serveOgImage } from "./og/mod.ts";
import { base } from "../client/base.ts";
import { Layout } from "../client/layout.tsx";
import { routes } from "../client/routes.ts";

import * as About from "../client/pages/about.tsx";
import { blogController } from "./blog/mod.ts";
// Fullscreen demo: delete this import when you delete the demo — see README.
import * as Fullscreen from "../client/pages/fullscreen.tsx";
import * as Home from "../client/pages/index.tsx";
// Showcase: delete these two imports when you delete the showcase — see README.
import * as Showcase from "../client/pages/showcase.tsx";
import { versions } from "./versions.ts";

/** Deploy path prefix. The build strips it back off when writing, so output lands at the root. */
export { base };

/** Where this deploys. The build writes the file this rule would serve. */
export const fileServer: FileServerBehavior = githubPages();

/** What every page module exports. */
interface Page {
  default: () => RemixNode;
  title: string;
  description?: string;
  /** Set by a page that places a client entry, so the shell boots the runtime for it. */
  hydrate?: boolean;
  /** Set by a page that needs a viewport meta of its own — `viewport-fit=cover`, in practice. */
  viewport?: string;
}

/**
 * Renders a page module into the shell.
 *
 * The route comes in alongside the module because the page's own path is what its social card is
 * registered under — the card is drawn from the same `title` and `description` the `<head>` gets,
 * so there is one place where a page says what it is called.
 *
 * @param route The route this page answers, for its card's URL
 * @param page The page module — its component, its title, and whether it hydrates
 * @returns An action for `router.get`
 */
function pageAction(route: { href(): string }, page: Page) {
  const image = ogImage(route.href(), page);

  return (context: AppContext): Response =>
    context.render(
      Layout({
        title: page.title,
        description: page.description,
        image,
        viewport: page.viewport,
        script: page.hydrate ? clientRuntime : null,
        children: page.default(),
      }),
    );
}

/**
 * Where the client runtime was compiled to, resolved once.
 *
 * The shell writes one `<script>` — `run()`, which hydrates whatever islands a page placed — and
 * this is the URL it needs, plus the chunks to preload behind it. It is resolved here because the
 * bundle does not change while the server runs, and because a page in `client/` cannot ask.
 *
 * One call rather than two, and the same one the renderer makes for each island: `getScriptEntry`
 * is what an asset server answers as of `remix@3.0.0-rc.2`.
 */
const runtime = await assets.getScriptEntry("hydration.ts");
const clientRuntime = { src: runtime.href, preloads: runtime.preloads };

/**
 * The files under `client/static/`, served verbatim at their own names.
 *
 * Addressed from this file rather than from the working directory, so `deno serve`, the build and
 * an editor all find them wherever they are run from.
 */
const staticFiles = await createFileTree({
  rootDir: `${import.meta.dirname}/../client/static`,
  basePath: `${base}/static`,
  cacheControl: "public, max-age=3600",
});

/**
 * The renderer, as middleware.
 *
 * `render({ assets })` puts `context.render(node)` on every request: `renderToStream`, the doctype,
 * the content type, and the two hooks a page tree needs answered — the chunk URL behind each
 * `clientEntry(import.meta.url, …)`, and the fetch behind a frame navigation. It is Remix's own,
 * which is why the asset server is passed to it rather than wrapped: as of `remix@3.0.0-rc.2` it
 * asks for `getScriptEntry` alone, and `@remix-kbn/assets-deno` answers it.
 */
const router = createRouter({ middleware: [render({ assets })] });

/** The request context those middlewares produce — `context.render`, in practice. */
export type AppContext = RouterContext<typeof router>;

// So `createController()` in `blog/mod.ts` types its actions against this app's context rather than
// the bare default. One augmentation for the whole app, which is what a single-router app has.
declare module "@remix-run/fetch-router" {
  interface RouterTypes {
    context: AppContext;
  }
}

router.get(routes.home, pageAction(routes.home, Home));
router.get(routes.about, pageAction(routes.about, About));
// Fullscreen demo: delete this line when you delete the demo — see README.
router.get(routes.fullscreen, pageAction(routes.fullscreen, Fullscreen));
// Both blog routes at once: the listing, and one article.
router.map(routes.blog, blogController);
// Showcase: delete this line when you delete the showcase — see README. It has an action of its
// own because its badges are read off the import map, which a page in `client/` cannot open.
const showcaseImage = ogImage(routes.showcase.href(), Showcase);
router.get(routes.showcase, (context) =>
  context.render(
    Layout({
      title: Showcase.title,
      description: Showcase.description,
      image: showcaseImage,
      script: Showcase.hydrate ? clientRuntime : null,
      children: Showcase.default(versions()),
    }),
  ));

// The three directories, each under its own prefix. A wildcard route is all it takes to hand a
// subtree to something that already serves one. `og/` is a directory only in the finished site —
// nothing is on disk until a card is drawn.
router.map(`${base}/static/*path`, ({ request }) => staticFiles.fetch(request));
router.map(`${assetsPath}/*path`, ({ request }) => assets.fetch(request));
router.map(`${base}/og/*path`, ({ request }) => serveOgImage(request));

/**
 * Where the crawl starts.
 *
 * Everything else is reached by following links, so the blog index listing its articles is what
 * makes them part of the site.
 *
 * The social cards are the exception, and the reason this is a list rather than just `/`: nothing
 * on the site links to one. An `og:image` is an absolute URL meant for someone else's server, so a
 * crawler that followed it would be leaving — the build is told about them instead.
 *
 * It is down here rather than up with the other exports because a card is registered as its page's
 * route is wired, and this reads the register.
 */
export const entryPoints: readonly string[] = ["/", ...ogPaths()];

export default router;
