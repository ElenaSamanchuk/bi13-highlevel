#!/usr/bin/env node
/**
 * Generates tilda-inline.html from index.html for direct paste into Tilda T123 block.
 * Usage: node scripts/build-tilda-inline.mjs
 *
 * By default: git pull + index.html from GitHub main + jsDelivr URLs pinned to commit SHA.
 * Local only: BI13_FROM_LOCAL=1 node scripts/build-tilda-inline.mjs
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "tilda-inline.html");
const GITHUB_REPO = "elenasamanchuk/bi13-highlevel";
const GITHUB_REF = process.env.BI13_GITHUB_REF || "main";
const FROM_LOCAL = process.env.BI13_FROM_LOCAL === "1";
const GITHUB_RAW = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_REF}/`;
const PREFIX = "#bi13-inline-wrap";
const VERSION = 45;
const TILDA_HEADER_OFFSET = 80;

function resolveCommitSha() {
  if (process.env.BI13_GITHUB_REF && process.env.BI13_GITHUB_REF.length >= 7) {
    return process.env.BI13_GITHUB_REF;
  }
  try {
    execSync("git fetch origin main", { cwd: ROOT, stdio: "pipe" });
    return execSync("git rev-parse origin/main", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return GITHUB_REF;
  }
}

let BASE =
  process.env.BI13_ASSET_BASE ||
  `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@${resolveCommitSha()}/`;

async function readIndexHtml() {
  if (FROM_LOCAL) {
    return fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  }
  const url = GITHUB_RAW + "index.html";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`GitHub fetch failed ${res.status}: ${url}`);
  return res.text();
}

function extractStyle(html) {
  const m = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!m) throw new Error("Missing <style> block");
  return m[1];
}

function extractPageRoot(html) {
  const startTag = '<div id="page-root">';
  const start = html.indexOf(startTag);
  if (start === -1) throw new Error('Missing <div id="page-root">');
  const scriptIdx = html.indexOf("<script>", start);
  if (scriptIdx === -1) throw new Error("Missing <script> after page-root");
  const slice = html.slice(start, scriptIdx);
  const end = slice.lastIndexOf("</div>");
  if (end === -1) throw new Error("Missing closing </div> for page-root");
  return slice.slice(0, end + "</div>".length);
}

/** Remove iframe-only rules without touching [data-hscroll] or other shared selectors. */
function removeIframeOnlyCss(css) {
  const blocks = [
    /\n    html\.bi13-tilda-scale \{\n[\s\S]*?\n    \}/,
    /\n    html\.bi13-embedded,\n    html\.bi13-embedded body,\n    html\.bi13-tilda-scale,\n    html\.bi13-tilda-scale body \{\n[\s\S]*?\n    \}/,
    /\n    html\.bi13-embedded #page-root,\n    html\.bi13-tilda-scale #page-root \{\n[\s\S]*?\n    \}/,
    /\n    html\.bi13-tilda-scale \.skill-track \{\n[\s\S]*?\n    \}/,
  ];
  for (const re of blocks) {
    css = css.replace(re, "");
  }
  return css;
}

/** Arrow buttons are iframe-only UX; inline uses drag + wheel. */
function removeHscrollArrowCss(css) {
  const blocks = [
    /\n    \.hscroll-btn \{\n[\s\S]*?\n    \}/,
    /\n    \.hscroll-wrap\.is-scrollable \.hscroll-btn \{\n[\s\S]*?\n    \}/,
    /\n    \.hscroll-btn:disabled \{\n[\s\S]*?\n    \}/,
    /\n    \.hscroll-btn--prev \{[^\n]*\}/,
    /\n    \.hscroll-btn--next \{[^\n]*\}/,
    /\n    \.hscroll-btn::before \{\n[\s\S]*?\n    \}/,
    /\n    \.hscroll-btn--prev::before \{\n[\s\S]*?\n    \}/,
    /\n    \.hscroll-btn--next::before \{\n[\s\S]*?\n    \}/,
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
  css = css.replace(/url\("\.\/fonts\//g, `url("${BASE}fonts/`);
  css = removeIframeOnlyCss(css);
  css = removeHscrollArrowCss(css);
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  css = css.replace(/:root/g, PREFIX);
  css = css.replace(
    /\* \{ box-sizing: border-box; margin: 0; padding: 0; \}/,
    `${PREFIX}, ${PREFIX} * { box-sizing: border-box; margin: 0; padding: 0; }`
  );
  css = css.replace(/^    html \{/m, `    ${PREFIX} {`);
  css = css.replace(/^    body \{/m, `    ${PREFIX} {`);
  css = css.replace(
    /html, body, #page-root, a, button/g,
    `${PREFIX}, ${PREFIX} #page-root, ${PREFIX} a, ${PREFIX} button`
  );
  css = css.replace(/html \{ scroll-behavior: auto; \}/g, `${PREFIX} { scroll-behavior: auto; }`);

  css = prefixCss(css, PREFIX);

  const wrapperRules = `
    ${PREFIX} { width:100%; max-width:100%; overflow-x:clip; position:relative; isolation:isolate; display:block; }
    ${PREFIX} a, ${PREFIX} button { -webkit-tap-highlight-color:transparent; }
    ${PREFIX} section[id] { scroll-margin-top: ${TILDA_HEADER_OFFSET}px; }
    ${PREFIX} img { border:0; vertical-align:top; }
    ${PREFIX} [data-hscroll] { cursor: grab; -webkit-user-select: none; user-select: none; }
    ${PREFIX} [data-hscroll].is-dragging { cursor: grabbing; scroll-snap-type: none; }
    ${PREFIX} [data-hscroll] .review-card, ${PREFIX} [data-hscroll] .aud-card, ${PREFIX} [data-hscroll] .skill-card { -webkit-user-select: none; user-select: none; }
    ${PREFIX} [data-hscroll] img { -webkit-user-drag: none; user-drag: none; pointer-events: none; }
`;

  return minifyCss(wrapperRules + css);
}

function transformHtml(html) {
  return html.replace(/src="assets\//g, `src="${BASE}assets/`);
}

function buildJs() {
  return `(function () {
      var root = document.getElementById("bi13-inline-wrap");
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
        if (href.indexOf("mailto:") === 0 || href.indexOf("tel:") === 0) return true;
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

      var tabs = root.querySelectorAll("[data-tab]");
      var panels = {
        aesthetic: root.querySelector("#panel-aesthetic"),
        highlevel: root.querySelector("#panel-highlevel")
      };
      tabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
          var key = tab.getAttribute("data-tab");
          tabs.forEach(function (t) {
            var on = t === tab;
            t.classList.toggle("is-active", on);
            t.setAttribute("aria-selected", on ? "true" : "false");
          });
          Object.keys(panels).forEach(function (name) {
            var panel = panels[name];
            if (!panel) return;
            var on = name === key;
            panel.classList.toggle("is-active", on);
            panel.hidden = !on;
          });
        });
      });

      function bootFaq() {
        var items = Array.prototype.slice.call(root.querySelectorAll(".faq-item"));
        var ease = "height 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease";

        function setOpen(item, open) {
          var body = item.querySelector(".faq-item__a");
          var btn = item.querySelector(".faq-item__q");
          if (!body || !btn) return;
          var instant = prefersReducedMotion();
          item.classList.toggle("is-open", open);
          btn.setAttribute("aria-expanded", open ? "true" : "false");
          if (instant) {
            body.style.transition = "none";
            body.style.height = open ? "auto" : "0px";
            body.style.opacity = open ? "1" : "0";
            return;
          }
          body.style.transition = ease;
          if (open) {
            body.style.height = "0px";
            body.style.opacity = "0";
            requestAnimationFrame(function () {
              body.style.height = body.scrollHeight + "px";
              body.style.opacity = "1";
            });
          } else {
            body.style.height = body.scrollHeight + "px";
            requestAnimationFrame(function () {
              body.style.height = "0px";
              body.style.opacity = "0";
            });
          }
          body.addEventListener("transitionend", function onEnd(event) {
            if (event.propertyName !== "height") return;
            body.removeEventListener("transitionend", onEnd);
            if (open) body.style.height = "auto";
          });
        }

        items.forEach(function (item) {
          var btn = item.querySelector(".faq-item__q");
          if (!btn) return;
          btn.addEventListener("click", function () {
            var willOpen = !item.classList.contains("is-open");
            items.forEach(function (other) {
              if (other !== item && other.classList.contains("is-open")) setOpen(other, false);
            });
            setOpen(item, willOpen);
          });
        });
      }

      function bootHscrollDrag() {
        root.querySelectorAll("[data-hscroll]").forEach(function (track) {
          var drag = { active: false, moved: false, x: 0, scroll: 0, id: null };

          track.querySelectorAll("img").forEach(function (img) {
            img.setAttribute("draggable", "false");
            img.addEventListener("dragstart", function (e) {
              e.preventDefault();
            });
          });

          function canScroll() {
            return track.scrollWidth > track.clientWidth + 1;
          }

          track.addEventListener(
            "dragstart",
            function (e) {
              e.preventDefault();
            },
            true
          );

          track.addEventListener(
            "selectstart",
            function (e) {
              if (drag.active || drag.moved) e.preventDefault();
            },
            true
          );

          track.addEventListener(
            "wheel",
            function (e) {
              if (!canScroll()) return;
              if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
              track.scrollLeft += e.deltaY;
              e.preventDefault();
            },
            { passive: false }
          );

          track.addEventListener("pointerdown", function (e) {
            if (e.pointerType === "touch") return;
            if (e.button !== 0 || !canScroll()) return;
            if (e.target.closest("a, button, input, textarea, select, label")) return;
            drag.active = true;
            drag.moved = false;
            drag.x = e.clientX;
            drag.scroll = track.scrollLeft;
            drag.id = e.pointerId;
            track.classList.add("is-dragging");
            track.setPointerCapture(e.pointerId);
          });

          track.addEventListener("pointermove", function (e) {
            if (!drag.active || e.pointerId !== drag.id) return;
            var dx = e.clientX - drag.x;
            if (Math.abs(dx) > 4) drag.moved = true;
            track.scrollLeft = drag.scroll - dx;
          });

          function endDrag(e) {
            if (!drag.active || e.pointerId !== drag.id) return;
            drag.active = false;
            track.classList.remove("is-dragging");
            try {
              track.releasePointerCapture(e.pointerId);
            } catch (err) {}
          }

          track.addEventListener("pointerup", endDrag);
          track.addEventListener("pointercancel", endDrag);

          track.addEventListener(
            "click",
            function (e) {
              if (!drag.moved) return;
              e.preventDefault();
              e.stopPropagation();
              drag.moved = false;
            },
            true
          );
        });
      }

      function boot() {
        bootHscrollDrag();
        applyLinkTargets();
        bootReveal();
        bootFaq();
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
      } else {
        boot();
      }
    })();`;
}

async function build() {
  try {
    execSync("git fetch origin main", { cwd: ROOT, stdio: "pipe" });
  } catch {
    /* offline / no remote */
  }

  if (!process.env.BI13_ASSET_BASE) {
    BASE = `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@${resolveCommitSha()}/`;
  }

  const indexHtml = await readIndexHtml();
  const css = transformCss(extractStyle(indexHtml));
  const pageRoot = transformHtml(extractPageRoot(indexHtml));
  const js = buildJs();

  const output = `<!-- BI13 inline T123 v${VERSION} · assets: ${BASE} -->
<style>${css}
</style>
<div id="bi13-inline-wrap">${pageRoot}</div>
<script>${js}
</script>
`;

  fs.writeFileSync(OUT_PATH, output, "utf8");

  const stats = fs.statSync(OUT_PATH);
  const sizeKb = (stats.size / 1024).toFixed(1);

  const checks = {
    audTrack: pageRoot.includes('id="audTrack"') && pageRoot.includes("data-hscroll"),
    skillTrack: pageRoot.includes('id="skillTrack"') && pageRoot.includes("data-hscroll"),
    reviewTrack: pageRoot.includes('id="reviewTrack"') && pageRoot.includes("data-hscroll"),
    hscrollCss: css.includes("[data-hscroll]") && css.includes("overflow-x:auto"),
    scopedCss: css.includes("#bi13-inline-wrap .hero") && !css.includes("\n    img {"),
    noRootVars: !css.includes(":root {"),
    bootHscroll: js.includes("bootHscrollDrag") && !js.includes("bootHscrollArrows"),
    noHscrollArrows: !css.includes("hscroll-btn"),
    scopedJs: js.includes('getElementById("bi13-inline-wrap")'),
    noIframe: !js.includes("inIframe") && !js.includes("postMessage"),
    ghFonts: css.includes(`${BASE}fonts/`),
    ghAssets: pageRoot.includes(`${BASE}assets/`),
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

  return { path: OUT_PATH, sizeKb: parseFloat(sizeKb), checks };
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
