"use client";

import { Building2, Inbox } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";

export default function StatesSection() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="text-sm font-semibold mb-3">Loading (content-shaped skeletons)</h3>
        <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
          {[0, 1].map((i) => (
            <div key={i} className="card p-4">
              <div className="flex items-center gap-2.5">
                <div className="skeleton h-9 w-9 rounded-[10px]" />
                <div className="flex-1"><div className="skeleton h-4 w-32 rounded" /><div className="skeleton h-3 w-20 rounded mt-2" /></div>
                <div className="skeleton h-5 w-14 rounded" />
              </div>
              <div className="skeleton h-3.5 w-full rounded mt-3" />
              <div className="skeleton h-3.5 w-4/5 rounded mt-2" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Empty states (one honest line + one action)</h3>
        <div className="grid gap-3 md:grid-cols-2 max-w-3xl">
          <EmptyState
            icon={<Building2 size={22} />}
            title="No opportunities yet"
            description="Turn on a signal and start a search. We only show companies backed by real evidence."
            action={<Button variant="primary" size="sm">Choose what to look for</Button>}
          />
          <EmptyState
            icon={<Inbox size={22} />}
            title="No decision-makers sourced yet"
            description="This signal is real — the people to reach just aren't on file yet."
            action={<Button variant="secondary" size="sm">Find contacts</Button>}
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Toasts</h3>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast.success("Outreach ready", { description: "Review it below, then copy what you need." })}>Success toast</Button>
          <Button variant="secondary" onClick={() => toast.error("Couldn't generate outreach", { description: "Please try again." })}>Error toast</Button>
          <Button variant="secondary" onClick={() => toast("Saved to \"Hot companies\"")}>Plain toast</Button>
        </div>
      </div>
    </div>
  );
}
