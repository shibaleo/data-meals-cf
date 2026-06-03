# data-meals-cf — 実装計画書

## 1. 目的

食事の摂取タイミングと PFC (Protein / Fat / Carbohydrate) を日次で記録・可視化し、**生活全体の throughput を最適化するための判断材料**とする。

### 上位目的との接続

- 直近の North Star は「**Drift (浪費時間) を減らす**」
- 仮説: 食事 (時刻 / 量 / PFC バランス) が午後〜夜のエネルギー残量を決め、それが Drift 量を決める
- 検証のためには PFC trend と摂取タイミングを daily で取り続ける必要がある
- 将来的に Toggl (時間使用) / Fitbit (睡眠) / Tanita (体組成) と join して、life-orchestrator の判断材料に統合する

### 設計思想

- **食品マスタは自前で育てる**。文科省 食品成分表などの外部 DB は依存しない
  - 自分が食べる食品 = 100 品目以下に収束する想定。汎用 DB はノイズが多く検索コストが高い
  - 加工食品は栄養表示を転記、生鮮は最初の 1 回だけ手入力
  - 外部 DB を取り込むと「更新追従」「ライセンス表記」のメンテ責務が発生し、続かない原因になる
- **責務を分離する**: data-meals は「食事の記録と可視化」だけ。Drift 削減や行動誘導は別レイヤー (将来の life-orchestrator) に任せる
- **習慣化の律速は目的の明確さ** — 入力 UX を凝るより、何のために集めているかが常に見える状態を維持する

## 2. スコープ

### やること

- 食品マスタ (food) の登録・編集
- 食事 (meal) の記録 (時刻 + 食品 + 量)
- PFC trend / 摂取タイミングの可視化
- Toggl などと join するための data warehouse 連携 (read-only export)

### やらないこと

- 行動誘導 / orchestration ("夜は drift より勉強しろ" 的な提案) — life-orchestrator の責務
- ビタミン / ミネラルなど PFC 以外の微量栄養素 (初期は対象外、必要になったら追加)
- レシピ管理 / 買い物リスト
- 体重・体組成データの取り込み (既に Tanita → warehouse で取得済)
- カロリー目標の達成度ゲーミフィケーション (動機が「目的の明確さ」であって「ゲーム性」ではない)

## 3. アーキテクチャ

data-drills-cf を踏襲する。理由は wireframe / ロジック / インフラ構成の流用で実装コストが激減するため。

```
CF Pages (React + Vite SPA, TanStack Router)
  └─ CF Worker (Hono API)
       ├─ Neon PostgreSQL (data_meals schema)
       └─ Clerk (認証)
```

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TanStack Router, Tailwind v4 |
| UI | Radix UI, Recharts, Sonner |
| Server state | TanStack Query |
| Forms | React Hook Form + zodResolver |
| API | Hono on CF Workers + RPC client |
| ORM | Drizzle |
| DB | Neon PostgreSQL (`data_meals` schema) |
| Auth | Clerk |

`data-drills-cf` から流用するもの:
- ページレイアウト / サイドバー / scope 概念
- backlog / throughput / review の Tetris 風可視化コンポーネント
- API クライアント (`rpc-client.ts`)、フォーム規約、zod スキーマ規約
- CF Workers + Pages のデプロイ設定

新規実装するのは **データ入力 UI と DB スキーマだけ**。

## 4. データモデル (初期案)

```
food
  id, name, brand, source_label_url,
  protein_g_per_100g, fat_g_per_100g, carb_g_per_100g, kcal_per_100g,
  default_serving_g, notes, created_at, updated_at

meal
  id, eaten_at (timestamptz), meal_kind ('breakfast'|'lunch'|'dinner'|'snack'),
  notes, created_at, updated_at

meal_item
  id, meal_id (FK), food_id (FK), amount_g, created_at
```

将来拡張:
- `meal_template` — 「いつもの朝食」セットの再入力ショートカット用 (flat で痛みが出たら導入)
- `food_alias` — 同一食品の別名検索用
- `nutrient` を別テーブル化 (微量栄養素を追加する時)

最初は **flat (meal = 食品の集合)** で始めて、必要が出てから階層化する。

## 5. 機能 (data-drills の概念を流用)

### 5.1 Food マスタ管理 (新規)

- 食品の CRUD
- 栄養表示の数値入力 UI (100g あたり / 1食あたり / 1個あたり の単位切替)
- 検索 / 並び替え (頻度順 / 直近使用順)

### 5.2 Meal 記録 (新規)

- meal を新規作成 (時刻 + meal_kind + 複数の food をぶら下げる)
- **直近食べたものから 1 タップ再登録** (再入力率を上げる肝)
- 朝のバイタル測定と同じ「朝に昨日 1 日分まとめて入力」運用も可能な UI 設計

### 5.3 PFC Throughput (data-drills の throughput を流用)

- 日次の PFC 摂取量を Tetris で可視化
- 色 = meal_kind (朝食 / 昼食 / 夕食 / 間食) または栄養素
- y 軸 = g (or kcal)、x 軸 = 日付

### 5.4 Timing View (新規概念だが backlog の Tetris を流用)

- 1 日の中での摂取タイミングをタイムライン表示
- Toggl の `Vitals/Ingestion` エントリと並べると整合が取れる

### 5.5 Scope 機能 (data-drills の scope を流用)

- `breakfast_scope`, `dinner_scope` のように meal_kind や期間でフィルタ
- 「平日の夕食だけ見たい」「週末の間食だけ見たい」を 1 つの scope として保存

### 5.6 Warehouse 連携 (read-only export)

- `data_meals` schema を Neon に作成 (data-drills と同じ Neon インスタンスでよい)
- 将来 `data_warehouse` レイヤーから `fct_meals` / `fct_food_intake` として SCD で取り込み

## 6. 段階的実装

### Phase 1 — MVP (記録できる状態にする)

- DB スキーマ (food, meal, meal_item)
- 認証 + RPC + 基本レイアウト (data-drills から雛形コピー)
- food CRUD
- meal CRUD (1 タップ再登録機能込み)

ゴール: **毎日 PFC を記録する習慣が回り始める**。

### Phase 2 — 可視化

- PFC throughput (日次)
- Timing view
- scope 機能

ゴール: **trend が見えて、判断材料になる**。

### Phase 3 — 連携

- warehouse export (fct_meals)
- Toggl `Vitals/Ingestion` との突合
- (将来) life-orchestrator への入力源として整備

ゴール: **生活全体の最適化に組み込まれる**。

## 7. 命名 / リポジトリ規約

- リポジトリ名: `data-meals-cf` (data-drills-cf に倣う)
- DB schema: `data_meals`
- CF Worker 名: `data-meals-cf`
- 並び: `data-drills` (問題演習) / `data-meals` (食事) / `data-warehouse` (統合 DWH)

## 8. 未決事項

- meal_kind の enum 定義 (`snack` を 1 つにするか時間帯別にするか)
- 量入力の単位 (g 固定か、個 / 杯 / 枚 などのユーザー定義単位を許すか)
- 「直近食べたもの」ショートカットの粒度 (food レベル vs meal レベル)
- mobile-first か desktop-first か (朝の入力なら mobile が現実的)
