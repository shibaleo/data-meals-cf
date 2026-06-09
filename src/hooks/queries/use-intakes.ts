import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export const intakesKeys = {
  all: ["intakes"] as const,
  list: () => [...intakesKeys.all, "list"] as const,
};

export type IntakeRow = RpcData<typeof rpc.api.v1.intakes.$get>["data"][number];
type IntakeBody = Parameters<typeof rpc.api.v1.intakes.$post>[0]["json"];

export function useIntakes() {
  return useQuery({
    queryKey: intakesKeys.list(),
    queryFn: () => unwrap(rpc.api.v1.intakes.$get()).then((r) => r.data),
  });
}

// See memory/feedback_cache_pattern.md — derive cache from body, never refetch.

export function useCreateIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IntakeBody) => unwrap(rpc.api.v1.intakes.$post({ json: body })),
    onSuccess: (res) => {
      // Server returns the full expanded row (intake + items LEFT JOIN meal),
      // so the cache patch carries the meal names directly. Fallback path
      // (server returned an unexpanded row) is left for safety.
      const created = res.data as IntakeRow | { id: string } | null;
      if (!created) return;
      const newRow = (created as IntakeRow).items
        ? (created as IntakeRow)
        : null;
      if (!newRow) return;
      qc.setQueryData<IntakeRow[]>(intakesKeys.list(), (prev) => {
        const base = prev ?? [];
        return [newRow, ...base].sort(
          (a, b) => new Date(b.eatenAt).getTime() - new Date(a.eatenAt).getTime(),
        );
      });
    },
  });
}

export function useUpdateIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: {
      id: string;
      body: Parameters<typeof rpc.api.v1.intakes[":id"]["$put"]>[0]["json"];
    }) => unwrap(rpc.api.v1.intakes[":id"].$put({ param: { id }, json: body })),
    onSuccess: (res, { id }) => {
      // Same expansion contract as create — server hands back the fully
      // joined row so item names survive into the cache.
      const updated = res.data as IntakeRow | null;
      if (!updated || !(updated as IntakeRow).items) return;
      qc.setQueryData<IntakeRow[]>(intakesKeys.list(), (prev) => {
        if (!prev) return prev;
        return prev.map((r) => r.id === id ? updated : r)
          .sort((a, b) => new Date(b.eatenAt).getTime() - new Date(a.eatenAt).getTime());
      });
    },
  });
}

export function useDeleteIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.intakes[":id"].$delete({ param: { id } })),
    onSuccess: (_res, id) => {
      qc.setQueryData<IntakeRow[]>(intakesKeys.list(), (prev) =>
        prev ? prev.filter((r) => r.id !== id) : prev,
      );
    },
  });
}
