/**
 * A game's rules.
 *
 * The body arrives already rendered, from `server/rules.ts` — this places it and dresses it with
 * `proseStyle`, which is the one mixin that reaches into markup it did not write. Text only: the
 * page places no client entry, so the rules ship no JavaScript at all.
 *
 * Above the body, its contents. The rules are long — a quick reference, the rules proper, and then
 * the group theory behind them — and most readers want one part of that, so the page says what is
 * in it before asking anyone to scroll through it. Folded, though: twenty-odd lines of contents
 * would push the quick reference, which is what most people came for, off the first screen.
 *
 * It ends with the way back into the game, because that is what someone reading the rules is on
 * their way to.
 */

import { css, type RemixNode } from "@remix-run/ui";

import type { Game } from "../games.ts";
import { buttonStyle, proseStyle } from "../theme.ts";
import { color, radius } from "../tokens.ts";

/**
 * One heading of the body, as the contents lists it.
 *
 * The shape `@kuboon/md`'s `tocFromHast` returns, written out here rather than imported: this file
 * is rendered from `client/`, and the Markdown parser stays on the server side of the line.
 */
export interface TocEntry {
  /** 1 for `#`, 2 for `##`, and so on. */
  depth: number;
  /** The heading's `id`, which is what a contents link points at. */
  id: string;
  /** The heading's text. */
  text: string;
}

export interface RulesProps {
  game: Game;
  /** The Markdown body, already a node tree. */
  body: RemixNode;
  /** The body's headings, in order. */
  toc: readonly TocEntry[];
}

/**
 * How deep the contents go.
 *
 * The Markdown's `#` sections and the `##` inside them. Below that a heading is a note within a
 * part — there are two `###` in テトラ道's rules — and listing them makes the contents longer
 * without making it any easier to find the part you came for.
 */
const TOC_DEPTH = 2;

/**
 * @param props The game these rules belong to, its rendered Markdown, and that Markdown's headings
 * @returns The rules page
 */
export default function Rules(props: RulesProps): RemixNode {
  const { game, body, toc } = props;

  return (
    <article mix={proseStyle}>
      <h1>{game.title}のルール</h1>
      <p mix={leadStyle}>{game.tagline}</p>
      {contents(toc)}
      {body}
      <p>
        <a mix={buttonStyle} href={game.href}>あそぶ →</a>
      </p>
    </article>
  );
}

/**
 * The contents: the body's sections, each with its subsections under it.
 *
 * The body's own top level is `#`, not the page's — the page's `<h1>` is the title above — so the
 * shallowest heading in the list is what starts a section, whatever depth it was written at.
 *
 * Nothing when the body has fewer than two headings. A contents with one line in it is the page
 * saying the same thing twice.
 *
 * A `<details>` inside the `<nav>`, closed until someone asks, so the page still opens on the
 * rules. It folds without a line of script, which this page has none of; the `<summary>` is the
 * button and the heading both.
 *
 * @param toc The body's headings, in order
 * @returns A `<nav>`, or nothing
 */
function contents(toc: readonly TocEntry[]): RemixNode {
  if (toc.length === 0) return null;
  const top = Math.min(...toc.map((entry) => entry.depth));
  const shown = toc.filter((entry) => entry.depth < top + TOC_DEPTH);
  if (shown.length < 2) return null;

  // Sections, each holding the entries under it until the next section starts.
  const sections: { head: TocEntry; children: TocEntry[] }[] = [];
  for (const entry of shown) {
    const last = sections.at(-1);
    if (entry.depth === top || last === undefined) {
      sections.push({ head: entry, children: [] });
    } else {
      last.children.push(entry);
    }
  }

  return (
    <nav mix={tocStyle} aria-label="目次">
      <details>
        <summary>目次</summary>
        <ol>
          {sections.map((section) => (
            <li key={section.head.id}>
              {link(section.head)}
              {section.children.length > 0
                ? (
                  <ol>
                    {section.children.map((child) => (
                      <li key={child.id}>{link(child)}</li>
                    ))}
                  </ol>
                )
                : null}
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}

/**
 * One line of the contents.
 *
 * @param entry The heading it points at
 * @returns The link
 */
function link(entry: TocEntry): RemixNode {
  return <a href={`#${encodeURIComponent(entry.id)}`}>{entry.text}</a>;
}

// --- styles -----------------------------------------------------------------

const leadStyle = css({
  fontSize: "1.1rem",
  color: color.muted,
  marginTop: "-0.5rem",
});

/**
 * The contents' box: set apart from the prose around it, and quieter than it.
 *
 * Numbered lists without the numbers — the order is the page's, and a reader does not need to be
 * told that the fourth part is the fourth.
 */
const tocStyle = css({
  marginBlock: "1.5rem 2rem",
  padding: "0.6rem 1.1rem",
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  fontSize: "0.95rem",
  "& ol": {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  "& li": { marginBlock: "0.25rem" },
  "& ol ol": {
    marginBlock: "0.25rem 0.5rem",
    paddingInlineStart: "1rem",
    fontSize: "0.9rem",
  },
  "& ol ol a": { color: color.muted },
  "& summary": {
    fontWeight: 700,
    cursor: "pointer",
  },
  "& details[open] > summary": { marginBlockEnd: "0.4rem" },
});
