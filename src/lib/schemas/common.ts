import { z } from "zod";

export const uuidParam = z.object({ id: z.string().uuid() });

export const mealKindSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);
