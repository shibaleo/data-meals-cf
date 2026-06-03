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

// Updates the cached list in place using the server's authoritative row.
// We deliberately don't invalidate (no refetch) because Hyperdrive may serve
// the stale pre-write result until its TTL expires. The server response is
// already post-write since the route SELECTs after UPDATE on the same
// connection, which bypasses Hyperdrive's cache.
function patchListWithRow(qc: ReturnType<typeof useQueryClient>, row: FoodRow | null) {
  if (!row) return;
  qc.setQueryData<FoodRow[]>(foodsKeys.list(), (prev) => {
    if (!prev) return [row];
    const idx = prev.findIndex((r) => r.id === row.id);
    if (idx === -1) {
      return [...prev, row].sort((a, b) => a.name.localeCompare(b.name));
    }
    const next = prev.slice();
    next[idx] = row;
    return next.sort((a, b) => a.name.localeCompare(b.name));
  });
}

export function useCreateFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof rpc.api.v1.foods.$post>[0]["json"]) =>
      unwrap(rpc.api.v1.foods.$post({ json: body })),
    onSuccess: (res) => patchListWithRow(qc, res.data as FoodRow | null),
  });
}

export function useUpdateFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: {
      id: string;
      body: Parameters<typeof rpc.api.v1.foods[":id"]["$put"]>[0]["json"];
    }) => unwrap(rpc.api.v1.foods[":id"].$put({ param: { id }, json: body })),
    onSuccess: (res) => patchListWithRow(qc, res.data as FoodRow | null),
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
