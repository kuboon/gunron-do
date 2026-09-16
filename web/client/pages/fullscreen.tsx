/**
 * Mobile Safari's chrome, and what a page can actually do about it.
 *
 * DELETE ME in a repository made from this template: this page, the two islands it imports
 * (`islands/viewport-probe.tsx` and `islands/fullscreen-demo.tsx`), its route in `routes.ts`, its
 * import and line in `server/router.ts`, and the nav link in `layout.tsx`. See the root README.
 *
 * What is worth keeping is the shell's optional `viewport` prop, which this page is the only
 * caller of: it stays useful the moment any page of yours needs `viewport-fit=cover`.
 *
 * The question this exists to answer is one everybody asks once: the URL bar and the tab bar eat
 * the top and bottom of an iPhone screen, scrolling a little shrinks them, and surely there is a
 * CSS property for that. There is not, and the page says so in the first paragraph rather than
 * burying it — but "no" on its own is not much use, so the rest is the four things that do work,
 * two of them wired to live demos you can run on the device in your hand.
 *
 * It is a page with islands rather than prose plus a screenshot because every claim on it is
 * device-specific. `100dvh` is a different number on an iPhone 15 and an iPad and a desktop, and
 * the gap between `100lvh` and `100svh` — the height the chrome occupies — is the measurement that
 * makes "scrolling only collapses it, never removes it" concrete. So the page measures rather than
 * asserts.
 *
 * This is the one page that overrides the shell's viewport meta. `viewport-fit=cover` is what makes
 * `env(safe-area-inset-*)` report anything other than zero, and a page about laying out to the
 * edges of a phone screen that could not read the insets would be missing its point. The shell
 * keeps the plain meta for every other page, where covering the notch would only push text under
 * it.
 */

import { css, type RemixNode } from "@remix-run/ui";

import { FullscreenDemo } from "../islands/fullscreen-demo.tsx";
import { ViewportProbe } from "../islands/viewport-probe.tsx";
import { color, font, radius } from "../tokens.ts";
import { routes } from "../routes.ts";

export const title = "Mobile Safari fullscreen — remix-ssg";
export const description =
  "Can CSS hide Safari's URL bar and tab bar on iOS? No — but svh/dvh/lvh, " +
  "safe-area insets, the Fullscreen API and Add to Home Screen each solve " +
  "part of it. Measured live on your device.";

/** This page places client entries, so the shell boots the runtime for it. */
export const hydrate = true;

/**
 * `viewport-fit=cover` — the opt-in that makes `env(safe-area-inset-*)` non-zero.
 *
 * Page-local on purpose: it lets content sit under the notch and the home indicator, which is
 * right for a page demonstrating edge-to-edge layout and wrong for an article.
 */
export const viewport =
  "width=device-width, initial-scale=1, viewport-fit=cover";

export default function FullscreenPage(): RemixNode {
  return (
    <>
      <h1>Mobile Safari fullscreen</h1>

      <p mix={leadStyle}>
        No. CSS cannot hide Safari's URL bar or tab bar — there is no property
        for it, and there was never going to be: a page that could hide the
        address bar on its own could show you a fake one. Scrolling collapses
        the chrome part-way and that is as far as the page gets to influence it.
      </p>

      <p>
        What CSS <em>can</em>{" "}
        do is stop caring. The viewport units below tell you how big the screen
        is with the chrome expanded, with it collapsed, and right now — so a
        layout can be correct in both states instead of guessing one. Everything
        on this page is measured on the device you are reading it on.
      </p>

      <h2>What the viewport says right now</h2>

      <ViewportProbe />

      <p>
        <code>100svh</code> is the <em>small</em>{" "}
        viewport: the height you get with the browser UI fully expanded — the
        smallest it will ever be, and therefore the only one that never
        overflows. <code>100lvh</code> is the <em>large</em>{" "}
        viewport, measured as if the chrome were gone. <code>100dvh</code>{" "}
        is whichever is true at this instant, and it changes as you scroll.
      </p>

      <p>
        The row worth staring at is{" "}
        <code>100lvh − 100svh</code>. That is how much of the screen Safari is
        holding. Scroll this page and watch <code>100dvh</code>{" "}
        climb toward the large value as the toolbar collapses — and notice it
        never gets there. Collapsed is not gone.
      </p>

      <h2>The four options, honestly</h2>

      <table mix={tableStyle}>
        <thead>
          <tr>
            <th>Approach</th>
            <th>Removes the chrome?</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Scrolling</td>
            <td>Partly — it collapses, never disappears</td>
            <td>Free, and not yours to control</td>
          </tr>
          <tr>
            <td>
              <code>svh</code> / <code>dvh</code> / <code>lvh</code>
            </td>
            <td>No — it lays out correctly either way</td>
            <td>None. Start here</td>
          </tr>
          <tr>
            <td>Fullscreen API</td>
            <td>Yes, completely</td>
            <td>Needs a tap; not on every iPhone Safari</td>
          </tr>
          <tr>
            <td>Add to Home Screen</td>
            <td>Yes, completely</td>
            <td>The user has to install it</td>
          </tr>
        </tbody>
      </table>

      <h2>Fullscreen API</h2>

      <p>
        The only thing here that removes the chrome inside a tab. It must be
        called from a user gesture, which is exactly why it is safe to allow —
        and why it is a button rather than something this page does on load.
      </p>

      <FullscreenDemo />

      <h2>Add to Home Screen</h2>

      <p>
        The other complete answer, and the durable one. An installed page runs
        with no browser UI at all — no URL bar, no tab bar, nothing to collapse.
        On iOS that is the Share sheet's{" "}
        <em>Add to Home Screen</em>, and what it gives you is what the{" "}
        <code>display-mode</code> row above reports: <code>browser</code>{" "}
        in a tab, <code>standalone</code> once installed.
      </p>

      <p>
        A web app manifest with <code>"display": "standalone"</code>{" "}
        is what asks for it. Modern iOS reads the manifest; the old{" "}
        <code>apple-mobile-web-app-capable</code>{" "}
        meta tag did the same job and is still worth shipping for older
        versions.
      </p>

      <h2>The CSS that actually helps</h2>

      <p>
        Two lines do most of the work. Size to <code>100svh</code>{" "}
        so the layout is correct when the chrome is at its largest, and pad with
        the safe-area insets so nothing lands under the notch or the home
        indicator.
      </p>

      <pre mix={preStyle}><code>{cssRecipe}</code></pre>

      <p>
        <code>env(safe-area-inset-*)</code> reads as <code>0px</code>{" "}
        unless the page opts in with{" "}
        <code>viewport-fit=cover</code>, which is what this page sets:
      </p>

      <pre mix={preStyle}><code>{viewportMeta}</code></pre>

      <p>
        Reach for <code>100dvh</code>{" "}
        only when you want the box to follow the chrome as it moves — it reflows
        on every toolbar transition, so it is a poor default for a full-height
        app shell and a fine one for a hero.
      </p>

      <h2>Scroll runway</h2>

      <p>
        Keep going. The panel above stays put, and its numbers move as Safari
        collapses its toolbar.
      </p>

      <div mix={runwayStyle}>
        <p mix={runwayNoteStyle}>
          Watch <code>100dvh</code> and <code>visualViewport.height</code>.
        </p>
      </div>

      <p>
        That is the whole of it: the chrome shrank, the numbers moved, and the
        gap never closed.
      </p>

      <p>
        <a href={routes.home.href()}>← Back home</a>
      </p>
    </>
  );
}

/** The recipe, as a string so the markup does not have to escape braces. */
const cssRecipe = `.screen {
  /* Correct with the browser UI at its largest — never overflows. */
  min-height: 100svh;

  /* Clear of the notch, the home indicator and the rounded corners. */
  padding-top: max(1rem, env(safe-area-inset-top));
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
}

/* A sticky bar has to clear the home indicator too. */
.bottom-bar {
  position: sticky;
  bottom: 0;
  padding-bottom: env(safe-area-inset-bottom);
}`;

const viewportMeta =
  `<meta name="viewport"\n      content="width=device-width, initial-scale=1, viewport-fit=cover">`;

// --- styles -----------------------------------------------------------------

const leadStyle = css({
  fontSize: "1.1rem",
  borderLeft: `3px solid ${color.accent}`,
  paddingLeft: "1rem",
  margin: "0 0 1.5rem",
});

const tableStyle = css({
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.9rem",
  margin: "1rem 0 1.5rem",
  "& th, & td": {
    textAlign: "left",
    padding: "0.5rem 0.6rem",
    borderBottom: `1px solid ${color.border}`,
    verticalAlign: "top",
  },
  "& th": { color: color.muted, fontWeight: 600 },
});

const preStyle = css({
  overflowX: "auto",
  padding: "0.9rem 1rem",
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  background: color.card,
  fontFamily: font.mono,
  fontSize: "0.8rem",
  lineHeight: 1.5,
  "& code": { background: "none", padding: 0 },
});

/**
 * Something tall enough that Safari actually collapses its toolbar.
 *
 * `svh` rather than `vh`, so the runway is the same number of *smallest* screens on every device —
 * and so this page practises what it says two sections up.
 */
const runwayStyle = css({
  display: "grid",
  placeItems: "center",
  minHeight: "180svh",
  margin: "1rem 0",
  border: `1px dashed ${color.border}`,
  borderRadius: radius.lg,
  background: color.card,
});

const runwayNoteStyle = css({
  margin: 0,
  color: color.muted,
  fontSize: "0.9rem",
  textAlign: "center",
  padding: "1rem",
});
