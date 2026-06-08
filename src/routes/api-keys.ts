import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { apiKey } from "@/lib/db/schema";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

function randomBase64url(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  const bin = Array.from(buf, (b) => String.fromCharCode(b)).join("");
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
});

const app = new Hono<Env>()
  .get("/", async (c) => {
    const userId = c.get("authResult").userId;
    const rows = await db
      .select({
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        isActive: apiKey.isActive,
        lastUsedAt: apiKey.lastUsedAt,
        createdAt: apiKey.createdAt,
      })
      .from(apiKey)
      .where(eq(apiKey.userId, userId))
      .orderBy(desc(apiKey.createdAt));
    return c.json({ data: rows });
  })
  .post("/", zValidator("json", createSchema), async (c) => {
    const userId = c.get("authResult").userId;
    const { name } = c.req.valid("json");
    // 32 bytes random → ~43 char base64url. Prefix "dm_" + first 8 chars
    // becomes the lookup key in auth.ts (`dm_XXXXXXXX`, 11 chars total).
    const raw = randomBase64url(32);
    const full = `dm_${raw}`;
    const keyHash = await bcrypt.hash(raw, 10);
    const keyPrefix = full.slice(0, 11);

    const [row] = await db.insert(apiKey).values({
      userId, name, keyHash, keyPrefix,
    }).returning({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      isActive: apiKey.isActive,
      createdAt: apiKey.createdAt,
    });
    // The full key is returned exactly once.
    return c.json({ data: { ...row, key: full } }, 201);
  })
  .delete("/:id", async (c) => {
    const userId = c.get("authResult").userId;
    const id = c.req.param("id");
    const [row] = await db.update(apiKey).set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(apiKey.id, id), eq(apiKey.userId, userId)))
      .returning({ id: apiKey.id });
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
