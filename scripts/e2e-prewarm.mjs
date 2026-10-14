// End-to-end test of the pre-warm flow against PRODUCTION.
//   marketing hero (domain) -> /signup?domain -> prewarm fires -> sign up ->
//   onboarding adopts the pre-warmed research -> summary appears.
// Usage: node scripts/e2e-prewarm.mjs [domain]
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SITE = "https://hotnow.co";
const APP = "https://app.hotnow.co";
const DOMAIN = process.argv[2] || "vercel.com";
const EMAIL = `e2e+${Date.now()}@hotnow.co`;
const PASS = "hotnow12345";

const log = (...a) => console.log(...a);
const net = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

page.on("response", async (res) => {
  const u = res.url();
  if (u.includes("/api/prewarm") || u.includes("/api/seller/research")) {
    let body = null;
    try { body = await res.json(); } catch {}
    const tag = u.replace(APP, "");
    net.push({ tag, status: res.status(), body });
    log("  NET", res.status(), tag, JSON.stringify(body));
  }
});

// 1) Marketing hero -> enter domain -> submit
log(`\n[1] ${SITE} hero, domain = ${DOMAIN}`);
await page.goto(SITE, { waitUntil: "networkidle2" });
await page.waitForSelector('form.domain-cta input[name="domain"]');
await page.type('form.domain-cta input[name="domain"]', DOMAIN);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}),
  page.click('form.domain-cta button[type="submit"]'),
]);
log("    -> landed:", page.url());
await page.screenshot({ path: "/tmp/e2e-1-signup.png" });

// 2) Sign up (prewarm has fired on page load)
log(`\n[2] signing up ${EMAIL}`);
await page.waitForSelector('input[type="email"]');
await page.type('input[type="email"]', EMAIL);
await page.type('input[type="password"]', PASS);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}),
  page.click("form button"),
]);
await new Promise((r) => setTimeout(r, 4000));
log("    -> landed:", page.url());
await page.screenshot({ path: "/tmp/e2e-2-onboarding.png" });

// 3) Onboarding auto-runs research (adopting prewarm). Wait for the studio.
log("\n[3] waiting for summary / studio ...");
const t0 = Date.now();
let reached = false;
for (let i = 0; i < 70; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const state = await page.evaluate(() => ({
    h1: document.querySelector("h1")?.innerText ?? null,
    studio: !!document.querySelector(".panel") || /Find opportunities/i.test(document.body.innerText),
    body: document.body.innerText.slice(0, 120).replace(/\n/g, " "),
  }));
  if (i % 3 === 0) log(`    t+${Math.round((Date.now() - t0) / 1000)}s h1=${JSON.stringify(state.h1)} studio=${state.studio}`);
  if (state.studio) { reached = true; break; }
}
log(`    -> studio reached: ${reached}  (${Math.round((Date.now() - t0) / 1000)}s)`);
await page.screenshot({ path: "/tmp/e2e-3-studio.png", fullPage: true });

log("\n===== RESULT =====");
log("EMAIL:", EMAIL);
log("DOMAIN:", DOMAIN);
const research = net.find((n) => n.tag.includes("/api/seller/research") && n.body && "prewarmed" in n.body);
log("research adopted prewarm:", research?.body?.prewarmed);
log("prewarm calls:", net.filter((n) => n.tag.includes("/api/prewarm")).map((n) => n.body?.status));
log("studio reached:", reached);

await browser.close();
log("done");
