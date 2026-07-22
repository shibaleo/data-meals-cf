/**
 * 公開 (非機密) config の単一ソース。dev/prod を分岐し、git 追跡する。
 *
 * 方針 (2026-07-22 確定): 「secret は注入 / 非 secret はすべて git 追跡 / 曖昧な第3を作らない」。
 * ここに置くのは **公開値のみ** — client bundle に焼かれても・リポジトリに commit されても
 * 問題ない値 (publishable key / 公開 URL 等)。
 * **実 secret (CLERK_SECRET_KEY / DATABASE_URL 等) は絶対に置かない**。それらは
 * process.env 経由で注入する (ローカル=bws、prod=CF Worker Secret / Hyperdrive)。詳細は SECRETS.md。
 *
 * dev/prod の選択は `import.meta.env.PROD` (ビルド時定数)。未使用ブランチは tree-shake され、
 * 各 bundle には該当環境の値だけが残る。
 * - client bundle: Vite が置換
 * - worker bundle: esbuild の define (scripts/build-worker.mjs) が置換
 * - dev worker: Vite dev server の ssrLoadModule が解決 (import.meta.env.PROD=false)
 *
 * Clerk は data-drills-cf と同一インスタンスを共有している (dev=humble-grub-88 の
 * pk_test / prod=shibaleo.uk の pk_live)。pk は公開値なのでここに、sk は bws / Worker Secret に。
 */

interface PublicConfig {
  /** Clerk Publishable Key (公開)。frontend の ClerkProvider + server の JWKS domain 推定に使う。 */
  clerkPublishableKey: string;
}

const dev: PublicConfig = {
  clerkPublishableKey: "pk_test_aHVtYmxlLWdydWItODguY2xlcmsuYWNjb3VudHMuZGV2JA",
};

const prod: PublicConfig = {
  clerkPublishableKey: "pk_live_Y2xlcmsuc2hpYmFsZW8udWsk",
};

export const publicConfig: PublicConfig = import.meta.env.PROD ? prod : dev;
