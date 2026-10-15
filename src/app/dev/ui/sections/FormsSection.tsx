"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Field } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Switch } from "@/components/ui/Switch";

export default function FormsSection() {
  const [check, setCheck] = useState(true);
  const [on, setOn] = useState(true);
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="text-sm font-semibold mb-3">Buttons</h3>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Find opportunities</Button>
          <Button variant="secondary">Export CSV</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="subtle">Save as list</Button>
          <Button variant="danger"><Trash2 size={15} /> Dismiss</Button>
          <Button variant="primary" loading>Generating…</Button>
          <Button variant="secondary" size="sm">Small</Button>
          <Button variant="secondary" size="icon" aria-label="Add"><Plus size={16} /></Button>
          <Button variant="primary" disabled>Disabled</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
        <Field label="Company domain" hint="We research this to build your profile.">
          <Input placeholder="spotio.com" defaultValue="spotio.com" />
        </Field>
        <Field label="Work email" error="Enter a valid email address.">
          <Input aria-invalid placeholder="you@company.com" defaultValue="not-an-email" />
        </Field>
        <Field label="What you sell" className="sm:col-span-2">
          <Textarea placeholder="One or two lines…" defaultValue="AI-powered field sales execution platform." />
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Toggles</h3>
        <label className="flex items-center gap-2.5 text-sm cursor-pointer w-fit">
          <Checkbox checked={check} onCheckedChange={(v) => setCheck(Boolean(v))} />
          Only companies with a verified work email
        </label>
        <label className="flex items-center gap-2.5 text-sm cursor-pointer w-fit">
          <Switch checked={on} onCheckedChange={setOn} />
          Signal enabled — "Scaling field teams to 5+ reps"
        </label>
      </div>
    </div>
  );
}
