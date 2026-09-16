/**
 * What the viewport actually measures, read back live.
 *
 * DELETE ME with the rest of the fullscreen demo — see `pages/fullscreen.tsx` and the root README.
 * Nothing but that page places it, and `server/assets.ts` globs `islands/*.tsx`, so removing the
 * file is the whole of removing the entrypoint.
 *
 * The page it sits on answers one question — can CSS hide Safari's toolbars? — and this is the
 * part that answers it with numbers rather than prose. Everything here is measured in the browser
 * because none of it can be known any other way: the same document reports a different height
 * depending on whether the URL bar is expanded, and no amount of CSS changes which of those two
 * numbers you get.
 *
 * The viewport units are measured rather than computed. A hidden probe element is given
 * `height: 100dvh` (and `100svh`, and `100lvh`), the browser resolves it, and its border box is
 * read back in pixels — so the row labelled `100dvh` is the value this device's CSS engine actually
 * produced, not this file's idea of it. The same trick reads the safe-area insets: a probe is
 * padded with `env(safe-area-inset-*)` and its computed padding is the inset.
 *
 * The row that matters is `100lvh − 100svh`: the height Safari's chrome occupies when it is
 * expanded. Scrolling shrinks it and collapses the toolbar into a bar, so `100dvh` walks between
 * the two — but it stops at `100svh`, never at `100lvh`. That gap not reaching zero is the whole
 * answer, and it is why the page tells you to use `100svh` rather than to chase the chrome away.
 *
 * Measurements land in a snapshot on an event rather than being read during render: a layout read
 * inside the render function would be reading the previous frame's DOM to decide what this frame
 * says. `null` until the first measurement, which is what the server renders.
 */

import { clientEntry, css, type Handle, ref } from "@remix-run/ui";

import { color, font, radius } from "../tokens.ts";

/** Everything one measurement pass produces. */
interface Snapshot {
  innerHeight: number;
  /** `visualViewport` is absent on nothing current, but it is still an optional API. */
  visualHeight: number | null;
  visualScale: number | null;
  dvh: number | null;
  svh: number | null;
  lvh: number | null;
  insetTop: string;
  insetBottom: string;
  /** Which `display-mode` media query matches — `browser` in a tab, `standalone` once installed. */
  displayMode: string;
  /** iOS's own pre-`display-mode` flag. `null` where the property does not exist at all. */
  iosStandalone: boolean | null;
  fullscreenEnabled: boolean;
}

/** `navigator.standalone` is iOS-only and not in the DOM types. */
type IosNavigator = Navigator & { standalone?: boolean };

/** Safari carried `webkitFullscreenEnabled` long before it shipped the unprefixed property. */
type LegacyFullscreenDocument = Document & {
  webkitFullscreenEnabled?: boolean;
};

const displayModes = ["fullscreen", "standalone", "minimal-ui", "browser"];

export const ViewportProbe = clientEntry(
  import.meta.url,
  function ViewportProbe(handle: Handle) {
    let dvhEl: HTMLElement | null = null;
    let svhEl: HTMLElement | null = null;
    let lvhEl: HTMLElement | null = null;
    let insetEl: HTMLElement | null = null;

    let snapshot: Snapshot | null = null;
    let measured = false;

    /** A probe's resolved height, in whole pixels. */
    function heightOf(element: HTMLElement | null): number | null {
      return element
        ? Math.round(element.getBoundingClientRect().height)
        : null;
    }

    function measure(): void {
      const insets = insetEl ? getComputedStyle(insetEl) : null;
      const viewport = globalThis.visualViewport;

      snapshot = {
        innerHeight: Math.round(globalThis.innerHeight),
        visualHeight: viewport ? Math.round(viewport.height) : null,
        visualScale: viewport ? Math.round(viewport.scale * 100) / 100 : null,
        dvh: heightOf(dvhEl),
        svh: heightOf(svhEl),
        lvh: heightOf(lvhEl),
        insetTop: insets?.paddingTop ?? "—",
        insetBottom: insets?.paddingBottom ?? "—",
        displayMode:
          displayModes.find((mode) =>
            matchMedia(`(display-mode: ${mode})`).matches
          ) ?? "unknown",
        iosStandalone: (navigator as IosNavigator).standalone ?? null,
        fullscreenEnabled: document.fullscreenEnabled === true ||
          (document as LegacyFullscreenDocument).webkitFullscreenEnabled ===
            true,
      };

      void handle.update();
    }

    // Nothing above runs on the server, where this component is rendered once to HTML and there is
    // no viewport to ask. The listeners are what make the numbers move: on iOS the toolbar
    // collapsing is a `visualViewport` resize, and it fires while the user is still scrolling.
    if (typeof document !== "undefined") {
      const options = { signal: handle.signal, passive: true } as const;
      globalThis.visualViewport?.addEventListener("resize", measure, options);
      globalThis.visualViewport?.addEventListener("scroll", measure, options);
      globalThis.addEventListener("resize", measure, options);
      globalThis.addEventListener("orientationchange", measure, options);
      document.addEventListener("fullscreenchange", measure, options);
    }

    return () => {
      // Once, after the probes are in the document — measuring on every render would be a loop,
      // because measuring ends in `handle.update()`.
      if (!measured) {
        measured = true;
        handle.queueTask(() => measure());
      }

      // The chrome's full extent. `null` until measured, and the reason the page says `100svh`.
      const chrome = snapshot?.lvh != null && snapshot.svh != null
        ? snapshot.lvh - snapshot.svh
        : null;

      return (
        <div mix={panelStyle}>
          <div
            aria-hidden="true"
            mix={[
              ref((node) => (dvhEl = node as HTMLElement)),
              probeStyle,
              dvhProbeStyle,
            ]}
          />
          <div
            aria-hidden="true"
            mix={[
              ref((node) => (svhEl = node as HTMLElement)),
              probeStyle,
              svhProbeStyle,
            ]}
          />
          <div
            aria-hidden="true"
            mix={[
              ref((node) => (lvhEl = node as HTMLElement)),
              probeStyle,
              lvhProbeStyle,
            ]}
          />
          <div
            aria-hidden="true"
            mix={[
              ref((node) => (insetEl = node as HTMLElement)),
              probeStyle,
              insetProbeStyle,
            ]}
          />

          <p mix={captionStyle}>
            Measured on this device, live. Scroll the page and watch{" "}
            <code>100dvh</code> move.
          </p>

          {snapshot
            ? (
              <dl mix={gridStyle}>
                <Row label="100svh" value={pixels(snapshot.svh)} />
                <Row label="100dvh" value={pixels(snapshot.dvh)} strong />
                <Row label="100lvh" value={pixels(snapshot.lvh)} />
                <Row
                  label="100lvh − 100svh"
                  value={chrome == null ? "—" : `${chrome}px of browser UI`}
                  strong
                />
                <Row label="innerHeight" value={pixels(snapshot.innerHeight)} />
                <Row
                  label="visualViewport.height"
                  value={pixels(snapshot.visualHeight)}
                />
                <Row
                  label="visualViewport.scale"
                  value={snapshot.visualScale == null
                    ? "—"
                    : String(snapshot.visualScale)}
                />
                <Row
                  label="safe-area-inset-top"
                  value={snapshot.insetTop}
                />
                <Row
                  label="safe-area-inset-bottom"
                  value={snapshot.insetBottom}
                />
                <Row label="display-mode" value={snapshot.displayMode} />
                <Row
                  label="navigator.standalone"
                  value={snapshot.iosStandalone == null
                    ? "not an iOS Safari"
                    : String(snapshot.iosStandalone)}
                />
                <Row
                  label="fullscreenEnabled"
                  value={String(snapshot.fullscreenEnabled)}
                />
              </dl>
            )
            : <p mix={captionStyle}>Measuring…</p>}
        </div>
      );
    };
  },
);

/** One `label: value` pair. A plain function, not an island — it ships inside this chunk. */
function Row(
  handle: Handle<{ label: string; value: string; strong?: boolean }>,
) {
  return () => (
    <>
      <dt mix={termStyle}>{handle.props.label}</dt>
      <dd
        mix={[valueStyle, handle.props.strong ? strongValueStyle : undefined]}
      >
        {handle.props.value}
      </dd>
    </>
  );
}

/** A measurement, or an em dash where the API that produces it is missing. */
function pixels(value: number | null): string {
  return value == null ? "—" : `${value}px`;
}

// --- styles -----------------------------------------------------------------

const panelStyle = css({
  // Sticky so the numbers stay on screen while you scroll the runway below and watch them change —
  // which is the demonstration.
  position: "sticky",
  top: "0.5rem",
  zIndex: 1,
  padding: "1rem 1.1rem",
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  background: color.card,
});

/**
 * The probes: laid out so the browser resolves their heights, invisible so nobody sees them.
 *
 * `visibility: hidden` rather than `display: none`, because a box that is not generated has no
 * height to read.
 */
const probeStyle = css({
  position: "fixed",
  top: 0,
  left: 0,
  width: "1px",
  visibility: "hidden",
  pointerEvents: "none",
  zIndex: -1,
});

const dvhProbeStyle = css({ height: "100dvh" });
const svhProbeStyle = css({ height: "100svh" });
const lvhProbeStyle = css({ height: "100lvh" });

const insetProbeStyle = css({
  height: 0,
  paddingTop: "env(safe-area-inset-top)",
  paddingBottom: "env(safe-area-inset-bottom)",
});

const captionStyle = css({
  margin: "0 0 0.75rem",
  fontSize: "0.85rem",
  color: color.muted,
});

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "0.3rem 1rem",
  margin: 0,
  fontFamily: font.mono,
  fontSize: "0.8rem",
});

const termStyle = css({ color: color.muted });

const valueStyle = css({
  margin: 0,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
});

const strongValueStyle = css({ color: color.accent, fontWeight: 700 });
