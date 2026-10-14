import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "https://app.hotnow.co";
const EMAIL = "demo+v2@hotnow.co";
const PASS = "hotnow12345";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--hide-scrollbars"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await page.type('input[type="email"]', EMAIL);
await page.type('input[type="password"]', PASS);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}),
  page.click('form button[type="submit"], form button'),
]);
await new Promise((r) => setTimeout(r, 3000));
console.log("after login url:", page.url());

const shots = [
  ["/dashboard", "dash-overview"],
  ["/dashboard/companies", "dash-companies"],
  ["/dashboard/contacts", "dash-contacts"],
  ["/dashboard/signals", "dash-signals"],
];
for (const [path, name] of shots) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `/tmp/${name}.png` });
  console.log("shot", name, "->", page.url());
}
await browser.close();
console.log("done");
