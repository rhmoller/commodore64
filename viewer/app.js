/* ============================================================
   C64 Dev Library — viewer logic
   - fetches markdown from ../docs/
   - renders with marked, converts ```mermaid blocks, themes mermaid
   - hash routing (#cpu-6510), internal .md link interception
   - sidebar nav, on-page TOC, prev/next pager, CRT toggle
   ============================================================ */
(function () {
  "use strict";

  // Reading order + display titles. `file` is relative to DOCS_BASE.
  var DOCS = [
    { file: "README.md",               title: "Home" },
    { file: "CURRICULUM.md",           title: "Curriculum" },
    { file: "00-getting-started.md",   title: "Getting Started" },
    { file: "part-0-orientation.md",   title: "Part 0 · Orientation" },
    { file: "part-1-foundations.md",   title: "Part I · 6502 Foundations" },
    { file: "cpu-6510.md",             title: "CPU · 6510 (overview)" },
    { file: "vic-ii.md",               title: "VIC-II" },
    { file: "sid.md",                  title: "SID" },
    { file: "basic-v2.md",             title: "BASIC V2" },
    { file: "demoscene-effects.md",    title: "Demoscene Effects" },
    { file: "game-dev-patterns.md",    title: "Game Dev Patterns" },
    { file: "toolchain.md",            title: "Toolchain" },
    { file: "c64-ultimate.md",         title: "C64 Ultimate" },
    { file: "appendix-a-opcodes.md",       title: "App A · Opcodes" },
    { file: "appendix-b-memory-map.md",    title: "App B · Memory Map" },
    { file: "appendix-c-vic-registers.md", title: "App C · VIC-II Regs" },
    { file: "appendix-d-sid-registers.md", title: "App D · SID Regs" },
    { file: "appendix-e-cia-registers.md", title: "App E · CIA Regs" },
    { file: "appendix-f-kernal-basic.md",  title: "App F · KERNAL/BASIC" },
    { file: "appendix-g-petscii.md",       title: "App G · PETSCII" },
    { file: "appendix-h-timing.md",        title: "App H · Timing" },
    { file: "appendix-i-glossary.md",      title: "App I · Glossary" }
  ];
  var DOCS_BASE = "../docs/";
  var DEFAULT_KEY = "README";

  var $doc     = document.getElementById("doc");
  var $sidebar = document.getElementById("sidebar");
  var $toc     = document.getElementById("toc");
  var $pager   = document.getElementById("pager");
  var $raw     = document.getElementById("rawLink");
  var cache    = {};

  // ---- helpers ----
  function keyOf(file) { return file.replace(/\.md$/i, ""); }
  function docByKey(key) {
    key = (key || "").toLowerCase();
    for (var i = 0; i < DOCS.length; i++)
      if (keyOf(DOCS[i].file).toLowerCase() === key) return DOCS[i];
    return null;
  }
  function slugify(s) {
    return s.toLowerCase().trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }
  function currentKey() {
    var h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    return h || DEFAULT_KEY;
  }

  // ---- marked + mermaid setup ----
  marked.setOptions({ gfm: true, breaks: false });
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",          // allow <br/> html labels in nodes
    theme: "base",
    themeVariables: {
      background: "#f4f1ff",
      primaryColor: "#dcd6ff",
      primaryBorderColor: "#5a4fcf",
      primaryTextColor: "#241a5e",
      secondaryColor: "#cfe4ff",
      tertiaryColor: "#fff2cc",
      lineColor: "#5a4fcf",
      fontFamily: '"Cascadia Mono",ui-monospace,Menlo,Consolas,monospace',
      fontSize: "14px"
    }
  });

  // ---- sidebar ----
  function buildSidebar() {
    var html = '<div class="navhead">Contents</div>';
    DOCS.forEach(function (d, i) {
      var idx = i === 0 ? "&#9670;" : String(i).padStart(2, "0");
      html += '<a href="#' + keyOf(d.file) + '" data-key="' +
        keyOf(d.file) + '"><span class="idx">' + idx + "</span>" + d.title + "</a>";
    });
    $sidebar.innerHTML = html;
  }

  function setActiveNav(key) {
    var links = $sidebar.querySelectorAll("a");
    links.forEach(function (a) {
      a.classList.toggle("active",
        a.getAttribute("data-key").toLowerCase() === key.toLowerCase());
    });
  }

  // ---- rendering ----
  function render(md) {
    $doc.innerHTML = marked.parse(md);

    // 1. Convert ```mermaid code blocks -> <div class="mermaid"> (raw textContent)
    var mblocks = $doc.querySelectorAll("code.language-mermaid");
    mblocks.forEach(function (code) {
      var pre = code.closest("pre") || code;
      var div = document.createElement("div");
      div.className = "mermaid";
      div.textContent = code.textContent;   // literal graph source (entities decoded)
      pre.replaceWith(div);
    });

    // 2. Heading ids for TOC + anchor links
    var heads = $doc.querySelectorAll("h2, h3");
    var used = {};
    heads.forEach(function (h) {
      var base = slugify(h.textContent) || "section";
      var id = base, n = 2;
      while (used[id]) { id = base + "-" + n++; }
      used[id] = true;
      h.id = id;
    });

    // 3. Resolve links: external -> new tab; relative non-.md (assets like the
    //    reference PDF, images) -> rewrite to the docs folder + open in new tab;
    //    relative .md -> left for the click handler to route internally.
    $doc.querySelectorAll("a[href]").forEach(function (a) {
      var href = a.getAttribute("href") || "";
      if (/^https?:\/\//i.test(href)) { a.target = "_blank"; a.rel = "noopener"; return; }
      if (/^[#/]/.test(href)) return;                 // in-page anchor or absolute path
      var isMd = /\.md($|[#?])/i.test(href);
      a.setAttribute("href", DOCS_BASE + href);       // resolve against ../docs/
      if (!isMd) { a.target = "_blank"; a.rel = "noopener"; }
    });
    // Same for images, so any figures in the docs load.
    $doc.querySelectorAll("img[src]").forEach(function (img) {
      var src = img.getAttribute("src") || "";
      if (!/^(https?:)?\/\//i.test(src) && !/^[/]/.test(src)) {
        img.setAttribute("src", DOCS_BASE + src);
      }
    });

    buildTOC(heads);
  }

  function renderMermaid() {
    var nodes = $doc.querySelectorAll(".mermaid");
    if (!nodes.length) return Promise.resolve();
    return mermaid.run({ nodes: nodes }).catch(function (err) {
      // Don't let a single bad diagram blank the page.
      console.error("mermaid render error", err);
    });
  }

  // ---- TOC ----
  function buildTOC(heads) {
    if (!heads.length) { $toc.innerHTML = ""; return; }
    var html = '<div class="navhead">On this page</div>';
    heads.forEach(function (h) {
      var cls = h.tagName === "H3" ? "lvl3" : "lvl2";
      html += '<a class="' + cls + '" href="#' + h.id + '" data-anchor="' +
        h.id + '">' + h.textContent + "</a>";
    });
    $toc.innerHTML = html;
  }

  // ---- pager ----
  function buildPager(index) {
    var prev = DOCS[index - 1], next = DOCS[index + 1];
    var html = "";
    if (prev) html += '<a class="prev" href="#' + keyOf(prev.file) +
      '"><span class="dir">&#8592; Prev</span><span class="ttl">' + prev.title + "</span></a>";
    else html += "<span></span>";
    if (next) html += '<a class="next" href="#' + keyOf(next.file) +
      '"><span class="dir">Next &#8594;</span><span class="ttl">' + next.title + "</span></a>";
    $pager.innerHTML = html;
  }

  // ---- load a document ----
  function load(key) {
    var doc = docByKey(key) || docByKey(DEFAULT_KEY);
    var index = DOCS.indexOf(doc);
    setActiveNav(keyOf(doc.file));
    $raw.href = DOCS_BASE + doc.file;
    document.title = doc.title + " — C64 Dev Library";

    var finish = function (md) {
      render(md);
      buildPager(index);
      renderMermaid().then(function () {
        // jump to top of content after everything is laid out
        window.scrollTo(0, 0);
        var main = document.querySelector(".content");
        if (main) main.scrollTop = 0;
      });
    };

    if (cache[doc.file]) { finish(cache[doc.file]); return; }

    $doc.innerHTML = '<p class="loading">Loading ' + doc.file + "&hellip;</p>";
    fetch(DOCS_BASE + doc.file, { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(function (md) { cache[doc.file] = md; finish(md); })
      .catch(function (err) {
        $doc.innerHTML =
          '<h1>Couldn’t load this page</h1>' +
          "<p><code>" + DOCS_BASE + doc.file + "</code> &rarr; " + err.message + "</p>" +
          "<blockquote>This viewer must be served over HTTP (not opened as a " +
          "<code>file://</code> URL), and the server root must be the repository " +
          "root so that <code>../docs/</code> is reachable.<br><br>" +
          "From the <code>c64-tools/</code> directory run:<br>" +
          "<code>python3 viewer/serve.py</code><br>then open " +
          "<code>http://localhost:8000/viewer/</code></blockquote>";
        $toc.innerHTML = "";
        $pager.innerHTML = "";
      });
  }

  // ---- routing ----
  function route() {
    closeNav();
    load(currentKey());
  }

  // ---- nav / link interactions ----
  function closeNav() { document.body.classList.remove("nav-open"); }

  document.getElementById("navToggle").addEventListener("click", function () {
    document.body.classList.toggle("nav-open");
  });
  document.getElementById("scrim").addEventListener("click", closeNav);

  // CRT toggle (persisted)
  var crtBtn = document.getElementById("crtToggle");
  if (localStorage.getItem("c64crt") === "1") {
    document.body.classList.add("crt"); crtBtn.classList.add("active");
  }
  crtBtn.addEventListener("click", function () {
    var on = document.body.classList.toggle("crt");
    crtBtn.classList.toggle("active", on);
    localStorage.setItem("c64crt", on ? "1" : "0");
  });

  // Intercept in-content clicks: .md links route internally, #anchors scroll.
  $doc.addEventListener("click", function (e) {
    var a = e.target.closest("a");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (/^#/.test(href)) {
      e.preventDefault();
      var el = document.getElementById(href.slice(1));
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (/\.md($|[#?])/i.test(href)) {
      e.preventDefault();
      var file = href.split(/[#?]/)[0].split("/").pop();
      location.hash = "#" + keyOf(file);
    }
  });

  // TOC clicks: smooth-scroll without hijacking the page hash route.
  $toc.addEventListener("click", function (e) {
    var a = e.target.closest("a");
    if (!a) return;
    e.preventDefault();
    var el = document.getElementById(a.getAttribute("data-anchor"));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // ---- boot ----
  buildSidebar();
  window.addEventListener("hashchange", route);
  route();
})();
