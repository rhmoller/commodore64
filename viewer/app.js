/* ============================================================
   C64 Dev Library — viewer logic
   - fetches markdown from ../docs/
   - renders with marked, converts ```mermaid blocks, themes mermaid
   - hash routing (#cpu-6510), internal .md link interception
   - sidebar nav, on-page TOC, prev/next pager, CRT toggle
   - 6502/KickAssembler syntax highlighting for ```asm blocks
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
    { file: "part-2-interrupts.md",    title: "Part II · Interrupts & Timing" },
    { file: "part-3-vic.md",           title: "Part III · VIC-II Graphics" },
    { file: "part-4-sid.md",           title: "Part IV · SID Sound" },
    { file: "part-5-basic.md",         title: "Part V · BASIC V2" },
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

  // ---- 6502/KickAssembler syntax highlighting for ```asm blocks ----
  var ASM_KEYWORDS = [
    // documented 6502 instructions
    'ADC','AND','ASL','BCC','BCS','BEQ','BIT','BMI','BNE','BPL','BRK',
    'BVC','BVS','CLC','CLD','CLI','CLV','CMP','CPX','CPY','DEC','DEX',
    'DEY','EOR','INC','INX','INY','JMP','JSR','LDA','LDX','LDY','LSR',
    'NOP','ORA','PHA','PHP','PLA','PLP','ROL','ROR','RTI','RTS','SBC',
    'SEC','SED','SEI','STA','STX','STY','TAX','TAY','TSX','TXA','TXS','TYA',
    // stable illegal opcodes
    'ANC','ALR','ARR','DCP','ISC','LAX','LAS','RLA','RRA','SAX','SBX',
    'SLO','SRE',
    // KickAssembler directives
    '.align','.assert','.byte','.const','.cpu','.define','.disposition',
    '.enc','.enum','.error','.eval','.file','.fill','.for','.function',
    '.import','.importbinary','.importc64','.importonce','.label','.let',
    '.macro','.namespace','.pc','.print','.pseudocommand','.return',
    '.segment','.segmentdef','.struct','.text','.var','.watch','.word',
    '.fillword','.dsection','.lohifill',
    // common KickAssembler macros
    'BasicUpstart2','BasicUpstart','Break','makeScreen','print',
    // flag & register names sometimes written uppercase
    'LORAM','HIRAM','CHAREN','RST8','DEN','RSEL','YSCROLL',
    // addressing-mode keywords used in expressions
    'lo','hi','bank','bank0','bank1','bank2','bank3'
  ];
  // Case-insensitive keyword lookup set.
  var ASM_KEYWORD_SET = {};
  ASM_KEYWORDS.forEach(function (k) { ASM_KEYWORD_SET[k.toLowerCase()] = true; });

  function highlightAsm(src) {
    var lines = src.split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      out.push(highlightAsmLine(lines[i]));
    }
    return out.join('\n');
  }

  function highlightAsmLine(line) {
    // 1) Split off comments (// or ;) that are not inside a string
    var comment = '';
    var body = line;
    var ci = indexOfAsmComment(body);
    if (ci >= 0) {
      comment = body.substring(ci);
      body = body.substring(0, ci);
    }

    // 2) Label at start of line: optional whitespace, identifier, colon
    var label = '';
    var rest = body;
    var labelMatch = body.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*?)\s*:/);
    if (labelMatch && labelMatch[1].length === (body.length - body.trimStart().length)) {
      // Only treat as label if the : is at the start (not mid-line like a ternary)
      label = labelMatch[1] + labelMatch[2] + ':';
      rest = body.substring(label.length);
    }

    // 3) Tokenise the rest
    var highlighted = '';
    if (rest) {
      highlighted = tokeniseAsmBody(rest);
    }

    var result = '';
    if (label) result += '<span class="asmlabel">' + escapeHtml(label) + '</span>';
    if (highlighted) {
      // preserve the space between label and operands
      result += highlighted;
    }
    if (comment) result += '<span class="asmcomment">' + escapeHtml(comment) + '</span>';
    return result || '';
  }

  // Find first // or ; not inside a double-quoted string
  function indexOfAsmComment(s) {
    var inStr = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '"') inStr = !inStr;
      if (!inStr) {
        if (ch === ';' || (ch === '/' && i + 1 < s.length && s[i + 1] === '/')) {
          return i;
        }
      }
    }
    return -1;
  }

  function tokeniseAsmBody(s) {
    var tokens = [];
    var i = 0;
    while (i < s.length) {
      // Whitespace — emit as-is
      if (/^\s/.test(s[i])) {
        var ws = '';
        while (i < s.length && /^\s/.test(s[i])) { ws += s[i]; i++; }
        tokens.push(ws);
        continue;
      }

      // String literal "..."
      if (s[i] === '"') {
        var str = '"';
        i++;
        while (i < s.length && s[i] !== '"') { str += s[i]; i++; }
        if (i < s.length) { str += '"'; i++; }
        tokens.push('<span class="asmstring">' + escapeHtml(str) + '</span>');
        continue;
      }

      // Hex number $xxxx
      if (s[i] === '$' && i + 1 < s.length && /[0-9A-Fa-f]/.test(s[i + 1])) {
        var hex = '$';
        i++;
        while (i < s.length && /[0-9A-Fa-f]/.test(s[i])) { hex += s[i]; i++; }
        tokens.push('<span class="asmnumber">' + hex + '</span>');
        continue;
      }

      // Binary number %xxxx
      if (s[i] === '%' && i + 1 < s.length && /[01]/.test(s[i + 1])) {
        var bin = '%';
        i++;
        while (i < s.length && /[01]/.test(s[i])) { bin += s[i]; i++; }
        tokens.push('<span class="asmnumber">' + bin + '</span>');
        continue;
      }

      // Decimal number
      if (/[0-9]/.test(s[i])) {
        var dec = '';
        while (i < s.length && /[0-9]/.test(s[i])) { dec += s[i]; i++; }
        tokens.push('<span class="asmnumber">' + dec + '</span>');
        continue;
      }

      // Identifier — check against keyword set
      if (/[A-Za-z_.]/.test(s[i])) {
        var id = '';
        while (i < s.length && /[A-Za-z0-9_.]/.test(s[i])) { id += s[i]; i++; }
        if (ASM_KEYWORD_SET[id.toLowerCase()]) {
          tokens.push('<span class="asmkeyword">' + escapeHtml(id) + '</span>');
        } else {
          tokens.push(escapeHtml(id));
        }
        continue;
      }

      // Punctuation / operators
      tokens.push(escapeHtml(s[i]));
      i++;
    }
    return tokens.join('');
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Register a marked extension that intercepts fenced code blocks with language "asm"
  marked.use({
    renderer: {
      code: function (token) {
        var lang = token.lang || '';
        if (lang.toLowerCase() === 'asm') {
          var highlighted = highlightAsm(token.text);
          var langClass = 'lang-asm';
          return '<pre class="' + langClass + '"><code class="' + langClass + '">' +
            highlighted + '</code></pre>';
        }
        // Fall through — default marked behaviour for all other languages
        return false;
      }
    }
  });

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
          '<h1>Couldn\'t load this page</h1>' +
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