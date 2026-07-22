# Secrets & Config — data-meals-cf

このアプリの secret / config の置き場所と、新しいマシン・クローンでのセットアップ手順。
パターンは `data-drills-cf` と共通（dev/prod 分離 playbook 準拠）。

## TL;DR（新規クローンのセットアップ）

1. `bws` CLI を入れる（未導入なら https://github.com/bitwarden/sdk-sm のリリースから。Windows は scoop）
2. `.env.local` を作り、`BWS_ACCESS_TOKEN` を1行だけ書く
   （値 = Bitwarden Secrets Manager の machine account の access token。data-drills-cf と同一トークンでよい）
   ```
   BWS_ACCESS_TOKEN=<bitwarden machine account token>
   ```
3. `pnpm install && pnpm dev`

これだけで動く。実 secret は Bitwarden から自動注入され、非機密 config は commit 済み。
**環境ごとに用意するのは `.env.local` の token 1つだけ。**

## 置き場所の区分け（2 バケツだけ。曖昧な第3を作らない）

- **secret** → 注入（git に置かない）。ローカル=bws、prod runtime=CF Worker Secret / Hyperdrive。
- **非 secret** → **すべて git 追跡**。`src/lib/public-config.ts` に dev/prod 分岐で集約（ビルド時 tree-shake）。

| 種類 | 例 | 場所 | git |
|---|---|---|---|
| 実 secret | `DATABASE_URL` `CLERK_SECRET_KEY` | **Bitwarden Secrets Manager**（data-drills と共有の `shibaleo-{dev,prod}-secrets`。token の `--project-id` で切替）+ prod runtime は CF Worker Secret / Hyperdrive | — |
| bootstrap token | `BWS_ACCESS_TOKEN` | `.env.local` | ignore |
| **非機密 config** | `clerkPublishableKey`（pk_test/pk_live） | **`src/lib/public-config.ts`**（dev/prod 分岐・`import.meta.env.PROD` で選択） | **commit** |

**`.env*` は全て gitignore。`.mcp.json` / `.dev.vars` も同様（実トークンを含む）。**

## bws（data-drills と共有）

- dev project: `shibaleo-dev-secrets` = `6eece948-709c-4a86-8923-b48e017573b9`
- prod project: `shibaleo-prod-secrets` = `16c74c07-0fb8-468a-8606-b48e01757644`
- token 1 本（`.env.local` の `BWS_ACCESS_TOKEN`）で、`--project-id` で dev/prod を切替。
- **data-meals は Clerk を data-drills と同一インスタンス共有**しているため、`DATABASE_URL`
  （共有 Neon hub、schema は client 側 `search_path=data_meals` で分離）と `CLERK_SECRET_KEY`
  が drills と同一値になる。よって **meals 専用の bws secret / Neon ブランチは不要**、
  drills の dev/prod-secrets をそのまま流用する。

## 注入の仕組み

`package.json` の dev / db スクリプト:

```
dotenv -e .env.local -- bws run --project-id <dev-project-id> -- <cmd>
```

1. `dotenv-cli` が `.env.local` を process.env に load（`BWS_ACCESS_TOKEN`）
2. `bws run` が Bitwarden Secrets Manager から実 secret を注入
3. その環境で本来のコマンド（vite / drizzle-kit）を実行

`pnpm build`（prod）は Vite + esbuild が `import.meta.env.PROD` を焼くだけで、secret は build に不要。

## インフラ

- **Neon**: data-drills-cf と同一 Neon hub。prod は Hyperdrive `10aa89de790d4ad8b16c0d24b023c365`
  経由（runtime で `DATABASE_URL` を上書き）。dev は bws dev-secrets の `DATABASE_URL`
  = Neon development ブランチ。schema 分離は `src/lib/db/index.ts` の `search_path: "data_meals,public"`。
- **Clerk**: data-drills-cf と同一インスタンス。dev=humble-grub-88 の pk_test/sk_test、
  prod=shibaleo.uk の pk_live/sk_live。pk は `public-config.ts`、sk は bws / Worker Secret。
- **prod Worker Secret**: `wrangler secret put CLERK_SECRET_KEY`（sk_live）。

## 運用トークン hub（`shibaleo-secrets-hub`）

外部サービスの API トークン（app runtime secret ではなく **CI/CLI の運用トークン**）を per-service で集約。
`bws run --project-id b49ccb02-f02b-4c7e-a4c1-b48e005732fc` で env に載る。

| key | 用途 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | wrangler deploy / secret put（`wrangler login` 不要にする） |
| `NEON_API_KEY` | Neon API/CLI |
| `RENDER_API_KEY` | Render API |
| `VERCEL_TOKEN` | Vercel CLI |
| `GITHUB_PAT` | GitHub / gh CLI |

いずれもフルアクセストークン（ダッシュボード発行）。`.mcp.json` にもローカル用のコピーがあるが、
CI/CLI からはこの hub を SSOT として使う。`BWS_ACCESS_TOKEN` だけは bootstrap なので hub に入れない（`.env.local`）。

**分類の原則**: hub = **ops/deploy token**（ツールがインフラ操作に使う・アプリは読まない・アカウント級で dev/prod 共通）。
dev/prod-secrets = **app runtime secret**（稼働アプリが process.env から読む・環境ごとに値が違う）。
CF/Neon/GitHub 等の API トークンは前者なので hub。`CLERK_SECRET_KEY`/`DATABASE_URL` は後者。**混ぜない**
（ops token を prod-secrets に入れ始めると分離が崩れる）。

> Bitwarden 無料枠は 3 project。ops(hub)/dev/prod で満杯。別 Clerk・別 DB を持つ新アプリを足す場合は
> 4つ目を作れないので、dev/prod 内で app-prefix key（`MEALS_CLERK_SECRET_KEY` 等）で同居させる。

## prod デプロイ（cutover）— 非対話

prod は Worker `data-meals-cf`（カスタムドメイン `meals.shibaleo.uk`、同一ルート shibaleo.uk なので
live Clerk `clerk.shibaleo.uk` を satellite 設定なしで共有）。deploy は `wrangler deploy`。
CF 認証は hub の `CLOUDFLARE_API_TOKEN` を bws 注入するので **`wrangler login` 不要**（MCP では secret 投入 / deploy 不可）。

```bash
pnpm secrets:prod   # scripts/set-cf-secrets.mjs: prod-secrets から app secret を read し
                    # bws run(hub) -- wrangler secret put で Worker に set。値は出力されない
pnpm deploy         # = pnpm build && bws run(hub) -- wrangler deploy
# 検証: https://meals.shibaleo.uk で Clerk ログイン + CRUD (書き込みは production ブランチへ)
```

- `bws run` はネスト不可（machine token が全 project を走査し同名 key 衝突）。よって `secrets:prod` は
  スクリプト自身が bws を **per-project で単一注入**する: app secret は prod-secrets から read、
  wrangler の CF 認証は hub から注入、値は stdin で wrangler へ渡す（storage は混ぜない）。
- Worker が runtime に読む secret（現状 `CLERK_SECRET_KEY`）だけ push。`DATABASE_URL` は Hyperdrive 供給、
  pk は bundle 焼き込みなので対象外。追加時は `scripts/set-cf-secrets.mjs` の `KEYS` に足す。
- `DRY_RUN=1 pnpm secrets:prod` で wrangler を呼ばず値解決だけ確認できる。
- この構成はそのまま CI（`BWS_ACCESS_TOKEN` 1本 → 注入 → secrets/deploy）に流用できる。

## secret / config を足す時の判断

- **外部から貰う credential・漏れたら困るもの** → bws
- **クライアントに配布される公開値**（publishable key 等）→ `src/lib/public-config.ts` に commit
