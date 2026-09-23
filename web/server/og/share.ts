/**
 * The card a shared round carries — the template, not the picture.
 *
 * Every page's card is drawn here at build time and written to `dist/og/`, which works because a
 * page is one of a handful of known things. A *round* is not: the three numbers it comes to are
 * different for every player and every day, and a static site has no server to draw a picture per
 * link. So this card is drawn by somebody else. [og.kbn.one](https://og.kbn.one/) is a template
 * service: the site publishes an SVG with `{{name}}` holes in it, the player shares a
 * `https://og.kbn.one/share?tmpl=…&cleared=…` URL, and the crawler that follows it gets an
 * `og:image` with this round's numbers in it. A human who follows it is sent straight on to the
 * board.
 *
 * What lives here is that template, as one JSON file served at {@link routes.tetraDoOg}. It is
 * generated rather than written out by hand for the same reason the cards are: the colours, the
 * three score names and the game's own URL are all things this repository already knows, and a
 * second copy of them in a static file is a second copy to keep in step.
 *
 * Two pictures, because a link is shown at two shapes. The wide one is OG's own 1.91:1 — Facebook,
 * LINE, Discord, Slack, Bluesky, and X's 2:1 card, which crops it rather than letterboxing. The
 * square one is for the crawlers that thumbnail a link into a square (WhatsApp, Telegram); handed
 * the wide card they would cut the numbers in half. The service picks between them from the
 * crawler's user agent, so the site's job is only to offer both.
 *
 * The wide card is not always shown wide, though. Facebook fetches one image for a link wherever it
 * is posted, and a link in a comment is shown as a square cut out of the middle of it — the crawler
 * cannot say which it is fetching for, so the service cannot pick the square card for it. So the
 * wide card keeps everything it says inside that middle square, and what is outside it is only
 * background.
 *
 * The drawing is resvg's, not Skia's: no `foreignObject`, no external stylesheet, and the fonts
 * are named in the template and subset from Google Fonts rather than vendored here. So the SVG
 * says everything in attributes — one font family at one weight, and size and colour doing the
 * work that weight usually would.
 */

import {
  ink,
  OP_COLORS,
  surface,
} from "../../client/games/tetra-do/palette.ts";
import { routes } from "../../client/routes.ts";
import { SITE_NAME, siteUrl } from "./mod.ts";

/**
 * The three numbers, in the order the result panel puts them.
 *
 * The name is the query parameter, the label is what the card says, and the colour is the op it
 * belongs to — the same three the board's marks are drawn in, so a card reads as this game's.
 */
const SCORES: readonly { name: string; label: string; color: string }[] = [
  { name: "cleared", label: "消去", color: OP_COLORS[0] },
  { name: "solved", label: "成立", color: OP_COLORS[1] },
  { name: "combo", label: "コンボ", color: OP_COLORS[2] },
];

/**
 * The one face the cards are set in.
 *
 * One family at one weight, and every string on the card asks for it. A second weight would be a
 * second subset to fetch for the sake of a lighter label, and a scoreboard is not hurt by being
 * bold throughout. The service subsets it from Google Fonts by family name; the SVG names the
 * family alone, since a weight is `font-weight`'s business.
 */
const FAMILY = "Noto Sans JP";

/** The same face as the service asks for it — family, and the weight to fetch. */
const FONT = `${FAMILY}:700`;

// The palette, under shorter names: everything below is SVG, and SVG reads better when an
// attribute is a word. `surface.ink` is the screen behind the board, not the ink on it.
const bg = surface.ink;
const panel = surface.board;
const edge = surface.edge;
const muted = ink.muted;
const text = ink.text;

/** What the `{{…}}` holes are called, and what stands in for one nobody filled. */
const VARS: Readonly<Record<string, string>> = {
  date: "",
  cleared: "0",
  solved: "0",
  combo: "0",
};

/**
 * The template, as the service reads it.
 *
 * `url` is where a human is sent, and it has to be absolute — the service is on another host, so
 * there is nothing for a path to be relative to. `BASE_URL` is what knows the origin; a local
 * build has none and leaves the key out rather than inventing a host, the same way a local card's
 * `og:image` stays relative. Nothing is lost by that: a template on `localhost` is not one the
 * service can fetch either.
 *
 * `rec` is deliberately not in {@link VARS}. A recording is long and the picture does not use it,
 * and only the names in `vars` are carried on to the image URL — so the round's moves reach the
 * board through `url` and stop there.
 *
 * @returns The template JSON
 */
export function shareTemplate(): string {
  const game = siteUrl
    ? new URL(routes.tetraDo.href(), siteUrl.origin).href
    : null;

  return `${
    JSON.stringify(
      {
        vars: VARS,
        fonts: [FONT],
        ...(game === null ? {} : { url: `${game}?date={{date}}&rec={{rec}}` }),
        og: {
          site_name: SITE_NAME,
          type: "website",
          title: `テトラ道 {{date}} — ${
            SCORES.map((score) => `${score.label} {{${score.name}}}`).join(
              " ／ ",
            )
          }`,
          description: "リンクを開くと、この手順をそのまま再生できます。",
        },
        images: [wideCard(), squareCard()],
      },
      null,
      2,
    )
  }\n`;
}

/**
 * The 1.91:1 card: the words and the three numbers, all in the square in its middle.
 *
 * 1200×630 is OG's own size, but Facebook crops the same image to a square when the link is in a
 * comment — the card's full height, cut from the centre. Everything the card says is inside that
 * square, centred, so the crop loses nothing but background; the sides are only the screen's blue
 * and the ends of the bar.
 *
 * The numbers are a row, the result panel's own arrangement — three side by side, each in its op's
 * colour — which in a square this size gives them more height than the 1:1 card's list would.
 *
 * @returns The SVG
 */
function wideCard(): string {
  const width = 1200;
  const height = 630;
  // The square a comment crops to, and a margin inside it so nothing touches the cut.
  const safe = height;
  const center = width / 2;
  const left = (width - safe) / 2 + 40;
  const inner = safe - 80;
  const top = 272;
  const deep = 290;
  const column = inner / SCORES.length;

  const scores = SCORES.map((score, i) => {
    const x = round(left + column * (i + 0.5));
    const label = score.label;
    const hole = `{{${score.name}}}`;
    const color = score.color;
    const labelY = top + 100;
    const valueY = top + 208;
    // 84 rather than larger because a column is 183 wide and Noto's digits are broad: three of
    // them at 84 leave room either side, where at 100 a score of 128 runs up to the rule.
    return `${rule(round(left + column * i), top, deep, i)}
    <text x="${x}" y="${labelY}" fill="${muted}" font-size="28">${label}</text>
    <text x="${x}" y="${valueY}" fill="${color}" font-size="84">${hole}</text>`;
  }).join("");

  return `${open(width, height)}
  <rect width="${width}" height="${height}" fill="${bg}"/>
${bar(width, 12, safe)}
  <g text-anchor="middle">
    <text x="${center}" y="104" fill="${muted}" font-size="24" letter-spacing="5">${SITE_NAME}</text>
    <text x="${center}" y="182" fill="${text}" font-size="64">テトラ道</text>
    <text x="${center}" y="230" fill="${muted}" font-size="28">{{date}} の盤面</text>
    <rect x="${left}" y="${top}" width="${inner}" height="${deep}" rx="28" fill="${panel}"/>${scores}
  </g>
</svg>
`;
}

/**
 * The upright between two columns of the wide card.
 *
 * @param x Where the columns meet
 * @param top The panel's top edge
 * @param deep The panel's height
 * @param i Which column follows it — the first has nothing to its left
 * @returns The line, or nothing
 */
function rule(x: string, top: number, deep: number, i: number): string {
  if (i === 0) return "";
  const from = top + 36;
  const to = top + deep - 36;
  return `
    <line x1="${x}" y1="${from}" x2="${x}" y2="${to}" stroke="${edge}" stroke-width="2"/>`;
}

/**
 * The 1:1 card: the same words, with the numbers stacked as a list.
 *
 * A square thumbnail is small and usually shown beside the text rather than above it, so the three
 * numbers are rows — label on the left, number on the right — rather than three narrow columns
 * each given a third of a small square.
 *
 * @returns The SVG
 */
function squareCard(): string {
  const size = 1200;
  const pad = 100;
  const inner = size - pad * 2;
  const top = 460;
  const deep = 640;
  const left = pad + 70;
  const right = size - pad - 70;
  const row = deep / SCORES.length;

  const scores = SCORES.map((score, i) => {
    const base = top + row * i + row / 2 + 38;
    const y = round(base);
    // The label rides up to the number's middle: on a shared baseline a 48 sits at the foot of a
    // 116 and reads as a caption under it rather than the name of it.
    const labelY = round(base - 26);
    const label = score.label;
    const hole = `{{${score.name}}}`;
    const color = score.color;
    const above = i === 0 ? "" : divider(round(top + row * i), left, right);
    return `${above}
    <text x="${left}" y="${labelY}" fill="${muted}" font-size="48">${label}</text>
    <text x="${right}" y="${y}" fill="${color}" font-size="116" text-anchor="end">${hole}</text>`;
  }).join("");

  return `${open(size, size)}
  <rect width="${size}" height="${size}" fill="${bg}"/>
${bar(size, 14)}
  <text x="${pad}" y="208" fill="${muted}" font-size="36" letter-spacing="7">${SITE_NAME}</text>
  <text x="${pad}" y="336" fill="${text}" font-size="108">テトラ道</text>
  <text x="${pad}" y="408" fill="${muted}" font-size="40">{{date}} の盤面</text>
  <rect x="${pad}" y="${top}" width="${inner}" height="${deep}" rx="36" fill="${panel}"/>
  <g>${scores}
  </g>
</svg>
`;
}

/**
 * The line between two rows of the square card.
 *
 * @param y Where the rows meet
 * @param left Where the labels start
 * @param right Where the numbers end
 * @returns The line
 */
function divider(y: string, left: number, right: number): string {
  return `
    <line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${edge}" stroke-width="2"/>`;
}

/**
 * A card's opening tag.
 *
 * The family and the weight are set once on the root and inherited, because every string on the
 * card is in the same face — see {@link FONT}.
 *
 * @param width The card's width
 * @param height The card's height
 * @returns The `<svg>` tag
 */
function open(width: number, height: number): string {
  const box = `0 0 ${width} ${height}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${box}" font-family="${FAMILY}" font-weight="700">`;
}

/**
 * The three ops, across the top.
 *
 * The same bar the page's own card carries, and the one thing on either card that says which game
 * this is without a word.
 *
 * The colours change at thirds of the square in the middle rather than thirds of the card, and the
 * first and last run on to the edges. Cut to that square, the bar is three equal parts, as it is on
 * the square card; left wide, it is the same bar with its two ends drawn out, and still symmetric.
 *
 * @param width The card's width
 * @param thickness How deep the bar is
 * @param safe The side of the square in the middle — the whole width, for a card that is square
 * @returns The bar's rectangles
 */
function bar(width: number, thickness: number, safe = width): string {
  const start = (width - safe) / 2;
  const count = OP_COLORS.length;
  const at = (i: number) =>
    i === 0 ? 0 : i === count ? width : start + (safe * i) / count;
  return OP_COLORS.map((color, i) => {
    const x = round(at(i));
    const w = round(at(i + 1) - at(i));
    return `  <rect x="${x}" y="0" width="${w}" height="${thickness}" fill="${color}"/>`;
  }).join("\n");
}

/**
 * A coordinate, short enough to read.
 *
 * Thirds of a card are not whole numbers and an SVG does not need fifteen decimal places of one.
 *
 * @param value The coordinate
 * @returns It, to one decimal place, with a trailing `.0` dropped
 */
function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}
