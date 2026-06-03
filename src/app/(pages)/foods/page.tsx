"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { usePageTitle } from "@/lib/page-context";
import {
  useFoods, useCreateFood, useUpdateFood, useDeleteFood, type FoodRow,
} from "@/hooks/queries/use-foods";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const formSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  default_serving_g: z.string().optional(),
  kcal_per_100g: z.string().optional(),
  protein_g_per_100g: z.string().optional(),
  fat_g_per_100g: z.string().optional(),
  carb_g_per_100g: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

type ServingBasis = "g" | "ml";

interface MicroRow { key: string; value: string }

function jsonToRows(j: unknown): MicroRow[] {
  if (!j || typeof j !== "object") return [];
  return Object.entries(j as Record<string, number>)
    .map(([key, value]) => ({ key, value: String(value) }));
}

function rowsToJson(rows: MicroRow[]): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    const n = Number(r.value);
    if (Number.isFinite(n)) out[k] = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function MicroEditor({
  label,
  rows,
  setRows,
  placeholder,
}: {
  label: string;
  rows: MicroRow[];
  setRows: (r: MicroRow[]) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <Label className="block">{label}</Label>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs"
          onClick={() => setRows([...rows, { key: "", value: "" }])}>
          <Plus className="size-3" /> Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No entries. Add one above.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                className="flex-1 h-8" placeholder={placeholder}
                value={r.key}
                onChange={(e) => {
                  const v = e.target.value;
                  setRows(rows.map((p, j) => j === i ? { ...p, key: v } : p));
                }}
              />
              <Input
                type="number" step="0.01" className="w-24 h-8" placeholder="/100g"
                value={r.value}
                onChange={(e) => {
                  const v = e.target.value;
                  setRows(rows.map((p, j) => j === i ? { ...p, value: v } : p));
                }}
              />
              <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive shrink-0">
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FoodDialog({
  food,
  open,
  onOpenChange,
}: {
  food: FoodRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = food !== null;
  const createFood = useCreateFood();
  const updateFood = useUpdateFood();
  const [vitamins, setVitamins] = useState<MicroRow[]>([]);
  const [minerals, setMinerals] = useState<MicroRow[]>([]);
  const [basis, setBasis] = useState<ServingBasis>("g");
  // Snapshot of the non-RHF fields at dialog-open time, so we can compute dirty.
  const [initialBasis, setInitialBasis] = useState<ServingBasis>("g");
  const [initialMicros, setInitialMicros] = useState<{ v: string; m: string }>({ v: "{}", m: "{}" });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" },
  });

  // Sync form + micros each time dialog opens with a different target
  useEffect(() => {
    if (!open) return;
    if (food) {
      form.reset({
        name: food.name,
        brand: food.brand ?? "",
        default_serving_g: food.defaultServingG ?? "",
        kcal_per_100g: food.kcalPer100g ?? "",
        protein_g_per_100g: food.proteinGPer100g ?? "",
        fat_g_per_100g: food.fatGPer100g ?? "",
        carb_g_per_100g: food.carbGPer100g ?? "",
      });
      const b = (food.servingBasis as ServingBasis) ?? "g";
      const v = jsonToRows(food.vitaminJson);
      const m = jsonToRows(food.mineralJson);
      setBasis(b);
      setVitamins(v);
      setMinerals(m);
      setInitialBasis(b);
      setInitialMicros({
        v: JSON.stringify(rowsToJson(v) ?? {}),
        m: JSON.stringify(rowsToJson(m) ?? {}),
      });
    } else {
      form.reset({ name: "" });
      setBasis("g");
      setVitamins([]);
      setMinerals([]);
      setInitialBasis("g");
      setInitialMicros({ v: "{}", m: "{}" });
    }
  }, [open, food, form]);

  const microsDirty =
    JSON.stringify(rowsToJson(vitamins) ?? {}) !== initialMicros.v ||
    JSON.stringify(rowsToJson(minerals) ?? {}) !== initialMicros.m;
  const basisDirty = basis !== initialBasis;
  // form.formState.isDirty reflects PFC + name/brand/serving fields.
  const dirty = form.formState.isDirty || microsDirty || basisDirty;

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      brand: values.brand || null,
      default_serving_g: values.default_serving_g || null,
      serving_basis: basis,
      kcal_per_100g: values.kcal_per_100g || "0",
      protein_g_per_100g: values.protein_g_per_100g || "0",
      fat_g_per_100g: values.fat_g_per_100g || "0",
      carb_g_per_100g: values.carb_g_per_100g || "0",
      vitamin_json: rowsToJson(vitamins),
      mineral_json: rowsToJson(minerals),
    };
    try {
      if (isEdit && food) {
        await updateFood.mutateAsync({ id: food.id, body: payload });
        toast.success("Food updated");
      } else {
        await createFood.mutateAsync(payload);
        toast.success("Food added");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const pending = createFood.isPending || updateFood.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit food" : "New food"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit, (errors) => {
            const first = Object.values(errors)[0];
            toast.error((first as { message?: string } | undefined)?.message ?? "Validation failed");
          })}
          className="space-y-3"
        >
          <div>
            <Label>Name</Label>
            <Input {...form.register("name")} />
          </div>
          <div>
            <Label>Brand</Label>
            <Input {...form.register("brand")} />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <Label>Default serving ({basis})</Label>
              <Input type="number" step="0.01" {...form.register("default_serving_g")} />
            </div>
            <div>
              <Label>Basis</Label>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={basis}
                onChange={(e) => setBasis(e.target.value as ServingBasis)}
              >
                <option value="g">g</option>
                <option value="ml">ml</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>kcal /100{basis}</Label>
              <Input type="number" step="0.01" {...form.register("kcal_per_100g")} />
            </div>
            <div>
              <Label>Protein g /100{basis}</Label>
              <Input type="number" step="0.01" {...form.register("protein_g_per_100g")} />
            </div>
            <div>
              <Label>Fat g /100{basis}</Label>
              <Input type="number" step="0.01" {...form.register("fat_g_per_100g")} />
            </div>
            <div>
              <Label>Carb g /100{basis}</Label>
              <Input type="number" step="0.01" {...form.register("carb_g_per_100g")} />
            </div>
          </div>
          <MicroEditor label="Vitamins" rows={vitamins} setRows={setVitamins}
            placeholder="e.g. vitamin_c_mg" />
          <MicroEditor label="Minerals" rows={minerals} setRows={setMinerals}
            placeholder="e.g. iron_mg" />
          <Button type="submit" disabled={pending || (isEdit && !dirty)}>
            {isEdit ? "Update" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function FoodsPage() {
  usePageTitle("Foods");
  const { data: foods = [], isLoading } = useFoods();
  const deleteFood = useDeleteFood();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FoodRow | null>(null);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(f: FoodRow) {
    setEditing(f);
    setDialogOpen(true);
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium md:hidden">Foods</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" /> New food
        </Button>
      </div>

      <FoodDialog food={editing} open={dialogOpen} onOpenChange={setDialogOpen} />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : foods.length === 0 ? (
        <div className="text-sm text-muted-foreground">No foods yet. Add one above.</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2 text-right">kcal/100</th>
                <th className="px-3 py-2 text-right">P</th>
                <th className="px-3 py-2 text-right">F</th>
                <th className="px-3 py-2 text-right">C</th>
                <th className="px-3 py-2 text-right">V</th>
                <th className="px-3 py-2 text-right">M</th>
                <th className="px-3 py-2 text-right">Serving</th>
                <th className="px-3 py-2 text-right">Unit</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {foods.map((f) => {
                const vCount = f.vitaminJson ? Object.keys(f.vitaminJson as Record<string, number>).length : 0;
                const mCount = f.mineralJson ? Object.keys(f.mineralJson as Record<string, number>).length : 0;
                return (
                  <tr
                    key={f.id}
                    className="border-t cursor-pointer hover:bg-muted/30"
                    onDoubleClick={() => openEdit(f)}
                    title="Double-click to edit"
                  >
                    <td className="px-3 py-2">{f.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{f.brand ?? ""}</td>
                    <td className="px-3 py-2 text-right">{f.kcalPer100g ?? "-"}</td>
                    <td className="px-3 py-2 text-right">{f.proteinGPer100g ?? "-"}</td>
                    <td className="px-3 py-2 text-right">{f.fatGPer100g ?? "-"}</td>
                    <td className="px-3 py-2 text-right">{f.carbGPer100g ?? "-"}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{vCount || "-"}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{mCount || "-"}</td>
                    <td className="px-3 py-2 text-right">{f.defaultServingG ?? "-"}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{f.servingBasis ?? "g"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${f.name}"?`)) deleteFood.mutate(f.id);
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
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
