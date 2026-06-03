"use client";

import { useEffect, useState } from "react";
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
