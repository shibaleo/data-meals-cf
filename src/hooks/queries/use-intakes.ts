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

function itemsFromBody(intakeId: string, items: IntakeBody["items"], now: string) {
  return items.map((it, i) => ({
    id: `${intakeId}-item-${i}`,
    intakeId,
    mealId: it.meal_id,
    coef: String(it.coef),
    sortOrder: it.sort_order,
    createdAt: now,
  }));
}

export function useCreateIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IntakeBody) => unwrap(rpc.api.v1.intakes.$post({ json: body })),
    onSuccess: (res, body) => {
      const created = res.data as { id: string } | null;
      if (!created) return;
      const now = new Date().toISOString();
      const newRow = {
        id: created.id,
        eatenAt: body.eaten_at,
        mealKind: body.meal_kind,
        notes: body.notes ?? null,
        createdAt: now,
        updatedAt: now,
        items: itemsFromBody(created.id, body.items, now),
      } as unknown as IntakeRow;
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
    onSuccess: (_res, { id, body }) => {
      qc.setQueryData<IntakeRow[]>(intakesKeys.list(), (prev) => {
        if (!prev) return prev;
        const now = new Date().toISOString();
        return prev.map((r) => {
          if (r.id !== id) return r;
          const next: IntakeRow = {
            ...r,
            ...(body.eaten_at !== undefined ? { eatenAt: body.eaten_at } : {}),
            ...(body.meal_kind !== undefined ? { mealKind: body.meal_kind } : {}),
            ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
            updatedAt: now,
            ...(body.items !== undefined ? { items: itemsFromBody(id, body.items, now) } : {}),
          } as IntakeRow;
          return next;
        }).sort((a, b) => new Date(b.eatenAt).getTime() - new Date(a.eatenAt).getTime());
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
