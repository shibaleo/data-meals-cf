"use client";

import { usePageTitle } from "@/lib/page-context";

export default function AboutPage() {
  usePageTitle("About");
  return (
    <div className="p-4 space-y-2 text-sm">
      <p>data-meals — PFC + 摂取タイミング記録。</p>
      <p className="text-muted-foreground">Schema: data_meals (Neon, shared with data-drills).</p>
    </div>
  );
}
