import { z } from "zod";

const numericString = z.union([z.number(), z.string()]).transform((v) => String(v));

export const mealItemSchema = z.object({
  food_id: z.string().uuid(),
  coef: numericString.default("1"),
  sort_order: z.number().int().default(0),
});

export const mealCreateSchema = z.object({
  name: z.string().min(1),
  notes: z.string().nullable().optional(),
  items: z.array(mealItemSchema).default([]),
});

export const mealUpdateSchema = mealCreateSchema.partial();
