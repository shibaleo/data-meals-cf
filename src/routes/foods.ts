import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { food, nutrient } from "@/lib/db/schema";
import { foodCreateSchema, foodUpdateSchema } from "@/lib/schemas/food";
import { uuidParam } from "@/lib/schemas/common";

const rowSelect = {
  id: food.id,
  name: food.name,
  brand: food.brand,
  defaultServingG: food.defaultServingG,
  servingBasis: food.servingBasis,
  notes: food.notes,
  kcalPer100g: nutrient.kcalPer100g,
  proteinGPer100g: nutrient.proteinGPer100g,
  fatGPer100g: nutrient.fatGPer100g,
  carbGPer100g: nutrient.carbGPer100g,
  vitaminJson: nutrient.vitaminJson,
  mineralJson: nutrient.mineralJson,
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

const app = new Hono()
  .get("/", async (c) => {
    const rows = await db
      .select(rowSelect)
      .from(food)
      .leftJoin(nutrient, eq(nutrient.foodId, food.id))
      .orderBy(asc(food.name));
    return c.json({ data: rows });
  })
  .post("/", zValidator("json", foodCreateSchema), async (c) => {
    const body = c.req.valid("json");
    const [created] = await db.insert(food).values({
      name: body.name,
      brand: body.brand ?? null,
      sourceLabelUrl: body.source_label_url ?? null,
      defaultServingG: body.default_serving_g ?? null,
      servingBasis: body.serving_basis ?? "g",
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
    if (body.default_serving_g !== undefined) foodPatch.defaultServingG = body.default_serving_g;
    if (body.serving_basis !== undefined) foodPatch.servingBasis = body.serving_basis;
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
    const { id } = c.req.valid("param");
    await db.delete(food).where(eq(food.id, id));
    return c.json({ data: { id } });
  });

export default app;
