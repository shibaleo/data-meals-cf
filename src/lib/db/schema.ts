import {
  pgSchema,
  uuid,
  text,
  integer,
  timestamp,
  numeric,
  jsonb,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const ds = pgSchema("data_meals");
const pgTable = ds.table.bind(ds);

const id = () => uuid("id").primaryKey().defaultRandom();
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const food = pgTable("food", {
  id: id(),
  name: text("name").notNull(),
  brand: text("brand"),
  sourceLabelUrl: text("source_label_url"),
  defaultServingG: numeric("default_serving_g", { precision: 7, scale: 2 }),
  notes: text("notes"),
  ...timestamps(),
}, (t) => [
  index("food_name_idx").on(t.name),
]);

export const nutrient = pgTable("nutrient", {
  id: id(),
  foodId: uuid("food_id").notNull().unique().references(() => food.id, { onDelete: "cascade" }),
  kcalPer100g: numeric("kcal_per_100g", { precision: 7, scale: 2 }).notNull().default("0"),
  proteinGPer100g: numeric("protein_g_per_100g", { precision: 7, scale: 2 }).notNull().default("0"),
  fatGPer100g: numeric("fat_g_per_100g", { precision: 7, scale: 2 }).notNull().default("0"),
  carbGPer100g: numeric("carb_g_per_100g", { precision: 7, scale: 2 }).notNull().default("0"),
  vitaminJson: jsonb("vitamin_json").notNull().default(sql`'{}'::jsonb`),
  mineralJson: jsonb("mineral_json").notNull().default(sql`'{}'::jsonb`),
  ...timestamps(),
});

export const meal = pgTable("meal", {
  id: id(),
  name: text("name").notNull(),
  notes: text("notes"),
  ...timestamps(),
}, (t) => [
  index("meal_name_idx").on(t.name),
]);

export const mealFood = pgTable("meal_food", {
  id: id(),
  mealId: uuid("meal_id").notNull().references(() => meal.id, { onDelete: "cascade" }),
  foodId: uuid("food_id").notNull().references(() => food.id, { onDelete: "restrict" }),
  coef: numeric("coef", { precision: 6, scale: 4 }).notNull().default("1"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("meal_food_meal_food_key").on(t.mealId, t.foodId),
  index("meal_food_meal_idx").on(t.mealId),
  index("meal_food_food_idx").on(t.foodId),
  check("meal_food_coef_check", sql`${t.coef} >= 0`),
]);

export const intake = pgTable("intake", {
  id: id(),
  eatenAt: timestamp("eaten_at", { withTimezone: true }).notNull(),
  mealKind: text("meal_kind").notNull(),
  notes: text("notes"),
  ...timestamps(),
}, (t) => [
  index("intake_eaten_at_idx").on(t.eatenAt),
  check("intake_meal_kind_check", sql`${t.mealKind} IN ('breakfast','lunch','dinner','snack')`),
]);

export const intakeMeal = pgTable("intake_meal", {
  id: id(),
  intakeId: uuid("intake_id").notNull().references(() => intake.id, { onDelete: "cascade" }),
  mealId: uuid("meal_id").notNull().references(() => meal.id, { onDelete: "restrict" }),
  coef: numeric("coef", { precision: 6, scale: 4 }).notNull().default("1"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("intake_meal_intake_idx").on(t.intakeId),
  index("intake_meal_meal_idx").on(t.mealId),
  check("intake_meal_coef_check", sql`${t.coef} >= 0`),
]);
