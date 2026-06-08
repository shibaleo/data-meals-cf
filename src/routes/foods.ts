import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, asc, isNull, and, ilike, or, sql as drizzleSql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { food, nutrient } from "@/lib/db/schema";
import { foodCreateSchema, foodUpdateSchema } from "@/lib/schemas/food";
import { uuidParam } from "@/lib/schemas/common";

const rowSelect = {
  id: food.id,
  name: food.name,
  brand: food.brand,
  servingBasis: food.servingBasis,
  labelBasisAmount: food.labelBasisAmount,
  sourceLabelUrl: food.sourceLabelUrl,
  notes: food.notes,
  kcalPer100g: nutrient.kcalPer100g,
  proteinGPer100g: nutrient.proteinGPer100g,
  fatGPer100g: nutrient.fatGPer100g,
  carbGPer100g: nutrient.carbGPer100g,
  vitaminJson: nutrient.vitaminJson,
  mineralJson: nutrient.mineralJson,
  archivedAt: food.archivedAt,
  createdAt: food.createdAt,
  updatedAt: food.updatedAt,
};

async function fetchRow(id: string) {
  const rows = await db
    .select(rowSelect)
    .from(food)
    .leftJoin(nutrient, eq(nutrient.foodId, food.id))
    .where(eq(food.id, id))
    .limit(1);
  return rows[0] ?? null;
}

const listQuery = z.object({
  include_archived: z.enum(["0", "1"]).optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const app = new Hono()
  .get("/", zValidator("query", listQuery), async (c) => {
    const { include_archived, q, limit, offset } = c.req.valid("query");
    const includeArchived = include_archived === "1";
    const lim = limit ?? 100;
    const off = offset ?? 0;
    const conds = [];
    if (!includeArchived) conds.push(isNull(food.archivedAt));
    if (q && q.trim().length > 0) {
      const needle = `%${q.trim()}%`;
      conds.push(or(ilike(food.name, needle), ilike(food.brand, needle))!);
    }
    const whereExpr = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);
    const rows = await db
      .select(rowSelect)
      .from(food)
      .leftJoin(nutrient, eq(nutrient.foodId, food.id))
      .where(whereExpr)
      .orderBy(asc(food.name))
      .limit(lim)
      .offset(off);
    return c.json({ data: rows, limit: lim, offset: off });
  })
  .get("/nutrient-keys", async (c) => {
    const rows = (await db.execute(drizzleSql`
      SELECT
        (SELECT array_agg(DISTINCT k ORDER BY k) FROM data_meals.nutrient,
          jsonb_object_keys(vitamin_json) AS k) AS vitamins,
        (SELECT array_agg(DISTINCT k ORDER BY k) FROM data_meals.nutrient,
          jsonb_object_keys(mineral_json) AS k) AS minerals
    `)) as unknown as Array<{ vitamins: string[] | null; minerals: string[] | null }>;
    const row = rows[0] ?? { vitamins: null, minerals: null };
    return c.json({
      data: {
        vitamins: row.vitamins ?? [],
        minerals: row.minerals ?? [],
      },
    });
  })
  .post("/", zValidator("json", foodCreateSchema), async (c) => {
    const body = c.req.valid("json");
    const [created] = await db.insert(food).values({
      name: body.name,
      brand: body.brand ?? null,
      sourceLabelUrl: body.source_label_url ?? null,
      servingBasis: body.serving_basis ?? "g",
      labelBasisAmount: body.label_basis_amount ?? "100",
      notes: body.notes ?? null,
    }).returning();
    await db.insert(nutrient).values({
      foodId: created.id,
      kcalPer100g: body.kcal_per_100g ?? "0",
      proteinGPer100g: body.protein_g_per_100g ?? "0",
      fatGPer100g: body.fat_g_per_100g ?? "0",
      carbGPer100g: body.carb_g_per_100g ?? "0",
      ...(body.vitamin_json !== undefined ? { vitaminJson: body.vitamin_json } : {}),
      ...(body.mineral_json !== undefined ? { mineralJson: body.mineral_json } : {}),
    });
    const row = await fetchRow(created.id);
    return c.json({ data: row });
  })
  .put("/:id", zValidator("param", uuidParam), zValidator("json", foodUpdateSchema), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const foodPatch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) foodPatch.name = body.name;
    if (body.brand !== undefined) foodPatch.brand = body.brand;
    if (body.source_label_url !== undefined) foodPatch.sourceLabelUrl = body.source_label_url;
    if (body.serving_basis !== undefined) foodPatch.servingBasis = body.serving_basis;
    if (body.label_basis_amount !== undefined) foodPatch.labelBasisAmount = body.label_basis_amount;
    if (body.notes !== undefined) foodPatch.notes = body.notes;
    await db.update(food).set(foodPatch).where(eq(food.id, id));

    const nutPatch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.kcal_per_100g !== undefined) nutPatch.kcalPer100g = body.kcal_per_100g;
    if (body.protein_g_per_100g !== undefined) nutPatch.proteinGPer100g = body.protein_g_per_100g;
    if (body.fat_g_per_100g !== undefined) nutPatch.fatGPer100g = body.fat_g_per_100g;
    if (body.carb_g_per_100g !== undefined) nutPatch.carbGPer100g = body.carb_g_per_100g;
    if (body.vitamin_json !== undefined) nutPatch.vitaminJson = body.vitamin_json;
    if (body.mineral_json !== undefined) nutPatch.mineralJson = body.mineral_json;
    if (Object.keys(nutPatch).length > 1) {
      await db.update(nutrient).set(nutPatch).where(eq(nutrient.foodId, id));
    }
    const row = await fetchRow(id);
    return c.json({ data: row });
  })
  .delete("/:id", zValidator("param", uuidParam), async (c) => {
    // Soft delete — keep the row so historical intakes can still resolve the
    // food name via JOIN. List/selector queries filter archivedAt IS NULL.
    const { id } = c.req.valid("param");
    await db.update(food).set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(food.id, id));
    return c.json({ data: { id } });
  })
  .post("/:id/restore", zValidator("param", uuidParam), async (c) => {
    const { id } = c.req.valid("param");
    await db.update(food).set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(food.id, id));
    return c.json({ data: { id } });
  });

export default app;
