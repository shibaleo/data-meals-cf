import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export const intakesKeys = {
  all: ["intakes"] as const,
  list: () => [...intakesKeys.all, "list"] as const,
};

export type IntakeRow = RpcData<typeof rpc.api.v1.intakes.$get>["data"][number];

export function useIntakes() {
  return useQuery({
    queryKey: intakesKeys.list(),
    queryFn: () => unwrap(rpc.api.v1.intakes.$get()).then((r) => r.data),
  });
}

export function useCreateIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof rpc.api.v1.intakes.$post>[0]["json"]) =>
      unwrap(rpc.api.v1.intakes.$post({ json: body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: intakesKeys.list() }),
  });
}

export function useDeleteIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(rpc.api.v1.intakes[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: intakesKeys.list() }),
  });
}
