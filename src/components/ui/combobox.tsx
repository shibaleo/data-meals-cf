"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  emptyText = "No matches",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      // Focus after the popover paints.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const needle = q.trim().toLowerCase();
  const matched = needle === ""
    ? options
    : options.filter((o) => {
        const hay = `${o.label} ${o.hint ?? ""}`.toLowerCase();
        return hay.includes(needle);
      });
  // Cap rendered rows; large masters (~2500) tank Popover paint without this.
  const cap = 80;
  const filtered = matched.slice(0, cap);
  const truncated = matched.length > cap;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center justify-between rounded-md border bg-background px-2 py-1.5 text-sm h-9 w-full",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate text-left">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-[min(28rem,var(--radix-popover-trigger-width,28rem))]">
        <div className="flex items-center gap-1 border-b px-2">
          <Search className="size-3.5 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="h-8 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{emptyText}</p>
          ) : (
            <>
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-left hover:bg-accent"
              >
                <Check className={cn("size-3.5 shrink-0", o.value === value ? "opacity-100" : "opacity-0")} />
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && <span className="text-xs text-muted-foreground shrink-0">{o.hint}</span>}
              </button>
            ))}
            {truncated && (
              <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-t">
                Showing first {cap}. Type to refine ({matched.length - cap} more).
              </p>
            )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
