"use client";

import { useEffect, useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePageTitle } from "@/lib/page-context";
import {
  useIntakes, useCreateIntake, useUpdateIntake, useDeleteIntake, type IntakeRow,
} from "@/hooks/queries/use-intakes";
import { useMeals, type MealRow } from "@/hooks/queries/use-meals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Combobox } from "@/components/ui/combobox";

const MEAL_KINDS = ["breakfast", "lunch", "dinner", "snack"] as const;
type MealKind = (typeof MEAL_KINDS)[number];

interface ItemDraft { meal_id: string; coef: string }

function localDatetime(d?: Date): string {
  const date = d ?? new Date();
  const tz = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tz).toISOString().slice(0, 16);
}

function IntakeDialog({
  intake,
  open,
  onOpenChange,
  meals,
}: {
  intake: IntakeRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meals: MealRow[];
}) {
  const isEdit = intake !== null;
  const createIntake = useCreateIntake();
  const updateIntake = useUpdateIntake();
  const [eatenAt, setEatenAt] = useState(localDatetime());
  const [kind, setKind] = useState<MealKind>("breakfast");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [initial, setInitial] = useState<{ eatenAt: string; kind: string; notes: string; items: string }>({
    eatenAt: "", kind: "breakfast", notes: "", items: "[]",
  });

  useEffect(() => {
    if (!open) return;
    if (intake) {
      const ea = localDatetime(new Date(intake.eatenAt));
      const k = (intake.mealKind as MealKind) ?? "breakfast";
      const its: ItemDraft[] = intake.items.map((it) => ({
        meal_id: it.mealId,
        coef: String(it.coef ?? "1"),
      }));
      const n = intake.notes ?? "";
      setEatenAt(ea);
      setKind(k);
      setNotes(n);
      setItems(its);
      setInitial({ eatenAt: ea, kind: k, notes: n, items: JSON.stringify(its) });
    } else {
      const ea = localDatetime();
      setEatenAt(ea);
      setKind("breakfast");
      setNotes("");
      setItems([]);
      setInitial({ eatenAt: ea, kind: "breakfast", notes: "", items: "[]" });
    }
  }, [open, intake]);

  const dirty =
    eatenAt !== initial.eatenAt ||
    kind !== initial.kind ||
    notes !== initial.notes ||
    JSON.stringify(items) !== initial.items;

  function addItem() {
    if (meals.length === 0) return;
    setItems((prev) => [...prev, { meal_id: meals[0].id, coef: "1" }]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      eaten_at: new Date(eatenAt).toISOString(),
      meal_kind: kind,
      notes: notes.trim() || null,
      items: items.map((it, i) => ({
        meal_id: it.meal_id,
        coef: it.coef,
        sort_order: i,
      })),
    };
    try {
      if (isEdit && intake) {
        await updateIntake.mutateAsync({ id: intake.id, body: payload });
        toast.success("Intake updated");
      } else {
        await createIntake.mutateAsync(payload);
        toast.success("Intake recorded");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const pending = createIntake.isPending || updateIntake.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit intake" : "New intake"}</DialogTitle>
        </DialogHeader>
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
                <Combobox
                  className="flex-1"
                  placeholder="Pick meal…"
                  options={meals.map((m) => ({ value: m.id, label: m.name }))}
                  value={it.meal_id}
                  onChange={(v) =>
                    setItems((prev) => prev.map((p, j) => j === i ? { ...p, meal_id: v } : p))
                  }
                />
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
          <div className="space-y-1">
            <Label>Notes (Markdown)</Label>
            <MarkdownEditor
              defaultValue={notes}
              onChange={setNotes}
              compact
              placeholder="気分 / 体調 / コンディション など"
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

export default function IntakesPage() {
  usePageTitle("Intake");
  const { data: intakes = [], isLoading } = useIntakes();
  const { data: meals = [] } = useMeals();
  const deleteIntake = useDeleteIntake();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IntakeRow | null>(null);

  const mealById = new Map(meals.map((m) => [m.id, m]));

  function summary(it: IntakeRow) {
    if (it.items.length === 0) return <span className="text-muted-foreground">(empty)</span>;
    return it.items.map((m, i) => {
      const meal = mealById.get(m.mealId);
      return (
        <span key={m.id}>
          {i > 0 && <span className="text-muted-foreground"> + </span>}
          {meal?.name ?? "(unknown)"} × {m.coef}
        </span>
      );
    });
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium md:hidden">Intake</h2>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="size-4" /> New intake
        </Button>
      </div>

      <IntakeDialog intake={editing} open={dialogOpen} onOpenChange={setDialogOpen} meals={meals} />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : intakes.length === 0 ? (
        <div className="text-sm text-muted-foreground">No intakes yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2">Eaten at</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Composition</th>
                <th className="px-3 py-2 text-right">Items</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {intakes.map((it) => (
                <tr key={it.id}
                  className="border-t cursor-pointer hover:bg-muted/30"
                  onDoubleClick={() => { setEditing(it); setDialogOpen(true); }}
                  title="Double-click to edit">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span>{new Date(it.eatenAt).toLocaleString()}</span>
                      {it.notes && <FileText className="size-3 text-muted-foreground" aria-label="has notes" />}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{it.mealKind}</td>
                  <td className="px-3 py-2">{summary(it)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{it.items.length}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete intake?")) deleteIntake.mutate(it.id);
                      }}
                      className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
