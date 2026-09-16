/**
 * The blog: the articles, and the routes that serve them.
 *
 * This module is the blog's entry — `router.ts` imports `blogController` from here and nothing else.
 * It sits in the directory the articles are in, so the files it reads are its own siblings and
 * `import.meta.dirname` is the only path involved; there is no article directory written down
 * elsewhere for this to fall out of step with.
 *
 * Everything Markdown is here: the front-matter shape, the parser, the file reads, and the
 * Markdown-to-nodes step. `@kuboon/md` and `@std/front-matter` are imported from nowhere else,
 * which is what keeps Markdown out of the generator — it serves what this site's own code returns.
 * The two screens are next door: `index.tsx` lists the articles, `article.tsx` shows one.
 *
 * An article is a route like any other page rather than a file served off disk, which is also why
 * these source files are safe to keep beside the `.md` ones: nothing serves the directory, so
 * nothing can serve the source.
 */

import { createController } from "@remix-run/fetch-router";
import type { RemixNode } from "@remix-run/ui";
import { markdownToHast } from "@kuboon/md";
import { hastToRemix } from "@kuboon/md/hast_to_remix.ts";
import { extract } from "@std/front-matter/yaml";

import { ogImage } from "../og/mod.ts";
import { Layout } from "../../client/layout.tsx";
import { routes } from "../../client/routes.ts";
import * as Index from "../../client/pages/blog/index.tsx";
import * as ArticlePage from "../../client/pages/blog/article.tsx";

/** Where the articles are: right here, next to this file. */
const articlesDir = import.meta.dirname!;

/** A Markdown article: front-matter metadata plus the Markdown body. */
export interface Article {
  /** The file's name without its extension, which is also its URL segment. */
  slug: string;
  title: string;
  date: string;
  summary: string;
  /** The Markdown body, front-matter removed. */
  body: string;
}

// --- the files --------------------------------------------------------------

/**
 * The slug of every article on disk.
 *
 * Names only — no file is read — because a name is enough to register an article's route and its
 * social card, and both are asked for before anyone has asked for an article. Synchronous for the
 * same reason: registration happens as the module loads, with nowhere to await.
 *
 * @returns One slug per `.md` file
 */
function readSlugs(): string[] {
  const slugs: string[] = [];

  for (const entry of Deno.readDirSync(articlesDir)) {
    if (entry.isFile && entry.name.endsWith(".md")) {
      slugs.push(entry.name.replace(/\.md$/, ""));
    }
  }

  return slugs;
}

/**
 * Reads one article.
 *
 * A slug arrives from the URL, so it is checked before it becomes a file name: anything holding a
 * separator, and anything starting with a dot, is not the name of an article here. It is typed as
 * possibly missing because that is how a matched param reaches an action.
 *
 * @param slug The file's name without its extension
 * @returns The article, or `null` if there is no such file
 */
async function readArticle(slug: string | undefined): Promise<Article | null> {
  if (!slug || slug.startsWith(".") || /[/\\]/.test(slug)) return null;

  const text = await Deno.readTextFile(`${articlesDir}/${slug}.md`).catch(
    () => null,
  );
  if (text === null) return null;

  const { attrs, body } = extract(text);
  const a = attrs as Record<string, unknown>;

  return {
    slug,
    title: typeof a.title === "string" ? a.title : slug,
    date: typeof a.date === "string" ? a.date : "",
    summary: typeof a.summary === "string" ? a.summary : "",
    body,
  };
}

/**
 * Every article, newest first.
 *
 * Read on each request rather than cached, so editing an article in the dev server is a reload
 * away — there are a handful of files, and the build reads them once.
 *
 * @returns The articles, sorted by date, descending
 */
async function listArticles(): Promise<Article[]> {
  const articles = await Promise.all(readSlugs().map(readArticle));

  return articles
    .filter((article): article is Article => article !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Renders an article body.
 *
 * `@kuboon/md` parses GitHub-flavored Markdown into a sanitized hast tree (heading anchors,
 * Shiki-highlighted code, tables, task lists) and `hastToRemix` converts it to `@remix-run/ui`
 * elements. That converter is its own entry point, so importing `@kuboon/md` does not put a UI
 * framework in the graph of anyone who only wants HTML out.
 *
 * @param markdown The Markdown body, front-matter already removed
 * @returns The body as a node tree, ready to place in a page
 */
async function renderMarkdown(markdown: string): Promise<RemixNode> {
  return hastToRemix(await markdownToHast(markdown)) as RemixNode;
}

// --- the routes -------------------------------------------------------------

/**
 * One social card per article, registered up front.
 *
 * The build asks for a card without visiting the page it belongs to, so registering has to happen
 * as the routes are wired rather than as an article is served. Only the slugs are read here —
 * naming a file is enough to register a card, and what the card says is worked out if and when
 * someone asks for the image.
 */
const articleImages = new Map(
  readSlugs().map((slug) => [
    slug,
    ogImage(articlePath(slug), async () => {
      const article = await readArticle(slug);
      return {
        eyebrow: "Blog",
        title: article?.title ?? slug,
        description: article?.summary,
      };
    }),
  ]),
);

/** The listing's own card. */
const indexImage = ogImage(routes.blog.index.href(), Index);

/** Both blog routes, for `router.map(routes.blog, blogController)`. */
export const blogController = createController(routes.blog, {
  actions: {
    index: async (context) =>
      context.render(
        Layout({
          title: Index.title,
          description: Index.description,
          image: indexImage,
          // Neither screen places an island; an article is text, and the listing is a list.
          script: null,
          children: Index.default(await listArticles()),
        }),
      ),

    show: async (context) => {
      const { params } = context;
      const article = await readArticle(params.slug);
      // A `404` reads as "not mine" to `compose`, which is what an unknown slug is.
      if (article === null) {
        return new Response("Not Found", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }

      return context.render(
        Layout({
          title: `${article.title} — remix-ssg`,
          description: article.summary,
          image: articleImages.get(article.slug) ?? null,
          script: null,
          children: ArticlePage.default({
            article,
            body: await renderMarkdown(article.body),
          }),
        }),
      );
    },
  },
});

/**
 * The path one article is served from.
 *
 * The site's paths are file-shaped — that is how the host indexes them, and how a card is filed —
 * so the slug goes in as it is on disk, not as `href()` percent-encodes it for a link.
 *
 * @param slug The article's slug
 * @returns Its path, deploy prefix included
 */
function articlePath(slug: string): string {
  return decodeURIComponent(routes.blog.show.href({ slug }));
}
