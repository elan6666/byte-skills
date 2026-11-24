// Neural Swarm Operating Network — Canvas Galaxy + 3-Level Fiber Tree Drilldown

export function createNeuralSwarmView(root) {
  let state = {
    projectId: "",
    data: null,
    selectedCluster: null,
    linkFilter: "all", // all | mutual | oneway
    query: "",
    paused: false,
    replaying: false,
    replayIdx: -1,
    drawer: null, // { path, content }
    legendOpen: null, // null = auto (>=980px open, <980px collapsed)
  };

  let rafId = 0;
  let replayTimer = 0;
  let canvas = null;
  let ctx = null;
  let particles = [];
  let flowPulses = [];

  function initParticles() {
    particles = Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.4,
      vx: (Math.random() - 0.5) * 0.00018,
      vy: (Math.random() - 0.5) * 0.00018,
      a: 0.15 + Math.random() * 0.45,
    }));
    flowPulses = Array.from({ length: 28 }, (_, i) => ({
      linkIdx: i,
      t: Math.random(),
      speed: 0.003 + Math.random() * 0.004,
    }));
  }
  initParticles();

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function isLegendVisible(w) {
    if (state.legendOpen !== null) return state.legendOpen;
    return w >= 980;
  }

  function layoutPositions(w, h, clusters) {
    const legendReserved = isLegendVisible(w) ? 268 : 20;
    const leftPad = 84;
    const availW = Math.max(360, w - legendReserved - leftPad);
    const cx = leftPad + availW * 0.5;

    const topSafe = 128;
    const bottomSafe = 148;
    const availH = Math.max(240, h - topSafe - bottomSafe);
    const cy = topSafe + availH * 0.5;

    // Guarantee outer cards (width 146, height ~76) stay strictly inside safe box
    const rx = Math.max(120, Math.min(availW * 0.5 - 78, 250));
    const ry = Math.max(96, Math.min(availH * 0.5 - 42, 175));
    const pos = { core: { x: cx, y: cy, color: "#a78bfa" } };
    clusters.forEach((c, idx) => {
      const angle = -Math.PI / 2 + (idx * Math.PI * 2) / clusters.length + 0.14;
      pos[c.id] = {
        x: cx + Math.cos(angle) * rx,
        y: cy + Math.sin(angle) * ry,
        color: c.color,
        cluster: c,
      };
    });
    return pos;
  }

  function bezierPoint(p0, cp, p1, t) {
    const inv = 1 - t;
    return {
      x: inv * inv * p0.x + 2 * inv * t * cp.x + t * t * p1.x,
      y: inv * inv * p0.y + 2 * inv * t * cp.y + t * t * p1.y,
    };
  }

  function drawCanvas(ts) {
    if (!canvas || !ctx || !state.data) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const t = state.paused ? 0 : ts * 0.001;

    // 1. Starfield particles
    for (const p of particles) {
      if (!state.paused) {
        p.x = (p.x + p.vx + 1) % 1;
        p.y = (p.y + p.vy + 1) % 1;
      }
      ctx.fillStyle = `rgba(199, 210, 254, ${p.a})`;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (state.selectedCluster) {
      rafId = requestAnimationFrame(drawCanvas);
      return;
    }

    const clusters = state.data.clusters || [];
    const pos = layoutPositions(w, h, clusters);
    const core = pos.core;

    // 2. Center Energy Core rings & aura
    const coreGrad = ctx.createRadialGradient(core.x, core.y, 12, core.x, core.y, 145);
    coreGrad.addColorStop(0, "rgba(167, 139, 250, 0.34)");
    coreGrad.addColorStop(0.5, "rgba(96, 165, 250, 0.12)");
    coreGrad.addColorStop(1, "rgba(6, 7, 12, 0)");
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(core.x, core.y, 145, 0, Math.PI * 2);
    ctx.fill();

    for (let ring = 0; ring < 3; ring++) {
      ctx.save();
      ctx.translate(core.x, core.y);
      ctx.rotate(t * (ring % 2 === 0 ? 0.25 : -0.18) + ring);
      ctx.strokeStyle = `rgba(167, 139, 250, ${0.22 - ring * 0.05})`;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.ellipse(0, 0, 74 + ring * 22, 58 + ring * 18, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Fiber links + animated photons
    const visibleLinks = (state.data.links || []).filter(
      (l) => state.linkFilter === "all" || l.type === state.linkFilter,
    );

    visibleLinks.forEach((link, idx) => {
      const a = pos[link.from];
      const b = pos[link.to];
      if (!a || !b) return;
      const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.08;
      const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.08;
      const cp = { x: mx, y: my };

      const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      grad.addColorStop(0, `${a.color}66`);
      grad.addColorStop(1, `${b.color}bb`);

      ctx.strokeStyle = grad;
      ctx.lineWidth = link.weight ? Math.min(2.6, 0.9 + link.weight * 0.5) : 1.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(cp.x, cp.y, b.x, b.y);
      ctx.stroke();

      // Photon pulse
      const pulse = flowPulses[idx % flowPulses.length];
      if (!state.paused) pulse.t = (pulse.t + pulse.speed) % 1;
      const pt = bezierPoint(a, cp, b, pulse.t);
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // 4. Jellyfish nodes (bioluminescent orb + tentacles)
    const activeReplayCluster =
      state.replaying && state.replayIdx >= 0
        ? state.data.timeline?.[state.replayIdx]?.clusterId
        : null;

    clusters.forEach((c, idx) => {
      const p = pos[c.id];
      if (!p) return;
      const pulseScale = activeReplayCluster === c.id ? 1.35 : 1 + Math.sin(t * 2 + idx) * 0.06;
      const r = 34 * pulseScale;

      const orb = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, r * 1.9);
      orb.addColorStop(0, `${c.color}88`);
      orb.addColorStop(0.5, `${c.color}24`);
      orb.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = orb;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.9, 0, Math.PI * 2);
      ctx.fill();

      // Jellyfish tentacles
      ctx.strokeStyle = `${c.color}55`;
      ctx.lineWidth = 1;
      for (let k = -2; k <= 2; k++) {
        const wave = Math.sin(t * 2.4 + idx + k) * 6;
        ctx.beginPath();
        ctx.moveTo(p.x + k * 5, p.y + 8);
        ctx.quadraticCurveTo(p.x + k * 7 + wave, p.y + 28, p.x + k * 9 - wave * 0.5, p.y + 44);
        ctx.stroke();
      }
    });

    rafId = requestAnimationFrame(drawCanvas);
  }

  function renderTreeSvg(stage, svg) {
    const cards = [...stage.querySelectorAll(".ns-branch-node")];
    const stageRect = stage.getBoundingClientRect();
    const byId = new Map(cards.map((c) => [c.dataset.nodeId, c]));
    svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${Math.max(1, stageRect.width)} ${Math.max(1, stageRect.height)}`);

    const branches = state.data?.trees?.[state.selectedCluster] || [];
    for (const parent of branches) {
      const pEl = byId.get(parent.id);
      if (!pEl) continue;
      const pr = pEl.getBoundingClientRect();
      const x1 = pr.right - stageRect.left;
      const y1 = pr.top - stageRect.top + pr.height / 2;

      for (const child of parent.children || []) {
        const cEl = byId.get(child.id);
        if (!cEl) continue;
        const cr = cEl.getBoundingClientRect();
        const x2 = cr.left - stageRect.left;
        const y2 = cr.top - stageRect.top + cr.height / 2;
        const dx = (x2 - x1) * 0.5;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", child.color || parent.color || "#60a5fa");
        path.setAttribute("stroke-opacity", "0.55");
        path.setAttribute("stroke-width", "1.6");
        svg.appendChild(path);
      }
    }
  }

  async function openFilePreview(relPath, title) {
    if (!relPath) {
      state.drawer = { path: title, content: "演示或虚拟节点暂无本地文件路径。" };
      render();
      return;
    }
    state.drawer = { path: relPath, content: "正在读取文件内容…" };
    render();
    try {
      const res = await fetch(
        `/api/neural-swarm/file?project=${encodeURIComponent(state.projectId)}&path=${encodeURIComponent(relPath)}`,
      );
      const data = await res.json();
      state.drawer = {
        path: relPath,
        content: data.content || data.error || "空文件",
      };
    } catch (err) {
      state.drawer = { path: relPath, content: `读取失败: ${err.message}` };
    }
    render();
  }

  async function sendCommand(target, text) {
    if (!text.trim() || !state.projectId) return;
    try {
      const res = await fetch(`/api/neural-swarm/post?project=${encodeURIComponent(state.projectId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: "user", to: target, kind: "note", text }),
      });
      if (res.ok) {
        await loadData(state.projectId);
      }
    } catch {
      // Ignore network errors silently in UI
    }
  }

  function startReplay() {
    if (replayTimer) clearInterval(replayTimer);
    const tl = state.data?.timeline || [];
    if (!tl.length) return;
    state.replaying = true;
    state.paused = false;
    state.replayIdx = 0;
    render();
    replayTimer = setInterval(() => {
      if (!state.replaying || state.paused) return;
      state.replayIdx += 1;
      if (state.replayIdx >= tl.length) {
        state.replaying = false;
        state.replayIdx = -1;
        clearInterval(replayTimer);
      }
      render();
    }, 1100);
  }

  function render() {
    cancelAnimationFrame(rafId);
    const d = state.data;
    if (!d) {
      root.replaceChildren(el("div", "ns-shell", ""));
      return;
    }

    const shell = el("div", "ns-shell");
    canvas = el("canvas", "ns-canvas");
    ctx = canvas.getContext("2d");
    shell.append(canvas);

    // Top-left Hero
    const topLeft = el("div", "ns-top-left");
    const brandRow = el("div", "ns-brand-row");
    const badge = el("span", "ns-brand-badge");
    const dot = el("span", `ns-brand-dot ${d.core.status === "paused" ? "paused" : ""}`);
    badge.append(dot, document.createTextNode("NEURAL / SWARM · 作战网"));
    brandRow.append(badge);

    if (state.selectedCluster) {
      const back = el("button", "ns-back-btn", "← 返回星系总览");
      back.onclick = () => {
        state.selectedCluster = null;
        state.drawer = null;
        render();
      };
      brandRow.append(back);
    }

    const h1 = el("h2", "ns-hero-title", state.selectedCluster ? `${(d.clusters.find((c) => c.id === state.selectedCluster) || {}).title || ""} · 光纤下钻` : "把散落的研究，接成一张作战网。");
    const sub = el("p", "ns-hero-sub", "Turn scattered research & agents into an operating network.");
    const meta = el("div", "ns-hero-meta", `${d.core.subtitle} · ${d.stallDiagnosis?.reason || "协同健康"}`);
    topLeft.append(brandRow, h1, sub, meta);
    shell.append(topLeft);

    // Top-right Controls + Legend Card (in Galaxy view)
    const topRight = el("div", "ns-top-right");
    const controls = el("div", "ns-controls");
    const replayBtn = el("button", `ns-pill-btn ${state.replaying ? "active" : ""}`, state.replaying ? "⟳ 回放中" : "▶ 重播 Replay");
    replayBtn.onclick = startReplay;
    const pauseBtn = el("button", `ns-pill-btn ${state.paused ? "active" : ""}`, state.paused ? "▶ 继续" : "⏸ 暂停 Pause");
    pauseBtn.onclick = () => {
      state.paused = !state.paused;
      render();
    };
    controls.append(replayBtn, pauseBtn);
    if (!state.selectedCluster) {
      const legendBtn = el("button", `ns-pill-btn`, "☷ 图例");
      legendBtn.onclick = () => {
        const w = shell.getBoundingClientRect().width || window.innerWidth;
        state.legendOpen = !isLegendVisible(w);
        render();
      };
      controls.append(legendBtn);
    }
    topRight.append(controls);

    const legendEl = el("div", "ns-legend-card");
    if (!state.selectedCluster) {
      legendEl.append(el("div", "ns-legend-head", `${d.clusters.length} 个作战集群`));
      const list = el("div", "ns-legend-list");
      for (const c of d.clusters) {
        const item = el("button", "ns-legend-item");
        const left = el("span", "ns-legend-left");
        const cDot = el("span", "ns-dot");
        cDot.style.background = c.color;
        cDot.style.boxShadow = `0 0 8px ${c.color}`;
        left.append(cDot, document.createTextNode(c.title));
        item.append(left, el("span", "ns-legend-count", String(c.count)));
        item.onclick = () => {
          state.selectedCluster = c.id;
          render();
        };
        list.append(item);
      }
      const filterRow = el("div", "ns-filter-row");
      for (const [fkey, flabel] of [["all", "全部连线"], ["mutual", "双向 Mutual"], ["oneway", "单向 One-way"]]) {
        const chip = el("button", `ns-filter-chip ${state.linkFilter === fkey ? "active" : ""}`, flabel);
        chip.onclick = () => {
          state.linkFilter = fkey;
          render();
        };
        filterRow.append(chip);
      }
      legendEl.append(list, filterRow);
      topRight.append(legendEl);
    }
    shell.append(topRight);

    // Center & Nodes OR 3-Level Drilldown Tree
    if (!state.selectedCluster) {
      const coreCard = el("div", "ns-core-card");
      coreCard.append(
        el("div", "ns-core-kicker", "OPERATING OBJECTIVE"),
        el("div", "ns-core-title", d.core.title),
        el("div", "ns-core-sub", `待验 ${d.metrics.pendingCount || 0} · 在跑 ${d.metrics.runningCount || 0}`),
      );
      shell.append(coreCard);

      const nodeLayer = el("div", "ns-node-layer");
      shell.append(nodeLayer);

      // Position cards and toggle legend visibility after layout
      requestAnimationFrame(() => {
        const rect = shell.getBoundingClientRect();
        legendEl.hidden = !isLegendVisible(rect.width);
        const pos = layoutPositions(rect.width, rect.height, d.clusters);
        coreCard.style.left = `${pos.core.x}px`;
        coreCard.style.top = `${pos.core.y}px`;
        nodeLayer.replaceChildren();
        const q = state.query.toLowerCase();
        for (const c of d.clusters) {
          const p = pos[c.id];
          if (!p) continue;
          const matches = !q || `${c.title} ${c.sub} ${c.en}`.toLowerCase().includes(q);
          const card = el("button", `ns-jelly-card ${matches ? "" : "dimmed"}`);
          card.style.left = `${p.x}px`;
          card.style.top = `${p.y}px`;
          const top = el("div", "ns-jelly-top");
          const num = el("span", "ns-jelly-num", String(c.count));
          num.style.color = c.color;
          const st = el("span", `ns-jelly-state ${c.state}`);
          st.append(el("i"), document.createTextNode(c.state === "working" ? "活跃" : c.state === "stalled" ? "告警" : "休眠"));
          top.append(num, st);
          card.append(top, el("div", "ns-jelly-title", c.title), el("div", "ns-jelly-sub", c.sub));
          card.onclick = () => {
            state.selectedCluster = c.id;
            render();
          };
          nodeLayer.append(card);
        }
      });
    } else {
      const treeView = el("div", "ns-tree-view");
      const rail = el("div", "ns-tree-rail");
      for (const c of d.clusters) {
        const item = el("button", `ns-rail-item ${c.id === state.selectedCluster ? "active" : ""}`);
        const num = el("div", "ns-rail-num", String(c.count));
        num.style.color = c.color;
        item.append(num, el("div", "ns-jelly-title", c.title), el("div", "ns-jelly-sub", c.sub));
        item.onclick = () => {
          state.selectedCluster = c.id;
          state.drawer = null;
          render();
        };
        rail.append(item);
      }

      const stage = el("div", "ns-tree-stage");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "ns-tree-svg");
      const cols = el("div", "ns-tree-columns");
      const colMid = el("div", "ns-tree-col");
      const colLeaf = el("div", "ns-tree-col");

      const branches = d.trees?.[state.selectedCluster] || [];
      for (const b of branches) {
        const bEl = el("button", "ns-branch-node");
        bEl.dataset.nodeId = b.id;
        const bDot = el("span", "ns-dot");
        bDot.style.background = b.color || "#60a5fa";
        const bTitle = el("div", "ns-branch-title");
        bTitle.append(bDot, document.createTextNode(b.title));
        bEl.append(bTitle, el("div", "ns-branch-sub", `${b.subtitle} · Out ${b.outCount} / In ${b.inCount}`));
        bEl.onclick = () => openFilePreview(b.path, b.title);
        colMid.append(bEl);

        for (const leaf of b.children || []) {
          const lEl = el("button", "ns-branch-node");
          lEl.dataset.nodeId = leaf.id;
          const lDot = el("span", "ns-dot");
          lDot.style.background = leaf.color || "#34d399";
          const lTitle = el("div", "ns-branch-title");
          lTitle.append(lDot, document.createTextNode(leaf.title));
          lEl.append(lTitle, el("div", "ns-branch-sub", leaf.subtitle));
          lEl.onclick = () => openFilePreview(leaf.path, leaf.title);
          colLeaf.append(lEl);
        }
      }

      cols.append(colMid, colLeaf);
      stage.append(svg, cols);
      treeView.append(rail, stage);
      shell.append(treeView);
      requestAnimationFrame(() => renderTreeSvg(stage, svg));
    }

    // Timeline toast during Replay
    if (state.replaying && state.replayIdx >= 0 && d.timeline?.[state.replayIdx]) {
      const item = d.timeline[state.replayIdx];
      shell.append(el("div", "ns-timeline-toast", `⏱ ${item.ts} · ${item.label}`));
    }

    // File Preview Drawer
    if (state.drawer) {
      const drawer = el("aside", "ns-drawer");
      const head = el("div", "ns-drawer-head");
      head.append(el("strong", "", state.drawer.path));
      const close = el("button", "ns-pill-btn", "✕");
      close.onclick = () => {
        state.drawer = null;
        render();
      };
      head.append(close);
      drawer.append(head, el("pre", "ns-drawer-body", state.drawer.content));
      shell.append(drawer);
    }

    // Bottom Metrics & Direct Board Post Dock
    const dock = el("div", "ns-bottom-dock");
    const metricsRow = el("div", "ns-metrics-row");
    for (const [label, val] of [
      ["总节点 Nodes", d.metrics.totalNodes],
      ["连接 Links", d.metrics.totalLinks],
      ["已验收 Verified", d.metrics.verifiedCount],
      ["停摆告警 Stalls", d.metrics.stalledCount],
    ]) {
      const box = el("div", "ns-metric-box");
      box.append(el("small", "", label), el("strong", "", String(val ?? 0)));
      metricsRow.append(box);
    }
    const cmdRow = el("form", "ns-command-row");
    const targetSel = el("select", "ns-target-select");
    for (const [val, lbl] of [
      ["filter", "🔍 筛选图谱"],
      ["lead", "@总控 (board)"],
      ["codex-methods", "@Codex主力"],
      ["ag-methods", "@AG主力"],
    ]) {
      const opt = el("option", "", lbl);
      opt.value = val;
      targetSel.append(opt);
    }
    const input = el("input", "ns-command-input");
    input.placeholder = "筛选节点或向 Swarm 共享板直接发指令…";
    input.value = state.query;
    input.oninput = () => {
      if (targetSel.value === "filter") {
        state.query = input.value;
        const cards = shell.querySelectorAll(".ns-jelly-card");
        const q = state.query.toLowerCase();
        cards.forEach((c) => {
          c.classList.toggle("dimmed", Boolean(q) && !c.textContent.toLowerCase().includes(q));
        });
      }
    };
    const sendBtn = el("button", "ns-send-btn", "→");
    sendBtn.type = "submit";
    cmdRow.onsubmit = async (e) => {
      e.preventDefault();
      if (targetSel.value === "filter") {
        state.query = input.value;
        render();
        return;
      }
      const txt = input.value.trim();
      if (!txt) return;
      input.value = "";
      await sendCommand(targetSel.value, txt);
    };
    cmdRow.append(targetSel, input, sendBtn);
    dock.append(metricsRow, cmdRow);
    shell.append(dock);

    root.replaceChildren(shell);
    rafId = requestAnimationFrame(drawCanvas);
  }

  async function loadData(projectId) {
    state.projectId = projectId;
    try {
      const res = await fetch(`/api/neural-swarm?project=${encodeURIComponent(projectId)}`);
      if (res.ok) {
        state.data = await res.json();
        render();
      }
    } catch {
      // keep previous state on transient errors
    }
  }

  return {
    update(projectId) {
      if (!projectId) return;
      loadData(projectId);
    },
    destroy() {
      cancelAnimationFrame(rafId);
      if (replayTimer) clearInterval(replayTimer);
    },
  };
}
