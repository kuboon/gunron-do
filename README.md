# remix3-ssg-gh-pages

A [Remix v3](https://remix.run) static-site starter built on
[`@kuboon/remix-ssg`](https://jsr.io/@kuboon/remix-ssg) and deployed to GitHub
Pages with per-PR previews.

The site is content and one `router.ts` that maps every URL to what renders it.
`deno task dev` serves that handler; the build crawls the same handler straight
from JSR, so there is no build script in this repository. Islands are code-split
out of one graph, so a module two of them share is emitted once — and the home
page shows what that buys.

The site lives in [`web/`](./web), a Deno workspace of two members: `client/`
holds everything the browser is ever given and is type-checked without
`deno.ns`, `server/` holds the router, the bundler and the build. Each page also
gets an `og:image` drawn at build time with Skia. See
[`web/README.md`](./web/README.md) for how it works and how to develop it.

```sh
cd web
deno task dev     # local dev server
deno task build   # generate the static site into web/dist
```

## Using this as a template

This repository is a GitHub template. The demo content in it exists to show the
framework working, not because your site needs it — **delete it in a new
repository**:

| Delete                                                                                  | What it is                                   |
| --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `web/client/pages/showcase.tsx`                                                         | The `@remix-run/ui` component showcase page  |
| `web/client/islands/showcase/`                                                          | Its 18 demo islands and their shared helpers |
| the `islands/showcase/*.tsx` entrypoint glob in `web/server/assets.ts`                  | What compiles them                           |
| `web/server/versions.ts`                                                                | The badges under its title                   |
| the `showcase` route in `web/client/routes.ts` and its action in `web/server/router.ts` | What serves it                               |
| the `UI showcase` link in `web/client/layout.tsx`                                       | The nav entry pointing at it                 |
| `web/client/pages/fullscreen.tsx`                                                       | The mobile-Safari fullscreen demo page       |
| `web/client/islands/{viewport-probe,fullscreen-demo}.tsx`                               | Its two islands                              |
| the `fullscreen` route in `web/client/routes.ts` and its line in `web/server/router.ts` | What serves it                               |
| the `Fullscreen` link in `web/client/layout.tsx`                                        | The nav entry pointing at it                 |
| `web/server/blog/*.md`, `web/client/pages/about.tsx`                                    | Placeholder content                          |

Each wiring row above is marked at its line in the source, so
`grep -rn "delete the showcase\|delete the demo" web` lists every edit the two
demo pages ask for.

`web/client/pages/index.tsx` and `web/client/islands/{counter,total,store}` are
the two-islands-one-store demo. Delete those too once you have read the home
page; the point they make is in this README's opening paragraph.

What you keep is the two `deno.json` members and everything wiring them:
`web/client/{routes,base,tokens,theme,hydration}.ts`, `web/client/layout.tsx`,
`web/client/static/`, `web/client/pages/blog/`, `web/server/{router,assets}.ts`,
`web/server/blog/mod.ts`, `web/server/og/`, and the workflows.
`web/client/tokens.ts` and `web/client/theme.ts` are where the site's look lives
— Remix supplies behaviour and a little component styling, not a theme, so the
palette, spacing and typography are the app's. Change them there and the whole
site follows.

After deleting, `deno task check && deno task build` should still pass — if it
does not, something you kept was linking to something you removed, which is the
build telling you the same thing it tells you about any dead link.

## Deployment

`.github/workflows/pages.yml` calls the reusable
`kuboon/workflows/.github/workflows/github-page-with-preview.yaml` workflow. It
builds `main` at the Pages root and each pull request under a preview sub-path,
deploys both to GitHub Pages, and comments the preview URL on the PR. The build
runs via [`mise`](https://mise.jdx.dev) (`mise.toml`), which installs Deno and
runs `deno task build` with the correct `BASE_URL`.

To enable it: **Settings → Pages → Build and deployment → Source: GitHub
Actions**.
