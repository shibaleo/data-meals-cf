import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";

/**
 * Analytics endpoints — consumer-facing. They read from v_intake_food, which
 * already encapsulates the (intake_coef × meal_food_coef × label_basis × PFC/100)
 * multiplication and exposes the JST calendar date. Adding new aggregations here
 * should not require touching the underlying tables.
 */

const dateRangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  meal_kind: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

interface IntakeExpandedFood {
  food_id: string;
  food_name: string;
  brand: string | null;
  amount: { value: number; unit: string };
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  vitamins: Record<string, number>;
  minerals: Record<string, number>;
}

interface IntakeExpandedMeal {
  meal_id: string;
  meal_name: string;
  coef: number;
  foods: IntakeExpandedFood[];
}

interface IntakeExpanded {
  id: string;
  eaten_at: string;
  intake_date_jst: string;
  meal_kind: string;
  notes: string | null;
  totals: {
    kcal: number;
    protein_g: number;
    fat_g: number;
    carb_g: number;
    vitamins: Record<string, number>;
    minerals: Record<string, number>;
  };
  meals: IntakeExpandedMeal[];
}

interface ViewRow {
  intake_id: string;
  eaten_at: string;
  intake_date_jst: string;
  meal_kind: string;
  intake_notes: string | null;
  meal_id: string;
  meal_name: string;
  food_id: string;
  food_name: string;
  brand: string | null;
  serving_basis: string;
  label_basis_amount: string;
  intake_coef: string;
  meal_food_coef: string;
  amount_in_basis: string;
  kcal: string;
  protein_g: string;
  fat_g: string;
  carb_g: string;
  vitamin_json: Record<string, number> | null;
  mineral_json: Record<string, number> | null;
}

function scaleJson(j: Record<string, number> | null, factor: number): Record<string, number> {
  if (!j) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(j)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n * factor;
  }
  return out;
}

function mergeJson(a: Record<string, number>, b: Record<string, number>) {
  for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v;
}

const app = new Hono()
  /**
   * GET /intakes/expanded — one node per intake, fully joined down to per-food
   * absolute consumption. Use this whenever you'd otherwise re-derive the
   * coef×coef×basis multiplication client-side.
   */
  .get("/intakes/expanded", zValidator("query", dateRangeQuery), async (c) => {
    const { from, to, meal_kind, limit } = c.req.valid("query");
    const conds: string[] = [];
    if (from) conds.push(`intake_date_jst >= '${from}'`);
    if (to) conds.push(`intake_date_jst <= '${to}'`);
    if (meal_kind) conds.push(`meal_kind = '${meal_kind}'`);
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const lim = limit ?? 500;
    const rows = (await db.execute(sql.raw(
      `SELECT * FROM data_meals.v_intake_food ${where}
       ORDER BY eaten_at DESC, meal_id, food_id
       LIMIT ${lim}`,
    ))) as unknown as ViewRow[];

    // Group into intake -> meal -> food, sum totals.
    const intakeMap = new Map<string, IntakeExpanded>();
    for (const r of rows) {
      const amountInBasis = Number(r.amount_in_basis);
      const factor = amountInBasis / 100;
      const vit = scaleJson(r.vitamin_json, factor);
      const min = scaleJson(r.mineral_json, factor);
      const food: IntakeExpandedFood = {
        food_id: r.food_id,
        food_name: r.food_name,
        brand: r.brand,
        amount: { value: amountInBasis, unit: r.serving_basis },
        kcal: Number(r.kcal),
        protein_g: Number(r.protein_g),
        fat_g: Number(r.fat_g),
        carb_g: Number(r.carb_g),
        vitamins: vit,
        minerals: min,
      };
      let intake = intakeMap.get(r.intake_id);
      if (!intake) {
        intake = {
          id: r.intake_id,
          eaten_at: typeof r.eaten_at === "string" ? r.eaten_at : new Date(r.eaten_at).toISOString(),
          intake_date_jst: typeof r.intake_date_jst === "string" ? r.intake_date_jst : new Date(r.intake_date_jst).toISOString().slice(0, 10),
          meal_kind: r.meal_kind,
          notes: r.intake_notes,
          totals: { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0, vitamins: {}, minerals: {} },
          meals: [],
        };
        intakeMap.set(r.intake_id, intake);
      }
      let meal = intake.meals.find((m) => m.meal_id === r.meal_id);
      if (!meal) {
        meal = {
          meal_id: r.meal_id,
          meal_name: r.meal_name,
          coef: Number(r.intake_coef),
          foods: [],
        };
        intake.meals.push(meal);
      }
      meal.foods.push(food);
      intake.totals.kcal += food.kcal;
      intake.totals.protein_g += food.protein_g;
      intake.totals.fat_g += food.fat_g;
      intake.totals.carb_g += food.carb_g;
      mergeJson(intake.totals.vitamins, vit);
      mergeJson(intake.totals.minerals, min);
    }
    return c.json({ data: Array.from(intakeMap.values()) });
  })

  /**
   * GET /analytics/daily — per-day PFC + micro rollup. Useful for the
   * Throughput page and any "how was last week?" query.
   */
  .get("/daily", zValidator("query", dateRangeQuery), async (c) => {
    const { from, to, meal_kind } = c.req.valid("query");
    const conds: string[] = [];
    if (from) conds.push(`intake_date_jst >= '${from}'`);
    if (to) conds.push(`intake_date_jst <= '${to}'`);
    if (meal_kind) conds.push(`meal_kind = '${meal_kind}'`);
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const rows = (await db.execute(sql.raw(
      `SELECT
         intake_date_jst::text AS date_jst,
         SUM(kcal)::numeric      AS kcal,
         SUM(protein_g)::numeric AS protein_g,
         SUM(fat_g)::numeric     AS fat_g,
         SUM(carb_g)::numeric    AS carb_g
       FROM data_meals.v_intake_food
       ${where}
       GROUP BY intake_date_jst
       ORDER BY intake_date_jst`,
    ))) as unknown as Array<{
      date_jst: string;
      kcal: string;
      protein_g: string;
      fat_g: string;
      carb_g: string;
    }>;
    return c.json({
      data: rows.map((r) => ({
        date_jst: r.date_jst,
        kcal: Number(r.kcal),
        protein_g: Number(r.protein_g),
        fat_g: Number(r.fat_g),
        carb_g: Number(r.carb_g),
      })),
    });
  });

export default app;
