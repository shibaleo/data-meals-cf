import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { appUser } from "@/lib/db/schema";
import { uuidParam } from "@/lib/schemas/common";

const updateSchema = z.object({
  name: z.string().min(1).max(120),
});

const app = new Hono()
  .put("/:id", zValidator("param", uuidParam), zValidator("json", updateSchema), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const [updated] = await db.update(appUser)
      .set({ name: body.name.trim(), updatedAt: new Date() })
      .where(eq(appUser.id, id))
      .returning({ id: appUser.id, name: appUser.name, email: appUser.email });
    if (!updated) return c.json({ error: "User not found" }, 404);
    return c.json({ data: updated });
  });

export default app;
