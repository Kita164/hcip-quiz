/* Local SVG figures. No CDN. Labels come from topic data, not generated images. */
(function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function measure(s) {
    let w = 0;
    for (const ch of String(s || "")) w += ch.charCodeAt(0) > 255 ? 16 : 8.8;
    return Math.ceil(w);
  }

  function clip(s, n) {
    const a = Array.from(s || "");
    if (a.length <= n) return s || "";
    return a.slice(0, n - 1).join("") + "…";
  }

  function svgWrap(w, h, body, label) {
    return '<svg class="fig" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + esc(label || "图") + '" style="min-width:' + Math.ceil(w) + 'px">' + body + "</svg>";
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

  function wrapLines(text, maxW) {
    const out = [];
    String(text || "").split("\n").forEach((para) => {
      let rest = para.trim();
      while (rest) {
        if (measure(rest) <= maxW) {
          out.push(rest);
          break;
        }
        let cut = 0;
        let width = 0;
        let lastBreak = -1;
        for (let i = 0; i < rest.length; i++) {
          const ch = rest[i];
          const cw = ch.charCodeAt(0) > 255 ? 16 : 8.8;
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
    const textW = 340;
    function layout(node, path) {
      const kids = node.c || [];
      const closed = !!(off && off.has(topicId + "|" + path) && kids.length);
      const titleLines = wrapLines(node.t || "", textW);
      const detailLines = wrapLines(node.d || "", textW);
      const widest = Math.max.apply(null, titleLines.concat(detailLines).map(measure).concat([96]));
      const tw = widest + (kids.length ? 56 : 28);
      const th = 16 + titleLines.length * 22 + (detailLines.length ? 6 + detailLines.length * 20 : 0) + 14;
      const laid = closed ? [] : kids.map((c, i) => layout(c, path + "/" + i));
      const gap = 16;
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
      const gap = 16;
      box.kids.forEach((k) => {
        place(k, x + box.tw + 46, cy);
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
      parts.push('<rect x="' + box.x + '" y="' + box.y + '" width="' + box.tw + '" height="' + box.th + '" rx="10"/>');
      box.titleLines.forEach((line, i) => {
        parts.push('<text class="mind-t" x="' + (box.x + 14) + '" y="' + (box.y + 26 + i * 22) + '">' + esc(line) + "</text>");
      });
      const detailTop = box.y + 26 + box.titleLines.length * 22 + 4;
      box.detailLines.forEach((line, i) => {
        parts.push('<text class="mind-d" x="' + (box.x + 14) + '" y="' + (detailTop + i * 20) + '">' + esc(line) + "</text>");
      });
      if (box.n) {
        const badge = box.closed ? "+" + box.n : "−";
        const bx = box.x + box.tw - 14;
        const by = box.y + box.th / 2;
        parts.push('<circle class="mind-badge" cx="' + bx + '" cy="' + by + '" r="9"/><text class="mind-badge-t" x="' + bx + '" y="' + (by + 4) + '" text-anchor="middle">' + badge + "</text>");
      }
      parts.push("</g>");
    }
    draw(tree, 0);
    const w = tree.maxX + 24;
    const h = tree.maxY + 16;
    return frame("思维导图", "点带加减号的节点可以折叠。说明在节点里全文显示。", svgWrap(w, h, parts.join(""), "思维导图"));
  }

  function renderNet(spec) {
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
      maxY = Math.max(maxY, n.cy + 90);
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
        const tw = Math.max.apply(null, lines.map(measure)) + 16;
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
        (n.sub ? '<text class="n-sub" x="' + n.cx + '" y="' + (n.cy + 54) + '" text-anchor="middle">' + esc(n.sub) + "</text>" : "") +
        "</g>";
    }).join("");
    return frame(spec.title, spec.caption, svgWrap(maxX, maxY + 8, lines + shapes, spec.title));
  }

  function renderFlow(spec) {
    const steps = spec.steps || [];
    const colW = 196;
    const rowH = 108;
    const cols = Math.min(4, Math.max(1, steps.length));
    const body = steps.map((s, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 24 + col * colW;
      const y = 24 + row * rowH;
      const arrow = col < cols - 1 && i < steps.length - 1
        ? '<path class="edge" d="M' + (x + 156) + " " + (y + 32) + " H " + (x + colW - 8) + '" marker-end="url(#arr)"/>'
        : "";
      return '<rect class="flow-box" x="' + x + '" y="' + y + '" width="148" height="64" rx="10"/>' +
        '<text class="n-text" x="' + (x + 74) + '" y="' + (y + 28) + '" text-anchor="middle">' + esc(s.text) + "</text>" +
        (s.sub ? '<text class="n-sub" x="' + (x + 74) + '" y="' + (y + 50) + '" text-anchor="middle">' + esc(clip(s.sub, 16)) + "</text>" : "") +
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
      const y = 20 + i * 64;
      return '<rect class="stack-box" x="70" y="' + y + '" width="280" height="52" rx="8"/>' +
        '<text class="n-text" x="210" y="' + (y + 22) + '" text-anchor="middle">' + esc(layer.name) + "</text>" +
        (layer.note ? '<text class="n-sub" x="210" y="' + (y + 42) + '" text-anchor="middle">' + esc(layer.note) + "</text>" : "");
    }).join("");
    const h = 32 + layers.length * 64;
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
