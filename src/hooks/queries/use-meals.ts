import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export const mealsKeys = {
  all: ["meals"] as const,
  list: (includeArchived = false) =>
    [...mealsKeys.all, "list", includeArchived] as const,
};

export type MealRow = RpcData<typeof rpc.api.v1.meals.$get>["data"][number];
type MealBody = Parameters<typeof rpc.api.v1.meals.$post>[0]["json"];

export function useMeals(includeArchived = false) {
  return useQuery({
    queryKey: mealsKeys.list(includeArchived),
    queryFn: () =>
      unwrap(rpc.api.v1.meals.$get({
        query: includeArchived ? { include_archived: "1" } : {},
      })).then((r) => r.data),
  });
}

function itemsFromBody(mealId: string, items: MealBody["items"], now: string) {
  return items.map((it, i) => ({
    id: `${mealId}-item-${i}`,
    mealId,
    foodId: it.food_id,
    coef: String(it.coef),
    sortOrder: it.sort_order,
    createdAt: now,
  }));
}

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
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        items: itemsFromBody(created.id, body.items, now),
      } as unknown as MealRow;
      for (const ia of [false, true]) {
        qc.setQueryData<MealRow[]>(mealsKeys.list(ia), (prev) => {
          const base = prev ?? [];
          return [...base, newRow].sort((a, b) => a.name.localeCompare(b.name));
        });
      }
    },
  });
}

export function useUpdateMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: {
      id: string;
      body: Parameters<typeof rpc.api.v1.meals[":id"]["$put"]>[0]["json"];
    }) => unwrap(rpc.api.v1.meals[":id"].$put({ param: { id }, json: body })),
    onSuccess: (_res, { id, body }) => {
      const patch = (r: MealRow): MealRow => {
        const now = new Date().toISOString();
        return {
          ...r,
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
          updatedAt: now,
          ...(body.items !== undefined ? {
            items: itemsFromBody(id, body.items, now),
          } : {}),
        } as MealRow;
      };
      for (const ia of [false, true]) {
        qc.setQueryData<MealRow[]>(mealsKeys.list(ia), (prev) =>
          prev ? prev.map((r) => r.id === id ? patch(r) : r)
            .sort((a, b) => a.name.localeCompare(b.name)) : prev);
      }
    },
  });
}

export function useDeleteMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.meals[":id"].$delete({ param: { id } })),
    onSuccess: (_res, id) => {
      qc.setQueryData<MealRow[]>(mealsKeys.list(false), (prev) =>
        prev ? prev.filter((r) => r.id !== id) : prev);
      qc.setQueryData<MealRow[]>(mealsKeys.list(true), (prev) =>
        prev ? prev.map((r) => r.id === id ? { ...r, archivedAt: new Date().toISOString() } : r) : prev);
    },
  });
}

export function useRestoreMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.meals[":id"].restore.$post({ param: { id } })),
    onSuccess: (_res, id) => {
      qc.setQueryData<MealRow[]>(mealsKeys.list(true), (prev) =>
        prev ? prev.map((r) => r.id === id ? { ...r, archivedAt: null } : r) : prev);
      qc.invalidateQueries({ queryKey: mealsKeys.list(false) });
    },
  });
}
