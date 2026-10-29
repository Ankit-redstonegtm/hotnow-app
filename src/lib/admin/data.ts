import "server-only";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { addCredits, emptyCredits, type CreditTotals } from "./credits";
import { domainList, onboardingStatus, recordedRunCost, weekAgoMs } from "./format";
import { requireAdmin } from "./guard";

const PAGE_SIZE = 1000;
const PAGE_CAP = 50;
const RECENT_JOBS = 50;
const USER_JOB_CAP = 200;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROFILE_COLUMNS = "id, user_id, domain, research_status, situations_status, slack_webhook_url, updated_at";
const JOB_COLUMNS = "id, kind, status, created_at, finished_at, last_error, provider_credits, seller_profile_id";
const JOB_COLUMNS_WITHOUT_CREDITS = "id, kind, status, created_at, finished_at, last_error, seller_profile_id";

type QueryError = { message: string; code?: string };
type QueryResult<T> = { data: T[] | null; error: QueryError | null };

type ProfileRow = {
  id: string;
  user_id: string;
  domain: string;
  research_status: string | null;
  situations_status: string | null;
  slack_webhook_url: string | null;
  updated_at: string;
};

type RunRow = { seller_profile_id: string; est_cost: unknown; actual_cost: unknown };
type LeadRow = { seller_profile_id: string };
type ConnectionRow = { seller_profile_id: string; provider: string | null; status: string | null };
type AuthUser = { id: string; email?: string; created_at: string; last_sign_in_at?: string };

export type AdminUserRow = {
  id: string;
  email: string;
  signedUp: string;
  lastSignIn: string | null;
  onboarding: string;
  domains: string;
  runs: number;
  leads: number;
  slackConnected: boolean;
};

export type AdminJobRow = {
  id: string;
  userId: string | null;
  email: string;
  domain: string;
  kind: string;
  status: string;
  started: string;
  finished: string | null;
  error: string | null;
  credits: number;
};

export type AdminHome = {
  totals: {
    signups: number;
    signups7d: number;
    jobsRun: number;
    failedJobs7d: number;
    parallelSpend: number;
    credits: CreditTotals;
  };
  users: AdminUserRow[];
  jobs: AdminJobRow[];
};

export type AdminUserDetail = {
  user: AdminUserRow;
  jobs: AdminJobRow[];
  jobsTruncated: boolean;
};

function db() {
  return createAdminClient();
}

function missingCredits(error: QueryError): boolean {
  return error.code === "42703" || error.code === "PGRST204" || /provider_credits/i.test(error.message);
}

async function eachPage<T>(load: (from: number, to: number) => PromiseLike<QueryResult<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < PAGE_CAP; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await load(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new Error("Admin query stopped after 50,000 rows.");
}

async function listAuthUsers(): Promise<AuthUser[]> {
  const users: AuthUser[] = [];
  let page = 1;
  for (let i = 0; i < PAGE_CAP; i += 1) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (!data.nextPage || data.users.length === 0) return users;
    page = data.nextPage;
  }
  throw new Error("Admin query stopped after 50,000 users.");
}

function loadProfiles(userId?: string): Promise<ProfileRow[]> {
  return eachPage<ProfileRow>((from, to) => {
    let query = db().from("seller_profiles").select(PROFILE_COLUMNS).order("id", { ascending: true });
    if (userId) query = query.eq("user_id", userId);
    return query.range(from, to);
  });
}

function loadRuns(profileIds?: string[]): Promise<RunRow[]> {
  if (profileIds && !profileIds.length) return Promise.resolve([]);
  return eachPage<RunRow>((from, to) => {
    let query = db().from("discovery_runs").select("seller_profile_id, est_cost, actual_cost").order("id", { ascending: true });
    if (profileIds) query = query.in("seller_profile_id", profileIds);
    return query.range(from, to);
  });
}

function loadLeads(profileIds?: string[]): Promise<LeadRow[]> {
  if (profileIds && !profileIds.length) return Promise.resolve([]);
  return eachPage<LeadRow>((from, to) => {
    let query = db().from("opportunities").select("seller_profile_id").order("id", { ascending: true });
    if (profileIds) query = query.in("seller_profile_id", profileIds);
    return query.range(from, to);
  });
}

function loadConnections(profileIds?: string[]): Promise<ConnectionRow[]> {
  if (profileIds && !profileIds.length) return Promise.resolve([]);
  return eachPage<ConnectionRow>((from, to) => {
    let query = db().from("delivery_connections").select("seller_profile_id, provider, status").order("seller_profile_id", { ascending: true }).order("provider", { ascending: true });
    if (profileIds) query = query.in("seller_profile_id", profileIds);
    return query.range(from, to);
  });
}

function countsByProfile(rows: Array<{ seller_profile_id: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.seller_profile_id, (counts.get(row.seller_profile_id) ?? 0) + 1);
  return counts;
}

function slackProfileIds(profiles: ProfileRow[], connections: ConnectionRow[]): Set<string> {
  const ids = new Set<string>();
  for (const profile of profiles) {
    if (typeof profile.slack_webhook_url === "string" && profile.slack_webhook_url.trim()) ids.add(profile.id);
  }
  for (const row of connections) {
    if (row.provider === "slack" && row.status === "connected") ids.add(row.seller_profile_id);
  }
  return ids;
}

async function countJobs(apply?: (query: any) => any): Promise<number> {
  let query = db().from("background_jobs").select("id", { count: "exact", head: true });
  if (apply) query = apply(query);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function loadCreditTotals(): Promise<CreditTotals> {
  const totals = emptyCredits();
  try {
    const rows = await eachPage<{ provider_credits: unknown }>((from, to) => db().from("background_jobs")
      .select("provider_credits")
      .order("id", { ascending: true })
      .range(from, to));
    for (const row of rows) addCredits(totals, row.provider_credits);
    return totals;
  } catch (error) {
    if (error instanceof Error && /provider_credits/i.test(error.message)) return totals;
    throw error;
  }
}

function toUserRow(user: AuthUser, profiles: ProfileRow[], runs: Map<string, number>, leads: Map<string, number>, slack: Set<string>): AdminUserRow {
  return {
    id: user.id,
    email: user.email?.trim() || "No email",
    signedUp: user.created_at,
    lastSignIn: user.last_sign_in_at ?? null,
    onboarding: onboardingStatus(profiles),
    domains: domainList(profiles),
    runs: profiles.reduce((sum, profile) => sum + (runs.get(profile.id) ?? 0), 0),
    leads: profiles.reduce((sum, profile) => sum + (leads.get(profile.id) ?? 0), 0),
    slackConnected: profiles.some((profile) => slack.has(profile.id)),
  };
}

type JobRecord = {
  id: string;
  kind: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  last_error: string | null;
  provider_credits?: unknown;
  seller_profile_id: string;
};

function creditTotal(value: unknown): number {
  const totals = emptyCredits();
  addCredits(totals, value);
  return totals.total;
}

function toJobRow(row: JobRecord, emails: Map<string, string>, profiles: Map<string, ProfileRow>): AdminJobRow {
  const profile = profiles.get(row.seller_profile_id);
  const userId = profile?.user_id ?? null;
  return {
    id: row.id,
    userId,
    email: userId ? emails.get(userId) || "Unknown user" : "Unknown user",
    domain: profile?.domain || "None",
    kind: row.kind,
    status: row.status,
    started: row.created_at,
    finished: row.finished_at,
    error: row.last_error?.trim() || null,
    credits: row.provider_credits == null ? 0 : creditTotal(row.provider_credits),
  };
}

async function loadJobRows(options: { profileIds?: string[]; limit: number }): Promise<{ rows: JobRecord[]; truncated: boolean }> {
  if (options.profileIds && !options.profileIds.length) return { rows: [], truncated: false };
  const run = (columns: string) => {
    let query = db().from("background_jobs").select(columns).order("created_at", { ascending: false }).limit(options.limit + 1);
    if (options.profileIds) query = query.in("seller_profile_id", options.profileIds);
    return query;
  };
  let result = await run(JOB_COLUMNS);
  if (result.error && missingCredits(result.error)) result = await run(JOB_COLUMNS_WITHOUT_CREDITS);
  if (result.error) throw new Error(result.error.message);
  const rows = (result.data ?? []) as unknown as JobRecord[];
  return { rows: rows.slice(0, options.limit), truncated: rows.length > options.limit };
}

export async function loadAdminHome(): Promise<AdminHome> {
  await requireAdmin();
  const now = Date.now();
  const since = new Date(weekAgoMs(now)).toISOString();
  const [authUsers, profiles, runs, leads, connections, jobsRun, failedJobs7d, credits, recent] = await Promise.all([
    listAuthUsers(),
    loadProfiles(),
    loadRuns(),
    loadLeads(),
    loadConnections(),
    countJobs(),
    countJobs((query) => query.eq("status", "failed").gte("finished_at", since)),
    loadCreditTotals(),
    loadJobRows({ limit: RECENT_JOBS }),
  ]);

  const profilesByUser = new Map<string, ProfileRow[]>();
  const profilesById = new Map<string, ProfileRow>();
  for (const profile of profiles) {
    profilesById.set(profile.id, profile);
    const list = profilesByUser.get(profile.user_id);
    if (list) list.push(profile);
    else profilesByUser.set(profile.user_id, [profile]);
  }
  const runCounts = countsByProfile(runs);
  const leadCounts = countsByProfile(leads);
  const slack = slackProfileIds(profiles, connections);
  const emails = new Map(authUsers.map((user) => [user.id, user.email?.trim() || "No email"]));
  const users = authUsers
    .map((user) => toUserRow(user, profilesByUser.get(user.id) ?? [], runCounts, leadCounts, slack))
    .toSorted((a, b) => Date.parse(b.signedUp) - Date.parse(a.signedUp));

  return {
    totals: {
      signups: users.length,
      signups7d: users.filter((user) => Date.parse(user.signedUp) >= weekAgoMs(now)).length,
      jobsRun,
      failedJobs7d,
      parallelSpend: runs.reduce((sum, row) => sum + recordedRunCost(row.actual_cost, row.est_cost), 0),
      credits,
    },
    users,
    jobs: recent.rows.map((row) => toJobRow(row, emails, profilesById)),
  };
}

async function loadAuthUser(id: string): Promise<AuthUser | null> {
  const { data, error } = await db().auth.admin.getUserById(id);
  if (error) {
    const status = (error as { status?: number }).status;
    if (status === 404 || /not found/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return data.user ?? null;
}

export async function loadAdminUser(id: string): Promise<AdminUserDetail> {
  await requireAdmin();
  if (!USER_ID.test(id)) notFound();
  const [authUser, profiles] = await Promise.all([loadAuthUser(id), loadProfiles(id)]);
  if (!authUser) notFound();
  const profileIds = profiles.map((profile) => profile.id);
  const [runs, leads, connections, jobs] = await Promise.all([
    loadRuns(profileIds),
    loadLeads(profileIds),
    loadConnections(profileIds),
    loadJobRows({ profileIds, limit: USER_JOB_CAP }),
  ]);
  const emails = new Map([[authUser.id, authUser.email?.trim() || "No email"]]);
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  return {
    user: toUserRow(authUser, profiles, countsByProfile(runs), countsByProfile(leads), slackProfileIds(profiles, connections)),
    jobs: jobs.rows.map((row) => toJobRow(row, emails, profilesById)),
    jobsTruncated: jobs.truncated,
  };
}
