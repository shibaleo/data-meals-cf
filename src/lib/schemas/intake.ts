import { z } from "zod";
import { mealKindSchema } from "./common";

const numericString = z.union([z.number(), z.string()]).transform((v) => String(v));

export const intakeItemSchema = z.object({
  meal_id: z.string().uuid(),
  coef: numericString.default("1"),
  sort_order: z.number().int().default(0),
});

export const intakeCreateSchema = z.object({
  eaten_at: z.string().datetime(),
  meal_kind: mealKindSchema,
  notes: z.string().nullable().optional(),
  items: z.array(intakeItemSchema).default([]),
});

export const intakeUpdateSchema = intakeCreateSchema.partial();
