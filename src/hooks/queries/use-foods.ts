import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type QueryClient, type InfiniteData } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export const foodsKeys = {
  all: ["foods"] as const,
  list: (params: { q?: string; includeArchived?: boolean; limit?: number }) =>
    [...foodsKeys.all, "list", {
      q: params.q ?? "",
      includeArchived: !!params.includeArchived,
      limit: params.limit ?? null,
    }] as const,
  infinite: (params: { q?: string; includeArchived?: boolean; pageSize?: number }) =>
    [...foodsKeys.all, "infinite", {
      q: params.q ?? "",
      includeArchived: !!params.includeArchived,
      pageSize: params.pageSize ?? 100,
    }] as const,
  nutrientKeys: () => [...foodsKeys.all, "nutrient-keys"] as const,
};

export type FoodRow = RpcData<typeof rpc.api.v1.foods.$get>["data"][number];
export type FoodDetailRow = RpcData<typeof rpc.api.v1.foods[":id"]["$get"]>["data"];
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

// Same idea for the useInfiniteFoods page bundles.
function forEachInfiniteCache(
  qc: QueryClient,
  fn: (page: ListResult, pageIdx: number) => ListResult,
) {
  const queries = qc.getQueriesData<InfiniteData<ListResult, number>>({ queryKey: [...foodsKeys.all, "infinite"] });
  for (const [key, prev] of queries) {
    if (!prev) continue;
    qc.setQueryData<InfiniteData<ListResult, number>>(key, {
      ...prev,
      pages: prev.pages.map((p, i) => fn(p, i)),
    });
  }
}

function makeStubRow(id: string, patch: Partial<FoodRow>): FoodRow {
  const now = new Date().toISOString();
  return {
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
}

function upsertRow(qc: QueryClient, id: string, patch: Partial<FoodRow>) {
  forEachListCache(qc, (prev) => {
    if (!prev) return prev;
    const idx = prev.data.findIndex((r) => r.id === id);
    if (idx === -1) {
      const next = [...prev.data, makeStubRow(id, patch)].sort((a, b) => a.name.localeCompare(b.name));
      return { data: next, limit: prev.limit };
    }
    const data = prev.data.slice();
    data[idx] = { ...data[idx], ...patch };
    return { data: data.sort((a, b) => a.name.localeCompare(b.name)), limit: prev.limit };
  });
  // For infinite caches: locate the page that holds the row and patch in
  // place. Newly-created rows go on the first page (sorted within it).
  forEachInfiniteCache(qc, (page, pageIdx) => {
    const idx = page.data.findIndex((r) => r.id === id);
    if (idx >= 0) {
      const data = page.data.slice();
      data[idx] = { ...data[idx], ...patch };
      return { ...page, data: data.sort((a, b) => a.name.localeCompare(b.name)) };
    }
    if (pageIdx === 0 && !page.data.some((r) => r.id === id)) {
      const data = [...page.data, makeStubRow(id, patch)].sort((a, b) => a.name.localeCompare(b.name));
      return { ...page, data };
    }
    return page;
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

function archiveRowAcross(qc: QueryClient, id: string, archivedAt: string | null) {
  // Flat caches.
  const flat = qc.getQueriesData<ListResult>({ queryKey: [...foodsKeys.all, "list"] });
  for (const [key, prev] of flat) {
    if (!prev) continue;
    const params = key[key.length - 1] as { includeArchived: boolean };
    if (params.includeArchived) {
      qc.setQueryData<ListResult>(key, {
        ...prev,
        data: prev.data.map((r) => r.id === id ? { ...r, archivedAt } : r),
      });
    } else if (archivedAt !== null) {
      qc.setQueryData<ListResult>(key, {
        ...prev,
        data: prev.data.filter((r) => r.id !== id),
      });
    }
  }
  // Infinite caches.
  const inf = qc.getQueriesData<InfiniteData<ListResult, number>>({ queryKey: [...foodsKeys.all, "infinite"] });
  for (const [key, prev] of inf) {
    if (!prev) continue;
    const params = key[key.length - 1] as { includeArchived: boolean };
    qc.setQueryData<InfiniteData<ListResult, number>>(key, {
      ...prev,
      pages: prev.pages.map((page) => {
        if (params.includeArchived) {
          return { ...page, data: page.data.map((r) => r.id === id ? { ...r, archivedAt } : r) };
        }
        if (archivedAt !== null) {
          return { ...page, data: page.data.filter((r) => r.id !== id) };
        }
        return page;
      }),
    });
  }
}

export function useDeleteFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.foods[":id"].$delete({ param: { id } })),
    onSuccess: (_res, id) => archiveRowAcross(qc, id, new Date().toISOString()),
  });
}

export function useRestoreFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.foods[":id"].restore.$post({ param: { id } })),
    onSuccess: (_res, id) => {
      archiveRowAcross(qc, id, null);
      // Active list might not have this row — refetch to surface it.
      qc.invalidateQueries({ queryKey: [...foodsKeys.all, "list"], predicate: (q) => {
        const last = q.queryKey[q.queryKey.length - 1] as { includeArchived?: boolean } | undefined;
        return last?.includeArchived === false;
      }});
      qc.invalidateQueries({ queryKey: [...foodsKeys.all, "infinite"], predicate: (q) => {
        const last = q.queryKey[q.queryKey.length - 1] as { includeArchived?: boolean } | undefined;
        return last?.includeArchived === false;
      }});
    },
  });
}

// Detail fetch — only kicked off when the dialog actually opens for edit.
// staleTime keeps a recently-fetched detail from re-firing if the user closes
// + reopens quickly.
export function useFoodDetail(id: string | null) {
  return useQuery({
    queryKey: [...foodsKeys.all, "detail", id],
    enabled: id !== null,
    staleTime: 30_000,
    queryFn: () =>
      unwrap(rpc.api.v1.foods[":id"].$get({ param: { id: id! } })).then((r) => r.data as FoodDetailRow),
  });
}

export function useInfiniteFoods(params: { q?: string; includeArchived?: boolean; pageSize?: number } = {}) {
  const q = params.q ?? "";
  const includeArchived = !!params.includeArchived;
  const pageSize = params.pageSize ?? 100;
  return useInfiniteQuery({
    queryKey: foodsKeys.infinite({ q, includeArchived, pageSize }),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      unwrap(rpc.api.v1.foods.$get({
        query: {
          ...(q ? { q } : {}),
          ...(includeArchived ? { include_archived: "1" } : {}),
          limit: String(pageSize),
          offset: String(pageParam),
        },
      })).then((r) => ({ data: r.data as FoodRow[], limit: r.limit ?? pageSize })),
    getNextPageParam: (last, all) => {
      // If the last page came back full, there might be more.
      if (last.data.length < last.limit) return undefined;
      return all.reduce((sum, p) => sum + p.data.length, 0);
    },
    placeholderData: (prev) => prev,
  });
}
