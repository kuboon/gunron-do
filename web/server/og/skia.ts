/**
 * Skia, the fonts, and one line of text at a time.
 *
 * `canvaskit-wasm` is Skia compiled to WebAssembly — the text stack a browser uses, minus the
 * browser. That matters for the part that is hard: a title is arbitrary length and the box is not,
 * so it has to be shaped, wrapped, and cut with an ellipsis at a line count. Skia's paragraph API
 * does that, and it does it with the same shaper the page itself will use.
 *
 * This module is the machinery only. What a card looks like is `card.ts`, and what a game's
 * picture looks like is `art.ts`; both of them come through here for their glyphs.
 *
 * Nothing here touches the network or the clock, so a card is a pure function of its text: the
 * same page builds the same bytes on every machine, which is what keeps a rebuild from churning
 * the deployed artifact.
 */

import CanvasKitModule, {
  type CanvasKit,
  type CanvasKitInitOptions,
  type FontMgr,
  type Paragraph,
} from "canvaskit-wasm";

/**
 * The loader, given the type its own package documents.
 *
 * `canvaskit-wasm` ships CommonJS with ES-module type declarations, and Deno resolves the default
 * import to the module rather than to the function inside it. The declarations are right about
 * what that function takes and returns; only where it sits is wrong, so this restates it rather
 * than describing it again.
 */
const CanvasKitInit = CanvasKitModule as unknown as (
  options?: CanvasKitInitOptions,
) => Promise<CanvasKit>;

/** The fonts, and the family names to ask for them by, in fallback order. */
export interface Fonts {
  manager: FontMgr;
  families: string[];
}

/** How one run of text is drawn. */
export interface TextStyle {
  size: number;
  color: string;
  bold?: boolean;
  /** Lines past this are dropped and the last one ends in an ellipsis. */
  maxLines: number;
  /** Line height as a multiple of the font size. */
  height?: number;
  letterSpacing?: number;
  /** Left unless a caller says otherwise — a label under a picture wants the middle. */
  center?: boolean;
}

/** Where the fonts are: a directory, so adding one is dropping a file in. See `loadFonts`. */
const fontsDir = new URL("fonts/", import.meta.url);

/**
 * Skia and the fonts — started once, on the first card.
 *
 * Lazy because `deno serve` should not pay for a WebAssembly runtime it may never use, and shared
 * because the build asks for one card per page and there is no reason to load Skia twice.
 */
let started: Promise<{ ck: CanvasKit; fonts: Fonts }>;

/**
 * Skia, ready to draw with.
 *
 * @returns The runtime and the fonts registered from `fonts/`
 */
export function skia(): Promise<{ ck: CanvasKit; fonts: Fonts }> {
  return started ??= start();
}

/**
 * One paragraph, shaped but not yet laid out.
 *
 * @param ck Skia
 * @param fonts The fonts registered from `fonts/`
 * @param content The text to shape
 * @param style How to draw it
 * @returns The paragraph, for the caller to lay out and draw
 */
export function paragraph(
  ck: CanvasKit,
  fonts: Fonts,
  content: string,
  style: TextStyle,
): Paragraph {
  const paragraphStyle = new ck.ParagraphStyle({
    textStyle: {
      color: ck.parseColorString(style.color),
      fontFamilies: fonts.families,
      fontSize: style.size,
      fontStyle: {
        weight: style.bold ? ck.FontWeight.Bold : ck.FontWeight.Normal,
      },
      letterSpacing: style.letterSpacing,
      heightMultiplier: style.height,
    },
    textAlign: style.center ? ck.TextAlign.Center : ck.TextAlign.Left,
    maxLines: style.maxLines,
    ellipsis: "…",
  });

  const builder = ck.ParagraphBuilder.Make(paragraphStyle, fonts.manager);
  try {
    builder.addText(content);
    return builder.build();
  } finally {
    builder.delete();
  }
}

/** Starts Skia and registers the fonts. */
async function start(): Promise<{ ck: CanvasKit; fonts: Fonts }> {
  const ck = await CanvasKitInit();
  const files = await loadFonts();

  const manager = ck.FontMgr.FromData(...files);
  if (manager === null) throw new Error(`No usable font in ${fontsDir}`);

  const families = Array.from(
    { length: manager.countFamilies() },
    (_, i) => manager.getFamilyName(i),
  );

  return { ck, fonts: { manager, families } };
}

/**
 * Every font in `fonts/`, in name order.
 *
 * A directory rather than a list, for the same reason the islands are globbed: a font file being
 * there is the decision, and naming it again here would only be a second place to keep it.
 *
 * Skia falls back per glyph through the families in the order they are registered, so the names
 * decide which font draws a character two of them have: Inter sorts first and keeps the Latin,
 * Noto Sans JP follows and answers for the Japanese. Covering another script is dropping a file in
 * here, and `card.ts`'s `report` names the characters that nothing covered yet. See
 * `fonts/README.md`.
 *
 * @returns The font files, sorted by name
 */
async function loadFonts(): Promise<ArrayBuffer[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(fontsDir)) {
    if (entry.isFile && /\.(?:ttf|otf)$/i.test(entry.name)) {
      names.push(entry.name);
    }
  }
  names.sort();

  if (names.length === 0) throw new Error(`No font files in ${fontsDir}`);

  return await Promise.all(names.map(async (name) => {
    // Skia takes the buffer rather than a view over it, and a view need not cover the whole of
    // one — so the bytes are copied into a buffer that is exactly the font and nothing else.
    const bytes = await Deno.readFile(new URL(name, fontsDir));
    return bytes.slice().buffer;
  }));
}
