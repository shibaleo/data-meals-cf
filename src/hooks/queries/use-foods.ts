import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export const foodsKeys = {
  all: ["foods"] as const,
  list: () => [...foodsKeys.all, "list"] as const,
};

export type FoodRow = RpcData<typeof rpc.api.v1.foods.$get>["data"][number];
type FoodBody = Parameters<typeof rpc.api.v1.foods.$post>[0]["json"];

// Map the snake_case API body into a FoodRow shape. Used to patch the cache
// without re-reading from the server (Hyperdrive may serve a stale row for up
// to its TTL even after a same-request SELECT post-write).
function bodyToRowPatch(body: Partial<FoodBody>): Partial<FoodRow> {
  const out: Record<string, unknown> = {};
  if (body.name !== undefined) out.name = body.name;
  if (body.brand !== undefined) out.brand = body.brand;
  if (body.default_serving_g !== undefined) out.defaultServingG = body.default_serving_g;
  if (body.serving_basis !== undefined) out.servingBasis = body.serving_basis;
  if (body.label_basis_amount !== undefined) out.labelBasisAmount = body.label_basis_amount;
  if (body.kcal_per_100g !== undefined) out.kcalPer100g = body.kcal_per_100g;
  if (body.protein_g_per_100g !== undefined) out.proteinGPer100g = body.protein_g_per_100g;
  if (body.fat_g_per_100g !== undefined) out.fatGPer100g = body.fat_g_per_100g;
  if (body.carb_g_per_100g !== undefined) out.carbGPer100g = body.carb_g_per_100g;
  if (body.vitamin_json !== undefined) out.vitaminJson = body.vitamin_json ?? {};
  if (body.mineral_json !== undefined) out.mineralJson = body.mineral_json ?? {};
  return out as Partial<FoodRow>;
}

function upsertRow(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  patch: Partial<FoodRow>,
) {
  qc.setQueryData<FoodRow[]>(foodsKeys.list(), (prev) => {
    if (!prev) return prev;
    const idx = prev.findIndex((r) => r.id === id);
    if (idx === -1) {
      // New row — fill in safe defaults for fields not in the patch.
      const now = new Date().toISOString();
      const row = {
        id,
        name: "",
        brand: null,
        defaultServingG: null,
        servingBasis: "g",
        labelBasisAmount: "100",
        notes: null,
        kcalPer100g: "0",
        proteinGPer100g: "0",
        fatGPer100g: "0",
        carbGPer100g: "0",
        vitaminJson: {},
        mineralJson: {},
        createdAt: now,
        updatedAt: now,
        ...patch,
      } as unknown as FoodRow;
      return [...prev, row].sort((a, b) => a.name.localeCompare(b.name));
    }
    const next = prev.slice();
    next[idx] = { ...next[idx], ...patch };
    return next.sort((a, b) => a.name.localeCompare(b.name));
  });
}

export function useFoods() {
  return useQuery({
    queryKey: foodsKeys.list(),
    queryFn: () => unwrap(rpc.api.v1.foods.$get()).then((r) => r.data),
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
    },
  });
}

export function useDeleteFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.foods[":id"].$delete({ param: { id } })),
    onSuccess: (_res, id) => {
      qc.setQueryData<FoodRow[]>(foodsKeys.list(), (prev) =>
        prev ? prev.filter((r) => r.id !== id) : prev,
      );
    },
  });
}
