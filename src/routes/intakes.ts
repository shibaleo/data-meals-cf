import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { intake, intakeMeal } from "@/lib/db/schema";
import { intakeCreateSchema, intakeUpdateSchema } from "@/lib/schemas/intake";
import { uuidParam } from "@/lib/schemas/common";

const app = new Hono()
  .get("/", async (c) => {
    const rows = await db.select().from(intake).orderBy(desc(intake.eatenAt)).limit(200);
    if (rows.length === 0) return c.json({ data: [] });
    const items = await db.select().from(intakeMeal)
      .where(inArray(intakeMeal.intakeId, rows.map((r) => r.id)));
    const byIntake = new Map<string, typeof items>();
    for (const it of items) {
      const arr = byIntake.get(it.intakeId) ?? [];
      arr.push(it);
      byIntake.set(it.intakeId, arr);
    }
    return c.json({ data: rows.map((r) => ({ ...r, items: byIntake.get(r.id) ?? [] })) });
  })
  .post("/", zValidator("json", intakeCreateSchema), async (c) => {
    const body = c.req.valid("json");
    const [created] = await db.insert(intake).values({
      eatenAt: new Date(body.eaten_at),
      mealKind: body.meal_kind,
      notes: body.notes ?? null,
    }).returning();
    if (body.items.length > 0) {
      await db.insert(intakeMeal).values(body.items.map((it) => ({
        intakeId: created.id,
        mealId: it.meal_id,
        coef: it.coef,
        sortOrder: it.sort_order,
      })));
    }
    return c.json({ data: created });
  })
  .put("/:id", zValidator("param", uuidParam), zValidator("json", intakeUpdateSchema), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.eaten_at !== undefined) patch.eatenAt = new Date(body.eaten_at);
    if (body.meal_kind !== undefined) patch.mealKind = body.meal_kind;
    if (body.notes !== undefined) patch.notes = body.notes;
    await db.update(intake).set(patch).where(eq(intake.id, id));
    if (body.items !== undefined) {
      await db.delete(intakeMeal).where(eq(intakeMeal.intakeId, id));
      if (body.items.length > 0) {
        await db.insert(intakeMeal).values(body.items.map((it) => ({
          intakeId: id,
          mealId: it.meal_id,
          coef: it.coef,
          sortOrder: it.sort_order,
        })));
      }
    }
    return c.json({ data: { id } });
  })
  .delete("/:id", zValidator("param", uuidParam), async (c) => {
    const { id } = c.req.valid("param");
    await db.delete(intake).where(eq(intake.id, id));
    return c.json({ data: { id } });
  });

export default app;
