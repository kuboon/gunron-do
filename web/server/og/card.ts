/**
 * The social card: what one looks like.
 *
 * A link to a page is a title, a line of description and nothing else until someone renders it —
 * so this draws the page's own words onto a 1200×630 canvas and hands back a PNG. What a card
 * says is decided next door in `mod.ts`; the glyphs come from `skia.ts`; and a page that has a
 * picture worth showing hands one in as `art`, drawn by `art.ts`.
 *
 * Two layouts, and the art decides which. Without it the words have the whole width, which is
 * right for an article: a title is the only thing an article can show you, so it gets the measure,
 * a description under it, and its address along the bottom. With it the words keep the left and
 * the picture takes the right, because a game is a thing you look at rather than a thing you read
 * about — and the card can then drop the description and the address too, and be better for it.
 *
 * The palette is the site's dark theme, copied from `client/static/app.css` — CSS custom
 * properties are resolved by a browser, and there is no browser here. Five values, restated,
 * rather than a stylesheet parser. A card carrying art brings its own instead: a game's screen has
 * its own colours, and a card that did not use them would be a card for a different game.
 */

import type { Canvas, Paragraph } from "canvaskit-wasm";

import { paragraph, skia, type TextStyle } from "./skia.ts";

/** What a card says, and what it shows. */
export interface Card {
  /** The small line above the title — the site's name, or a section's. */
  eyebrow: string;
  /** The page's title, wrapped to at most three lines. */
  title: string;
  /** The page's description, wrapped to at most two lines. Omitted when a page has none. */
  description?: string;
  /** The line along the bottom — where the page lives. */
  footer: string;
  /** The picture on the right, for a page that has one. */
  art?: Art;
}

/**
 * A picture on a card.
 *
 * It is handed a box to fill and a pen to draw with, and it owns nothing: every paragraph the pen
 * makes is tidied up by the card, so a drawing is only ever geometry and colour.
 */
export interface Art {
  /** What to paint behind everything, when the picture wants the whole card to be its own. */
  background?: string;
  /** The bar across the top, in as many colours as it likes. */
  bar?: readonly string[];
  /** How the words should be coloured, for a card that is not on the site's own background. */
  ink?: { eyebrow: string; title: string; muted: string; rule: string };
  /** Draws the picture. */
  draw(pen: Pen, box: Box): void;
}

/** A rectangle, in card pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a picture draws with. */
export interface Pen {
  canvas: Canvas;
  /** Skia itself, for paints, paths and matrices. */
  ck: Awaited<ReturnType<typeof skia>>["ck"];
  /**
   * One run of text, laid out and ready to draw.
   *
   * The card keeps it and deletes it afterwards, so a drawing never has to.
   *
   * @param content The text
   * @param style How to draw it
   * @param width The measure to lay it out to
   * @returns The paragraph
   */
  line(content: string, style: TextStyle, width: number): Paragraph;
}

/** The card's size. 1200×630 is what every social preview crops to. */
const WIDTH = 1200;
const HEIGHT = 630;
/** The margin every line starts at, and the one the footer sits above. */
const PADDING = 72;
/** The blank line between the blocks of text. */
const GAP = 26;
/** How much of the width the words keep when a picture has the rest. */
const WORDS = 0.48;

/**
 * How each block is drawn.
 *
 * The sizes and line counts are a budget, not a preference: the tallest card this can produce is
 * `PADDING` + the eyebrow + the title at three lines + the description at two, gaps included —
 * 463px — and the rule above the footer sits at 495. A card whose title and description both
 * overflow therefore still clears it, which is the case that has to be checked, because it is the
 * one nobody writes on purpose.
 */
const type = {
  eyebrow: { size: 28, maxLines: 1, letterSpacing: 1 },
  title: { size: 64, maxLines: 3, height: 1.15 },
  description: { size: 30, maxLines: 2, height: 1.4 },
  footer: { size: 26, maxLines: 1 },
} as const;

/**
 * The site's dark palette, from `client/static/app.css`.
 *
 * Dark because a card is shown against someone else's timeline rather than against this site, and
 * a dark rectangle reads as one deliberate object there; the light theme would read as a
 * screenshot with a white edge nobody trimmed.
 */
const color = {
  bg: "#0b0f19",
  fg: "#e5e7eb",
  muted: "#9ca3af",
  accent: "#60a5fa",
  border: "#1f2937",
} as const;

/**
 * Draws a card.
 *
 * @param card The words to put on it, and the picture if it has one
 * @returns The PNG bytes, ready to serve
 */
export async function renderCard(card: Card): Promise<Uint8Array<ArrayBuffer>> {
  const { ck, fonts } = await skia();

  const surface = ck.MakeSurface(WIDTH, HEIGHT);
  if (surface === null) {
    throw new Error("CanvasKit could not allocate a surface");
  }

  try {
    const canvas = surface.getCanvas();
    const art = card.art;
    const ink = art?.ink ?? {
      eyebrow: color.accent,
      title: color.fg,
      muted: color.muted,
      rule: color.border,
    };

    canvas.clear(ck.parseColorString(art?.background ?? color.bg));

    const paragraphs: Paragraph[] = [];
    /** Characters no registered font had a glyph for. See `report`. */
    const missing = new Set<number>();

    /** Lays a paragraph out to a measure, which is when Skia resolves its glyphs. */
    const line = (
      content: string,
      style: TextStyle,
      width: number,
    ): Paragraph => {
      const laid = paragraph(ck, fonts, content, style);
      paragraphs.push(laid);
      laid.layout(width);
      laid.unresolvedCodepoints().forEach((code) => missing.add(code));
      return laid;
    };

    // The bar across the top: the one piece of identity on the card that is not a word. One
    // colour for the site, and as many as a game's own palette has.
    bar(ck, canvas, art?.bar ?? [color.accent]);

    // The picture first, so a word that reaches into it is drawn over it rather than under.
    if (art !== undefined) {
      art.draw({ canvas, ck, line }, {
        x: WIDTH * WORDS,
        y: 0,
        width: WIDTH * (1 - WORDS),
        height: HEIGHT,
      });
    }

    const measure = (art === undefined ? WIDTH : WIDTH * WORDS) - PADDING * 2;

    // A card with a picture and no description has nothing below the title to balance it against,
    // so the title takes the room the description would have had.
    const big = art !== undefined && card.description === undefined;

    const eyebrow = line(card.eyebrow, {
      ...type.eyebrow,
      color: ink.eyebrow,
      bold: true,
    }, measure);
    const title = line(card.title, {
      ...type.title,
      size: type.title.size * (big ? 1.5 : 1),
      maxLines: big ? 2 : type.title.maxLines,
      color: ink.title,
      bold: true,
    }, measure);
    const description = card.description === undefined ? null : line(
      card.description,
      { ...type.description, color: ink.muted },
      measure,
    );

    // Where the page lives, along the bottom, under a rule. A card is read away from the site and
    // where it came from is the one thing its own words never say — but a card with a picture is
    // already unmistakably from somewhere, and the line would only be a URL in a small grey font
    // taking the place of the air the picture wants. So an article gets one and a game does not.
    //
    // Measured from the bottom rather than from whatever came before it, so a card with a
    // one-line title and one with three both end at the same place.
    const footer = art === undefined
      ? line(card.footer, { ...type.footer, color: ink.muted }, measure)
      : null;
    const bottom = footer === null
      ? HEIGHT - PADDING
      : HEIGHT - PADDING - footer.getHeight() - 32;

    // Where the words start. At the top for a card that is all words — a title is the first thing
    // to read and should be where reading starts. Centred against the picture for a card that has
    // one, because two short lines pinned to the top of a tall column read as a mistake.
    let top = PADDING;
    if (big) {
      const block = eyebrow.getHeight() + GAP + title.getHeight();
      top = PADDING + (bottom - PADDING - block) / 2;
    }

    const draw = (laid: Paragraph, at: number, gap = 0): number => {
      canvas.drawParagraph(laid, PADDING, at);
      return at + laid.getHeight() + gap;
    };

    top = draw(eyebrow, top, GAP);
    top = draw(title, top, GAP);
    if (description !== null) draw(description, top);

    if (footer !== null) {
      const rule = new ck.Paint();
      rule.setColor(ck.parseColorString(ink.rule));
      canvas.drawRect(
        ck.LTRBRect(PADDING, bottom, PADDING + measure, bottom + 1),
        rule,
      );
      rule.delete();
      canvas.drawParagraph(footer, PADDING, bottom + 32);
    }

    paragraphs.forEach((laid) => laid.delete());
    report(missing, card);

    const image = surface.makeImageSnapshot();
    try {
      const png = image.encodeToBytes(ck.ImageFormat.PNG, 100);
      if (png === null) {
        throw new Error("CanvasKit could not encode the card as a PNG");
      }
      // Re-wrapped rather than returned as it comes: the bytes arrive over an unspecified buffer,
      // and a response body has to be backed by a plain `ArrayBuffer`.
      return new Uint8Array(png);
    } finally {
      image.delete();
    }
  } finally {
    // WebAssembly memory is not the JavaScript heap, so nothing here is collected for us: a build
    // draws one card per page in one process, and leaking a surface each time would grow with the
    // site.
    surface.delete();
  }
}

/** The bar across the top, split evenly between however many colours it is given. */
function bar(
  ck: Awaited<ReturnType<typeof skia>>["ck"],
  canvas: Canvas,
  colors: readonly string[],
): void {
  const paint = new ck.Paint();
  const step = WIDTH / colors.length;
  colors.forEach((each, i) => {
    paint.setColor(ck.parseColorString(each));
    canvas.drawRect(ck.LTRBRect(step * i, 0, step * (i + 1), 10), paint);
  });
  paint.delete();
}

/**
 * Says which characters had no glyph, once per card.
 *
 * A character no registered font covers is drawn as whatever the font's `.notdef` is — a box in
 * some, nothing at all in others, which is how a name can quietly lose a letter. Either way it is
 * visible only to someone looking at the card, and nobody looks at a card; that is the point of
 * one. So the build says it out loud instead. It is a warning rather than an error because one
 * missing character is not a reason to fail a deploy, and because the fix is a font file rather
 * than a code change: `fonts/README.md` says which set is covered and how to widen it.
 *
 * @param missing The code points Skia could not resolve
 * @param card The card they were on, for naming it
 */
function report(missing: Set<number>, card: Card): void {
  if (missing.size === 0) return;

  const characters = [...missing].map((code) => String.fromCodePoint(code))
    .join(" ");
  console.warn(
    `og: no glyph for ${characters} in ${card.footer} — see server/og/fonts/README.md`,
  );
}
