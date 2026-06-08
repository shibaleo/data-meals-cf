"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ExternalLink, FileText, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { usePageTitle } from "@/lib/page-context";
import {
  useFoods, useCreateFood, useUpdateFood, useDeleteFood, useRestoreFood, useNutrientKeys, type FoodRow,
} from "@/hooks/queries/use-foods";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownEditor } from "@/components/markdown-editor";

const formSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  source_label_url: z.string().optional(),
  kcal_per_100g: z.string().optional(),
  protein_g_per_100g: z.string().optional(),
  fat_g_per_100g: z.string().optional(),
  carb_g_per_100g: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

type ServingBasis = "g" | "ml";

const PFC_FIELDS = ["kcal_per_100g", "protein_g_per_100g", "fat_g_per_100g", "carb_g_per_100g"] as const;
type PFCField = (typeof PFC_FIELDS)[number];

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

// Format a number for an Input value: trim trailing zeros so 367.86 stays as
// "367.86" but 100 doesn't show as "100.00000001" after a roundtrip.
function fmt(n: number): string {
  if (!Number.isFinite(n)) return "";
  const s = n.toFixed(4);
  return s.replace(/\.?0+$/, "");
}

function MicroEditor({
  label,
  rows,
  setRows,
  placeholder,
  unitSuffix,
  suggestions,
  datalistId,
}: {
  label: string;
  rows: MicroRow[];
  setRows: (r: MicroRow[]) => void;
  placeholder: string;
  unitSuffix: string;
  suggestions: string[];
  datalistId: string;
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
      {suggestions.length === 0 ? null : (
        <datalist id={datalistId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No entries. Add one above.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                className="flex-1 h-8" placeholder={placeholder}
                list={datalistId}
                value={r.key}
                onChange={(e) => {
                  const v = e.target.value;
                  setRows(rows.map((p, j) => j === i ? { ...p, key: v } : p));
                }}
              />
              <Input
                type="number" step="0.01" className="w-24 h-8" placeholder={unitSuffix}
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

// Seeded suggestions used when the DB-derived list is empty (first food).
const VITAMIN_SEEDS = [
  "vitamin_a_ug", "vitamin_b1_mg", "vitamin_b2_mg", "vitamin_b6_mg", "vitamin_b12_ug",
  "vitamin_c_mg", "vitamin_d_ug", "vitamin_e_mg", "vitamin_k_ug",
  "niacin_mg", "folate_ug", "pantothenic_acid_mg", "biotin_ug",
];
const MINERAL_SEEDS = [
  "salt_equivalent_g", "sodium_mg",
  "calcium_mg", "iron_mg", "magnesium_mg", "potassium_mg", "phosphorus_mg",
  "zinc_mg", "copper_mg", "manganese_mg", "selenium_ug", "iodine_ug",
];

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
  const [notes, setNotes] = useState<string>("");
  const [basis, setBasis] = useState<ServingBasis>("g");
  // labelBasis = how many basis-units the user's typed values are per (e.g.
  // 28 if the label is "per 1食(28g)"). Stored values are per 100; the form
  // displays per labelBasis. Default 100 = enter values exactly as per-100g.
  const [labelBasis, setLabelBasis] = useState<number>(100);
  const prevLabelBasis = useRef<number>(100);

  const [initialBasis, setInitialBasis] = useState<ServingBasis>("g");
  const [initialMicros, setInitialMicros] = useState<{ v: string; m: string }>({ v: "{}", m: "{}" });
  const [initialNotes, setInitialNotes] = useState<string>("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    if (!open) return;
    if (food) {
      // Stored values are per 100; redisplay them per the food's saved
      // labelBasisAmount so the inputs match what the user originally typed.
      const lb = Number(food.labelBasisAmount ?? 100) || 100;
      const ratio = lb / 100;
      const scale = (s: string | null | undefined) => {
        if (s === null || s === undefined || s === "") return "";
        const n = Number(s);
        return Number.isFinite(n) ? fmt(n * ratio) : "";
      };
      form.reset({
        name: food.name,
        brand: food.brand ?? "",
        source_label_url: food.sourceLabelUrl ?? "",
        kcal_per_100g: scale(food.kcalPer100g),
        protein_g_per_100g: scale(food.proteinGPer100g),
        fat_g_per_100g: scale(food.fatGPer100g),
        carb_g_per_100g: scale(food.carbGPer100g),
      });
      const b = (food.servingBasis as ServingBasis) ?? "g";
      const scaleRows = (rows: MicroRow[]) =>
        rows.map((r) => {
          const n = Number(r.value);
          return Number.isFinite(n) && r.value !== "" ? { ...r, value: fmt(n * ratio) } : r;
        });
      const v = scaleRows(jsonToRows(food.vitaminJson));
      const m = scaleRows(jsonToRows(food.mineralJson));
      setBasis(b);
      setVitamins(v);
      setMinerals(m);
      setInitialBasis(b);
      setInitialMicros({
        v: JSON.stringify(rowsToJson(v) ?? {}),
        m: JSON.stringify(rowsToJson(m) ?? {}),
      });
      setLabelBasis(lb);
      prevLabelBasis.current = lb;
      const fn = food.notes ?? "";
      setNotes(fn);
      setInitialNotes(fn);
    } else {
      form.reset({ name: "", source_label_url: "" });
      setBasis("g");
      setVitamins([]);
      setMinerals([]);
      setInitialBasis("g");
      setInitialMicros({ v: "{}", m: "{}" });
      setLabelBasis(100);
      prevLabelBasis.current = 100;
      setNotes("");
      setInitialNotes("");
    }
  }, [open, food, form]);

  // Rescale all PFC + V/M values when the user changes labelBasis so that the
  // displayed numbers stay self-consistent (= "per <new labelBasis>" units).
  function changeLabelBasis(next: number) {
    const prev = prevLabelBasis.current;
    if (!Number.isFinite(next) || next <= 0 || prev <= 0 || next === prev) {
      setLabelBasis(Number.isFinite(next) && next > 0 ? next : prev);
      return;
    }
    const ratio = next / prev;
    for (const f of PFC_FIELDS) {
      const raw = form.getValues(f);
      const n = raw === "" || raw === undefined ? NaN : Number(raw);
      if (Number.isFinite(n)) {
        form.setValue(f, fmt(n * ratio), { shouldDirty: true });
      }
    }
    const scaleRows = (rows: MicroRow[]) =>
      rows.map((r) => {
        const n = Number(r.value);
        return Number.isFinite(n) && r.value !== "" ? { ...r, value: fmt(n * ratio) } : r;
      });
    setVitamins((rs) => scaleRows(rs));
    setMinerals((rs) => scaleRows(rs));
    setLabelBasis(next);
    prevLabelBasis.current = next;
  }

  const microsDirty =
    JSON.stringify(rowsToJson(vitamins) ?? {}) !== initialMicros.v ||
    JSON.stringify(rowsToJson(minerals) ?? {}) !== initialMicros.m;
  const basisDirty = basis !== initialBasis;
  const notesDirty = notes !== initialNotes;
  const dirty = form.formState.isDirty || microsDirty || basisDirty || notesDirty;

  async function onSubmit(values: FormValues) {
    // Convert per-labelBasis -> per-100 for storage. ratio = 100 / labelBasis.
    const toPer100 = (s: string | undefined): string => {
      const n = s === "" || s === undefined ? NaN : Number(s);
      if (!Number.isFinite(n)) return "0";
      return fmt(n * (100 / labelBasis));
    };
    const scaledMicros = (rows: MicroRow[]): Record<string, number> | undefined => {
      const out: Record<string, number> = {};
      for (const r of rows) {
        const k = r.key.trim();
        if (!k) continue;
        const n = Number(r.value);
        if (Number.isFinite(n)) out[k] = Number(fmt(n * (100 / labelBasis)));
      }
      return Object.keys(out).length > 0 ? out : undefined;
    };
    // Warn (don't block) on vitamin/mineral keys not in the autocomplete set —
    // protects against typo-style drift like salt_g vs salt_equivalent_g.
    const unknownKeys: string[] = [];
    const knownVitamins = new Set([...VITAMIN_SEEDS, ...(nutrientKeys?.vitamins ?? [])]);
    const knownMinerals = new Set([...MINERAL_SEEDS, ...(nutrientKeys?.minerals ?? [])]);
    for (const r of vitamins) {
      const k = r.key.trim();
      if (k && !knownVitamins.has(k)) unknownKeys.push(`vitamin: ${k}`);
    }
    for (const r of minerals) {
      const k = r.key.trim();
      if (k && !knownMinerals.has(k)) unknownKeys.push(`mineral: ${k}`);
    }
    if (unknownKeys.length > 0) {
      const ok = confirm(
        `未登録の栄養素 key を使っています:\n\n${unknownKeys.join("\n")}\n\n新規 key として保存しますか?`,
      );
      if (!ok) return;
    }

    const payload = {
      name: values.name,
      brand: values.brand || null,
      source_label_url: values.source_label_url?.trim() || null,
      notes: notes.trim() || null,
      serving_basis: basis,
      label_basis_amount: String(labelBasis),
      kcal_per_100g: toPer100(values.kcal_per_100g),
      protein_g_per_100g: toPer100(values.protein_g_per_100g),
      fat_g_per_100g: toPer100(values.fat_g_per_100g),
      carb_g_per_100g: toPer100(values.carb_g_per_100g),
      vitamin_json: scaledMicros(vitamins),
      mineral_json: scaledMicros(minerals),
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
  const unit = `${labelBasis}${basis}`;
  const microSuffix = `/${unit}`;

  // kcal sanity check: typed kcal vs Atwater 4P + 9F + 4C
  const kcalSanity = useMemo(() => {
    const kc = Number(form.watch("kcal_per_100g"));
    const p = Number(form.watch("protein_g_per_100g")) || 0;
    const f = Number(form.watch("fat_g_per_100g")) || 0;
    const c = Number(form.watch("carb_g_per_100g")) || 0;
    if (!Number.isFinite(kc) || (p === 0 && f === 0 && c === 0)) return null;
    const computed = 4 * p + 9 * f + 4 * c;
    if (computed === 0) return null;
    const diff = Math.abs(kc - computed);
    const pct = (diff / Math.max(kc, computed)) * 100;
    return { computed, diff, pct };
  }, [form]);

  // Suggestions come from the cached nutrient-keys endpoint (server-side
  // DISTINCT) so we don't iterate every fetched food row.
  const { data: nutrientKeys } = useNutrientKeys();
  const vitaminSuggestions = Array.from(new Set([
    ...(nutrientKeys?.vitamins ?? []),
    ...VITAMIN_SEEDS,
  ])).sort();
  const mineralSuggestions = Array.from(new Set([
    ...(nutrientKeys?.minerals ?? []),
    ...MINERAL_SEEDS,
  ])).sort();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit food" : "New food"}</DialogTitle>
        </DialogHeader>
        <details className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">入力ルール</summary>
          <ul className="mt-2 space-y-1 list-disc list-inside">
            <li>ラベルの「100g/100ml/1食 X g あたり」を <strong>Label basis</strong> に入れて、数値はラベル通り転記。保存時に per-100 に正規化される。</li>
            <li>範囲表記 (例: 2.8〜5.9g) は <strong>中央値</strong> で。</li>
            <li>飽和脂肪酸 / 糖質 / 食物繊維など内訳は今のスキーマだと入れ場所なし → 飛ばす。</li>
            <li>Vitamin / Mineral key は <code>snake_case_unit</code> (例: <code>vitamin_c_mg</code>, <code>calcium_mg</code>, <code>salt_equivalent_g</code>)。入力欄で候補が出るので既存 key を使い回す。</li>
            <li>食塩相当量は mineral に <code>salt_equivalent_g</code>。</li>
          </ul>
        </details>
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
          <div>
            <Label>Source label URL</Label>
            <Input type="url" placeholder="https://..." {...form.register("source_label_url")} />
          </div>
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1">
            <Label className="block">Label basis</Label>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground">per</span>
              <Input
                type="number" step="0.01" className="w-24 h-8"
                value={labelBasis}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (e.target.value === "") return;
                  if (Number.isFinite(n) && n > 0) changeLabelBasis(n);
                }}
              />
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={basis}
                onChange={(e) => setBasis(e.target.value as ServingBasis)}
              >
                <option value="g">g</option>
                <option value="ml">ml</option>
              </select>
              <span className="text-xs text-muted-foreground">あたり</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>kcal /{unit}</Label>
              <Input type="number" step="0.01" {...form.register("kcal_per_100g")} />
            </div>
            <div>
              <Label>Protein g /{unit}</Label>
              <Input type="number" step="0.01" {...form.register("protein_g_per_100g")} />
            </div>
            <div>
              <Label>Fat g /{unit}</Label>
              <Input type="number" step="0.01" {...form.register("fat_g_per_100g")} />
            </div>
            <div>
              <Label>Carb g /{unit}</Label>
              <Input type="number" step="0.01" {...form.register("carb_g_per_100g")} />
            </div>
          </div>
          {kcalSanity && (
            <p className={`text-xs ${kcalSanity.pct > 15 ? "text-amber-500" : "text-muted-foreground"}`}>
              Atwater 計算 kcal: <strong>{kcalSanity.computed.toFixed(1)}</strong>
              {" "}(差 {kcalSanity.diff.toFixed(1)}, {kcalSanity.pct.toFixed(0)}%)
              {kcalSanity.pct > 15 && " — 入力値とのズレが大きい。確認推奨"}
            </p>
          )}
          <MicroEditor label="Vitamins" rows={vitamins} setRows={setVitamins}
            placeholder="e.g. vitamin_c_mg" unitSuffix={microSuffix}
            suggestions={vitaminSuggestions} datalistId="vitamin-keys" />
          <MicroEditor label="Minerals" rows={minerals} setRows={setMinerals}
            placeholder="e.g. iron_mg" unitSuffix={microSuffix}
            suggestions={mineralSuggestions} datalistId="mineral-keys" />
          <div className="space-y-1">
            <Label>Notes (Markdown)</Label>
            <MarkdownEditor
              defaultValue={notes}
              onChange={setNotes}
              compact
              placeholder="気づき / メーカー備考 / 入手元 など"
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

export default function FoodsPage() {
  usePageTitle("Foods");
  const [showArchived, setShowArchived] = useState(false);
  const [qInput, setQInput] = useState("");
  // Debounce the server query so each keystroke doesn't refire.
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 200);
    return () => clearTimeout(t);
  }, [qInput]);
  const { data, isLoading, isFetching } = useFoods({ q, includeArchived: showArchived, limit: 200 });
  const foods = data?.data ?? [];
  const capped = foods.length >= (data?.limit ?? 200);
  const deleteFood = useDeleteFood();
  const restoreFood = useRestoreFood();
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
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-medium md:hidden">Foods</h2>
        <Input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Search name / brand…"
          className="max-w-xs h-9"
        />
        {isFetching && !isLoading && <span className="text-xs text-muted-foreground">…</span>}
        <div className="flex items-center gap-2 ml-auto">
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> New food
          </Button>
        </div>
      </div>

      <FoodDialog food={editing} open={dialogOpen} onOpenChange={setDialogOpen} />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : foods.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          {q ? `No matches for "${q}".` : "No foods yet. Add one above."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {foods.map((f) => {
                const archived = !!f.archivedAt;
                return (
                  <tr
                    key={f.id}
                    className={`border-t cursor-pointer hover:bg-muted/30 ${archived ? "opacity-50" : ""}`}
                    onDoubleClick={() => openEdit(f)}
                    title="Double-click to edit"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span>{f.name}</span>
                        {f.sourceLabelUrl ? (
                          <a href={f.sourceLabelUrl} target="_blank" rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground"
                            title={f.sourceLabelUrl}>
                            <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          <AlertTriangle
                            className="size-3 text-amber-500"
                            aria-label="No source URL"
                            title="No source URL registered"
                          />
                        )}
                        {f.notes && (
                          <FileText className="size-3 text-muted-foreground" aria-label="has notes" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{f.brand ?? ""}</td>
                    <td className="px-3 py-2 text-right">
                      {archived ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            restoreFood.mutate(f.id);
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          title="Restore"
                        >
                          <RotateCcw className="size-4" />
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete "${f.name}"?`)) deleteFood.mutate(f.id);
                          }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {capped && (
            <p className="text-xs text-muted-foreground p-2 border-t">
              Showing the first {foods.length} results. Refine the search to narrow down.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
