/**
 * One article.
 *
 * The body arrives already rendered, from `server/blog/` — this places it and dresses it with
 * `proseStyle`, which is the one mixin that reaches into markup it did not write. Text only: the
 * page places no client entry, so an article ships no JavaScript at all.
 */

import type { RemixNode } from "@remix-run/ui";

import { routes } from "../../routes.ts";
import { metaStyle, proseStyle } from "../../theme.ts";

export interface ArticleProps {
  /** What the page shows of the article itself — its front-matter, as far as this needs it. */
  article: { title: string; date: string };
  /** The Markdown body, already a node tree. */
  body: RemixNode;
}

/**
 * @param props The article's front-matter, and its rendered body
 * @returns The article page
 */
export default function BlogArticle(props: ArticleProps): RemixNode {
  const { article, body } = props;

  return (
    <article mix={proseStyle}>
      <h1>{article.title}</h1>
      {article.date
        ? (
          <time mix={metaStyle} datetime={article.date}>
            {article.date}
          </time>
        )
        : null}
      {body}
      <p>
        <a href={routes.blog.index.href()}>← All posts</a>
      </p>
    </article>
  );
}
