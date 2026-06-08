"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePageTitle } from "@/lib/page-context";
import {
  useMeals, useCreateMeal, useUpdateMeal, useDeleteMeal, useRestoreMeal, type MealRow,
} from "@/hooks/queries/use-meals";
import { useFoods, type FoodRow } from "@/hooks/queries/use-foods";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Combobox } from "@/components/ui/combobox";

interface ItemDraft { food_id: string; coef: string }

function foodUnit(f: FoodRow | undefined) {
  if (!f) return "";
  return `${f.labelBasisAmount ?? "100"}${f.servingBasis ?? "g"}`;
}

function MealDialog({
  meal,
  open,
  onOpenChange,
}: {
  meal: MealRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = meal !== null;
  const createMeal = useCreateMeal();
  const updateMeal = useUpdateMeal();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [initial, setInitial] = useState<{ name: string; notes: string; items: string }>(
    { name: "", notes: "", items: "[]" },
  );
  // Server-side food search driven by the open Combobox. One shared input
  // across all the food rows (only one popover is open at a time).
  const [foodQuery, setFoodQuery] = useState("");
  const [debouncedFoodQuery, setDebouncedFoodQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFoodQuery(foodQuery.trim()), 200);
    return () => clearTimeout(t);
  }, [foodQuery]);
  const { data: foodsResult } = useFoods({ q: debouncedFoodQuery, limit: 100 });
  const foods = foodsResult?.data ?? [];

  // Snapshot of food display info for any food already attached to the meal
  // — these may not be in the current search result. Keyed by food_id.
  const [pickedFoods, setPickedFoods] = useState<Map<string, FoodRow>>(new Map());

  useEffect(() => {
    if (!open) return;
    if (meal) {
      const its: ItemDraft[] = meal.items.map((it) => ({
        food_id: it.foodId,
        coef: String(it.coef ?? "1"),
      }));
      const n = meal.notes ?? "";
      setName(meal.name);
      setNotes(n);
      setItems(its);
      setInitial({ name: meal.name, notes: n, items: JSON.stringify(its) });
      // Seed pickedFoods from the embedded item names so combobox triggers
      // can render the right label without another fetch.
      const seed = new Map<string, FoodRow>();
      for (const it of meal.items) {
        const embed = it as { foodName?: string | null; foodBrand?: string | null; foodArchivedAt?: string | null };
        seed.set(it.foodId, {
          id: it.foodId,
          name: embed.foodName ?? "(unknown)",
          brand: embed.foodBrand ?? null,
          archivedAt: embed.foodArchivedAt ?? null,
        } as unknown as FoodRow);
      }
      setPickedFoods(seed);
    } else {
      setName("");
      setNotes("");
      setItems([]);
      setInitial({ name: "", notes: "", items: "[]" });
      setPickedFoods(new Map());
    }
    setFoodQuery("");
  }, [open, meal]);

  // Merge currently-known picked foods with the latest search result so the
  // combobox can keep rendering the chosen value's label even after the
  // search filters it out.
  const foodOptions = useMemo(() => {
    const map = new Map<string, FoodRow>();
    for (const f of foods) map.set(f.id, f);
    for (const [id, f] of pickedFoods) if (!map.has(id)) map.set(id, f);
    return Array.from(map.values());
  }, [foods, pickedFoods]);
  const foodById = useMemo(() => new Map(foodOptions.map((f) => [f.id, f])), [foodOptions]);

  function rememberFood(id: string) {
    const f = foodById.get(id);
    if (!f) return;
    setPickedFoods((prev) => {
      if (prev.has(id)) return prev;
      const next = new Map(prev);
      next.set(id, f);
      return next;
    });
  }

  const dirty =
    name !== initial.name ||
    notes !== initial.notes ||
    JSON.stringify(items) !== initial.items;

  function addItem() {
    // Empty food_id; user picks via the combobox.
    setItems((prev) => [...prev, { food_id: "", coef: "1" }]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const payload = {
      name: name.trim(),
      notes: notes.trim() || null,
      items: items.map((it, i) => ({
        food_id: it.food_id,
        coef: it.coef,
        sort_order: i,
      })),
    };
    try {
      if (isEdit && meal) {
        await updateMeal.mutateAsync({ id: meal.id, body: payload });
        toast.success("Meal updated");
      } else {
        await createMeal.mutateAsync(payload);
        toast.success("Meal added");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const pending = createMeal.isPending || updateMeal.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit meal" : "New meal"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Foods (coef × food unit = consumed amount)</Label>
            {items.map((it, i) => {
              const f = foodById.get(it.food_id);
              return (
                <div key={i} className="flex gap-2 items-center">
                  <Combobox
                    className="flex-1"
                    placeholder="Pick food…"
                    options={foodOptions.map((f) => ({
                      value: f.id,
                      label: f.name,
                      hint: f.brand ?? undefined,
                    }))}
                    value={it.food_id}
                    onSearchChange={setFoodQuery}
                    onChange={(v) => {
                      rememberFood(v);
                      setItems((prev) => prev.map((p, j) => j === i ? { ...p, food_id: v } : p));
                    }}
                  />
                  <Input
                    type="number" step="0.01" className="w-20"
                    value={it.coef}
                    onChange={(e) => {
                      const v = e.target.value;
                      setItems((prev) => prev.map((p, j) => j === i ? { ...p, coef: v } : p));
                    }}
                  />
                  <span className="text-xs text-muted-foreground w-16 shrink-0">× {foodUnit(f)}</span>
                  <button type="button"
                    onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="size-3" /> Add food
            </Button>
          </div>
          <div className="space-y-1">
            <Label>Notes (Markdown)</Label>
            <MarkdownEditor
              defaultValue={notes}
              onChange={setNotes}
              compact
              placeholder="作り方 / 想定タイミング / 代替案 など"
            />
          </div>
          <Button type="submit" disabled={pending || (isEdit && !dirty)}>
            {isEdit ? "Update" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function MealsPage() {
  usePageTitle("Meals");
  const [showArchived, setShowArchived] = useState(false);
  const { data: meals = [], isLoading } = useMeals(showArchived);
  const deleteMeal = useDeleteMeal();
  const restoreMeal = useRestoreMeal();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MealRow | null>(null);
  const [q, setQ] = useState("");

  const needle = q.trim().toLowerCase();
  const filtered = needle === "" ? meals : meals.filter((m) => {
    const compText = m.items.map((it) => (it as { foodName?: string | null }).foodName ?? "").join(" ");
    return `${m.name} ${compText}`.toLowerCase().includes(needle);
  });

  function summary(m: MealRow) {
    if (m.items.length === 0) return <span className="text-muted-foreground">(empty)</span>;
    return m.items.map((it, i) => {
      // Items now carry the joined food name from the API. We fall back to the
      // local foods list (in case the embed is missing) and finally to "(unknown)".
      const name = (it as { foodName?: string | null }).foodName ?? "(unknown)";
      return (
        <span key={it.id}>
          {i > 0 && <span className="text-muted-foreground"> + </span>}
          {name} × {it.coef}
        </span>
      );
    });
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-medium md:hidden">Meals</h2>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name / contained food…"
          className="max-w-xs h-9"
        />
        <div className="flex items-center gap-2 ml-auto">
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="size-4" /> New meal
          </Button>
        </div>
      </div>

      <MealDialog meal={editing} open={dialogOpen} onOpenChange={setDialogOpen} />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : meals.length === 0 ? (
        <div className="text-sm text-muted-foreground">No meals yet.</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground">No matches for "{q}".</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Composition</th>
                <th className="px-3 py-2 text-right">Items</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const archived = !!m.archivedAt;
                return (
                <tr key={m.id}
                  className={`border-t cursor-pointer hover:bg-muted/30 ${archived ? "opacity-50" : ""}`}
                  onDoubleClick={() => { setEditing(m); setDialogOpen(true); }}
                  title="Double-click to edit">
                  <td className="px-3 py-2 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span>{m.name}</span>
                      {m.notes && <FileText className="size-3 text-muted-foreground" aria-label="has notes" />}
                    </div>
                  </td>
                  <td className="px-3 py-2">{summary(m)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{m.items.length}</td>
                  <td className="px-3 py-2 text-right">
                    {archived ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); restoreMeal.mutate(m.id); }}
                        className="text-muted-foreground hover:text-foreground"
                        title="Restore">
                        <RotateCcw className="size-4" />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${m.name}"?`)) deleteMeal.mutate(m.id);
                        }}
                        className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
