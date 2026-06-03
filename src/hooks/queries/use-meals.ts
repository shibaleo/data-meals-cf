import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export const mealsKeys = {
  all: ["meals"] as const,
  list: () => [...mealsKeys.all, "list"] as const,
};

export type MealRow = RpcData<typeof rpc.api.v1.meals.$get>["data"][number];

export function useMeals() {
  return useQuery({
    queryKey: mealsKeys.list(),
    queryFn: () => unwrap(rpc.api.v1.meals.$get()).then((r) => r.data),
  });
}

export function useCreateMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof rpc.api.v1.meals.$post>[0]["json"]) =>
      unwrap(rpc.api.v1.meals.$post({ json: body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: mealsKeys.list() }),
  });
}

export function useDeleteMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.meals[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: mealsKeys.list() }),
  });
}
