// Background ingest: Parallel calls this when a FindAll run reaches a terminal
// state (completed / failed / cancelled). This is what lets results land WITHOUT
// the user keeping a browser tab open on the dashboard.
//
// Auth: Parallel signs every delivery with a Standard Webhooks HMAC-SHA256
// signature. When PARALLEL_WEBHOOK_SECRET is set we verify it. Even unverified,
// this endpoint is safe: it only ever re-fetches the real run's real results from
// Parallel using our own API key and ingests them idempotently - it cannot inject
// data from the request body.

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRunByProviderJobId } from "@/lib/db/repo";
import { ingestRun, notifyIfWaveComplete } from "@/lib/discovery/worker";

export const maxDuration = 300;

export async function POST(req: Request) {
  const raw = await req.text();

  const verified = verifySignature(req, raw);
  if (verified === false) return NextResponse.json({ error: "bad signature" }, { status: 401 });

  let evt: any;
  try {
    evt = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const data = evt.data ?? {};
  const findallId: string | undefined = data.findall_id || data.id || evt.findall_id;
  if (!findallId) return NextResponse.json({ error: "no findall_id" }, { status: 400 });

  const admin = createAdminClient();
  const run = await getRunByProviderJobId(admin, findallId);
  if (!run) return NextResponse.json({ ok: true, note: "unknown run (ignored)" });

  // Already ingested - acknowledge so Parallel stops retrying.
  if (run.status === "completed" || run.status === "failed") {
    return NextResponse.json({ ok: true, idempotent: true, status: run.status });
  }

  const result = await ingestRun(admin, run);
  await notifyIfWaveComplete(admin, run.seller_profile_id);
  return NextResponse.json({ ok: true, ...result });
}

// Some webhook systems send a GET to validate the endpoint; answer it.
export async function GET() {
  return NextResponse.json({ ok: true });
}

/**
 * Standard Webhooks verification.
 * Returns true if valid, false if invalid, null if we're not configured to verify
 * (no secret set) - callers treat null as "allowed" because the handler is safe
 * even without verification.
 */
function verifySignature(req: Request, body: string): boolean | null {
  const secret = process.env.PARALLEL_WEBHOOK_SECRET;
  if (!secret) return null;

  const id = req.headers.get("webhook-id");
  const ts = req.headers.get("webhook-timestamp");
  const sigHeader = req.headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;

  const keyMaterial = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(keyMaterial, "base64");
  } catch {
    return false;
  }

  const signed = `${id}.${ts}.${body}`;
  const expected = crypto.createHmac("sha256", key).update(signed).digest("base64");

  // Header is space-delimited "v1,<sig>" entries; any match is valid.
  for (const entry of sigHeader.split(" ")) {
    const sig = entry.includes(",") ? entry.split(",")[1] : entry;
    if (sig && timingSafeEq(sig, expected)) return true;
  }
  return false;
}

function timingSafeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
