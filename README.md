# gunron-do

群で遊ぶ小さなゲームを置いていく場所。

| ゲーム                                     | 中身                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| [テトラ道](./web/server/games/tetra-do.md) | 正四面体を120°ずつ回す操作が並んだ盤面をなぞり、元の向きに戻る経路を探す。群は A₄。 |

ゲームはひとつずつ増やしていく。増やし方は [`web/README.md`](./web/README.md)
の「Adding a game」にある。

## つくり

サイトは [Remix v3](https://remix.run) と
[`@remix-kbn/ssg`](https://jsr.io/@remix-kbn/ssg) で書かれた静的サイトで、GitHub
Pages に置いてある。ページを返すのは `web/server/router.ts`
ひとつで、ビルドはその同じ ハンドラを JSR
から直接クロールするので、このリポジトリにビルドスクリプトはない。

トップページとルール説明は JavaScript
を1バイトも積まない。ゲームのページだけが島 （island）を置いて、そのぶんだけ
hydrate する。

中身は [`web/`](./web) にある Deno ワークスペースで、メンバーは2つ。`client/`
はブラウザに 渡るものだけを置き、`deno.ns` なしで型検査する。`server/`
はルータ、バンドラ、ビルドを持つ。 詳しくは [`web/README.md`](./web/README.md)。

```sh
cd web
deno task dev     # http://localhost:8000
deno task build   # web/dist に静的サイトを生成
deno task check   # 型検査、lint、フォーマット検査
```

## デプロイ

`.github/workflows/pages.yml` が、再利用可能ワークフロー
`kuboon/workflows/.github/workflows/github-page-with-preview.yaml`
を呼ぶ。`main` は Pages
のルートに、プルリクエストはプレビュー用のサブパスに置かれ、プレビュー URL が
プルリクエストにコメントされる。ビルドは
[`mise`](https://mise.jdx.dev)（`mise.toml`）が Deno を入れて `deno task build`
を正しい `BASE_URL` で走らせる。

有効にするには **Settings → Pages → Build and deployment → Source: GitHub
Actions**。
