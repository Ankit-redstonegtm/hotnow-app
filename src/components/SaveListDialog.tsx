"use client";

// Save-to-list modal — replaces the old window.prompt() on Companies and Contacts.
// Posts to POST /api/lists with the exact existing payload shape; nothing else changed.

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

export function SaveListDialog({
  open, onOpenChange, kind, ids, defaultName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "companies" | "contacts";
  ids: string[];
  defaultName: string;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);

  const noun = kind === "companies" ? "companies" : "contacts";
  const count = ids.length;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const body = kind === "companies"
        ? { name: trimmed, kind, opportunityIds: ids }
        : { name: trimmed, kind, contactIds: ids };
      const r = await fetch("/api/lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save the list.");
      toast({ title: `Saved “${trimmed}”`, description: `${j.added} ${noun} added.`, variant: "success" });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Couldn't save list", description: err instanceof Error ? err.message : "Please try again.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Save to a list</DialogTitle>
            <DialogDescription>
              {count > 0 ? `${count} ${noun} will be added to a new list.` : `All ${noun} will be added to a new list.`}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="list-name">List name</Label>
            <Input id="list-name" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Hot companies" disabled={busy} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={busy}>Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>Save list</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
