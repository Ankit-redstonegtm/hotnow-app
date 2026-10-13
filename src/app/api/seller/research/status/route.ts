import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { finishResearch, defaultIcp } from "@/lib/engine";
import { getSellerProfileByUser, updateSellerProfile, upsertIcp } from "@/lib/db/repo";

export const maxDuration = 60;

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const row = await getSellerProfileByUser(sb, user.id);
    if (!row) return NextResponse.json({ status: "none" });

    if (row.research_status === "done" || row.company_name) {
      return NextResponse.json({ status: "done", profile: toProfileDTO(row) });
    }
    if (row.research_status !== "running" || !row.research_task_id) {
      return NextResponse.json({ status: row.research_status ?? "none" });
    }

    const profile = await finishResearch(row.research_task_id, row.domain).catch((e) => {
      throw e;
    });
    if (!profile) return NextResponse.json({ status: "running" });

    await updateSellerProfile(sb, row.id, {
      company_name: profile.companyName,
      product_description: profile.productDescription,
      target_customers: profile.targetCustomers,
      problems_solved: profile.problemsSolved,
      buyer_personas: profile.buyerPersonas,
      industries: profile.industries,
      raw_research: profile.raw ?? null,
      research_status: "done",
    });
    await upsertIcp(sb, row.id, defaultIcp(profile));

    return NextResponse.json({
      status: "done",
      profile: {
        companyName: profile.companyName,
        productDescription: profile.productDescription,
        targetCustomers: profile.targetCustomers,
        problemsSolved: profile.problemsSolved,
        buyerPersonas: profile.buyerPersonas,
        industries: profile.industries,
      },
    });
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
