import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export const mealsKeys = {
  all: ["meals"] as const,
  list: () => [...mealsKeys.all, "list"] as const,
};

export type MealRow = RpcData<typeof rpc.api.v1.meals.$get>["data"][number];
type MealBody = Parameters<typeof rpc.api.v1.meals.$post>[0]["json"];

export function useMeals() {
  return useQuery({
    queryKey: mealsKeys.list(),
    queryFn: () => unwrap(rpc.api.v1.meals.$get()).then((r) => r.data),
  });
}

// Hyperdrive may serve a stale list for up to its TTL after a write, so we
// patch the local cache from the body we just sent instead of refetching.
// See memory/feedback_cache_pattern.md.

export function useCreateMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MealBody) => unwrap(rpc.api.v1.meals.$post({ json: body })),
    onSuccess: (res, body) => {
      const created = res.data as { id: string } | null;
      if (!created) return;
      const now = new Date().toISOString();
      const newRow = {
        id: created.id,
        name: body.name,
        notes: body.notes ?? null,
        createdAt: now,
        updatedAt: now,
        items: body.items.map((it, i) => ({
          id: `${created.id}-item-${i}`,
          mealId: created.id,
          foodId: it.food_id,
          coef: String(it.coef),
          sortOrder: it.sort_order,
          createdAt: now,
        })),
      } as unknown as MealRow;
      qc.setQueryData<MealRow[]>(mealsKeys.list(), (prev) => {
        const base = prev ?? [];
        return [...base, newRow].sort((a, b) => a.name.localeCompare(b.name));
      });
    },
  });
}

export function useDeleteMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.meals[":id"].$delete({ param: { id } })),
    onSuccess: (_res, id) => {
      qc.setQueryData<MealRow[]>(mealsKeys.list(), (prev) =>
        prev ? prev.filter((r) => r.id !== id) : prev,
      );
    },
  });
}
