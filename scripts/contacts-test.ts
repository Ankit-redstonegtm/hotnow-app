import { config } from "dotenv";
config({ path: ".env.local" });
import { sourceContactsForCompany } from "../src/lib/engine/contacts";
(async () => {
  const domain = process.argv[2] || "salesrabbit.com";
  const { companyLinkedin, contacts } = await sourceContactsForCompany(domain, {
    jobFunctions: ["Sales & Business Development", "Operations"],
    jobLevels: ["VP", "Director"],
  });
  console.log("company linkedin:", companyLinkedin);
  console.log("contacts:", contacts.length);
  for (const c of contacts.slice(0, 12)) console.log(`  [${c.priority}] ${c.fullName} — ${c.title}`);
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
