import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { meal, mealFood } from "@/lib/db/schema";
import { mealCreateSchema, mealUpdateSchema } from "@/lib/schemas/meal";
import { uuidParam } from "@/lib/schemas/common";

const app = new Hono()
  .get("/", async (c) => {
    const meals = await db.select().from(meal).orderBy(asc(meal.name));
    if (meals.length === 0) return c.json({ data: [] });
    const items = await db.select().from(mealFood)
      .where(inArray(mealFood.mealId, meals.map((m) => m.id)))
      .orderBy(asc(mealFood.sortOrder));
    const byMeal = new Map<string, typeof items>();
    for (const it of items) {
      const arr = byMeal.get(it.mealId) ?? [];
      arr.push(it);
      byMeal.set(it.mealId, arr);
    }
    return c.json({ data: meals.map((m) => ({ ...m, items: byMeal.get(m.id) ?? [] })) });
  })
  .post("/", zValidator("json", mealCreateSchema), async (c) => {
    const body = c.req.valid("json");
    const [created] = await db.insert(meal).values({
      name: body.name,
      notes: body.notes ?? null,
    }).returning();
    if (body.items.length > 0) {
      await db.insert(mealFood).values(body.items.map((it) => ({
        mealId: created.id,
        foodId: it.food_id,
        coef: it.coef,
        sortOrder: it.sort_order,
      })));
    }
    return c.json({ data: created });
  })
  .put("/:id", zValidator("param", uuidParam), zValidator("json", mealUpdateSchema), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.notes !== undefined) patch.notes = body.notes;
    await db.update(meal).set(patch).where(eq(meal.id, id));
    if (body.items !== undefined) {
      await db.delete(mealFood).where(eq(mealFood.mealId, id));
      if (body.items.length > 0) {
        await db.insert(mealFood).values(body.items.map((it) => ({
          mealId: id,
          foodId: it.food_id,
          coef: it.coef,
          sortOrder: it.sort_order,
        })));
      }
    }
    return c.json({ data: { id } });
  })
  .delete("/:id", zValidator("param", uuidParam), async (c) => {
    const { id } = c.req.valid("param");
    await db.delete(meal).where(eq(meal.id, id));
    return c.json({ data: { id } });
  });

export default app;
