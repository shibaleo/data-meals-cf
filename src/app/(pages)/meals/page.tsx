"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePageTitle } from "@/lib/page-context";
import { useMeals, useCreateMeal, useDeleteMeal } from "@/hooks/queries/use-meals";
import { useFoods } from "@/hooks/queries/use-foods";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

interface ItemDraft { food_id: string; coef: string }

export default function MealsPage() {
  usePageTitle("Meals");
  const { data: meals = [], isLoading } = useMeals();
  const { data: foods = [] } = useFoods();
  const createMeal = useCreateMeal();
  const deleteMeal = useDeleteMeal();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);

  function addItem() {
    if (foods.length === 0) return;
    setItems((prev) => [...prev, { food_id: foods[0].id, coef: "1" }]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createMeal.mutateAsync({
        name: name.trim(),
        items: items.map((it, i) => ({
          food_id: it.food_id,
          coef: it.coef,
          sort_order: i,
        })),
      });
      toast.success("Meal added");
      setName(""); setItems([]); setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium md:hidden">Meals</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="size-4" /> New meal</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New meal</DialogTitle></DialogHeader>
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Foods (coef 0-1+)</Label>
                {items.map((it, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select
                      className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={it.food_id}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItems((prev) => prev.map((p, j) => j === i ? { ...p, food_id: v } : p));
                      }}
                    >
                      {foods.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <Input
                      type="number" step="0.01" className="w-20"
                      value={it.coef}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItems((prev) => prev.map((p, j) => j === i ? { ...p, coef: v } : p));
                      }}
                    />
                    <button type="button"
                      onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="size-3" /> Add food
                </Button>
              </div>
              <Button type="submit" disabled={createMeal.isPending}>Save</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : meals.length === 0 ? (
        <div className="text-sm text-muted-foreground">No meals yet.</div>
      ) : (
        <div className="space-y-2">
          {meals.map((m) => (
            <div key={m.id} className="rounded-md border p-3 flex items-start justify-between">
              <div>
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-muted-foreground">
                  {m.items.length} item{m.items.length === 1 ? "" : "s"}
                </div>
              </div>
              <button
                onClick={() => { if (confirm(`Delete "${m.name}"?`)) deleteMeal.mutate(m.id); }}
                className="text-muted-foreground hover:text-destructive">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
