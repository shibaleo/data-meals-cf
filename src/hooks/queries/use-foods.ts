import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export const foodsKeys = {
  all: ["foods"] as const,
  list: (params: { q?: string; includeArchived?: boolean; limit?: number }) =>
    [...foodsKeys.all, "list", {
      q: params.q ?? "",
      includeArchived: !!params.includeArchived,
      limit: params.limit ?? null,
    }] as const,
  nutrientKeys: () => [...foodsKeys.all, "nutrient-keys"] as const,
};

export type FoodRow = RpcData<typeof rpc.api.v1.foods.$get>["data"][number];
type FoodBody = Parameters<typeof rpc.api.v1.foods.$post>[0]["json"];

// Wrapper carries the server limit so consumers can warn when results were
// capped without a separate COUNT query.
interface ListResult { data: FoodRow[]; limit: number }

function bodyToRowPatch(body: Partial<FoodBody>): Partial<FoodRow> {
  const out: Record<string, unknown> = {};
  if (body.name !== undefined) out.name = body.name;
  if (body.brand !== undefined) out.brand = body.brand;
  if (body.serving_basis !== undefined) out.servingBasis = body.serving_basis;
  if (body.label_basis_amount !== undefined) out.labelBasisAmount = body.label_basis_amount;
  if (body.source_label_url !== undefined) out.sourceLabelUrl = body.source_label_url;
  if (body.notes !== undefined) out.notes = body.notes;
  if (body.kcal_per_100g !== undefined) out.kcalPer100g = body.kcal_per_100g;
  if (body.protein_g_per_100g !== undefined) out.proteinGPer100g = body.protein_g_per_100g;
  if (body.fat_g_per_100g !== undefined) out.fatGPer100g = body.fat_g_per_100g;
  if (body.carb_g_per_100g !== undefined) out.carbGPer100g = body.carb_g_per_100g;
  if (body.vitamin_json !== undefined) out.vitaminJson = body.vitamin_json ?? {};
  if (body.mineral_json !== undefined) out.mineralJson = body.mineral_json ?? {};
  return out as Partial<FoodRow>;
}

// Apply a per-row patch to every cached foods list (regardless of which q/
// includeArchived combination it was fetched with).
function forEachListCache(qc: QueryClient, fn: (prev: ListResult | undefined) => ListResult | undefined) {
  const queries = qc.getQueriesData<ListResult>({ queryKey: [...foodsKeys.all, "list"] });
  for (const [key] of queries) qc.setQueryData<ListResult>(key, (prev) => fn(prev));
}

function upsertRow(qc: QueryClient, id: string, patch: Partial<FoodRow>) {
  forEachListCache(qc, (prev) => {
    if (!prev) return prev;
    const idx = prev.data.findIndex((r) => r.id === id);
    if (idx === -1) {
      const now = new Date().toISOString();
      const row = {
        id,
        name: "",
        brand: null,
        servingBasis: "g",
        labelBasisAmount: "100",
        sourceLabelUrl: null,
        notes: null,
        kcalPer100g: "0",
        proteinGPer100g: "0",
        fatGPer100g: "0",
        carbGPer100g: "0",
        vitaminJson: {},
        mineralJson: {},
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        ...patch,
      } as unknown as FoodRow;
      const next = [...prev.data, row].sort((a, b) => a.name.localeCompare(b.name));
      return { data: next, limit: prev.limit };
    }
    const data = prev.data.slice();
    data[idx] = { ...data[idx], ...patch };
    return { data: data.sort((a, b) => a.name.localeCompare(b.name)), limit: prev.limit };
  });
}

export function useFoods(params: { q?: string; includeArchived?: boolean; limit?: number } = {}) {
  const q = params.q ?? "";
  const includeArchived = !!params.includeArchived;
  const limit = params.limit;
  return useQuery({
    queryKey: foodsKeys.list({ q, includeArchived, limit }),
    queryFn: () =>
      unwrap(rpc.api.v1.foods.$get({
        query: {
          ...(q ? { q } : {}),
          ...(includeArchived ? { include_archived: "1" } : {}),
          ...(limit ? { limit: String(limit) } : {}),
        },
      })).then((r) => ({ data: r.data as FoodRow[], limit: r.limit ?? (limit ?? 100) })),
    placeholderData: (prev) => prev,
  });
}

export type NutrientKeys = { vitamins: string[]; minerals: string[] };

export function useNutrientKeys() {
  return useQuery({
    queryKey: foodsKeys.nutrientKeys(),
    queryFn: () =>
      unwrap(rpc.api.v1.foods["nutrient-keys"].$get()).then((r) => r.data as NutrientKeys),
    staleTime: 60_000,
  });
}

export function useCreateFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FoodBody) => unwrap(rpc.api.v1.foods.$post({ json: body })),
    onSuccess: (res, body) => {
      const created = res.data as { id: string } | null;
      if (!created) return;
      upsertRow(qc, created.id, bodyToRowPatch(body));
      qc.invalidateQueries({ queryKey: foodsKeys.nutrientKeys() });
    },
  });
}

export function useUpdateFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: {
      id: string;
      body: Parameters<typeof rpc.api.v1.foods[":id"]["$put"]>[0]["json"];
    }) => unwrap(rpc.api.v1.foods[":id"].$put({ param: { id }, json: body })),
    onSuccess: (_res, { id, body }) => {
      upsertRow(qc, id, bodyToRowPatch(body));
      qc.invalidateQueries({ queryKey: foodsKeys.nutrientKeys() });
    },
  });
}

export function useDeleteFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.foods[":id"].$delete({ param: { id } })),
    onSuccess: (_res, id) => {
      const archivedAt = new Date().toISOString();
      const queries = qc.getQueriesData<ListResult>({ queryKey: [...foodsKeys.all, "list"] });
      for (const [key, prev] of queries) {
        if (!prev) continue;
        // Cache key shape: [..."list", { q, includeArchived, limit }]
        const params = key[key.length - 1] as { includeArchived: boolean };
        if (params.includeArchived) {
          qc.setQueryData<ListResult>(key, {
            ...prev,
            data: prev.data.map((r) => r.id === id ? { ...r, archivedAt } : r),
          });
        } else {
          qc.setQueryData<ListResult>(key, {
            ...prev,
            data: prev.data.filter((r) => r.id !== id),
          });
        }
      }
    },
  });
}

export function useRestoreFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.foods[":id"].restore.$post({ param: { id } })),
    onSuccess: (_res, id) => {
      const queries = qc.getQueriesData<ListResult>({ queryKey: [...foodsKeys.all, "list"] });
      for (const [key, prev] of queries) {
        if (!prev) continue;
        const params = key[key.length - 1] as { includeArchived: boolean };
        if (params.includeArchived) {
          qc.setQueryData<ListResult>(key, {
            ...prev,
            data: prev.data.map((r) => r.id === id ? { ...r, archivedAt: null } : r),
          });
        }
      }
      // Active list might not have this row — refetch.
      qc.invalidateQueries({ queryKey: [...foodsKeys.all, "list"], predicate: (q) => {
        const last = q.queryKey[q.queryKey.length - 1] as { includeArchived?: boolean } | undefined;
        return last?.includeArchived === false;
      }});
    },
  });
}
