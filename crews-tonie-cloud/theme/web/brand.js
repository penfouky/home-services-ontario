/* Colada Builds branding for the TeddyCloud admin UI.
 *
 * Loaded (deferred) over the stock TeddyCloud page by Caddy — see ../README.md.
 * TeddyCloud is a React single-page app, so the header renders after this script
 * runs; everything here is therefore defensive and idempotent, and a MutationObserver
 * re-applies the brand text whenever React re-renders. Purely cosmetic: it renames
 * and re-badges the UI, it does not change any behaviour.
 */
(function () {
  "use strict";

  var BRAND = "Colada Builds";
  var LOGO = "/colada/logo.svg";
  var THEME_COLOR = "#8b6df2";
  // TeddyCloud's own name, shown in the header/sidebar; swapped for the brand.
  var OLD = "TeddyCloud";

  function setTitle() {
    // Keep any page-specific suffix TeddyCloud sets (e.g. "TeddyCloud - Settings").
    var t = document.title || "";
    if (t.indexOf(BRAND) === -1) {
      document.title = t.indexOf(OLD) !== -1 ? t.split(OLD).join(BRAND) : BRAND;
    }
  }

  function setFavicon() {
    try {
      var links = document.querySelectorAll('link[rel~="icon"]');
      if (!links.length) {
        var l = document.createElement("link");
        l.rel = "icon";
        document.head.appendChild(l);
        links = [l];
      }
      links.forEach(function (l) {
        l.setAttribute("type", "image/svg+xml");
        l.setAttribute("href", LOGO);
      });
      var meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "theme-color");
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", THEME_COLOR);
    } catch (e) { /* non-fatal */ }
  }

  // Replace the "TeddyCloud" wordmark with "Colada Builds" inside the header and
  // sidebar only, so labels elsewhere that legitimately mention TeddyCloud are left
  // alone. Operates on text nodes so it never disturbs the DOM structure React owns.
  function rebrandChrome(root) {
    var scopes = (root || document).querySelectorAll(
      "header, .ant-layout-header, aside, .ant-layout-sider, .ant-menu"
    );
    scopes.forEach(function (scope) {
      var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = walker.nextNode())) {
        if (n.nodeValue && n.nodeValue.indexOf(OLD) !== -1) {
          n.nodeValue = n.nodeValue.split(OLD).join(BRAND);
        }
      }
    });
  }

  function apply() {
    setTitle();
    rebrandChrome(document);
  }

  function start() {
    setFavicon();
    apply();
    try {
      var obs = new MutationObserver(function () {
        // Debounce bursts of React updates into one pass on the next frame.
        if (start._q) return;
        start._q = true;
        (window.requestAnimationFrame || window.setTimeout)(function () {
          start._q = false;
          apply();
        }, 0);
      });
      obs.observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* observer unsupported: the initial apply() still ran */ }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
