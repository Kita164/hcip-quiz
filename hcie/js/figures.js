/* Local SVG figures. No CDN. Labels come from topic data, not generated images. */
(function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function measure(s, cjk, ascii) {
    const wide = cjk == null ? 13 : cjk;
    const narrow = ascii == null ? 7.2 : ascii;
    let w = 0;
    for (const ch of String(s || "")) w += ch.charCodeAt(0) > 255 ? wide : narrow;
    return Math.ceil(w);
  }

  function clip(s, n) {
    const a = Array.from(s || "");
    if (a.length <= n) return s || "";
    return a.slice(0, n - 1).join("") + "…";
  }

  function svgWrap(w, h, body, label) {
    const width = Math.ceil(w);
    const height = Math.ceil(h);
    return '<svg class="fig" viewBox="0 0 ' + width + " " + height + '" width="' + width + '" height="' + height + '" role="img" aria-label="' + esc(label || "图") + '" style="min-width:' + width + 'px">' + body + "</svg>";
  }

  function frame(title, caption, inner) {
    return '<figure class="diagram"><div class="diagram-bar"><span>' + esc(title || "图") + '</span><button type="button" data-zoom>放大</button></div><div class="diagram-scroll">' + inner + "</div>" +
      (caption ? "<figcaption>" + esc(caption) + "</figcaption>" : "") + "</figure>";
  }

  function icon(role) {
    if (role === "switch") {
      return '<rect class="ico ico-sw" x="0" y="4" width="52" height="28" rx="4"/><circle class="port" cx="10" cy="18" r="2.2"/><circle class="port" cx="20" cy="18" r="2.2"/><circle class="port" cx="32" cy="18" r="2.2"/><circle class="port" cx="42" cy="18" r="2.2"/>';
    }
    if (role === "fw") {
      return '<path class="ico ico-fw" d="M26 2 L46 10 V24 C46 34 36 40 26 44 C16 40 6 34 6 24 V10 Z"/>';
    }
    if (role === "pc") {
      return '<rect class="ico ico-pc" x="6" y="4" width="40" height="26" rx="3"/><path class="ico-line" d="M26 30 V38 M16 38 H36"/>';
    }
    if (role === "server") {
      return '<rect class="ico ico-srv" x="10" y="2" width="32" height="40" rx="3"/><path class="ico-line" d="M16 12 H36 M16 20 H36 M16 28 H36"/>';
    }
    if (role === "cloud") {
      return '<ellipse class="ico ico-cloud" cx="26" cy="20" rx="24" ry="14"/>';
    }
    if (role === "ap") {
      return '<circle class="ico ico-ap" cx="26" cy="24" r="8"/><path class="ico-line" d="M14 16 a16 16 0 0 1 24 0 M10 12 a22 22 0 0 1 32 0"/>';
    }
    return '<circle class="ico ico-r" cx="26" cy="20" r="13"/><path class="ico-line" d="M26 7 V13 M26 27 V33 M13 20 H19 M33 20 H39"/>';
  }

  function wrapLines(text, maxW, cjk, ascii) {
    const wide = cjk == null ? 13 : cjk;
    const narrow = ascii == null ? 7.2 : ascii;
    const out = [];
    String(text || "").split("\n").forEach((para) => {
      let rest = para.trim();
      while (rest) {
        if (measure(rest, wide, narrow) <= maxW) {
          out.push(rest);
          break;
        }
        let cut = 0;
        let width = 0;
        let lastBreak = -1;
        for (let i = 0; i < rest.length; i++) {
          const ch = rest[i];
          const cw = ch.charCodeAt(0) > 255 ? wide : narrow;
          if (width + cw > maxW) break;
          width += cw;
          cut = i + 1;
          if ("，。；、, ".indexOf(ch) >= 0) lastBreak = i + 1;
        }
        if (lastBreak > 8 && lastBreak < rest.length) cut = lastBreak;
        const line = rest.slice(0, cut).trim();
        if (!line) break;
        out.push(line);
        rest = rest.slice(cut).trim();
      }
    });
    return out;
  }

  function mind(topicId, roots, off) {
    if (!roots || !roots.length) return "";
    const root = roots.length === 1 ? roots[0] : { t: "本篇", c: roots };
    const textW = 320;
    const titleCjk = 13.5;
    const titleAscii = 7.4;
    const detailCjk = 12.5;
    const detailAscii = 6.8;
    function layout(node, path) {
      const kids = node.c || [];
      const closed = !!(off && off.has(topicId + "|" + path) && kids.length);
      const titleLines = wrapLines(node.t || "", textW, titleCjk, titleAscii);
      const detailLines = wrapLines(node.d || "", textW, detailCjk, detailAscii);
      const widths = titleLines.map((line) => measure(line, titleCjk, titleAscii))
        .concat(detailLines.map((line) => measure(line, detailCjk, detailAscii)));
      const widest = Math.max.apply(null, widths.concat([72]));
      const tw = widest + (kids.length ? 40 : 20);
      const th = 8 + titleLines.length * 16 + (detailLines.length ? 2 + detailLines.length * 15 : 0) + 6;
      const laid = closed ? [] : kids.map((c, i) => layout(c, path + "/" + i));
      const gap = 6;
      const inner = laid.reduce((s, c) => s + c.boxH, 0) + Math.max(0, laid.length - 1) * gap;
      const boxH = Math.max(th, inner);
      return {
        node: node, path: path, titleLines: titleLines, detailLines: detailLines,
        tw: tw, th: th, boxH: boxH, kids: laid, closed: closed, n: kids.length,
      };
    }
    const tree = layout(root, "0");
    function place(box, x, y) {
      box.x = x;
      box.y = y + (box.boxH - box.th) / 2;
      let cy = y;
      const gap = 6;
      box.kids.forEach((k) => {
        place(k, x + box.tw + 22, cy);
        cy += k.boxH + gap;
      });
      let maxX = x + box.tw;
      let maxY = y + box.boxH;
      box.kids.forEach((k) => {
        maxX = Math.max(maxX, k.maxX);
        maxY = Math.max(maxY, k.maxY);
      });
      box.maxX = maxX;
      box.maxY = maxY;
    }
    place(tree, 16, 16);
    const parts = [];
    function draw(box, depth) {
      const y1 = box.y + box.th / 2;
      box.kids.forEach((k) => {
        const y2 = k.y + k.th / 2;
        const x1 = box.x + box.tw;
        const x2 = k.x;
        const c = Math.max(16, (x2 - x1) / 2);
        parts.push('<path class="mind-edge" d="M' + x1 + " " + y1 + " C " + (x1 + c) + " " + y1 + ", " + (x2 - c) + " " + y2 + ", " + x2 + " " + y2 + '"/>');
        draw(k, depth + 1);
      });
      const cls = depth === 0 ? "mind-node root" : "mind-node";
      const click = box.n ? ' data-mind-path="' + esc(topicId + "|" + box.path) + '" tabindex="0" role="button"' : "";
      parts.push('<g class="' + cls + '"' + click + ">");
      parts.push('<rect x="' + box.x + '" y="' + box.y + '" width="' + box.tw + '" height="' + box.th + '" rx="8"/>');
      box.titleLines.forEach((line, i) => {
        parts.push('<text class="mind-t" x="' + (box.x + 10) + '" y="' + (box.y + 16 + i * 16) + '">' + esc(line) + "</text>");
      });
      const detailTop = box.y + 16 + box.titleLines.length * 16 + 1;
      box.detailLines.forEach((line, i) => {
        parts.push('<text class="mind-d" x="' + (box.x + 10) + '" y="' + (detailTop + i * 15) + '">' + esc(line) + "</text>");
      });
      if (box.n) {
        const badge = box.closed ? "+" + box.n : "−";
        const bx = box.x + box.tw - 12;
        const by = box.y + box.th / 2;
        parts.push('<circle class="mind-badge" cx="' + bx + '" cy="' + by + '" r="7"/><text class="mind-badge-t" x="' + bx + '" y="' + (by + 3) + '" text-anchor="middle">' + badge + "</text>");
      }
      parts.push("</g>");
    }
    draw(tree, 0);
    const w = tree.maxX + 24;
    const h = tree.maxY + 16;
    return frame("思维导图", "点带加减号的节点可以折叠。说明在节点里全文显示。", svgWrap(w, h, parts.join(""), "思维导图"));
  }

  function pillGeom(cls, text, cx, cy) {
    const lines = String(text || "").split("\n").filter(function (line) { return line.length; });
    if (!lines.length) return null;
    const tw = Math.max.apply(null, lines.map(function (line) { return measure(line, 12, 6.6); })) + 14;
    const th = lines.length * 15 + 8;
    return { cls: cls, lines: lines, tw: tw, th: th, x: cx - tw / 2, y: cy - th / 2 };
  }

  function drawPill(p) {
    if (!p) return "";
    const cx = p.x + p.tw / 2;
    return '<g><rect class="pill" x="' + p.x + '" y="' + p.y + '" width="' + p.tw + '" height="' + p.th + '" rx="5"/>' +
      p.lines.map(function (line, i) {
        return '<text class="' + p.cls + '" x="' + cx + '" y="' + (p.y + 14 + i * 15) + '" text-anchor="middle">' + esc(line) + "</text>";
      }).join("") + "</g>";
  }

  function boxesHit(a, b) {
    if (!a || !b) return false;
    const aw = a.w || a.tw || 0;
    const ah = a.h || a.th || 0;
    const bw = b.w || b.tw || 0;
    const bh = b.h || b.th || 0;
    if (!aw || !bw) return false;
    return a.x < b.x + bw + 4 && a.x + aw + 4 > b.x && a.y < b.y + bh + 4 && a.y + ah + 4 > b.y;
  }

  function renderDetailNet(spec) {
    const nodes = spec.nodes || [];
    let minX = Infinity, minY = Infinity, srcMaxX = -Infinity, srcMaxY = -Infinity;
    nodes.forEach(function (n) {
      minX = Math.min(minX, n.x || 0);
      minY = Math.min(minY, n.y || 0);
      srcMaxX = Math.max(srcMaxX, n.x || 0);
      srcMaxY = Math.max(srcMaxY, n.y || 0);
    });
    const spanX = Math.max(1, srcMaxX - minX);
    const spanY = srcMaxY - minY;
    const row = spanY < 8;
    const padX = 148;
    const padY = row ? 52 : 78;
    const innerW = row ? Math.max(420, Math.min(680, 150 * Math.max(1, nodes.length - 1))) : 640;
    const innerH = row ? 12 : 220;
    const by = {};
    nodes.forEach(function (n) {
      const cx = padX + ((n.x || 0) - minX) / spanX * innerW;
      const cy = padY + (row ? 8 : ((n.y || 0) - minY) / Math.max(1, spanY) * innerH);
      by[n.id] = {
        id: n.id,
        role: n.role || "router",
        label: n.label || n.id,
        sub: n.sub || "",
        labelAt: n.labelAt || (function () {
          if (row) return "below";
          if ((n.y || 0) <= minY + spanY * 0.28) return "above";
          if ((n.y || 0) >= srcMaxY - spanY * 0.28) return "below";
          if ((n.x || 0) <= minX + spanX * 0.28) return "left";
          if ((n.x || 0) >= srcMaxX - spanX * 0.28) return "right";
          return "below";
        })(),
        cx: cx,
        cy: cy,
      };
    });
    const placed = [];
    Object.keys(by).forEach(function (id) {
      const n = by[id];
      const subs = String(n.sub || "").split("\n").filter(function (line) { return line.length; });
      const lines = [n.label].concat(subs);
      const widest = Math.max.apply(null, lines.map(function (line) { return measure(line, 13, 7); }));
      const nameX = n.labelAt === "left" ? n.cx - 26 : (n.labelAt === "right" ? n.cx + 26 : n.cx);
      const nameY = n.labelAt === "above" ? n.cy - 26 : (n.labelAt === "left" || n.labelAt === "right" ? n.cy - 4 : n.cy + 30);
      const top = n.labelAt === "above" ? nameY - 13 * subs.length - 12 : nameY - 12;
      const left = n.labelAt === "left" ? nameX - widest : (n.labelAt === "right" ? nameX : nameX - widest / 2);
      placed.push({ x: n.cx - 22, y: n.cy - 18, w: 44, h: 36 });
      placed.push({ x: left - 4, y: top, w: widest + 8, h: 14 * lines.length + 6 });
    });
    const segs = [];
    const pills = [];
    (spec.links || []).forEach(function (l) {
      const a = by[l.a];
      const b = by[l.b];
      if (!a || !b) return;
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const px = -uy;
      const py = ux;
      const trim = 22;
      const x1 = a.cx + ux * trim;
      const y1 = a.cy + uy * trim;
      const x2 = b.cx - ux * trim;
      const y2 = b.cy - uy * trim;
      segs.push({ x1: x1, y1: y1, x2: x2, y2: y2, dash: l.dashed ? ' stroke-dasharray="5 3"' : "" });
      function add(text, cls, cx, cy) {
        const box = pillGeom(cls, text, cx, cy);
        if (box) pills.push(box);
      }
      if (l.aEnd) add(l.aEnd, "end-t", x1 + (x2 - x1) * 0.24 + px * 22, y1 + (y2 - y1) * 0.24 + py * 22);
      if (l.bEnd) add(l.bEnd, "end-t", x1 + (x2 - x1) * 0.76 + px * 22, y1 + (y2 - y1) * 0.76 + py * 22);
      if (l.label) {
        const off = 40 + String(l.label).split("\n").length * 8;
        add(l.label, "edge-t", x1 + (x2 - x1) * 0.5 - px * off, y1 + (y2 - y1) * 0.5 - py * off);
      }
    });
    function shove(box) {
      const others = placed.concat(pills.filter(function (q) { return q !== box; }));
      others.forEach(function (old) {
        if (!boxesHit(box, old)) return;
        const bw = old.w || old.tw;
        const bh = old.h || old.th;
        const ox = Math.min(box.x + box.tw, old.x + bw) - Math.max(box.x, old.x);
        const oy = Math.min(box.y + box.th, old.y + bh) - Math.max(box.y, old.y);
        if (ox < oy) box.x += (box.x + box.tw / 2 < old.x + bw / 2 ? -1 : 1) * (ox + 4);
        else box.y += (box.y + box.th / 2 < old.y + bh / 2 ? -1 : 1) * (oy + 4);
      });
    }
    for (let pass = 0; pass < 10; pass++) pills.forEach(shove);
    const linkSvg = segs.map(function (s) {
      return '<line class="edge"' + s.dash + ' x1="' + s.x1 + '" y1="' + s.y1 + '" x2="' + s.x2 + '" y2="' + s.y2 + '"/>';
    }).join("") + pills.map(drawPill).join("");
    let maxX = padX + innerW + 70;
    let maxY = padY + innerH + 56;
    const shapes = nodes.map(function (raw) {
      const n = by[raw.id];
      const subs = String(n.sub || "").split("\n").filter(function (line) { return line.length; });
      const above = n.labelAt === "above";
      const side = n.labelAt === "left" || n.labelAt === "right";
      const anchor = n.labelAt === "left" ? "end" : (n.labelAt === "right" ? "start" : "middle");
      const nameX = n.labelAt === "left" ? n.cx - 26 : (n.labelAt === "right" ? n.cx + 26 : n.cx);
      const nameY = above ? n.cy - 26 : (side ? n.cy - 4 : n.cy + 30);
      const subStart = above ? nameY - 13 * subs.length : nameY + 14;
      let texts = '<text class="n-text" x="' + nameX + '" y="' + nameY + '" text-anchor="' + anchor + '">' + esc(n.label) + "</text>";
      maxX = Math.max(maxX, anchor === "start" ? nameX + measure(n.label, 13, 7) + 16 : n.cx + 36);
      if (anchor === "end") maxX = Math.max(maxX, n.cx + 20);
      subs.forEach(function (line, i) {
        const y = subStart + i * 13;
        texts += '<text class="n-sub" x="' + nameX + '" y="' + y + '" text-anchor="' + anchor + '">' + esc(line) + "</text>";
        maxY = Math.max(maxY, y + 10);
        maxX = Math.max(maxX, nameX + (anchor === "start" ? measure(line, 12, 6.6) + 8 : 8));
      });
      maxY = Math.max(maxY, nameY + 12);
      maxX = Math.max(maxX, n.cx + 80);
      return '<g><g transform="translate(' + n.cx + " " + n.cy + ') scale(0.62) translate(-26 -20)">' + icon(n.role) + "</g>" + texts + "</g>";
    }).join("");
    placed.concat(pills).forEach(function (box) {
      const bw = box.w || box.tw || 0;
      const bh = box.h || box.th || 0;
      maxX = Math.max(maxX, box.x + bw + 12);
      maxY = Math.max(maxY, box.y + bh + 12);
    });
    return frame(spec.title, spec.caption, svgWrap(maxX, maxY, linkSvg + shapes, spec.title));
  }

  function renderNet(spec) {
    if (spec.detail) return renderDetailNet(spec);
    const nodes = spec.nodes || [];
    const by = {};
    const cw = 176;
    const ch = 118;
    const px = !!spec.pixel;
    nodes.forEach((n) => {
      by[n.id] = {
        id: n.id,
        role: n.role || "router",
        label: n.label || n.id,
        sub: n.sub || "",
        cx: px ? (n.x || 0) + 40 : 70 + (n.x || 0) * cw,
        cy: px ? (n.y || 0) + 22 : 48 + (n.y || 0) * ch,
      };
    });
    let maxX = 120;
    let maxY = 80;
    Object.keys(by).forEach((id) => {
      const n = by[id];
      maxX = Math.max(maxX, n.cx + 90);
      maxY = Math.max(maxY, n.cy + 70);
    });
    const lines = (spec.links || []).map((l) => {
      const a = by[l.a];
      const b = by[l.b];
      if (!a || !b) return "";
      const x1 = a.cx;
      const y1 = a.cy;
      const x2 = b.cx;
      const y2 = b.cy;
      const dash = l.dashed ? ' stroke-dasharray="6 4"' : "";
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2 - 12;
      let label = "";
      if (l.label) {
        const lines = String(l.label).split("\n");
        const tw = Math.max.apply(null, lines.map((line) => measure(line, 14.5, 8))) + 18;
        const th = lines.length * 18 + 10;
        label = '<rect class="pill" x="' + (mx - tw / 2) + '" y="' + (my - 14) + '" width="' + tw + '" height="' + th + '" rx="6"/>' +
          lines.map((line, i) => '<text class="edge-t" x="' + mx + '" y="' + (my + 4 + i * 18) + '" text-anchor="middle">' + esc(line) + "</text>").join("");
      }
      return '<line class="edge"' + dash + ' x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>' + label;
    }).join("");
    const shapes = nodes.map((raw) => {
      const n = by[raw.id];
      return '<g><g transform="translate(' + (n.cx - 26) + " " + (n.cy - 22) + ')">' + icon(n.role) + '</g>' +
        '<text class="n-text" x="' + n.cx + '" y="' + (n.cy + 32) + '" text-anchor="middle">' + esc(n.label) + "</text>" +
        (n.sub ? '<text class="n-sub" x="' + n.cx + '" y="' + (n.cy + 46) + '" text-anchor="middle">' + esc(n.sub) + "</text>" : "") +
        "</g>";
    }).join("");
    return frame(spec.title, spec.caption, svgWrap(maxX, maxY + 8, lines + shapes, spec.title));
  }

  function renderFlow(spec) {
    const steps = spec.steps || [];
    const colW = 176;
    const rowH = 92;
    const cols = Math.min(4, Math.max(1, steps.length));
    const body = steps.map((s, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 24 + col * colW;
      const y = 24 + row * rowH;
      const arrow = col < cols - 1 && i < steps.length - 1
        ? '<path class="edge" d="M' + (x + 144) + " " + (y + 26) + " H " + (x + colW - 8) + '" marker-end="url(#arr)"/>'
        : "";
      return '<rect class="flow-box" x="' + x + '" y="' + y + '" width="136" height="52" rx="10"/>' +
        '<text class="n-text" x="' + (x + 68) + '" y="' + (y + 22) + '" text-anchor="middle">' + esc(s.text) + "</text>" +
        (s.sub ? '<text class="n-sub" x="' + (x + 68) + '" y="' + (y + 40) + '" text-anchor="middle">' + esc(clip(s.sub, 16)) + "</text>" : "") +
        arrow;
    }).join("");
    const rows = Math.ceil(steps.length / cols);
    const w = 24 + cols * colW;
    const h = 24 + rows * rowH;
    const defs = '<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path class="arrow-head" d="M0 0 L6 3 L0 6 Z"/></marker></defs>';
    return frame(spec.title, spec.caption, svgWrap(w, h, defs + body, spec.title));
  }

  function renderStack(spec) {
    const layers = spec.layers || [];
    const w = 420;
    const body = layers.map((layer, i) => {
      const y = 16 + i * 52;
      return '<rect class="stack-box" x="80" y="' + y + '" width="260" height="44" rx="8"/>' +
        '<text class="n-text" x="210" y="' + (y + 18) + '" text-anchor="middle">' + esc(layer.name) + "</text>" +
        (layer.note ? '<text class="n-sub" x="210" y="' + (y + 34) + '" text-anchor="middle">' + esc(layer.note) + "</text>" : "");
    }).join("");
    const h = 24 + layers.length * 52;
    const note = '<text class="n-sub" x="24" y="36">外</text><text class="n-sub" x="24" y="' + (h - 20) + '">内</text>';
    return frame(spec.title, spec.caption, svgWrap(w, h, note + body, spec.title));
  }

  function renderState(spec) {
    const states = spec.states || [];
    const gap = 180;
    const y = 70;
    const pos = {};
    states.forEach((s, i) => { pos[s.id] = { x: 80 + i * gap, y: y, text: s.text }; });
    const edges = (spec.edges || []).map((e, i) => {
      const a = pos[e.from];
      const b = pos[e.to];
      if (!a || !b) return "";
      const up = i % 2 === 0 ? -28 : 28;
      const mx = (a.x + b.x) / 2;
      const my = a.y + up;
      return '<path class="edge" d="M' + (a.x + 28) + " " + a.y + " Q " + mx + " " + my + " " + (b.x - 28) + " " + b.y + '" marker-end="url(#arrs)"/>' +
        '<text class="edge-t" x="' + mx + '" y="' + (my + (up < 0 ? -4 : 14)) + '" text-anchor="middle">' + esc(e.label || "") + "</text>";
    }).join("");
    const circles = states.map((s) => {
      const p = pos[s.id];
      return '<circle class="state" cx="' + p.x + '" cy="' + p.y + '" r="28"/><text class="n-text" x="' + p.x + '" y="' + (p.y + 4) + '" text-anchor="middle">' + esc(s.text) + "</text>";
    }).join("");
    const w = 80 + Math.max(1, states.length - 1) * gap + 80;
    const defs = '<defs><marker id="arrs" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path class="arrow-head" d="M0 0 L6 3 L0 6 Z"/></marker></defs>';
    return frame(spec.title, spec.caption, svgWrap(w, 150, defs + edges + circles, spec.title));
  }

  function renderCompare(spec) {
    const cols = spec.columns || [];
    const w = 220;
    const body = cols.map((col, i) => {
      const x = 20 + i * (w + 24);
      const items = (col.items || []).map((item, k) => '<text class="n-text" x="' + (x + 16) + '" y="' + (58 + k * 26) + '">' + esc(item) + "</text>").join("");
      const h = 48 + (col.items || []).length * 26;
      return '<rect class="flow-box" x="' + x + '" y="16" width="' + w + '" height="' + h + '" rx="12"/>' +
        '<text class="mind-t" x="' + (x + 16) + '" y="38">' + esc(col.title) + "</text>" + items;
    }).join("");
    const tall = Math.max.apply(null, cols.map((c) => 64 + (c.items || []).length * 26).concat([80]));
    const width = 20 + cols.length * (w + 24);
    return frame(spec.title, spec.caption, svgWrap(width, tall, body, spec.title));
  }

  function spec(item) {
    if (!item) return "";
    if (item.kind === "net") return renderNet(item);
    if (item.kind === "flow") return renderFlow(item);
    if (item.kind === "stack") return renderStack(item);
    if (item.kind === "state") return renderState(item);
    if (item.kind === "compare") return renderCompare(item);
    return "";
  }

  window.HCIEFigures = { mind: mind, spec: spec };
})();
