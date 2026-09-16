import type { RemixNode } from "@remix-run/ui";

import { routes } from "../routes.ts";

export const title = "About — remix-ssg";
export const description = "What this starter is and how it works.";

export default function About(): RemixNode {
  return (
    <>
      <h1>About</h1>
      <p>
        <code>router.ts</code> is the whole site in one route map:{" "}
        <code>routes.ts</code> mapped to the pages that render them,{" "}
        <code>islands/</code> compiled as a single code-split bundle, and{" "}
        <code>static/</code> served verbatim.
      </p>
      <p>
        <code>deno serve router.ts</code>{" "}
        runs that handler as the dev server. The build drives the very same
        object with{" "}
        <code>fetch()</code>, writes each response to disk, and follows the
        links it finds — so going from a static deploy to a live server would be
        a change of deploy target rather than of code.
      </p>
      <p>
        Only what is reachable gets generated. A page nothing links to belongs
        in <code>entryPoints</code>, or it is not part of the site.
      </p>
      <p>
        Articles are Markdown files under <code>pages/blog/</code>; see the{" "}
        <a href={routes.blog.index.href()}>blog</a>.
      </p>
      <p>
        <a href={routes.home.href()}>← Back home</a>
      </p>
    </>
  );
}
