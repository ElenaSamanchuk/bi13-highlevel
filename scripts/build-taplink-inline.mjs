#!/usr/bin/env node
/**
 * Generates tilda-inline-taplink.html from bi13-taplink for direct paste into Tilda T123 block.
 * Usage: node scripts/build-taplink-inline.mjs
 *
 * By default: index.html + styles.css from bi13-taplink GitHub main.
 * Images/fonts served via jsDelivr from bi13-highlevel (bi13-taplink is not on jsDelivr).
 * Local only: BI13_FROM_LOCAL=1 node scripts/build-taplink-inline.mjs
 *
 * Source repo: elenasamanchuk/bi13-taplink (override root via BI13_TAPLINK_ROOT)
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "tilda-inline-taplink.html");
const DESKTOP_PATH = path.join(process.env.HOME || "", "Desktop", "tilda-inline-taplink.html");
const TAPLINK_ROOT =
  process.env.BI13_TAPLINK_ROOT || path.resolve(ROOT, "../bi13-taplink");
const TAPLINK_GITHUB_REPO = "elenasamanchuk/bi13-taplink";
const CDN_GITHUB_REPO = "elenasamanchuk/bi13-highlevel";
const CDN_FONT_SHA =
  process.env.BI13_FONT_SHA || "1935b7b9287da46d96afce16d6c816d1031dfd56";
const GITHUB_REF = process.env.BI13_GITHUB_REF || "main";
const FROM_LOCAL = process.env.BI13_FROM_LOCAL === "1";
const GITHUB_RAW = `https://raw.githubusercontent.com/${TAPLINK_GITHUB_REPO}/${GITHUB_REF}/`;
const ASSET_PREFIX = "assets/taplink/";
const PREFIX = "#bi13-taplink-wrap";
const VERSION = 2;
const TILDA_HEADER_OFFSET = 80;

function cdnRef(sha) {
  const ref = (sha || "main").trim();
  return ref === "main" ? ref : ref.slice(0, 7);
}

function resolveAssetSha() {
  if (process.env.BI13_ASSET_SHA) {
    return cdnRef(process.env.BI13_ASSET_SHA);
  }
  try {
    const sha = execSync("git log -1 --format=%H -- assets/taplink", {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    return cdnRef(sha);
  } catch {
    return "main";
  }
}

let BASE =
  process.env.BI13_ASSET_BASE ||
  `https://cdn.jsdelivr.net/gh/${CDN_GITHUB_REPO}@${resolveAssetSha()}/`;
let FONT_BASE =
  process.env.BI13_FONT_BASE ||
  `https://cdn.jsdelivr.net/gh/${CDN_GITHUB_REPO}@${cdnRef(CDN_FONT_SHA)}/`;

async function readFile(name) {
  if (FROM_LOCAL) {
    return fs.readFileSync(path.join(TAPLINK_ROOT, name), "utf8");
  }
  const url = GITHUB_RAW + name;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`GitHub fetch failed ${res.status}: ${url}`);
  return res.text();
}

function extractPageContent(html) {
  const startTag = '<div class="page">';
  const start = html.indexOf(startTag);
  if (start === -1) throw new Error('Missing <div class="page">');
  const scriptIdx = html.indexOf("<script>", start);
  if (scriptIdx === -1) throw new Error("Missing <script> after .page");
  const slice = html.slice(start, scriptIdx);
  const end = slice.lastIndexOf("</div>");
  if (end === -1) throw new Error("Missing closing </div> for .page");
  return slice.slice(0, end + "</div>".length);
}

function removeIframeOnlyCss(css) {
  const blocks = [
    /\nhtml\.is-embed-mobile \{\n[\s\S]*?\n\}/,
    /\nhtml\.is-embed-mobile \.shell \{\n[\s\S]*?\n\}/,
    /\nhtml\.is-embed,\nhtml\.is-embed body \{\n[\s\S]*?\n\}/,
    /\nhtml\.is-embed \.page \{\n[\s\S]*?\n\}/,
    /\nhtml\.is-embed \.shell \{\n[\s\S]*?\n\}/,
  ];
  for (const re of blocks) css = css.replace(re, "");
  return css;
}

function prefixCss(css, prefix) {
  let result = "";
  let i = 0;

  while (i < css.length) {
    if (css.slice(i, i + 2) === "/*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1) {
        result += css.slice(i);
        break;
      }
      result += css.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    if (/^[\s\n]+/.test(css.slice(i))) {
      const ws = css.slice(i).match(/^[\s\n]+/)[0];
      result += ws;
      i += ws.length;
      continue;
    }

    if (css[i] === "@") {
      const braceIdx = css.indexOf("{", i);
      if (braceIdx === -1) {
        result += css.slice(i);
        break;
      }
      const atRule = css.slice(i, braceIdx).trim();
      let j = braceIdx;
      let depth = 0;
      for (; j < css.length; j++) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
      }

      if (/^@(font-face|charset|import)/.test(atRule)) {
        result += css.slice(i, j);
      } else if (/^@media/.test(atRule)) {
        const inner = css.slice(braceIdx + 1, j - 1);
        result += atRule + "{" + prefixCss(inner, prefix) + "}";
      } else {
        result += css.slice(i, j);
      }
      i = j;
      continue;
    }

    const braceIdx = css.indexOf("{", i);
    if (braceIdx === -1) {
      result += css.slice(i);
      break;
    }

    const selectors = css.slice(i, braceIdx).trim();
    let j = braceIdx;
    let depth = 0;
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    const body = css.slice(braceIdx, j);

    if (!selectors) {
      result += css.slice(i, j);
    } else {
      const prefixed = selectors
        .split(",")
        .map((sel) => {
          sel = sel.trim();
          if (!sel) return sel;
          if (sel.startsWith(prefix)) return sel;
          return `${prefix} ${sel}`;
        })
        .join(", ");
      result += prefixed + body;
    }
    i = j;
  }

  return result;
}

function minifyCss(css) {
  const calcs = [];
  let out = "";
  let i = 0;
  while (i < css.length) {
    if (css.slice(i, i + 5) === "calc(") {
      let depth = 1;
      let j = i + 5;
      while (j < css.length && depth > 0) {
        if (css[j] === "(") depth++;
        else if (css[j] === ")") depth--;
        j++;
      }
      calcs.push(css.slice(i, j));
      out += `__CALC_${calcs.length - 1}__`;
      i = j;
      continue;
    }
    out += css[i];
    i++;
  }
  css = out
    .replace(/\n\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/\s*([{}:;,>+~])\s*/g, "$1")
    .replace(/;}/g, "}");
  calcs.forEach((calc, idx) => {
    css = css.replace(`__CALC_${idx}__`, calc.replace(/\s+/g, " ").trim());
  });
  return css;
}

function transformCss(css) {
  css = css.replace(/url\("\.\/fonts\//g, `url("${FONT_BASE}fonts/`);
  css = removeIframeOnlyCss(css);
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  css = css.replace(/:root/g, PREFIX);
  css = css.replace(
    /\*,\n\*::before,\n\*::after \{\n  box-sizing: border-box;\n\}/,
    `${PREFIX}, ${PREFIX} *, ${PREFIX} *::before, ${PREFIX} *::after { box-sizing: border-box; }`
  );
  css = css.replace(/^html \{/m, `${PREFIX} {`);
  css = css.replace(/^body \{/m, `${PREFIX} {`);
  css = css.replace(
    /^html \{\n  scroll-behavior: smooth;\n\}/m,
    `${PREFIX} { scroll-behavior: smooth; }`
  );
  css = css.replace(
    /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*html \{/,
    `@media (prefers-reduced-motion: reduce) {\n    ${PREFIX} {`
  );

  css = prefixCss(css, PREFIX);

  const wrapperRules = `
    ${PREFIX} { background:#000; width:100%; max-width:100%; overflow-x:clip; position:relative; isolation:isolate; display:block; color:var(--ink); font-family:Manrope,system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
    ${PREFIX} a, ${PREFIX} button { -webkit-tap-highlight-color:transparent; }
    ${PREFIX} #products, ${PREFIX} section[id] { scroll-margin-top: ${TILDA_HEADER_OFFSET}px; }
    ${PREFIX} img { border:0; vertical-align:top; }
    ${PREFIX} .page { min-height:0; display:flex; justify-content:center; background:var(--bg); width:100%; margin:0; }
    ${PREFIX} .shell { min-height:0; margin-inline:auto; }
    @media (max-width:519px) { ${PREFIX} { --pad:12px; } ${PREFIX} .shell { width:100%; max-width:none; } }
  `;

  return minifyCss(wrapperRules + css);
}

function transformHtml(html) {
  return html.replace(/src="assets\//g, `src="${BASE}${ASSET_PREFIX}`);
}

function buildJs() {
  return `(function () {
      var root = document.getElementById("bi13-taplink-wrap");
      if (!root) return;

      var revealObserver = null;
      var TILDA_HEADER_OFFSET = ${TILDA_HEADER_OFFSET};

      function prefersReducedMotion() {
        return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      }

      function scrollToId(id) {
        var el = root.querySelector("#" + CSS.escape(id));
        if (!el) el = document.getElementById(id);
        if (!el || !root.contains(el)) return;
        var reduced = prefersReducedMotion();
        var top = el.getBoundingClientRect().top - TILDA_HEADER_OFFSET;
        window.scrollBy({ top: top, behavior: reduced ? "auto" : "smooth" });
      }

      root.addEventListener("click", function (event) {
        var link = event.target.closest('a[href^="#"], [data-scroll-to]');
        if (!link || !root.contains(link)) return;
        var id = link.getAttribute("data-scroll-to") || (link.getAttribute("href") || "").replace(/^#/, "");
        if (!id) return;
        event.preventDefault();
        scrollToId(id);
      });

      function revealAll() {
        root.querySelectorAll("[data-reveal]").forEach(function (el) {
          el.setAttribute("data-reveal", "in");
        });
      }

      function bootReveal() {
        if (prefersReducedMotion()) {
          revealAll();
          return;
        }
        if (typeof IntersectionObserver === "undefined") {
          revealAll();
          return;
        }
        revealObserver = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (!entry.isIntersecting) return;
              entry.target.setAttribute("data-reveal", "in");
              revealObserver.unobserve(entry.target);
            });
          },
          { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
        );
        root.querySelectorAll("[data-reveal]").forEach(function (el) {
          el.setAttribute("data-reveal", "out");
          revealObserver.observe(el);
        });
      }

      function isSameSiteHref(href) {
        if (!href) return true;
        if (href.charAt(0) === "#" || href.charAt(0) === "/" || href.charAt(0) === "?") return true;
        if (href.indexOf("mailto:") === 0 || href.indexOf("tel:") === 0 || href.indexOf("tg:") === 0) return true;
        try {
          var url = new URL(href, window.location.href);
          var host = url.hostname.replace(/^www\\./, "");
          return host === "bi13pro.ru" || host === window.location.hostname.replace(/^www\\./, "");
        } catch (e) {
          return true;
        }
      }

      function applyLinkTargets() {
        root.querySelectorAll("a[href]").forEach(function (a) {
          var href = a.getAttribute("href") || "";
          if (isSameSiteHref(href)) {
            a.removeAttribute("target");
            if ((a.getAttribute("rel") || "").indexOf("noopener") !== -1) a.removeAttribute("rel");
            return;
          }
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener");
        });
      }

      function boot() {
        applyLinkTargets();
        bootReveal();
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
      } else {
        boot();
      }
    })();`;
}

async function build() {
  if (!process.env.BI13_ASSET_BASE) {
    BASE = `https://cdn.jsdelivr.net/gh/${CDN_GITHUB_REPO}@${resolveAssetSha()}/`;
  }
  if (!process.env.BI13_FONT_BASE) {
    FONT_BASE = `https://cdn.jsdelivr.net/gh/${CDN_GITHUB_REPO}@${cdnRef(CDN_FONT_SHA)}/`;
  }
  const [indexHtml, stylesCss] = await Promise.all([
    readFile("index.html"),
    readFile("styles.css"),
  ]);

  const css = transformCss(stylesCss);
  const pageContent = transformHtml(extractPageContent(indexHtml));
  const js = buildJs();

  const output = `<!-- BI13 Taplink inline T123 v${VERSION} · assets: ${BASE} -->
<style>${css}
</style>
<div id="bi13-taplink-wrap">${pageContent}</div>
<script>${js}
</script>
`;

  fs.writeFileSync(OUT_PATH, output, "utf8");

  try {
    fs.copyFileSync(OUT_PATH, DESKTOP_PATH);
    console.log(`Copied to ${DESKTOP_PATH}`);
  } catch (err) {
    console.warn(`Could not copy to Desktop: ${err.message}`);
  }

  const stats = fs.statSync(OUT_PATH);
  const sizeKb = (stats.size / 1024).toFixed(1);

  const checks = {
    hero: pageContent.includes('class="hero"') && pageContent.includes("hero.webp"),
    products: pageContent.includes('id="products"'),
    scopedCss: css.includes("#bi13-taplink-wrap .hero") && !css.includes("\nimg {"),
    noRootVars: !css.includes(":root {"),
    scopedJs: js.includes('getElementById("bi13-taplink-wrap")'),
    noIframe: !js.includes("postMessage") && !js.includes("inIframe"),
    ghFonts: css.includes(`${FONT_BASE}fonts/`),
    ghAssets: pageContent.includes(`${BASE}${ASSET_PREFIX}`),
    jsdelivr: pageContent.includes(`cdn.jsdelivr.net/gh/${CDN_GITHUB_REPO}@`),
  };

  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Size: ${sizeKb} KB (${stats.size} bytes)`);
  console.log("Checks:", checks);

  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  if (failed.length) {
    throw new Error(`Build checks failed: ${failed.join(", ")}`);
  }

  if (stats.size > 100 * 1024) {
    console.warn(`Warning: file exceeds ~100KB T123 soft limit (${sizeKb} KB)`);
  }

  return { path: OUT_PATH, sizeKb: parseFloat(sizeKb), checks, base: BASE };
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
