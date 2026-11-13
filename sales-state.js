/* BI13 · 9 поток «Весь путь» · невидимый таймер продаж.
 * До OPEN_MS: вид «скоро старт продаж» (предзапись).
 * С OPEN_MS до CLOSE_MS: «продажи открыты», тарифы с кнопками оплаты.
 * После CLOSE_MS: «продажи закрыты», предзапись на следующий поток.
 * Переключение происходит само, без перезагрузки страницы.
 * Просмотр вида вручную: ?sales=before | ?sales=open | ?sales=after
 * Сменить время: числа ниже (new Date("2026-11-16T00:00:00+03:00").getTime()).
 */
(function () {
  var OPEN_MS = 1794776400000;  // 16.11.2026 00:00 МСК
  var CLOSE_MS = 1796072400000; // 01.12.2026 00:00 МСК (продажи до 30.11 23:59)
  var PASS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "r"];

  function forced() {
    try {
      var v = new URLSearchParams(location.search).get("sales");
      return v === "before" || v === "open" || v === "after" ? v : null;
    } catch (e) { return null; }
  }

  function stateAt(now) {
    return now < OPEN_MS ? "before" : now < CLOSE_MS ? "open" : "after";
  }

  function passParams(root) {
    try {
      var q = new URLSearchParams(location.search);
      var keep = PASS.filter(function (k) { return q.get(k); });
      if (!keep.length) return;
      root.querySelectorAll("a[data-pay]").forEach(function (a) {
        var u = new URL(a.getAttribute("href"), location.href);
        keep.forEach(function (k) { u.searchParams.set(k, q.get(k)); });
        a.setAttribute("href", u.toString());
      });
    } catch (e) {}
  }

  function apply(root) {
    var s = forced() || stateAt(Date.now());
    root.setAttribute("data-sales", s);
    if (forced()) return;
    var next = s === "before" ? OPEN_MS : s === "open" ? CLOSE_MS : 0;
    var wait = next - Date.now();
    if (next && wait > 0) setTimeout(function () { apply(root); }, Math.min(wait + 500, 36e5));
  }

  function boot() {
    var root = document.getElementById("page-root");
    if (!root) return;
    apply(root);
    passParams(root);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
