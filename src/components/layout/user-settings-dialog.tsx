"use client";

import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useMe } from "@/components/auth/auth-gate";
import { ApiError } from "@/lib/api-client";
import { rpc, unwrap } from "@/lib/rpc-client";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/hooks/queries/use-api-keys";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserSettingsDialog({ open, onOpenChange }: Props) {
  const { me, refresh } = useMe();
  const [name, setName] = useState(me.name);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setName(me.name);
  }, [open, me.name]);

  async function handleSave() {
    if (!name.trim() || name === me.name) return;
    setSaving(true);
    try {
      await unwrap(
        rpc.api.v1.users[":id"].$put({
          param: { id: me.id },
          json: { name: name.trim() },
        }),
      );
      await refresh();
      toast.success("Display name updated");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User Settings</DialogTitle>
          <DialogDescription className="sr-only">Manage your account settings</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Profile</h3>
            <div className="space-y-1">
              <Label>Email</Label>
              <p className="text-sm text-muted-foreground">{me.email}</p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Display Name</h3>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !name.trim() || name === me.name}
              >
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </section>

          <ApiKeysSection />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ApiKeysSection() {
  const { data: keys = [] } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const [newName, setNewName] = useState("");
  const [justIssued, setJustIssued] = useState<string | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const res = await createKey.mutateAsync({ name: newName.trim() });
      const key = (res.data as { key?: string } | null)?.key;
      if (key) {
        setJustIssued(key);
        try { await navigator.clipboard.writeText(key); } catch { /* clipboard denied */ }
        toast.success("API key created (copied to clipboard)");
      }
      setNewName("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "Failed to create");
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">API Keys</h3>
      <p className="text-xs text-muted-foreground">
        Use <code>Authorization: Bearer dm_…</code> against the API. The full key is shown once on creation only.
      </p>
      {justIssued && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-1 text-xs">
          <p className="font-semibold">Save this key now — it won't be shown again:</p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 break-all bg-background px-2 py-1 rounded">{justIssued}</code>
            <button onClick={() => {
              navigator.clipboard.writeText(justIssued).then(() => toast.success("Copied"));
            }} className="text-muted-foreground hover:text-foreground" title="Copy">
              <Copy className="size-3.5" />
            </button>
          </div>
          <button className="text-[10px] text-muted-foreground hover:text-foreground underline"
            onClick={() => setJustIssued(null)}>Dismiss</button>
        </div>
      )}
      <div className="flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="Key label (e.g. siri-shortcut)" />
        <Button size="sm" onClick={handleCreate} disabled={createKey.isPending || !newName.trim()}>
          {createKey.isPending ? "Creating…" : "Create"}
        </Button>
      </div>
      {keys.length === 0 ? (
        <p className="text-xs text-muted-foreground">No keys yet.</p>
      ) : (
        <ul className="divide-y rounded-md border text-xs">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  {k.name}
                  {!k.isActive && <span className="text-[10px] text-muted-foreground">(revoked)</span>}
                </div>
                <div className="text-muted-foreground">
                  <code>{k.keyPrefix}…</code> · last used{" "}
                  {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "—"}
                </div>
              </div>
              {k.isActive && (
                <button onClick={() => {
                  if (confirm(`Revoke "${k.name}"?`)) revokeKey.mutate(k.id);
                }} className="text-muted-foreground hover:text-destructive" title="Revoke">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
