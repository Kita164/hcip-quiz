/* HCIE-Datacom notes. Static: catalog.json lists topics, one JSON file each. */
(function () {
  const KEY = "hcie-datacom-learned";
  const state = {
    catalog: null,
    topics: {},
    order: [],
    learned: {},
    query: "",
    onlyTodo: false,
    current: "home",
    openDecks: new Set(),
    mindOff: new Set(),
    diagrams: {},
    spy: null,
    spyLock: "",
  };

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function highlight(s) {
    const text = esc(s);
    const q = state.query.trim();
    if (q.length < 1) return text;
    const parts = q.split(/\s+/).filter(Boolean).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!parts.length) return text;
    try {
      return text.replace(new RegExp("(" + parts.join("|") + ")", "gi"), "<mark>$1</mark>");
    } catch (e) {
      return text;
    }
  }

  function loadLearned() {
    try {
      state.learned = JSON.parse(localStorage.getItem(KEY) || "{}");
    } catch (e) {
      state.learned = {};
    }
  }

  function saveLearned() {
    localStorage.setItem(KEY, JSON.stringify(state.learned));
  }

  function topicList() {
    return state.order.map((id) => state.topics[id]).filter(Boolean);
  }

  function haystack(topic) {
    const bits = [topic.title, topic.summary];
    walk(topic.mindmap, bits);
    (topic.blocks || []).forEach((b) => {
      bits.push(b.text, b.title, b.caption, b.code);
      (b.items || []).forEach((x) => bits.push(x));
      (b.headers || []).forEach((x) => bits.push(x));
      if (b.type === "table") {
        (b.rows || []).forEach((r) => r.forEach((c) => bits.push(c)));
      }
      if (b.type === "bands") {
        (b.rows || []).forEach((r) => {
          bits.push(r.name);
          (r.items || []).forEach((x) => bits.push(x));
        });
      }
      if (b.type === "topo") {
        (b.nodes || []).forEach((n) => bits.push(n.label, n.sub));
        (b.links || []).forEach((l) => bits.push(l.label));
      }
    });
    (topic.exam || []).forEach((x) => bits.push(x));
    (topic.mixups || []).forEach((m) => bits.push(m.see, m.mean));
    (topic.memory || []).forEach((x) => bits.push(x));
    (topic.labs || []).forEach((lab) => {
      bits.push(lab.title, lab.goal);
      (lab.steps || []).forEach((s) => {
        bits.push(s.where, s.text, s.code);
        if (s.table) {
          (s.table.headers || []).forEach((x) => bits.push(x));
          (s.table.rows || []).forEach((r) => r.forEach((c) => bits.push(c)));
        }
      });
      (lab.verify || []).forEach((v) => bits.push(v.title, v.see, v.code));
    });
    (topic.figures || []).forEach((f) => bits.push(f.caption));
    return bits.filter(Boolean).join("\n");
  }

  function walk(nodes, bits) {
    (nodes || []).forEach((n) => {
      bits.push(n.t, n.d);
      walk(n.c, bits);
    });
  }

  function matches(topic) {
    if (state.onlyTodo && state.learned[topic.id]) return false;
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    const hay = topic._hay || "";
    return q.split(/\s+/).every((part) => hay.includes(part));
  }

  function parseHash() {
    const raw = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    if (!raw || raw === "home") return { id: "home", anchor: "" };
    const cut = raw.indexOf("/");
    if (cut < 0) return { id: raw, anchor: "" };
    return { id: raw.slice(0, cut), anchor: raw.slice(cut + 1) };
  }

  function deckOf(id) {
    return (state.catalog.decks || []).find((d) => d.topics.includes(id));
  }

  function renderNav() {
    const nav = $("nav");
    const learnedN = state.order.filter((id) => state.learned[id]).length;
    $("prog").textContent = "已学 " + learnedN + " / " + state.order.length;
    const searching = state.query.trim().length > 0;
    const homeOn = state.current === "home" ? " active" : "";
    let html = '<a class="topic-link' + homeOn + '" href="#home"><i class="dot"></i><span>总览</span></a>';
    state.catalog.decks.forEach((deck) => {
      const items = deck.topics
        .map((id) => state.topics[id])
        .filter((t) => t && matches(t));
      if (!items.length) return;
      const open = searching || state.openDecks.has(deck.id);
      html += '<details class="deck-block" data-deck="' + esc(deck.id) + '"' + (open ? " open" : "") + ">";
      html += "<summary>" + esc(deck.title) + "</summary>";
      items.forEach((t) => {
        const on = t.id === state.current ? " active" : "";
        const done = state.learned[t.id] ? " learned" : "";
        html += '<a class="topic-link' + on + done + '" href="#' + esc(t.id) + '"><i class="dot"></i><span>' + highlight(t.title) + "</span></a>";
      });
      html += "</details>";
    });
    const any = state.order.some((id) => matches(state.topics[id]));
    if (!any) html += '<p class="empty">没有匹配的专题。</p>';
    nav.innerHTML = html;
    nav.querySelectorAll("details.deck-block").forEach((el) => {
      el.addEventListener("toggle", () => {
        const id = el.getAttribute("data-deck");
        if (el.open) state.openDecks.add(id);
        else state.openDecks.delete(id);
      });
    });
    const active = nav.querySelector(".topic-link.active");
    if (active) {
      const nr = nav.getBoundingClientRect();
      const ar = active.getBoundingClientRect();
      if (ar.top < nr.top + 8 || ar.bottom > nr.bottom - 8) {
        nav.scrollTop += ar.top - nr.top - 48;
      }
    }
    renderHits();
  }

function snippet(topic) {
  const part = state.query.trim().toLowerCase().split(/\s+/)[0] || "";
  const lines = (topic._raw || topic._hay || "").split("\n");
  const line = lines.find((l) => l.toLowerCase().includes(part)) || topic.summary || "";
  const i = part ? line.toLowerCase().indexOf(part) : 0;
  const start = Math.max(0, i - 18);
  return (start ? "…" : "") + line.slice(start, start + 72);
}

  function renderHits() {
    const box = $("hits");
    const q = state.query.trim();
    if (q.length < 1) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    const hits = topicList().filter(matches).slice(0, 8);
    if (!hits.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = hits.map((t) => {
      const anchor = firstAnchor(t);
      const href = "#" + encodeURIComponent(t.id) + (anchor ? "/" + anchor : "");
      return '<a class="hit" href="' + href + '"><b>' + highlight(t.title) + "</b><span>" + highlight(snippet(t)) + "</span></a>";
    }).join("");
  }

  function firstAnchor(topic) {
    const blocks = topic.blocks || [];
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].type === "h") return "s-" + i;
    }
    return "";
  }

  function renderTree(nodes) {
    if (!nodes || !nodes.length) return "";
    return "<ul class=\"tree\">" + nodes.map((n) => {
      const kids = n.c && n.c.length ? renderTree(n.c) : "";
      const note = n.d ? '<span class="tree-d">' + highlight(n.d) + "</span>" : "";
      if (kids) {
        return "<li><details open><summary>" + highlight(n.t) + note + "</summary>" + kids + "</details></li>";
      }
      return '<li class="leaf"><span>' + highlight(n.t) + "</span>" + note + "</li>";
    }).join("") + "</ul>";
  }

  function renderTopo(topo) {
    if (!topo || !window.HCIEFigures) return "";
    return HCIEFigures.spec({
      kind: "net",
      pixel: true,
      title: "组网",
      caption: topo.caption || "",
      detail: true,
      nodes: (topo.nodes || []).map((n) => ({ id: n.id, role: n.role || "router", label: n.label, sub: n.sub, labelAt: n.labelAt, x: n.x, y: n.y })),
      links: topo.links || [],
    });
  }

  function renderCode(title, code) {
    if (!code) return "";
    const head = '<div class="code-head"><span>' + highlight(title || "命令") + '</span><button type="button" class="copy" data-copy="1">复制</button></div>';
    return head + "<pre>" + esc(code).replace(/\n$/, "") + "</pre>";
  }

  function liBody(s) {
    const lines = String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
    if (lines.length <= 1) return highlight(s);
    return highlight(lines[0]) + "<ul>" + lines.slice(1).map((x) => "<li>" + highlight(x) + "</li>").join("") + "</ul>";
  }

  function richText(s) {
    const raw = String(s || "");
    const lines = raw.split("\n").map((x) => x.trim()).filter(Boolean);
    if (lines.length > 1) {
      return "<ul>" + lines.map((x) => "<li>" + highlight(x) + "</li>").join("") + "</ul>";
    }
    return "<p>" + highlight(raw) + "</p>";
  }

  function renderTable(b) {
    const head = "<tr>" + (b.headers || []).map((h) => "<th>" + highlight(h) + "</th>").join("") + "</tr>";
    const rows = (b.rows || []).map((r) => "<tr>" + r.map((c) => "<td>" + highlight(c) + "</td>").join("") + "</tr>").join("");
    const cap = b.caption ? "<caption>" + highlight(b.caption) + "</caption>" : "";
    return '<div class="table-wrap"><table>' + cap + "<thead>" + head + "</thead><tbody>" + rows + "</tbody></table></div>";
  }

  function secHead(tag, id, no, text) {
    return "<" + tag + (id ? ' id="' + id + '"' : "") + ">" +
      (no ? '<span class="sec-no">' + esc(no) + "</span>" : "") + highlight(text) + "</" + tag + ">";
  }

  function renderBlock(b, index, no) {
    if (b.type === "h") {
      const lv = b.lv === 3 ? "h4" : "h3";
      return secHead(lv, "s-" + index, no, b.text);
    }
    if (b.type === "p") return richText(b.text);
    if (b.type === "ul") return "<ul>" + (b.items || []).map((x) => "<li>" + liBody(x) + "</li>").join("") + "</ul>";
    if (b.type === "ol") return "<ol>" + (b.items || []).map((x) => "<li>" + liBody(x) + "</li>").join("") + "</ol>";
    if (b.type === "table") return renderTable(b);
    if (b.type === "code") return renderCode(b.title, b.code);
    if (b.type === "callout") {
      const kind = ["exam", "tip", "warn", "fix"].includes(b.kind) ? b.kind : "tip";
      return '<div class="callout ' + kind + '"><div class="ct">' + highlight(b.title || "") + "</div>" + richText(b.text || "") + "</div>";
    }
    if (b.type === "topo") return renderTopo(b);
    if (b.type === "bands") {
      const rows = (b.rows || []).map((r) => {
        const items = (r.items || []).map((x) => "<span>" + highlight(x) + "</span>").join("");
        return '<div class="band"><div class="band-name">' + highlight(r.name) + '</div><div class="band-items">' + items + "</div></div>";
      }).join("");
      const cap = b.caption ? '<p class="source">' + highlight(b.caption) + "</p>" : "";
      return '<div class="bands">' + rows + "</div>" + cap;
    }
    return "";
  }

  function renderLabs(labs, no) {
    if (!labs || !labs.length) return "";
    const body = labs.map((lab, i) => {
      const steps = (lab.steps || []).map((s) => {
        return '<div class="where">' + esc(s.where || "步骤") + "</div>" +
          (s.text ? richText(s.text) : "") +
          (s.table ? renderTable(s.table) : "") +
          (s.code ? renderCode(s.where || "", s.code) : "");
      }).join("");
      const verify = (lab.verify || []).map((v) => {
        return "<h4>" + highlight(v.title || "验证") + "</h4>" +
          (v.see ? (richText(v.see).startsWith("<ul>") ? "<p><b>看到：</b></p>" + richText(v.see) : richText(v.see).replace(/^<p>/, "<p><b>看到：</b>")) : "") +
          (v.code ? renderCode("回显", v.code) : "");
      }).join("");
      return '<details class="lab card" open id="lab-' + i + '"><summary>' + highlight(lab.title || "实验") + "</summary>" +
        (lab.goal ? '<p class="goal">' + highlight(lab.goal) + "</p>" : "") +
        (lab.topo ? renderTopo(lab.topo) : "") +
        steps + verify + "</details>";
    }).join("");
    return secHead("h3", "labs", no, "实验") + body;
  }

  function renderFigures(figs, no) {
    if (!figs || !figs.length) return "";
    return secHead("h3", "figures", no, "课件里的图") + figs.map((f) => {
      return '<figure class="figure"><img src="' + esc(f.src) + '" alt="' + esc(f.caption || "") + '" loading="lazy"><figcaption>' + highlight(f.caption || "") + "</figcaption></figure>";
    }).join("");
  }

  function neighbors(id) {
    const i = state.order.indexOf(id);
    return {
      prev: i > 0 ? state.topics[state.order[i - 1]] : null,
      next: i >= 0 && i < state.order.length - 1 ? state.topics[state.order[i + 1]] : null,
    };
  }

  function renderHome() {
    const learnedN = state.order.filter((id) => state.learned[id]).length;
    const next = state.order.map((id) => state.topics[id]).find((t) => !state.learned[t.id]);
    let html = '<p class="kicker">学习笔记，不是题库</p>';
    html += secHead("h2", "page-title", "1.", "HCIE-Datacom");
    html += "<p class=\"summary\">这里按专题整理笔试 H12-891 和实验 H12-892 会用到的说法、对照表和华为命令。不做题。左侧可以搜整份笔记，学完一个专题就标已学，进度只存在这台浏览器里。</p>";
    html += '<p class="source">已学 ' + learnedN + " / " + state.order.length + (next ? "。下一篇未学：<a href=\"#" + esc(next.id) + "\">" + esc(next.title) + "</a>" : "。这一轮都标过了，可以按目录回头翻易混点。") + "</p>";
    const outline = [{ id: "page-title", text: "总览", depth: 0, no: "1." }];
    let sectionNo = 0;
    state.catalog.decks.forEach((deck) => {
      sectionNo += 1;
      const no = "1." + sectionNo;
      html += '<section class="card" id="deck-' + esc(deck.id) + '">' + secHead("h3", "", no, deck.title);
      outline.push({ id: "deck-" + deck.id, text: deck.title, depth: 1, no: no });
      html += '<p class="source">' + esc(deck.source || "") + "</p>";
      html += "<p>" + esc(deck.blurb || "") + "</p><ul>";
      deck.topics.forEach((id) => {
        const t = state.topics[id];
        if (!t) return;
        const mark = state.learned[id] ? "已学 · " : "";
        html += "<li><a href=\"#" + esc(id) + "\">" + esc(mark + t.title) + "</a> — " + esc(t.summary) + "</li>";
      });
      html += "</ul></section>";
    });
    sectionNo += 1;
    html += '<section class="card" id="add-deck">' + secHead("h3", "", "1." + sectionNo, "以后加一套新课件") + "<ol>";
    outline.push({ id: "add-deck", text: "以后加一套新课件", depth: 1, no: "1." + sectionNo });
    html += "<li>一个专题一个文件，放到 <code>hcie/data/topics/&lt;id&gt;.json</code>。字段看 <code>hcie/README.md</code>。</li>";
    html += "<li>在 <code>hcie/data/catalog.json</code> 的某个章节 <code>topics</code> 数组里写上这个 id。新章节就加一个 deck。</li>";
    html += "<li>图放进 <code>hcie/images/</code>，JSON 里用相对 <code>hcie/</code> 的路径，例如 <code>images/foo.jpg</code>。</li>";
    html += "<li>不用构建。保存后刷新页面就会出现在目录和搜索里。</li>";
    html += "</ol></section>";
    $("article").innerHTML = html;
    $("top-title").textContent = "总览";
    renderRail(outline, '<div class="rail-card"><p class="rail-kicker">怎么用</p><p>左侧按章展开。搜概念或命令会把命中的章节打开。学完就标已学，进度只留在这台浏览器里。</p></div>');
  }

  function renderTopic(id) {
    const t = state.topics[id];
    if (!t) {
      $("article").innerHTML = "<h2>没有这一篇</h2><p><a href=\"#home\">回总览</a></p>";
      renderRail([], "");
      return;
    }
    const deck = deckOf(id);
    const learned = !!state.learned[id];
    const outline = [{ id: "page-title", text: t.title, depth: 0, no: "1." }];
    const sectionNo = {};
    let h3n = 0;
    (t.blocks || []).forEach((b, i) => {
      if (b.type !== "h" || b.lv === 3) return;
      h3n += 1;
      sectionNo["s-" + i] = "1." + h3n;
      outline.push({ id: "s-" + i, text: b.text, depth: 1, no: sectionNo["s-" + i] });
    });
    function takeNo(anchor, text) {
      h3n += 1;
      const no = "1." + h3n;
      outline.push({ id: anchor, text: text, depth: 1, no: no });
      return no;
    }
    const examNo = t.exam && t.exam.length ? takeNo("exam", "常考点") : "";
    const mixNo = t.mixups && t.mixups.length ? takeNo("mixups", "看到什么就是什么") : "";
    const memNo = t.memory && t.memory.length ? takeNo("memory", "记忆") : "";
    const labNo = (t.labs || []).length ? takeNo("labs", "实验") : "";
    const figNo = (t.figures || []).length ? takeNo("figures", "课件里的图") : "";
    const toc = outline.filter((item) => item.depth).map((item) => {
      return '<a href="#' + esc(id) + "/" + encodeURIComponent(item.id) + '">' +
        (item.no ? '<span class="sec-no">' + esc(item.no) + "</span>" : "") + esc(item.text) + "</a>";
    });
    let html = '<p class="kicker">' + esc(deck ? deck.title : "") + "</p>";
    html += secHead("h2", "page-title", "1.", t.title);
    html += '<p class="summary">' + highlight(t.summary) + "</p>";
    html += '<div class="meta-row"><button type="button" class="learn' + (learned ? " on" : "") + '" id="learn-btn">' + (learned ? "已学" : "标为已学") + "</button>";
    html += '<span class="source">' + esc(t.source || (deck && deck.source) || "") + "</span></div>";
    if (toc.length) html += '<nav class="toc" aria-label="本页小节">' + toc.join("") + "</nav>";
    if (t.mindmap && t.mindmap.length && window.HCIEFigures) html += HCIEFigures.mind(id, t.mindmap, state.mindOff);
    const figs = state.diagrams[id] || [];
    const used = {};
    let prose = "";
    (t.blocks || []).forEach((b, i) => {
      prose += renderBlock(b, i, sectionNo["s-" + i]);
      if (b.type === "h" && window.HCIEFigures) {
        figs.forEach((f, fi) => {
          if (!used[fi] && f.at && String(b.text || "").indexOf(f.at) >= 0) {
            used[fi] = true;
            prose += HCIEFigures.spec(f);
          }
        });
      }
    });
    if (window.HCIEFigures) {
      figs.forEach((f, fi) => {
        if (!used[fi]) prose = HCIEFigures.spec(f) + prose;
      });
    }
    html += '<div class="prose">' + prose + "</div>";
    if (t.exam && t.exam.length) {
      html += secHead("h3", "exam", examNo, "常考点") + "<ul>" + t.exam.map((x) => "<li>" + liBody(x) + "</li>").join("") + "</ul>";
    }
    if (t.mixups && t.mixups.length) {
      html += secHead("h3", "mixups", mixNo, "看到什么就是什么");
      html += t.mixups.map((m) => '<div class="see"><div><b>看到</b>' + highlight(m.see) + "</div><div><b>就是</b>" + highlight(m.mean) + "</div></div>").join("");
    }
    if (t.memory && t.memory.length) {
      html += secHead("h3", "memory", memNo, "记忆") + '<ul class="memory">' + t.memory.map((x) => "<li>" + highlight(x) + "</li>").join("") + "</ul>";
    }
    html += renderLabs(t.labs, labNo);
    html += renderFigures(t.figures, figNo);
    const nb = neighbors(id);
    html += '<div class="pager">';
    html += nb.prev ? '<a href="#' + esc(nb.prev.id) + '">← ' + esc(nb.prev.title) + "</a>" : "<span></span>";
    html += nb.next ? '<a href="#' + esc(nb.next.id) + '">' + esc(nb.next.title) + " →</a>" : "<span></span>";
    html += "</div>";
    $("article").innerHTML = html;
    $("top-title").textContent = t.title;
    document.title = t.title + " · HCIE 笔记";
    const btn = $("learn-btn");
    if (btn) btn.addEventListener("click", () => toggleLearned(id));
    const points = (t.exam && t.exam.length ? t.exam : t.memory) || [];
    const card = points.length
      ? '<div class="rail-card"><p class="rail-kicker">本篇要点</p><ul>' + points.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul></div>"
      : "";
    renderRail(outline, card);
  }

  function renderRail(items, extra) {
    const rail = $("rail");
    if (!rail) return;
    if (!items || !items.length) {
      rail.innerHTML = "";
      return;
    }
    const base = state.current === "home" ? "home" : state.current;
    const nav = items.map((item, i) => {
      const href = item.id === "page-title" ? "#" + encodeURIComponent(base) : "#" + encodeURIComponent(base) + "/" + encodeURIComponent(item.id);
      return '<a class="' + (item.depth ? "sub" : "") + (i === 0 ? " active" : "") + '" data-spy="' + esc(item.id) + '" href="' + href + '">' +
        (item.no ? '<span class="sec-no">' + esc(item.no) + "</span>" : "") + esc(item.text) + "</a>";
    }).join("");
    rail.innerHTML = '<p class="rail-kicker">本页目录</p><nav class="rail-nav" aria-label="本页目录">' + nav + "</nav>" + (extra || "");
    rail.querySelectorAll("a[data-spy]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const target = a.getAttribute("data-spy");
        state.spyLock = target;
        setRailActive(target);
        const href = a.getAttribute("href") || "";
        if (location.hash !== href) history.pushState(null, "", href);
        scrollToHeading(target, true);
      });
    });
    updateSpy();
  }

  function viewScroller() {
    if (window.matchMedia("(max-width: 900px)").matches) return window;
    if (window.matchMedia("(min-width: 1180px)").matches) return $("article");
    return document.querySelector(".main") || window;
  }

  function spyOffset() {
    return window.matchMedia("(max-width: 900px)").matches ? 64 : 24;
  }

  function railHeads() {
    return Array.from(document.querySelectorAll(".rail-nav a[data-spy]")).map((a) => {
      return { id: a.getAttribute("data-spy"), el: document.getElementById(a.getAttribute("data-spy")) };
    }).filter((item) => item.el);
  }

  function setRailActive(id) {
    document.querySelectorAll(".rail-nav a[data-spy]").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("data-spy") === id);
    });
  }

  function updateSpy() {
    if (state.spyLock) return;
    const heads = railHeads();
    const scroller = viewScroller();
    if (!heads.length || !scroller) return;
    const scrollingWindow = scroller === window;
    const top = scrollingWindow ? window.scrollY : scroller.scrollTop;
    const height = scrollingWindow ? window.innerHeight : scroller.clientHeight;
    const scrollHeight = scrollingWindow ? document.documentElement.scrollHeight : scroller.scrollHeight;
    if (top + height >= scrollHeight - 8) {
      setRailActive(heads[heads.length - 1].id);
      return;
    }
    const line = (scrollingWindow ? 0 : scroller.getBoundingClientRect().top) + spyOffset();
    let current = heads[0].id;
    heads.forEach((item) => {
      if (item.el.getBoundingClientRect().top <= line + 1) current = item.id;
    });
    setRailActive(current);
  }

  function scrollToHeading(id, smooth) {
    const el = document.getElementById(id);
    const scroller = viewScroller();
    if (!el || !scroller) return;
    state.spyLock = id;
    setRailActive(id);
    const scrollingWindow = scroller === window;
    const line = (scrollingWindow ? 0 : scroller.getBoundingClientRect().top) + spyOffset();
    const dest = (scrollingWindow ? window.scrollY : scroller.scrollTop) + el.getBoundingClientRect().top - line;
    scroller.scrollTo({ top: Math.max(0, dest), behavior: smooth ? "smooth" : "auto" });
    window.clearTimeout(state.spyTimer);
    state.spyTimer = window.setTimeout(() => finishSpyScroll(), smooth ? 1200 : 40);
  }

  function finishSpyScroll() {
    const id = state.spyLock;
    if (!id) return;
    const el = document.getElementById(id);
    const scroller = viewScroller();
    if (el && scroller) {
      const scrollingWindow = scroller === window;
      const line = (scrollingWindow ? 0 : scroller.getBoundingClientRect().top) + spyOffset();
      const delta = el.getBoundingClientRect().top - line;
      const top = scrollingWindow ? window.scrollY : scroller.scrollTop;
      const max = scrollingWindow
        ? document.documentElement.scrollHeight - window.innerHeight
        : scroller.scrollHeight - scroller.clientHeight;
      if (Math.abs(delta) > 2 && top < max - 2) {
        scroller.scrollTo({ top: Math.max(0, Math.min(max, top + delta)), behavior: "auto" });
      }
    }
    state.spyLock = "";
    updateSpy();
  }

  function toggleLearned(id) {
    if (state.learned[id]) delete state.learned[id];
    else state.learned[id] = Date.now();
    saveLearned();
    renderNav();
    renderTopic(id);
  }

  function show(id, anchor) {
    const next = state.topics[id] || id === "home" ? id : "home";
    const same = state.current === next && document.getElementById(anchor || "page-title");
    state.current = next;
    const deck = state.current === "home" ? null : deckOf(state.current);
    if (deck) state.openDecks.add(deck.id);
    if (!same) {
      if (state.current === "home") {
        renderHome();
        document.title = "HCIE-Datacom 学习笔记";
      } else renderTopic(state.current);
      renderNav();
    }
    if (anchor && document.getElementById(anchor)) scrollToHeading(anchor, same);
    else if (!same) {
      const scroller = viewScroller();
      if (scroller === window) window.scrollTo(0, 0);
      else scroller.scrollTop = 0;
      state.spyLock = "";
      updateSpy();
    }
    closeDrawer();
  }

  function closeDrawer() {
    $("side").classList.remove("open");
    $("backdrop").hidden = true;
    $("menu").setAttribute("aria-expanded", "false");
  }

  function openDrawer() {
    $("side").classList.add("open");
    $("backdrop").hidden = false;
    $("menu").setAttribute("aria-expanded", "true");
  }

  async function boot() {
    loadLearned();
    const catalog = await fetch("data/catalog.json").then((r) => {
      if (!r.ok) throw new Error("catalog " + r.status);
      return r.json();
    });
    state.catalog = catalog;
    state.order = catalog.decks.flatMap((d) => d.topics);
    const diagramPromise = fetch("data/diagrams.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    state.diagrams = await diagramPromise;
    await Promise.all(state.order.map(async (id) => {
      const res = await fetch("data/topics/" + id + ".json");
      if (!res.ok) throw new Error(id + " " + res.status);
      const topic = await res.json();
      topic._raw = haystack(topic);
      topic._hay = topic._raw.toLowerCase();
      state.topics[id] = topic;
    }));
    const route = () => {
      const { id, anchor } = parseHash();
      show(id, anchor);
    };
    window.addEventListener("hashchange", route);
    window.addEventListener("popstate", route);
    const onScroll = () => updateSpy();
    $("article").addEventListener("scroll", onScroll, { passive: true });
    document.querySelector(".main").addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    const unlockSpy = () => finishSpyScroll();
    $("article").addEventListener("scrollend", unlockSpy);
    document.querySelector(".main").addEventListener("scrollend", unlockSpy);
    window.addEventListener("scrollend", unlockSpy);
    $("q").addEventListener("input", (e) => {
      state.query = e.target.value;
      renderNav();
      if (state.current === "home") renderHome();
      else if (state.topics[state.current]) renderTopic(state.current);
    });
    $("only-todo").addEventListener("click", (e) => {
      state.onlyTodo = !state.onlyTodo;
      e.currentTarget.setAttribute("aria-pressed", state.onlyTodo ? "true" : "false");
      renderNav();
    });
    $("menu").addEventListener("click", () => {
      if ($("side").classList.contains("open")) closeDrawer();
      else openDrawer();
    });
    $("backdrop").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== $("q")) {
        e.preventDefault();
        $("q").focus();
      }
      if (e.key === "Escape") closeDrawer();
    });
    $("article").addEventListener("click", async (e) => {
      const mindHit = e.target.closest("[data-mind-path]");
      if (mindHit && window.HCIEFigures) {
        e.preventDefault();
        const key = mindHit.getAttribute("data-mind-path");
        if (state.mindOff.has(key)) state.mindOff.delete(key);
        else state.mindOff.add(key);
        const topicId = key.split("|")[0];
        const fig = mindHit.closest("figure.diagram");
        const topic = state.topics[topicId];
        if (fig && topic) fig.outerHTML = HCIEFigures.mind(topicId, topic.mindmap, state.mindOff);
        return;
      }
      const zoomBtn = e.target.closest("[data-zoom]");
      if (zoomBtn) {
        const fig = zoomBtn.closest("figure.diagram");
        const box = fig && fig.querySelector(".diagram-scroll");
        const dialog = $("zoom");
        if (box && dialog) {
          $("zoom-body").innerHTML = box.innerHTML;
          dialog.showModal();
        }
        return;
      }
      const btn = e.target.closest("[data-copy]");
      if (!btn) return;
      const pre = btn.parentElement.nextElementSibling;
      const text = pre ? pre.textContent : "";
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "已复制";
      } catch (err) {
        btn.textContent = "复制失败";
      }
      setTimeout(() => { btn.textContent = "复制"; }, 1200);
    });
    route();
  }

  boot().catch((err) => {
    $("article").innerHTML = "<h2>笔记没有加载出来</h2><p>请用本地网页服务器打开本目录，不要直接双击文件。例如在仓库根目录执行 <code>python3 -m http.server</code>，然后访问 <code>/hcie/</code>。</p><p class=\"source\">" + esc(err.message) + "</p>";
  });
})();
