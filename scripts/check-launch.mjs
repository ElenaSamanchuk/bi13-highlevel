#!/usr/bin/env node
/*
 * Проверка запуска 16.11.2026 без ИИ: страницы сами переключились на вид продаж/запуска, ссылки рабочие.
 * Только чтение: GET-запросы и открытие страниц в headless-браузере, ничего не отправляется и не меняется.
 *
 * Запуск:   node scripts/check-launch.mjs
 * Флаги:    --at "2026-11-16T10:05:00+03:00"  подменить текущее время (ожидание и часы в браузере)
 *           --sales=open|before|after          добавить ?sales= к адресам GitHub Pages
 *           --no-browser                       только код страницы и ссылки, без рендера
 *           --timeout=40000                    таймаут одного запроса, мс
 * Выход: 0 — нет ❌ (⚠️ допустимы), 1 — есть ❌.
 */
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------- настройки ----------
const BI13_OPEN = 1794812400000;   // 16.11.2026 10:00 МСК
const BI13_CLOSE = 1796072400000;  // 01.12.2026 00:00 МСК
const KT_OPEN = 1794812400000;
const KT_CLOSE = 1796590800000;    // 07.12.2026 00:00 МСК
const BI13_TARGETS = [
  { name: "BI13 боевая (Тильда)", url: "https://bi13pro.ru/aesthetic-high-level", live: true },
  { name: "BI13 GitHub Pages", url: "https://elenasamanchuk.github.io/bi13-highlevel/", live: false },
];
const PAY_PAGES = [
  "https://bi13pro.ru/payment-allway",
  "https://bi13pro.ru/payment-allway-oc",
  "https://bi13pro.ru/payment-method",
  "https://bi13pro.ru/payment-method-oc",
];
const KT_TARGETS = [
  { name: "Kinezio таплинк боевой", url: "https://kineziofitness.online/taplink", live: true },
  { name: "Kinezio таплинк GitHub Pages", url: "https://elenasamanchuk.github.io/kinezio-taplink/", live: false },
];
const KT_LINK_OPEN = "https://t.me/+jD2efeMN-5szMmZi";
const KT_LINK_OTHER = "https://t.me/+jEUoHcbCU8xlNWUy";
const KT_TEXT_OPEN = "Старт 23 ноября";
const KT_TEXT_OTHER = "Старт после регистрации";

// ---------- аргументы ----------
const argv = process.argv.slice(2);
const opt = (n) => {
  const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (i < 0) return null;
  if (argv[i].includes("=")) return argv[i].split("=").slice(1).join("=");
  const nx = argv[i + 1];
  return nx && !nx.startsWith("--") ? nx : "";
};
const atArg = opt("at");
const salesArg = opt("sales");
const noBrowser = argv.includes("--no-browser");
const TIMEOUT = Number(opt("timeout")) || 40000;
const NOW = atArg ? Date.parse(atArg) : Date.now();
if (Number.isNaN(NOW)) { console.error("Не разобрал --at: " + atArg); process.exit(2); }
if (salesArg && !["before", "open", "after"].includes(salesArg)) { console.error("--sales: before|open|after"); process.exit(2); }

// ---------- вывод ----------
let fails = 0, warns = 0, oks = 0;
const ok = (m) => { oks++; console.log("  ✅ " + m); };
const bad = (m) => { fails++; console.log("  ❌ " + m); };
const warn = (m) => { warns++; console.log("  ⚠️  " + m); };
const head = (m) => console.log("\n" + m);
const fmt = (ms) => new Date(ms).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) + " МСК";
const stateAt = (n, o, c) => (n < o ? "before" : n < c ? "open" : "after");

// ---------- сеть ----------
async function get(url, tries = 3) {
  let last;
  for (let i = 1; i <= tries; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TIMEOUT);
    try {
      const r = await fetch(url, { signal: ac.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 check-launch" } });
      const body = await r.text();
      clearTimeout(t);
      return { status: r.status, body, tries: i };
    } catch (e) {
      clearTimeout(t);
      await new Promise((r) => setTimeout(r, 1500));
      last = e.name === "AbortError" ? `таймаут ${TIMEOUT / 1000} с` : e.message;
    }
  }
  return { status: 0, body: "", error: last, tries };
}

// ---------- браузер ----------
async function launchBrowser() {
  if (noBrowser) return { skip: "отключён флагом --no-browser" };
  const here = dirname(fileURLToPath(import.meta.url));
  const cands = [join(here, ".."), join(homedir(), "Projects/qa-kit"), join(homedir(), "Projects/popovichfit-site"), join(homedir(), "Projects/platformax-autotests")];
  let pw = null;
  for (const c of cands) {
    try { pw = createRequire(join(c, "x.js"))("playwright"); break; } catch {}
  }
  if (!pw) return { skip: "Playwright не найден" };
  try { return { browser: await pw.chromium.launch({ headless: true }) }; } catch (e1) {
    // версия Playwright может не совпасть с установленным Chromium — ищем любой в кэше
    const base = join(homedir(), "Library/Caches/ms-playwright");
    const list = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith("chromium-")).sort().reverse() : [];
    for (const d of list) {
      const root = join(base, d);
      for (const sub of readdirSync(root)) {
        for (const exe of ["Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "Chromium.app/Contents/MacOS/Chromium"]) {
          const p = join(root, sub, exe);
          if (existsSync(p)) {
            try { return { browser: await pw.chromium.launch({ headless: true, executablePath: p }) }; } catch {}
          }
        }
      }
    }
    return { skip: "браузер не запустился: " + e1.message.split("\n")[0] };
  }
}

async function openPage(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" });
  const page = await ctx.newPage();
  if (atArg) await page.clock.install({ time: NOW });
  await page.goto(url, { waitUntil: "load", timeout: TIMEOUT });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

// ---------- BI13 ----------
async function checkBi13(t, br) {
  const forced = salesArg && !t.live ? salesArg : null;
  const url = forced ? t.url + (t.url.includes("?") ? "&" : "?") + "sales=" + forced : t.url;
  head(`${t.name}: ${url}`);
  const r = await get(url);
  if (r.status !== 200) { bad(`страница отвечает ${r.status || "без ответа"} ${r.error || ""}`); return; }
  ok("страница отвечает 200");
  let code = r.body;
  const scripts = [...r.body.matchAll(/<script[^>]+src=["']([^"']*sales-state[^"']*)["']/g)];
  for (const m of scripts) {
    const s = await get(new URL(m[1], url).toString());
    if (s.status === 200) code += "\n" + s.body;
  }
  const hasCode = /OPEN_MS\s*=\s*1794812400000/.test(code) && /CLOSE_MS\s*=\s*1796072400000/.test(code);
  if (!hasCode) {
    const ifr = r.body.match(/<iframe[^>]+src=["']([^"']*github\.io[^"']*)["']/);
    if (ifr) warn(`код таймера не вставлен как текст, но на странице iframe на ${ifr[1]} — рендерится из GitHub Pages (проверяется строкой выше)`);
    else warn("код таймера на странице не найден (OPEN_MS=1794812400000 / CLOSE_MS=1796072400000); если код ещё не вставлен в Тильду — это ожидаемо");
    return;
  }
  ok("код таймера на месте (OPEN_MS=1794812400000, CLOSE_MS=1796072400000)");
  const expected = forced || stateAt(NOW, BI13_OPEN, BI13_CLOSE);
  console.log(`     ожидаемый вид на ${fmt(NOW)}${forced ? " (принудительно ?sales=" + forced + ")" : ""}: ${expected}`);
  if (!br.browser) { warn("рендер не проверен: " + br.skip); return; }
  const { ctx, page } = await openPage(br.browser, url);
  try {
    // одноблочная версия и GitHub Pages: #page-root; код в два блока Тильды: два корня .bi13p
    const roots = page.locator("#page-root, .bi13p");
    const rn = await roots.count();
    if (!rn) bad("корень страницы (#page-root или .bi13p) не найден");
    for (let i = 0; i < rn; i++) {
      const got = await roots.nth(i).getAttribute("data-sales");
      const label = rn > 1 ? `корень ${i + 1} из ${rn}` : "корень страницы";
      got === expected ? ok(`${label}: data-sales = ${got}`) : bad(`${label}: data-sales = ${got}, ожидалось ${expected}`);
    }
    const links = page.locator("a[data-pay]");
    const n = await links.count();
    let vis = 0; const hrefs = [];
    for (let i = 0; i < n; i++) if (await links.nth(i).isVisible()) { vis++; hrefs.push((await links.nth(i).getAttribute("href")).split("?")[0]); }
    const want = expected === "open" ? 4 : 0;
    vis === want ? ok(`видимых кнопок оплаты ${vis} (ожидалось ${want})`) : bad(`видимых кнопок оплаты ${vis}, ожидалось ${want}`);
    if (expected === "open") {
      const missing = PAY_PAGES.filter((p) => !hrefs.includes(p));
      missing.length ? bad("нет видимой кнопки на: " + missing.join(", ")) : ok("кнопки ведут на payment-allway, -allway-oc, payment-method, -method-oc");
    }
  } catch (e) { bad("ошибка рендера: " + e.message.split("\n")[0]); } finally { await ctx.close(); }
}

async function checkPayPages() {
  head("Страницы оплаты BI13 и ссылки checkout");
  const checkouts = new Set();
  for (const u of PAY_PAGES) {
    const r = await get(u);
    if (r.status === 200) ok(`${u} — 200${r.tries > 1 ? ` (с попытки ${r.tries})` : ""}`);
    else bad(`${u} — ${r.status || "нет ответа"} ${r.error || ""}`);
    for (const m of r.body.matchAll(/https?:\/\/lk\.bi13pro\.ru\/payments\/[^"'\s)<\\]+\/checkout|lk\.bi13pro\.ru\/payments\/[A-Za-z0-9_]+\/checkout/g))
      checkouts.add(m[0].startsWith("http") ? m[0] : "https://" + m[0]);
  }
  if (!checkouts.size) { warn("ссылки lk.bi13pro.ru/payments/…/checkout на страницах оплаты не найдены"); return; }
  for (const c of [...checkouts].sort()) {
    const r = await get(c);
    r.status === 200 ? ok(`${c} — 200`) : bad(`${c} — ${r.status || "нет ответа"} ${r.error || ""}`);
  }
}

// ---------- Kinezio ----------
async function checkKinezio(t, br) {
  const forced = salesArg && !t.live ? salesArg : null;
  const url = forced ? t.url + "?sales=" + forced : t.url;
  head(`${t.name}: ${url}`);
  const r = await get(url);
  if (r.status !== 200) { bad(`страница отвечает ${r.status || "без ответа"} ${r.error || ""}`); return; }
  ok("страница отвечает 200");
  const hasCode = /id=["']ktl-root["']/.test(r.body) && /OPEN_MS\s*=\s*1794812400000/.test(r.body) && /CLOSE_MS\s*=\s*1796590800000/.test(r.body);
  if (!hasCode) { warn("наш код (ktl-root, OPEN_MS=1794812400000, CLOSE_MS=1796590800000) на странице не найден; если код ещё не вставлен — ожидаемо"); return; }
  ok("код таплинка на месте (ktl-root, OPEN_MS, CLOSE_MS)");
  const expected = forced || stateAt(NOW, KT_OPEN, KT_CLOSE);
  const isOpen = expected === "open";
  console.log(`     ожидаемый вид на ${fmt(NOW)}${forced ? " (принудительно ?sales=" + forced + ")" : ""}: ${expected}`);
  const pageLinks = new Set([...r.body.matchAll(/href=["'](https:\/\/kineziofitness\.online[^"'#]*)["']/g)].map((m) => m[1]));
  if (br.browser) {
    const { ctx, page } = await openPage(br.browser, url);
    try {
      const got = await page.locator("#ktl-root").getAttribute("data-sales");
      got === expected ? ok(`#ktl-root[data-sales] = ${got}`) : bad(`#ktl-root[data-sales] = ${got}, ожидалось ${expected}`);
      const wantL = isOpen ? KT_LINK_OPEN : KT_LINK_OTHER, noL = isOpen ? KT_LINK_OTHER : KT_LINK_OPEN;
      const vis = async (sel) => { const l = page.locator(sel); for (let i = 0; i < await l.count(); i++) if (await l.nth(i).isVisible()) return true; return false; };
      (await vis(`a[href="${wantL}"]`)) ? ok(`видна ссылка ${wantL}`) : bad(`не видна ссылка ${wantL}`);
      (await vis(`a[href="${noL}"]`)) ? bad(`видна лишняя ссылка ${noL}`) : ok(`лишняя ссылка ${noL} скрыта`);
      const wantT = isOpen ? KT_TEXT_OPEN : KT_TEXT_OTHER, noT = isOpen ? KT_TEXT_OTHER : KT_TEXT_OPEN;
      (await vis(`text="${wantT}"`)) ? ok(`виден текст «${wantT}»`) : bad(`не виден текст «${wantT}»`);
      // в open «Старт после регистрации» легально есть у других карточек, поэтому там проверяем только нужный текст
      if (!isOpen) (await vis(`text="${noT}"`)) ? bad(`виден текст «${noT}» вне запуска`) : ok(`текст «${noT}» скрыт`);
    } catch (e) { bad("ошибка рендера: " + e.message.split("\n")[0]); } finally { await ctx.close(); }
  } else {
    // без браузера — только логика кода: ссылки и тексты есть в разметке с data-when
    const has = (s) => r.body.includes(s);
    has(KT_LINK_OPEN) && has(KT_LINK_OTHER) && has(KT_TEXT_OPEN) && has(KT_TEXT_OTHER)
      ? ok("в разметке есть обе пары ссылок и текстов (какая видна — без браузера не проверить)") : bad("в разметке нет одной из ссылок/текстов");
    warn("рендер не проверен: " + br.skip);
  }
  if (!pageLinks.size) { warn("ссылок на kineziofitness.online в коде страницы не найдено"); return; }
  let badN = 0;
  for (const l of [...pageLinks].sort()) {
    const x = await get(l);
    if (x.status !== 200) { badN++; bad(`${l} — ${x.status || "нет ответа"} ${x.error || ""}`); }
  }
  if (!badN) ok(`ссылки на kineziofitness.online отвечают 200 (${pageLinks.size} шт.)`);
}

// ---------- запуск ----------
console.log(`Проверка запуска 16.11.2026 · сейчас: ${fmt(NOW)}${atArg ? " (подмена --at)" : ""}${salesArg ? " · ?sales=" + salesArg + " на GitHub Pages" : ""}`);
console.log(`Ожидание по времени: BI13 — ${stateAt(NOW, BI13_OPEN, BI13_CLOSE)}. Режим: только чтение. Таплинк Kinezio — отдельный скрипт в ~/Projects/kinezio-taplink.`);
const br = await launchBrowser();
if (!br.browser) console.log("Браузер: нет — " + br.skip);
try {
  for (const t of BI13_TARGETS) await checkBi13(t, br);
  await checkPayPages();
  // Kinezio таплинк проверяется своим скриптом: cd ~/Projects/kinezio-taplink && node scripts/check-launch.mjs
} finally { if (br.browser) await br.browser.close(); }

head(`ИТОГ: ✅ ${oks}  ⚠️ ${warns}  ❌ ${fails}`);
console.log(fails ? "Есть ошибки (❌) — выход 1." : warns ? "Ошибок нет; предупреждения ⚠️ — прочтите выше." : "Всё в порядке.");
process.exit(fails ? 1 : 0);
