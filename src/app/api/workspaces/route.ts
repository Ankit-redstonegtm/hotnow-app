import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const { data, error } = await sb.from("seller_profiles")
      .select("id, domain, company_name, research_status").eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ workspaces: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load companies" },
      { status: e instanceof UnauthorizedError ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const { id } = await req.json();
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });
    }
    const { data, error } = await sb.from("seller_profiles").select("id")
      .eq("user_id", user.id).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    (await cookies()).set("hotnow_workspace", id, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not switch company" },
      { status: e instanceof UnauthorizedError ? 401 : 500 });
  }
}
