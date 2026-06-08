import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export const apiKeysKeys = {
  all: ["api-keys"] as const,
  list: () => [...apiKeysKeys.all, "list"] as const,
};

// Indexed member access (rpc.api.v1["api-keys"]) tangled with the trailing
// .$get in a single type expression confuses Vite's oxc parser. Pull the
// endpoint into a local const first; TS infers the same callable shape.
const apiKeysGet = rpc.api.v1["api-keys"].$get;
const apiKeysPost = rpc.api.v1["api-keys"].$post;
const apiKeysDelete = rpc.api.v1["api-keys"][":id"].$delete;
export type ApiKeyRow = RpcData<typeof apiKeysGet>["data"][number];

export function useApiKeys() {
  return useQuery({
    queryKey: apiKeysKeys.list(),
    queryFn: () => unwrap(apiKeysGet()).then((r) => r.data),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) => unwrap(apiKeysPost({ json: body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: apiKeysKeys.list() }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(apiKeysDelete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: apiKeysKeys.list() }),
  });
}
