import {
  pgSchema,
  uuid,
  text,
  integer,
  timestamp,
  numeric,
  jsonb,
  date,
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

// =============================================================================
// User
// =============================================================================

export const appUser = pgTable("app_user", {
  id: id(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  externalId: text("external_id"),
  ...timestamps(),
}, (t) => [
  uniqueIndex("app_user_email_key").on(t.email),
  index("app_user_external_id_idx").on(t.externalId),
]);

export const food = pgTable("food", {
  id: id(),
  name: text("name").notNull(),
  brand: text("brand"),
  sourceLabelUrl: text("source_label_url"),
  servingBasis: text("serving_basis").notNull().default("g"),
  labelBasisAmount: numeric("label_basis_amount", { precision: 7, scale: 2 }).notNull().default("100"),
  notes: text("notes"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps(),
}, (t) => [
  index("food_name_idx").on(t.name),
  check("food_serving_basis_check", sql`${t.servingBasis} IN ('g','ml')`),
  check("food_label_basis_check", sql`${t.labelBasisAmount} > 0`),
]);

export const nutrient = pgTable("nutrient", {
  id: id(),
  foodId: uuid("food_id").notNull().unique().references(() => food.id, { onDelete: "cascade" }),
  kcalPer100g: numeric("kcal_per_100g", { precision: 12, scale: 6 }).notNull().default("0"),
  proteinGPer100g: numeric("protein_g_per_100g", { precision: 12, scale: 6 }).notNull().default("0"),
  fatGPer100g: numeric("fat_g_per_100g", { precision: 12, scale: 6 }).notNull().default("0"),
  carbGPer100g: numeric("carb_g_per_100g", { precision: 12, scale: 6 }).notNull().default("0"),
  vitaminJson: jsonb("vitamin_json").notNull().default(sql`'{}'::jsonb`),
  mineralJson: jsonb("mineral_json").notNull().default(sql`'{}'::jsonb`),
  ...timestamps(),
});

export const meal = pgTable("meal", {
  id: id(),
  name: text("name").notNull(),
  notes: text("notes"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
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
  // Generated stored column — JST calendar date of eaten_at. Used by
  // v_intake_food and any analytical query that wants a daily rollup.
  // Drizzle doesn't insert/update generated columns, so this field is
  // read-only at the ORM level.
  intakeDateJst: date("intake_date_jst").notNull(),
  mealKind: text("meal_kind").notNull(),
  notes: text("notes"),
  ...timestamps(),
}, (t) => [
  index("intake_eaten_at_idx").on(t.eatenAt),
  index("intake_date_jst_idx").on(t.intakeDateJst),
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
