"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePageTitle } from "@/lib/page-context";
import { useIntakes, useCreateIntake, useDeleteIntake } from "@/hooks/queries/use-intakes";
import { useMeals } from "@/hooks/queries/use-meals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const MEAL_KINDS = ["breakfast", "lunch", "dinner", "snack"] as const;
type MealKind = (typeof MEAL_KINDS)[number];

interface ItemDraft { meal_id: string; coef: string }

function localDatetime(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export default function IntakesPage() {
  usePageTitle("Intake");
  const { data: intakes = [], isLoading } = useIntakes();
  const { data: meals = [] } = useMeals();
  const createIntake = useCreateIntake();
  const deleteIntake = useDeleteIntake();
  const [open, setOpen] = useState(false);
  const [eatenAt, setEatenAt] = useState(localDatetime());
  const [kind, setKind] = useState<MealKind>("breakfast");
  const [items, setItems] = useState<ItemDraft[]>([]);

  function addItem() {
    if (meals.length === 0) return;
    setItems((prev) => [...prev, { meal_id: meals[0].id, coef: "1" }]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createIntake.mutateAsync({
        eaten_at: new Date(eatenAt).toISOString(),
        meal_kind: kind,
        items: items.map((it, i) => ({
          meal_id: it.meal_id,
          coef: it.coef,
          sort_order: i,
        })),
      });
      toast.success("Intake recorded");
      setItems([]); setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const mealName = (id: string) => meals.find((m) => m.id === id)?.name ?? id;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium md:hidden">Intake</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="size-4" /> New intake</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New intake</DialogTitle></DialogHeader>
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <Label>Eaten at</Label>
                <Input type="datetime-local" value={eatenAt}
                  onChange={(e) => setEatenAt(e.target.value)} />
              </div>
              <div>
                <Label>Kind</Label>
                <select className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  value={kind} onChange={(e) => setKind(e.target.value as MealKind)}>
                  {MEAL_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Meals (coef = portion eaten)</Label>
                {items.map((it, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select
                      className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={it.meal_id}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItems((prev) => prev.map((p, j) => j === i ? { ...p, meal_id: v } : p));
                      }}
                    >
                      {meals.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
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
                  <Plus className="size-3" /> Add meal
                </Button>
              </div>
              <Button type="submit" disabled={createIntake.isPending}>Save</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : intakes.length === 0 ? (
        <div className="text-sm text-muted-foreground">No intakes yet.</div>
      ) : (
        <div className="space-y-2">
          {intakes.map((it) => (
            <div key={it.id} className="rounded-md border p-3 flex items-start justify-between">
              <div>
                <div className="text-xs text-muted-foreground">
                  {new Date(it.eatenAt).toLocaleString()} · {it.mealKind}
                </div>
                <div className="text-sm">
                  {it.items.length === 0
                    ? <span className="text-muted-foreground">(empty)</span>
                    : it.items.map((m, i) => (
                      <span key={m.id}>
                        {i > 0 && <span className="text-muted-foreground"> + </span>}
                        {mealName(m.mealId)} × {m.coef}
                      </span>
                    ))}
                </div>
              </div>
              <button
                onClick={() => { if (confirm("Delete intake?")) deleteIntake.mutate(it.id); }}
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
