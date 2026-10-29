import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "./allowlist";

export const requireAdmin = cache(async () => {
  await connection();
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user || !isAdminEmail(user.email)) notFound();
  return user;
});
