# web

[gunron-do](https://github.com/kuboon/gunron-do), built with
[Remix v3](https://remix.run) — `remix/ui` for rendering — and
[`@remix-kbn/ssg`](https://jsr.io/@remix-kbn/ssg) for everything around it. The
output is plain HTML that deploys to GitHub Pages: the home page and the rules
pages ship no JavaScript at all, and a game is a page that opts into it through
hydrated islands.

## Two halves

The workspace has one member for each side of the wire:

|           |                                                                       | checked with        |
| --------- | --------------------------------------------------------------------- | ------------------- |
| `client/` | pages, islands, routes, tokens — everything the browser is ever given | `dom`, no `deno.ns` |
| `server/` | the router, the bundler, the file reads, the build                    | `deno.ns` and `dom` |

Only `server/` is type-checked with the Deno namespace, so a `Deno.` anywhere in
`client/` is a build error rather than a surprise in the browser. Nothing else
enforces the line — no bundler config, no naming convention, one `lib` each.

`server/` may read from `client/` and does: it imports the pages and the shell
to render them, compiles the islands, and serves `client/static/`. Nothing goes
the other way — where a view needs something only the server knows, it takes it
as a prop. The document shell has two such props. `script` is where the client
runtime was compiled to, which `router.ts` resolves and hands over — a page with
no islands passes `null` and ships no JavaScript. `image` is the page's social
card, drawn by `server/og/`.

## How it works

`client/routes.ts` states every URL the site answers, the pages render them —
`client/pages/`, and each game's `client/{slug}/page.tsx` — and
`server/router.ts` maps one to the other, the shape a Remix app has:

```ts
router.get(routes.tetraDo, tetraDoAction);
```

The rest of the site is mapped the same way. A directory is a wildcard route
handing a subtree to whatever already serves one:

```ts
router.map(`${base}/static/*path`, ({ request }) => staticFiles.fetch(request));
router.map(`${assetsPath}/*path`, ({ request }) => assets.fetch(request));
router.map(`${base}/og/*path`, ({ request }) => serveOgImage(request));
```

So `server/router.ts` default-exports a plain `@remix-run/fetch-router` router,
with nothing wrapped around it. `deno serve` and the build both want the same
thing from it — `fetch` — and everything the build additionally needs (`base`,
`entryPoints`, `fileServer`) is a named export beside it.

The one middleware it carries is Remix's own renderer:

```ts
const router = createRouter({ middleware: [render({ assets })] });
```

`render({ assets })` puts `context.render(node)` on every request — the doctype,
the content type, `renderToStream`, and the two hooks a page tree needs
answered: the chunk URL behind each `clientEntry(import.meta.url, …)`, and the
fetch behind a frame navigation. It asks the asset server for `getHref` and
`getPreloads`, which is all it wants from one, so `@kuboon/remix-assets-deno`
goes straight in.

A game's rules are a page like any other. `server/rules.ts` reads
`server/{slug}/rules.md` for a game and hands back its front-matter and its
rendered body, so `server/router.ts` answers the route in a few lines:

```ts
router.get(routes.rules, async (context) => {
  const game = findGame(context.params.game);
  …
});
```

`client/games.ts` is what says which slugs exist. A slug that is not a game
never becomes a file name, and the route is `:game` rather than one line per
game because every game's rules are the same page with a different file behind
it.

`deno task dev` runs that handler as the dev server. The build drives the very
same object with `fetch()`, writes each response to disk, and follows the links
it finds — so what you see locally is what gets generated, and moving to a live
server would be a change of deploy target rather than of code.

There is no build script in this repository. `deno task build` runs the
generator straight from JSR.

## Requirements

[Deno](https://deno.com) 2.x.

## Commands

```sh
deno task dev     # local dev server at http://localhost:8000
deno task build   # generate the static site into dist/
deno task check   # type-check, lint, and format-check
```

`dev` and `build` are `server/`'s tasks; the ones at the root run them there, so
either directory works. `check` runs `deno check` in each member — with that
member's `lib`, which is the whole point — then lints and format-checks the
workspace.

Neither task passes `-A` or `--unstable-bundle`. `server/deno.json` carries a
permission set for each (`-P=dev`, `-P=build`) and the root config the
`"unstable": ["bundle"]` the bundler needs — which is also why `deno task build`
names `-c deno.json`: a remote main module reads a project's config only when it
is told to.

The root `imports` names each package once. A subpath resolves from that entry,
so `@remix-run/ui/menu`, `@kuboon/remix-ssg/site` and `@std/front-matter/yaml`
all work without a line of their own — and adding one would only be a second
place to bump the version.

## Project layout

```
web/
  deno.json          # the workspace: members, imports, tasks, lint + fmt
  deno.lock          # pinned dependency versions (committed)
  client/
    deno.json        # lib: dom — no deno.ns, so nothing here can reach for Deno
    routes.ts        # every URL the site answers
    games.ts         # the games: title, tagline, and the two hrefs of each
    base.ts          # the deploy prefix, computed once
    tokens.ts        # design tokens — colors, fonts, radii, the measure
    theme.ts         # the css() mixins more than one module uses
    layout.tsx       # the HTML document shell
    hydration.ts     # run() — the client runtime, loaded by a page that hydrates
    gamecenter.ts    # the GameCenter manifest's shape, and the author's id
    gestures.ts      # refusing the phone gestures a game has no use for
    pages/
      index.tsx      # home — the list of games
      rules.tsx      # any game's rules, around a rendered Markdown body
    gun-shooter/     # everything 群シューター is in the browser
      page.tsx       # the screen: one island, the arena and its HUD
      quat.ts        # the rotation arithmetic the rules are decided on
      solids.ts      # the five enemy bodies, each set up in its home pose
      groups.ts      # each group, its axes and spots, and what a shot at each does
      game.ts        # waves, shots, the e砲, the score — and the one instance
      engine.ts      # three.js: the camera, picking a spot, input, the juice
      enemy-view.ts  # one enemy's mesh, turned to the element it is in
      fx.ts          # sparks, shards, shockwaves, beams, popups
      stage.ts       # the floor, and the line round the turret
      sound.ts       # every sound, synthesised
      islands/
        gun-arena.tsx  # the arena's box, and the HUD over it
    tetra-do/        # everything テトラ道 is in the browser
      page.tsx       # the screen: six islands and where they go
      rotation.ts    # the group: six moves, and the arithmetic that composes them
      game.ts        # the board, the trace, the clock — and the one instance
      solid.ts       # where every corner of the tetrahedron lands on screen
      palette.ts     # the game's own colours, painted by CSS and by SVG alike
      cell.tsx       # one cell's picture, shared by the board and the card
      …              # the recording, the walkthrough, sound, sharing, unlocks
      islands/
        tetra-board.tsx     # the board, and the finger on it
        tetra-hud.tsx       # score, longest trace, and the clock
        tetra-solid.tsx     # the tetrahedron, sixty frames a second
        tetra-controls.tsx  # the buttons under the board
        tetra-panel.tsx     # the cards that book-end a round
        tetra-seed.tsx      # which day's board this is
    static/
      app.css        # tokens, document defaults, the cascade layer order
      favicon.svg
  server/
    deno.json        # lib: deno.ns — plus the tasks and their permission sets
    router.ts        # the wiring — routes to pages, plus the rest of the site
    assets.ts        # client/ compiled as one graph
    rules.ts         # the rules: the Markdown, and what turns it into a page
    gun-shooter/
      rules.md       # 群シューター's rules
    tetra-do/        # everything テトラ道 is on the server
      rules.md       # its rules
      art.ts         # the picture on its social card
      share.ts       # the og.kbn.one template a shared round's card is drawn from
    og/
      mod.ts         # which page gets which social card, and the route serving them
      card.ts        # the drawing — Skia, via canvaskit-wasm
      fonts/         # Inter and Noto Sans JP — every .ttf here is registered
  dist/              # the build's output (gitignored)
```

Two files sit across the line on purpose. `client/base.ts` reads `BASE_URL` off
`globalThis` rather than through `Deno.env`, because a prefix is a render-time
value that the browser is never told and `client/` may not name `Deno`; and the
rules screen is `client/pages/rules.tsx` while the module that reads the `.md`
files is `server/rules.ts`. The screen states the shape it needs — a game,
and a body already rendered — and the server's own `Rules` is a superset of it.

## テトラ道

Each game keeps a directory of its own on both sides of the line, named after
its slug: `client/tetra-do/` for everything the browser is given, and
`server/tetra-do/` for its rules and its cards. What is left at the top of
`client/` and `server/` is the site — shared by every game, owned by none.

The game is four plain modules under `client/tetra-do/`: `rotation.ts` is
the group — six moves, the quaternions they are, and the free reduction that
decides what a trace is worth — `solid.ts` turns an orientation into the numbers
an SVG needs, `palette.ts` holds the colours, and `game.ts` is the board, the
trace, the clock and the one instance the screen reads. None of them touches the
DOM, which is what lets the rules be checked without a browser.

Four islands draw it. `tetra-board.tsx` takes the trace, `tetra-hud.tsx` the
score and the clock, `tetra-solid.tsx` the tetrahedron, and
`tetra-controls.tsx` the buttons and the two cards that book-end a round. The
split is along what changes when: a turn of the solid runs at sixty frames a
second, and re-rendering twenty-five cells for each of those frames is what this
avoids. They agree about the game because they are compiled as one graph, so
`game.ts` is emitted once into a chunk all four import — the property the next
section describes, load-bearing here rather than demonstrated.

Two details of the board are worth knowing before editing it. The pointer
handlers are on the board rather than on each cell, because a trace is one
gesture: once the pointer is captured, which cell a finger is over is worked out
from where it is, which is also what gives each cell a dead zone at its corners.
And the cells are keyed by the identity `game.ts` gives them, so a cell that
falls into the row below is the same key in a new place and a cell dealt into
the top is a new one — `animateLayout` slides the first, `animateEntrance` drops
the second, and `animateExit` keeps a cleared cell on screen long enough to see
it go. Nothing in the island animates anything by hand.

`client/tetra-do/page.tsx` places the islands and sets `chrome: "bare"`, which
drops the site's header and footer: on a phone the board should be as wide as
the phone. It is also the one page that overrides the shell's viewport meta,
because `env(safe-area-inset-*)` reads `0px` until a page asks for
`viewport-fit=cover`.

## 群シューター

A shooter where the targets are groups. Each enemy is a solid — a triangle or
square plate, a tetrahedron, a cube, a dodecahedron — whose rotations form D₃,
D₄, A₄, S₄ or A₅, and its state is one element of that group: the rotation from
its home pose, the `e` face upright and facing the turret. Bring an enemy to `e`
and the e砲 finishes it; fire the e砲 at anything else and it bounces, knocking
the enemy one more step round.

The shots are where they land. Every rotation of these solids is a turn about
one axis, and every axis comes out through a face's middle, a corner, or an
edge's middle. A round that hits one of those spots turns the enemy one step
about the axis through it — `360° / k`, `k` being how many steps make a full
turn — clockwise or anticlockwise as the turret sees it, by which button fired
it. So undoing an enemy is its inverse: the same axis, the other way. Most
elements are one step about some axis and go home in one shot; a half turn about
a cube's face or two steps round a dodecahedron's take two. `groups.ts` works
all of it out from the solid at load — the elements, the axes (from the elements
themselves), the spots where they leave the surface and whether that is a face,
an edge or a corner, a table of what each round at each spot does to each
element, and every element's distance home. A spot is fixed to the body, so a
shot multiplies on the right: `g · s`.

The camera is above and behind the turret, so the side of an enemy the player
sees is roughly the side its `e` face belongs on. A dashed outline marks where
the `e` face goes. Picking is on the solid itself: a ray from the camera finds
the point under the pointer, and it snaps to the nearest spot, corners and
edges weighted so they are not slivers (and a plate's rim can be hit from near
the edge of its face). Rounds only reach the turret's half of an enemy, which
costs nothing: every axis has at least one end on that half, and both ways
round are available from either end.

The field teaches in three steps: on the first two waves every enemy shows the
spot to hit and which way; on the next two it shows only the axis it is turned
about; after that, nothing. The HUD always names the spot under the pointer —
"頂点を通る軸で 120°（3 回で 1 周・位数 3）".

Only the effects glow. The bloom pass is thresholded above white, and the
enemies are lit, matte and never pushed past it, so the `e` on one — ink on a
white face — stays legible through any explosion.

The rules are plain numbers. `solids.ts` builds each body in its home pose,
`groups.ts` works out its group as above, and `game.ts` runs the waves on top.
Nothing there touches three.js.

`engine.ts` is the only module that does, and the island loads it with a dynamic
`import()` once it is in a browser. That keeps three.js (most of a 600 KB chunk)
out of the server render and out of the page's first download: the HUD hydrates
immediately and the arena follows.

One thing about handing a box to code the island does not render: give the box a
fixed child. `@remix-run/ui`'s reconciler empties an element whose rendered
children are none (`textContent = ""`) whenever the island redraws —
`data-rmx-preserve-dom` does not stop it — so a canvas appended into an empty box
vanishes on the first HUD update. `gun-arena.tsx` renders one `<span hidden />`
into the box, and the canvas the engine appends after it is left alone.

## Styling

Almost every rule is a `css(...)` mixin from `@remix-run/ui`, attached to an
element with `mix`:

```tsx
const cardStyle = css({
  padding: "1.25rem",
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  "&:hover": { borderColor: color.accent },
  "@media (min-width: 40rem)": { padding: "2rem" },
});

<section mix={cardStyle}>…</section>;
```

`renderToString` collects the mixins a page actually rendered and writes them
into that page's `<head>` as `<style>` tags. So a page carries its own CSS and
nothing else: no rules for parts of the site the reader never opened, and no
class name that has to agree with a file somewhere else. The one stylesheet the
site does link is `client/static/app.css`, and the next section is what it is
for.

### The cascade

Generated `css(...)` rules — this site's, and the ones first-party `remix/ui`
components carry — all land in the native `rmx` cascade layer, and a mixin
cannot choose its layer. So `client/static/app.css` declares the full order, and
`client/layout.tsx` links it at the top of `<head>`:

```css
@layer base, rmx, app;
```

Layers rank by where they are first named, which is why that link has to come
out ahead of Remix's own rules — Remix appends its collected styles just before
`</head>`.

| Layer  | What is in it                                                                                                                                                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base` | `app.css`. Tokens, the box model, and defaults for elements nobody styles by hand (`body`, `a`, `h1`, `code`). Being _before_ `rmx`, every one is a default a component may override — which is why nothing here needs `:where()` or `!important`. |
| `rmx`  | Remix's. Every mixin on this site, and the styling `remix/ui` components bring with them.                                                                                                                                                          |
| `app`  | Empty, and named anyway: where a rule would go that has to beat a component's own styling on purpose. Unlayered CSS would also win, but it would win by accident.                                                                                  |

### Where a style goes

- **Token values live in `client/static/app.css`; `client/tokens.ts` names
  them.** Remix supplies behaviour and a little component styling, not a theme,
  so the palette, typography and radii are the app's. They are custom properties
  because light and dark swap between two sets of them, and `tokens.ts` exports
  the `var(--…)` references rather than a second copy of the values. Islands
  import from `tokens.ts` and only from there — a `css(...)` call at module
  scope is not something the bundler will drop, so importing `theme.ts` would
  pull the whole shell into an island's chunk.
- **Mixins used by more than one module live in `client/theme.ts`.** A style
  used in one place belongs in that file, under a `// --- styles ---` heading at
  the bottom — see `client/layout.tsx` or `client/pages/index.tsx`.
- **`mix` takes an array**, so mixins compose: `mix={[bandStyle, headerStyle]}`
  is what a stylesheet would have said with a grouped selector. When an element
  also has behaviour, the `on(...)` handlers go last.
- **A page that wants the screen says so to the shell.** A game exports
  `chrome = "bare"`, and `client/layout.tsx` leaves out the header, the footer
  and the main column's measure — `client/tetra-do/page.tsx` then lays itself
  out from the viewport, and paints the document through `background` so an
  overscroll on a phone shows the board's colour rather than the site's.
- **Nesting reaches markup this site does not write.** `theme.ts`'s `proseStyle`
  dresses the rules pages with `& h2`, `& pre`, `& table` and friends, scoped to
  the one class on the article wrapper instead of leaking out as bare element
  selectors.

`client/static/` holds `app.css` and anything else served verbatim (the favicon,
images).

## Adding a game

A game is a screen someone wrote, so it is named one at a time rather than
looked up in a table. Five edits:

1. Add it to `client/games.ts` — its slug, title, tagline and description. The
   home page lists that, the shell links it, and the rules route reads it.
2. Name its URL in `client/routes.ts` — `shinGame: get("/shin-game")`.
3. Write `client/shin-game/page.tsx`, exporting a component as `default` plus a
   `title`, and `hydrate = true` if it places an island. A game that wants the
   screen exports `chrome = "bare"`, the `background` to paint the document, and
   a `viewport` of its own.
4. Map it in `server/router.ts` —
   `router.get(routes.shinGame, pageAction(routes.shinGame, ShinGame))`. The
   route goes in twice because the second one is what files the page's social
   card.
5. Write its rules as `server/shin-game/rules.md`. They are served at
   `/shin-game/rules` with no further wiring: that route is `:game`, and the
   slug in step 1 is what makes it a game.

Its logic belongs beside its page in `client/shin-game/`, and its islands in
`client/shin-game/islands/` — `server/assets.ts` globs `*/islands/*.tsx`, so the
file being there is what makes it an entrypoint. Anything server-side that is
only about this game — its card's picture, a template — goes in
`server/shin-game/`.

The crawl starts at `entryPoints` in `server/router.ts` and follows links, so
**what is reachable is what gets generated**. A page nothing links to belongs in
`entryPoints`, or it is not part of the site. That is also why the home page
lists the games: listing them is what makes them reachable.

## Social cards

Every page gets an `og:image`: a 1200×630 PNG with the page's own title and
description on it, drawn during the build and written to `dist/og/`.

`server/og/card.ts` draws it with [Skia](https://skia.org), through
[`canvaskit-wasm`](https://www.npmjs.com/package/canvaskit-wasm) — the text
stack a browser uses, compiled to WebAssembly. That is more than a rectangle and
some words needs, until you look at the words: a title is arbitrary length and
the box is not, so it has to be shaped, wrapped, and cut with an ellipsis at a
line count. Skia does that with the same shaper the page itself will use, and it
does it without a browser, a font server, or a network round trip.

`server/og/mod.ts` decides what each card says. A page already exports a `title`
and a `description`, so a card is registered from those rather than from a
second list of pages to keep in step:

```ts
const image = ogImage(routes.tetraDo.href(), TetraDo);
```

One call does both halves — it records how to draw the card and returns the URL
to put in `<meta property="og:image">` — so there is no way to register a card
without getting its URL, and none to write the URL without registering the card.

Two things follow from a card not being linked to from anywhere. `og:image` is
an absolute URL fetched by whoever is showing the link, so the deploy origin
matters: `BASE_URL` carries it, and a local build, having none, writes a
relative tag rather than inventing a host. And the crawl has no link to follow,
so `entryPoints` in `server/router.ts` names the images — `["/", ...ogPaths()]`
— which is why that export sits at the bottom of the file, after the routes that
filled the register.

### Fonts, and Japanese

`server/og/fonts/` holds what the cards are drawn with; every `.ttf` or `.otf`
in it is registered, in file-name order, and that order is the fallback order.
The fonts are vendored because Skia needs real font data — there is no system
font stack to fall back on and no CSS to resolve one.

Inter draws the Latin. Noto Sans JP sorts after it and answers for the Japanese,
so a mixed title comes out as it should — `静的サイトを書く` in Noto, the `HTML`
in the middle of it still Inter. Skia synthesises the bold face, so Japanese
needs only the one weight.

It is cut down to JIS X 0208 — every kana and all 6,355 level-1 and level-2
kanji, 2.2MB against the full font's 5.3MB. A character outside that set is
drawn as nothing at all, so the build says which ones and on which page:

```
og: no glyph for 鷗 in /tetra-do/rules — see server/og/fonts/README.md
```

[`server/og/fonts/README.md`](./server/og/fonts/README.md) has the exact set,
the commands that produced it, and what to drop in for a script neither font
covers.

### A round's own card

A page's card is one of a handful, so it can be drawn during the build. A
_round_ is not: the three numbers a player finishes with are different every
time, and a static site has no server to draw a picture per link. So a shared
round's card is drawn by [og.kbn.one](https://og.kbn.one/), a service that fills
in a template the site publishes.

`server/tetra-do/share.ts` is that template — `vars`, the fonts to fetch, the OG text,
and two SVGs with `{{date}}`, `{{cleared}}`, `{{solved}}` and `{{combo}}` holes
in them. It is generated rather than hand-written for the same reason the cards
are: the colours, the score names and the game's address are all things this
repository already knows. It is served at `/tetra-do/og.json`, which is a route
like any other and an entry point like the cards, since nothing on the site
links to it.

Two SVGs, because a link is shown at two shapes: the 1.91:1 one OG asks for, and
a 1:1 one for the crawlers that thumbnail a link into a square and would
otherwise cut the numbers in half. The service picks between them from the
crawler's user agent.

The 1.91:1 one keeps everything it says inside the square in its middle anyway.
Facebook fetches one image per link and shows it wide in a post but cut to a
centred square in a comment, and its crawler cannot say which it is fetching
for — so the wide card has to survive the crop. Its sides are background, and
the bar's colours change at thirds of that square, so the crop sees three equal
parts.

The browser half is `client/tetra-do/share.ts`. It builds the URL the
share buttons hand out —

```
https://og.kbn.one/share?tmpl=gunron-do.kbn.one/tetra-do/og.json&date=…&cleared=…&rec=…
```

— a crawler that reads it gets the card with this round's numbers, and a person
who opens it is sent on to the board with `?date=&rec=` intact. The template is
addressed from `location` rather than from `routes.ts`, because an island cannot
import the routes: they are built on the router, and the router is server code.
That also makes a preview deploy share its own template and its own board.

`rec` is deliberately not one of the template's `vars`. Only the names in `vars`
are carried on to the image URL, so a recording — which the picture never shows
— goes to the board and no further.

## GameCenter

テトラ道 records achievements on [GameCenter](https://ga-cen.kbn.one). The hub
reads a game's manifest out of its published page, so the page carries it — a
`<script type="application/gamecenter+json">` in the `<head>`, which `Layout`
writes for any page that exports a `gamecenter` manifest. `client/gamecenter.ts`
has its shape and the author's id; `client/tetra-do/page.tsx` fills it in.

The achievements themselves are `client/tetra-do/achievements.ts`: one
list, read by the manifest and by the game, so a key the hub knows is always one
the game can unlock, and each threshold sits next to the words describing it.
`client/tetra-do/unlocks.ts` watches the game against that list and hands
keys to the SDK (`jsr:@kuboon/game-center-sdk`). Only real rounds count — not the
walkthrough, not a replay — except for the achievements that are about those.

A player who came in from the hub carries a launch token, and each unlock is
recorded as it happens. Anyone else has them queued on the device, and the
result panel shows one link that records the whole queue. It is a link and not
a window opened for them: the claim page shows what it will record first. The
keys already earned are remembered on the device too, because without a token
the SDK cannot ask the hub what it already has, and would otherwise offer the
same achievement after every round.

`.github/workflows/register.yaml` tells the hub to re-read the page after each
deploy of `main`. The very first run is answered "pending" until the author
approves the URL at https://ga-cen.kbn.one/dev; after that, a push is enough.

## Markdown content

Each game's rules are `rules.md` in the game's directory under `server/` —
`server/tetra-do/rules.md` — with `title` and `summary` front-matter:

```markdown
---
title: テトラ道のルール
summary: 正四面体を120°ずつ回す操作の盤面をなぞり、元の向きに戻る経路を探す。
---

Body starts here…
```

`server/rules.ts` turns it into a page: front-matter via
`@std/front-matter`, the body via [`@kuboon/md`](https://jsr.io/@kuboon/md) —
GitHub-flavored, sanitized, with heading anchors and Shiki-highlighted code. It
is the only module importing either package, and the only one that reads the
files; `client/pages/rules.tsx` beside it is handed what it renders. The
generator never sees Markdown at all — it serves what this site's own code
returns.

The page opens with a table of contents, from `tocFromHast` — the same parsed
tree, so each entry's link is the `id` the heading was actually given rather
than a second slug of its text. It lists the Markdown's `#` sections and the
`##` under them; the page's own `<h1>` is its title and stays out of it. It is
folded in a `<details>`, so the page still opens on the quick reference.

`@kuboon/md`'s Remix converter is built against one `@remix-run/ui`, and this
site renders with one too: they have to be the same release, or the page is
drawn by two copies of the runtime. `@kuboon/md@0.5` moved to `@remix-run/ui`
0.10, so the Remix set here moves with it.

`mod.ts` finds the files through `import.meta.dirname`, being in the directory
with them, so no path to them is written down anywhere. Nothing serves that
directory as files, either, which is why the source can sit beside the `.md`
without becoming a URL.

### Line breaks, and why the formatter leaves prose alone

`deno.json` sets `"proseWrap": "preserve"`, so `deno fmt` formats the code in a
Markdown file and leaves the words where they were put. It has to: Markdown
joins the lines of a paragraph with a space, which is invisible between English
words and a gap in the middle of a Japanese sentence — and a formatter wrapping
at 80 columns puts one wherever it likes. So English prose wraps at the margin,
Japanese is a line per sentence, and each is right for what it renders to.

## Interactive islands (client components)

Most of the site is static HTML. When you need interactivity, use an **island**:
a component that is server-rendered like everything else, then hydrated in the
browser. See `client/tetra-do/islands/tetra-seed.tsx`, which is the smallest.

To add one:

1. Write it in the game's `islands/` directory with `clientEntry(import.meta.url, …)` from
   `@remix-run/ui` — the module naming itself, so there is no path to keep in
   step with a file name. Pass a **named** function: the name is the export the
   browser imports. Call `handle.update()` after changing state.
2. Import it into a page and place it, and set `export const hydrate = true` on
   that page.

There is no third step: `server/assets.ts` globs `*/islands/*.tsx`, so the file
being there is what makes it an entrypoint. A helper a few islands share goes
beside `islands/` rather than in it — `client/tetra-do/game.ts`, for the ones
テトラ道's islands share — which the glob does not reach.

A page that does not set `hydrate` ships no `<script>` at all — the home page
and the rules pages have none.

### How the client code is compiled

Every island is a browser entrypoint, and all of them go into a _single_
`Deno.bundle({ codeSplitting: true })` call. A module more than one of them
imports comes out **once**, in a chunk they share:

```
client/hydration.js                ─┬─→ chunk-…   the Remix UI runtime
tetra-do/islands/tetra-board.js    ─┤
tetra-do/islands/tetra-solid.js    ─┤
tetra-do/islands/tetra-hud.js      ─┤
tetra-do/islands/tetra-controls.js ┴─→ chunk-…   tetra-do/game.ts
```

テトラ道 is why that matters. Its four islands never reference each other; all
four import `client/tetra-do/game.ts`, and the board, the clock and the
solid agree about the game only because that module was emitted once. Compile
the entries independently — one bundler call each — and each would get a board
of its own.

`client/hydration.ts` is an entrypoint like the islands, and the only script the
shell writes: it calls `run()`, which walks the document for the hydration
markers the server emitted and imports each island by the URL named there.

That URL is resolved on the server, by the `render()` middleware —
`clientEntry`'s id is the island's own module URL, and turning that into a chunk
URL needs both the deploy prefix and the bundler's output naming, neither of
which the browser has. The middleware asks the asset server: `getHref(id)` for
the URL, and `getPreloads(id)` for the chunks under it. The id is read only
there: `$entryId` is what `renderToStream` passes to the hook, and nothing in
the client runtime looks at it, which is why the same expression may mean a
`file:` URL on one side and a chunk URL on the other. Where the id carries no
`#ExportName`, the export is the component function's own name — which is why
every island is written as a named function.

Those preloads earn their keep twice: the browser fetches the whole graph while
the runtime is still starting, and the build's crawl gets a `<link>` per chunk
to follow. Without them the chunks are named only inside the hydration JSON,
where nothing looking for links can see them — and the build writes four assets
instead of thirty-eight.

### Links, and why the shell streams

Every URL lives in `client/routes.ts` as a `@remix-run/fetch-router` route map,
and links go through it:

```tsx
<a href={routes.tetraDo.href()}>テトラ道</a>;
```

The map is built with the deploy prefix as its base, so an href is already
correct under a repo sub-path or a PR preview URL — `route('', …)` gives
`/tetra-do`, `route('/repo/preview', …)` gives `/repo/preview/tetra-do` — and nothing
has to remember to prepend `base`. That is also why `home` needs no special
case: the base alone is the home path. Nothing enforces that a route points at a
page that exists, but nothing needs to: the build crawls the links it finds, so
a route with no page behind it fails the build.

The rules are in the map as `rules: get("/:game/rules")`. One route for every
game, because they are the same page with a different Markdown file behind it,
and the home page links each with `routes.rules.href({ game: slug })`. That call
percent-encodes the slug itself, which is why nothing around it encodes
anything.

Internal links are plain `<a href>`. On a page with an island the client runtime
is active, and it turns every internal `<a>` click into a frame navigation: it
fetches the destination and swaps the document in place. That works — the new
page's islands hydrate, the back button behaves, styles come with it — but only
because the shell renders through `renderToStream`.

`renderToString` is `renderToStream` with `stripFlushMarkers()` over the result,
and the marker it strips, `<!-- rmx:flush document -->`, is exactly how the
runtime recognises a whole document rather than a fragment. Serve pages without
it and an internal link changes the URL while leaving the page alone, silently:
no error, no console warning, and the fetch even returns 200. `context.render`
streams, which is the only reason a bare `<a>` is enough here.

If you ever do want a link to force a real document load — leaving the runtime
and all its state behind — mark that one `<a data-rmx-document>`.

## Base paths and GitHub Pages

A GitHub Pages _project_ site is served under a sub-path
(`https://<user>.github.io/<repo>/`), and per-PR previews add a further segment.
`client/base.ts` turns the `BASE_URL` the deploy workflow sets into that prefix;
the shell, the pages and the router all read it from there, and the build strips
it back off when writing so the output always lands at `dist/`'s root.

Locally `BASE_URL` is unset and the site is served from `/`. To preview a
sub-path deployment:

```sh
BASE_URL=http://localhost:8000/gunron-do deno task dev
```

`deno serve` prints the root URL, but with `BASE_URL` set the site lives under
the prefix — open <http://localhost:8000/gunron-do>.

### Which file answers which URL

GitHub Pages serves `/tetra-do` from `tetra-do.html`, and 404s `/tetra-do/` when only
that file exists. `server/router.ts` states that rule as
`fileServer = githubPages()`, and the build writes the file it would reach for.
Deploying somewhere with different rules is a matter of exporting a different
behavior.

The dev server does not emulate the host — it answers the URLs the routes
declare, which is the same set for every rule that matters here: `/tetra-do` is
a route, `/tetra-do/` is not, and neither is `/tetra-do.html`. The one thing Pages is
more forgiving about is that last one, serving a page at the file's own name
too; a link written that way fails the build here instead, which is the more
useful direction to be wrong in.

Deployment is wired up in `.github/workflows/pages.yml` at the repository root.
