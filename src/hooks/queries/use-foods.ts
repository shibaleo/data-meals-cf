import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export const foodsKeys = {
  all: ["foods"] as const,
  list: () => [...foodsKeys.all, "list"] as const,
};

export type FoodRow = RpcData<typeof rpc.api.v1.foods.$get>["data"][number];

export function useFoods() {
  return useQuery({
    queryKey: foodsKeys.list(),
    queryFn: () => unwrap(rpc.api.v1.foods.$get()).then((r) => r.data),
  });
}

export function useCreateFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof rpc.api.v1.foods.$post>[0]["json"]) =>
      unwrap(rpc.api.v1.foods.$post({ json: body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: foodsKeys.list() }),
  });
}

export function useUpdateFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: {
      id: string;
      body: Parameters<typeof rpc.api.v1.foods[":id"]["$put"]>[0]["json"];
    }) => unwrap(rpc.api.v1.foods[":id"].$put({ param: { id }, json: body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: foodsKeys.list() }),
  });
}

export function useDeleteFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.foods[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: foodsKeys.list() }),
  });
}
