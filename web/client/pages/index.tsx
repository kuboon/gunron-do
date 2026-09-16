import { css, type RemixNode } from "@remix-run/ui";

import { routes } from "../routes.ts";
import { buttonStyle, cardStyle } from "../theme.ts";
import { color } from "../tokens.ts";
import { Counter } from "../islands/counter.tsx";
import { Total } from "../islands/total.tsx";

export const title = "remix-ssg — a static site starter";
export const description =
  "A Remix v3 static-site-generation starter for GitHub Pages.";

/** This page places two client entries, so the shell boots the runtime for it. */
export const hydrate = true;

export default function Home(): RemixNode {
  return (
    <>
      <h1>A static site, rendered by your own handler</h1>
      <p mix={leadStyle}>
        This starter serves <a href="https://remix.run">Remix v3</a>{" "}
        pages from a handler you write in <code>router.ts</code>, and{" "}
        <a href="https://jsr.io/@remix-kbn/ssg">@remix-kbn/ssg</a>{" "}
        crawls that same handler into static HTML for GitHub Pages.
      </p>
      <ul mix={featureListStyle}>
        <li>Server-rendered pages — zero client JavaScript by default.</li>
        <li>
          Content authored in Markdown, rendered with{" "}
          <a href="https://jsr.io/@kuboon/md">@kuboon/md</a>{" "}
          by a controller this site owns.
        </li>
        <li>
          Works at the domain root, a repo sub-path, or a PR preview URL.
        </li>
        <li>Opt into interactivity per page with hydrated islands.</li>
      </ul>
      <section mix={cardStyle}>
        <h2>Two islands, one shared module</h2>
        <p>
          Both controls below are server-rendered like every other page, then
          hydrated in the browser — view source and you'll find them already in
          the initial HTML.
        </p>
        <p>
          They are <em>separate browser entrypoints</em>{" "}
          that never talk to each other. Each one imports the same click store,
          and the running total keeps up because the bundler emitted that store
          once, into a chunk they share. Compile the two entries independently
          and each gets a private copy — the total would sit at zero forever.
        </p>
        <div mix={demoRowStyle}>
          <Counter label="Left" start={0} />
          <Counter label="Right" start={0} />
          <Total label="Shared total" />
        </div>
      </section>
      <p>
        <a mix={buttonStyle} href={routes.blog.index.href()}>
          Read the blog →
        </a>
      </p>
    </>
  );
}

// --- styles -----------------------------------------------------------------

const leadStyle = css({
  fontSize: "1.15rem",
  color: color.muted,
});

const featureListStyle = css({
  paddingLeft: "1.1rem",
  "& li": { marginBlock: "0.4rem" },
});

const demoRowStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.75rem",
});
