import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getActivity } from "@/lib/activity/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { sb, user } = await requireUser();
    return NextResponse.json(await getActivity(sb, user.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Activity unavailable" }, { status: error instanceof UnauthorizedError ? 401 : 500 });
  }
}
