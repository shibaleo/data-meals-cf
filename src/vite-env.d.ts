/// <reference types="vite/client" />

// CF Worker runtime — process.env is populated by cf-worker-entry.ts
declare const process: { env: Record<string, string | undefined> };

// 非機密 config は src/lib/public-config.ts (import.meta.env.PROD で dev/prod 分岐)。
// VITE_* のカスタム env 型はもう使わない (Vite 標準の import.meta.env.PROD/DEV/MODE のみ利用)。
