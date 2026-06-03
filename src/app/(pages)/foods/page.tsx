"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { usePageTitle } from "@/lib/page-context";
import { useFoods, useCreateFood, useDeleteFood } from "@/hooks/queries/use-foods";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
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

interface MicroRow { key: string; value: string }

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
    <div className="space-y-1">
      <Label>{label}</Label>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            className="flex-1" placeholder={placeholder}
            value={r.key}
            onChange={(e) => {
              const v = e.target.value;
              setRows(rows.map((p, j) => j === i ? { ...p, key: v } : p));
            }}
          />
          <Input
            type="number" step="0.01" className="w-24" placeholder="amount /100g"
            value={r.value}
            onChange={(e) => {
              const v = e.target.value;
              setRows(rows.map((p, j) => j === i ? { ...p, value: v } : p));
            }}
          />
          <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))}
            className="text-muted-foreground hover:text-destructive">
            <X className="size-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm"
        onClick={() => setRows([...rows, { key: "", value: "" }])}>
        <Plus className="size-3" /> Add {label.toLowerCase()}
      </Button>
    </div>
  );
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

export default function FoodsPage() {
  usePageTitle("Foods");
  const { data: foods = [], isLoading } = useFoods();
  const createFood = useCreateFood();
  const deleteFood = useDeleteFood();
  const [open, setOpen] = useState(false);
  const [vitamins, setVitamins] = useState<MicroRow[]>([]);
  const [minerals, setMinerals] = useState<MicroRow[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await createFood.mutateAsync({
        name: values.name,
        brand: values.brand || null,
        default_serving_g: values.default_serving_g || null,
        kcal_per_100g: values.kcal_per_100g || "0",
        protein_g_per_100g: values.protein_g_per_100g || "0",
        fat_g_per_100g: values.fat_g_per_100g || "0",
        carb_g_per_100g: values.carb_g_per_100g || "0",
        vitamin_json: rowsToJson(vitamins),
        mineral_json: rowsToJson(minerals),
      });
      toast.success("Food added");
      form.reset();
      setVitamins([]); setMinerals([]);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium md:hidden">Foods</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="size-4" /> New food</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New food</DialogTitle></DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input {...form.register("name")} />
              </div>
              <div>
                <Label>Brand</Label>
                <Input {...form.register("brand")} />
              </div>
              <div>
                <Label>Default serving (g)</Label>
                <Input type="number" step="0.01" {...form.register("default_serving_g")} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>kcal /100g</Label>
                  <Input type="number" step="0.01" {...form.register("kcal_per_100g")} />
                </div>
                <div>
                  <Label>Protein g /100g</Label>
                  <Input type="number" step="0.01" {...form.register("protein_g_per_100g")} />
                </div>
                <div>
                  <Label>Fat g /100g</Label>
                  <Input type="number" step="0.01" {...form.register("fat_g_per_100g")} />
                </div>
                <div>
                  <Label>Carb g /100g</Label>
                  <Input type="number" step="0.01" {...form.register("carb_g_per_100g")} />
                </div>
              </div>
              <MicroEditor label="Vitamins" rows={vitamins} setRows={setVitamins}
                placeholder="e.g. vitamin_c_mg" />
              <MicroEditor label="Minerals" rows={minerals} setRows={setMinerals}
                placeholder="e.g. iron_mg" />
              <Button type="submit" disabled={createFood.isPending}>Save</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
                <th className="px-3 py-2 text-right">kcal/100g</th>
                <th className="px-3 py-2 text-right">P</th>
                <th className="px-3 py-2 text-right">F</th>
                <th className="px-3 py-2 text-right">C</th>
                <th className="px-3 py-2 text-right">Serving</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {foods.map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="px-3 py-2">{f.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{f.brand ?? ""}</td>
                  <td className="px-3 py-2 text-right">{f.kcalPer100g ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{f.proteinGPer100g ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{f.fatGPer100g ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{f.carbGPer100g ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{f.defaultServingG ?? "-"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${f.name}"?`)) deleteFood.mutate(f.id);
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
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
