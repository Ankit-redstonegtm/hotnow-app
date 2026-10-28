import { NextResponse } from "next/server";
import { deliveryToggleInput } from "@/lib/validation";
import { DeliveryError } from "@/lib/delivery/errors";
import { jsonError, requireWorkspace } from "@/lib/delivery/http";
import { getConnection, patchConnection } from "@/lib/delivery/store";

export async function POST(req: Request) {
  try {
    const { admin, profile } = await requireWorkspace();
    const body = deliveryToggleInput.parse(await req.json());
    const row = await getConnection(admin, profile.id, body.provider);
    if (!row) throw new DeliveryError("Connect this destination first.", 400);
    await patchConnection(admin, profile.id, body.provider, { enabled: body.enabled });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
