import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser } from "@/lib/db/repo";

export const maxDuration = 60;

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const row = await getSellerProfileByUser(sb, user.id);
    if (!row) return NextResponse.json({ status: "none" });

    const state = row.research_status;
    if (state === "done") return NextResponse.json({ status: "done", profile: toProfileDTO(row) });
    if (state === "failed") return NextResponse.json({ status: "failed", error: row.raw_research?._background?.researchError || "Research failed. Please retry." });
    return NextResponse.json({ status: ["queued", "starting", "running", "ready"].includes(state) ? "running" : state || "none", stage: state });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ status: "failed", error: e instanceof Error ? e.message : "error" }, { status: 200 });
  }
}

function toProfileDTO(row: any) {
  return {
    companyName: row.company_name ?? row.domain,
    productDescription: row.product_description ?? "",
    targetCustomers: row.target_customers ?? "",
    problemsSolved: row.problems_solved ?? "",
    buyerPersonas: row.buyer_personas ?? [],
    industries: row.industries ?? [],
  };
}
