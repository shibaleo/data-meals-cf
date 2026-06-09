import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, asc, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { meal, mealFood, food } from "@/lib/db/schema";
import { mealCreateSchema, mealUpdateSchema } from "@/lib/schemas/meal";
import { uuidParam } from "@/lib/schemas/common";

const listQuery = z.object({
  include_archived: z.enum(["0", "1"]).optional(),
});

async function fetchExpandedMeal(id: string) {
  const rows = await db.select().from(meal).where(eq(meal.id, id)).limit(1);
  if (rows.length === 0) return null;
  const items = await db
    .select({
      id: mealFood.id,
      mealId: mealFood.mealId,
      foodId: mealFood.foodId,
      coef: mealFood.coef,
      sortOrder: mealFood.sortOrder,
      createdAt: mealFood.createdAt,
      foodName: food.name,
      foodBrand: food.brand,
      foodArchivedAt: food.archivedAt,
    })
    .from(mealFood)
    .leftJoin(food, eq(food.id, mealFood.foodId))
    .where(eq(mealFood.mealId, id))
    .orderBy(asc(mealFood.sortOrder));
  return { ...rows[0], items };
}

const app = new Hono()
  .get("/", zValidator("query", listQuery), async (c) => {
    const { include_archived } = c.req.valid("query");
    const includeArchived = include_archived === "1";
    const baseSelect = db.select().from(meal);
    const meals = includeArchived
      ? await baseSelect.orderBy(asc(meal.name))
      : await baseSelect.where(isNull(meal.archivedAt)).orderBy(asc(meal.name));
    if (meals.length === 0) return c.json({ data: [] });
    // LEFT JOIN food so the row carries the food name even when the food has
    // been archived (active food query filters them out — historic references
    // would otherwise render as "(unknown)").
    const items = await db
      .select({
        id: mealFood.id,
        mealId: mealFood.mealId,
        foodId: mealFood.foodId,
        coef: mealFood.coef,
        sortOrder: mealFood.sortOrder,
        createdAt: mealFood.createdAt,
        foodName: food.name,
        foodBrand: food.brand,
        foodArchivedAt: food.archivedAt,
      })
      .from(mealFood)
      .leftJoin(food, eq(food.id, mealFood.foodId))
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
    const row = await fetchExpandedMeal(created.id);
    return c.json({ data: row ?? created });
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
    const row = await fetchExpandedMeal(id);
    return c.json({ data: row ?? { id } });
  })
  .delete("/:id", zValidator("param", uuidParam), async (c) => {
    // Soft delete (see foods.ts for rationale).
    const { id } = c.req.valid("param");
    await db.update(meal).set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(meal.id, id));
    return c.json({ data: { id } });
  })
  .post("/:id/restore", zValidator("param", uuidParam), async (c) => {
    const { id } = c.req.valid("param");
    await db.update(meal).set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(meal.id, id));
    return c.json({ data: { id } });
  });

export default app;
