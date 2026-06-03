import { z } from "zod";

const numericString = z.union([z.number(), z.string()]).transform((v) => String(v));

export const foodCreateSchema = z.object({
  name: z.string().min(1),
  brand: z.string().nullable().optional(),
  source_label_url: z.string().url().nullable().optional(),
  default_serving_g: numericString.nullable().optional(),
  serving_basis: z.enum(["g", "ml"]).optional(),
  notes: z.string().nullable().optional(),
  // nutrient (1:1, optional — defaults to 0 in DB)
  kcal_per_100g: numericString.optional(),
  protein_g_per_100g: numericString.optional(),
  fat_g_per_100g: numericString.optional(),
  carb_g_per_100g: numericString.optional(),
  // free-form key → amount per 100g (e.g. { "vitamin_c_mg": 30 })
  vitamin_json: z.record(z.string(), z.number()).optional(),
  mineral_json: z.record(z.string(), z.number()).optional(),
});

export const foodUpdateSchema = foodCreateSchema.partial();
