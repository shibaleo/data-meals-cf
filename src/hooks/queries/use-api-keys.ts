import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export const apiKeysKeys = {
  all: ["api-keys"] as const,
  list: () => [...apiKeysKeys.all, "list"] as const,
};

export type ApiKeyRow = RpcData<typeof rpc.api.v1["api-keys"].$get>["data"][number];

export function useApiKeys() {
  return useQuery({
    queryKey: apiKeysKeys.list(),
    queryFn: () => unwrap(rpc.api.v1["api-keys"].$get()).then((r) => r.data),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) =>
      unwrap(rpc.api.v1["api-keys"].$post({ json: body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: apiKeysKeys.list() }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1["api-keys"][":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: apiKeysKeys.list() }),
  });
}
