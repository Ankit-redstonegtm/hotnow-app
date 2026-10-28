import { NextResponse } from "next/server";
import { deliveryProviderInput } from "@/lib/validation";
import { jsonError, requireWorkspace } from "@/lib/delivery/http";
import { deleteConnection } from "@/lib/delivery/store";

export async function POST(req: Request) {
  try {
    const { admin, profile } = await requireWorkspace();
    const body = deliveryProviderInput.parse(await req.json());
    await deleteConnection(admin, profile.id, body.provider);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
