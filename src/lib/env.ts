/**
 * Secret 専用の集中アクセスポイント。**非機密 config は src/lib/public-config.ts** に置く。
 * ここは注入される実 secret の getter のみ (ローカル=bws、prod=CF Worker Secret / Hyperdrive)。
 *
 * CF Workers では process.env はリクエスト毎にバインディングから注入される。
 * モジュールロード時の早期 throw を避け、各 getter で参照する。
 */
export const env = {
  /** Neon PostgreSQL (data_meals schema) の OLTP 接続文字列。Drizzle / postgres-js が読む。 */
  get DATABASE_URL(): string {
    const v = process.env.DATABASE_URL;
    if (!v) throw new Error("DATABASE_URL is not set");
    return v;
  },
  /** Clerk Secret Key (server 用)。ユーザー email lookup に使う。 */
  get CLERK_SECRET_KEY(): string | undefined {
    return process.env.CLERK_SECRET_KEY;
  },
};
