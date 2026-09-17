/**
 * The document shell — this site's, not the framework's.
 *
 * A component like any other, which is why it lives here rather than beside the server: everything
 * it names is in `client/`. The one thing it cannot work out — where the client runtime was
 * compiled to — is handed to it.
 *
 * It also carries the one thing the browser cannot work out for itself: the map from an island's
 * name to the chunk the bundler emitted, plus the scripts that load them. A page that places no
 * island gets neither, and so ships no JavaScript at all.
 *
 * The shell's own CSS is right here too, as `css(...)` mixins. The renderer collects the mixins
 * the page rendered and writes them into `<head>`, so nothing below has a class name that has to
 * agree with a file somewhere else.
 *
 * What turns this tree into a response is `context.render`, from the `render({ assets })`
 * middleware in `router.ts`: the doctype, the content type, and — the part that matters here —
 * `renderToStream` rather than `renderToString`. The runtime turns every internal `<a>` click into
 * a frame navigation and swaps the document only when it finds `<!-- rmx:flush document -->` at the
 * end, which `renderToString` strips; without it the URL changes while the page does not, with no
 * error anywhere. That is what keeps a plain `<a href>` working on a page with islands as well as
 * on one without.
 *
 * The social card is the other thing handed in rather than worked out here. What it says comes from
 * this page — its title and its description — but where the PNG ended up, and whether there is an
 * origin to make its URL absolute with, are things only the server knows.
 *
 * The one stylesheet it does link is `static/app.css`: the site's tokens, its document-level
 * defaults, and the `@layer base, rmx, app` statement the whole cascade hangs off. Its position in
 * the head matters — layers rank by where they are first named, and Remix appends its collected
 * styles just before `</head>`, so the link has to come first.
 */

import { css, type RemixNode } from "@remix-run/ui";

import { base } from "./base.ts";
import { games } from "./games.ts";
import { routes } from "./routes.ts";
import { color, contentWidth } from "./tokens.ts";

/** What every page hands the shell. */
export interface LayoutProps {
  title: string;
  description?: string;
  /**
   * The page's social card — the URL of the PNG `server/og/` draws for it.
   *
   * Absolute when the deploy URL is known, because `og:image` is fetched by whoever is showing the
   * link rather than by a browser that has the page open, and a path means nothing to them. `null`
   * where there is nothing to show.
   *
   * Required for the same reason `script` is: a card that is missing looks exactly like a card
   * nobody wanted, and neither the page nor the build can tell the difference.
   */
  image: string | null;
  /**
   * The page's viewport meta, for the rare page that needs one of its own.
   *
   * Optional because almost nothing does: `width=device-width, initial-scale=1` is right for a
   * document. The exception is a page laying out to the edges of a phone screen, which needs
   * `viewport-fit=cover` before `env(safe-area-inset-*)` reports anything but zero — and that is
   * a choice per page, since covering the notch on an article would only push its text under one.
   */
  viewport?: string;
  /**
   * The client runtime, for a page that places an island — resolved by `router.ts`, because a URL
   * under the deploy prefix and the bundler's naming is a thing only the server knows.
   *
   * The shell has to be handed it rather than finding out for itself: entries are resolved while
   * the tree renders, and by then the `<script>` that boots them has already been written.
   *
   * Required, and `null` for a page with no islands — a rules page ships no JavaScript at all.
   */
  script: ClientRuntime | null;
  /**
   * Whether the page sits in the site's shell, or is given the screen.
   *
   * A game is the second kind. Its screen is the game — a header band and a footer above and below
   * it would be a smaller board on a phone for no gain — so `bare` drops both and hands the page
   * the document. Everything else on the site is a document and takes the default.
   */
  chrome?: "site" | "bare";
  /**
   * What the document is painted, for a `bare` page.
   *
   * On the `<body>` rather than on the page's own box, because an overscroll on a phone drags the
   * page away from the edge of the screen and shows whatever is behind it — and a game on a dark
   * board flashing white at the top is worse than the bounce it came from. A page with the site's
   * shell has no use for it: the shell's own background is the right one.
   */
  background?: string;
  children: RemixNode;
}

/**
 * What a `bare` page paints its document, and how a phone is allowed to touch it.
 *
 * `touchAction: "manipulation"` for the same reason as the overscroll above it: both are phone
 * gestures that cost a game more than they give it. A double tap on a document zooms in on what
 * was tapped; a double tap on a game erases a cell, or presses a button twice, and the zoom that
 * follows leaves the player looking at a corner of the board with seconds left on the clock.
 * `manipulation` turns off that one gesture and nothing else — panning and pinch-to-zoom still
 * work, so a player who wants a closer look can still take one. (`user-scalable=no` in the
 * viewport meta is the other way to say it, and iOS has ignored it since 10, rightly.)
 *
 * @param background What to paint the document, or `undefined` to leave it
 * @returns The `<body>` style for a page that has been given the screen
 */
function bodyStyle(background: string | undefined) {
  return {
    background,
    overscrollBehavior: "none",
    touchAction: "manipulation",
  } as const;
}

/** Where the client runtime lives, and what it pulls in behind it. */
export interface ClientRuntime {
  src: string;
  /** The chunks it imports, for `<link rel="modulepreload">`. */
  preloads: readonly string[];
}

/**
 * Renders a page inside the document shell.
 *
 * @param props The page's title, body, and whether it hydrates
 * @returns The response to serve for this page
 */
export function Layout(props: LayoutProps): RemixNode {
  const bare = props.chrome === "bare";

  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content={props.viewport ?? "width=device-width, initial-scale=1"}
        />
        <title>{props.title}</title>
        {props.description
          ? <meta name="description" content={props.description} />
          : null}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={props.title} />
        {props.description
          ? <meta property="og:description" content={props.description} />
          : null}
        {props.image
          ? (
            <>
              <meta property="og:image" content={props.image} />
              <meta name="twitter:card" content="summary_large_image" />
            </>
          )
          : null}
        <link rel="stylesheet" href={`${base}/static/app.css`} />
        <link rel="icon" href={`${base}/static/favicon.svg`} />
        {(props.script?.preloads ?? []).map((href) => (
          <link key={href} rel="modulepreload" href={href} />
        ))}
      </head>
      <body style={bare ? bodyStyle(props.background) : undefined}>
        {bare ? null : (
          <header mix={[bandStyle, headerStyle]}>
            <a mix={brandStyle} href={routes.home.href()}>gunron-do</a>
            <nav mix={navStyle}>
              {games.map((game) => (
                <a key={game.slug} href={game.href}>{game.title}</a>
              ))}
            </nav>
          </header>
        )}

        {bare
          ? props.children
          : <main mix={[bandStyle, mainStyle]}>{props.children}</main>}

        {bare ? null : (
          <footer mix={[bandStyle, footerStyle]}>
            <p>
              群論で遊ぶ。ソースは{" "}
              <a href="https://github.com/kuboon/gunron-do">GitHub</a>。
            </p>
          </footer>
        )}

        {props.script
          ? <script type="module" src={props.script.src}></script>
          : null}
      </body>
    </html>
  );
}

// --- styles -----------------------------------------------------------------

/**
 * The measure the header, the main column and the footer all share.
 *
 * A stylesheet would say this with a grouped selector; here each band composes it, because `mix`
 * takes an array and the classes stack in the order they are listed.
 */
const bandStyle = css({
  width: "100%",
  maxWidth: contentWidth,
  marginInline: "auto",
  paddingInline: "1.25rem",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
  paddingBlock: "1.25rem",
  borderBottom: `1px solid ${color.border}`,
});

const brandStyle = css({
  fontWeight: 700,
  fontSize: "1.1rem",
  textDecoration: "none",
  color: color.fg,
});

const navStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "1rem",
});

const mainStyle = css({ paddingBlock: "2.5rem" });

const footerStyle = css({
  paddingBlock: "2rem",
  borderTop: `1px solid ${color.border}`,
  color: color.muted,
  fontSize: "0.9rem",
});
