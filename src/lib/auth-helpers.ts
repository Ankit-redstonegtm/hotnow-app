import { createClient } from "./supabase/server";

/** Returns the signed-in user or throws a 401-style error. */
export async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new UnauthorizedError();
  return { sb, user };
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}
