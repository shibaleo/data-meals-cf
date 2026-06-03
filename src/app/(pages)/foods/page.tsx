"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
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
  vitamin_g_per_100g: z.string().optional(),
  mineral_g_per_100g: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

export default function FoodsPage() {
  usePageTitle("Foods");
  const { data: foods = [], isLoading } = useFoods();
  const createFood = useCreateFood();
  const deleteFood = useDeleteFood();
  const [open, setOpen] = useState(false);

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
        vitamin_g_per_100g: values.vitamin_g_per_100g || "0",
        mineral_g_per_100g: values.mineral_g_per_100g || "0",
      });
      toast.success("Food added");
      form.reset();
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
                <div>
                  <Label>Vitamin g /100g</Label>
                  <Input type="number" step="0.01" {...form.register("vitamin_g_per_100g")} />
                </div>
                <div>
                  <Label>Mineral g /100g</Label>
                  <Input type="number" step="0.01" {...form.register("mineral_g_per_100g")} />
                </div>
              </div>
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
                <th className="px-3 py-2 text-right">V</th>
                <th className="px-3 py-2 text-right">M</th>
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
                  <td className="px-3 py-2 text-right">{f.vitaminGPer100g ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{f.mineralGPer100g ?? "-"}</td>
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
