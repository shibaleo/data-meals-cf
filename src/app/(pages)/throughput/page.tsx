"use client";

import { usePageTitle } from "@/lib/page-context";

export default function ThroughputPage() {
  usePageTitle("Throughput");
  return (
    <div className="p-4">
      <div className="text-sm text-muted-foreground">
        PFC throughput (Tetris). To be implemented (Phase 2).
      </div>
    </div>
  );
}
