"use client";

import { usePageTitle } from "@/lib/page-context";

export default function TimingPage() {
  usePageTitle("Timing");
  return (
    <div className="p-4">
      <div className="text-sm text-muted-foreground">
        Daily intake timeline. To be implemented (Phase 2).
      </div>
    </div>
  );
}
