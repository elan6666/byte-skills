import {
  OfficeSimulation,
  WORLD_W,
  WORLD_H,
  TILE,
  distance,
} from "./office-model.js";
import { zoneColor } from "./art.js";
const NAMES = {
  codex: "Codex",
  zcode: "Zcode",
  claude: "Claude",
  opencode: "OpenCode",
  dsh: "DSH",
  hermes: "Hermes",
  kimi: "Kimi",
  pi: "Pi",
};
const P = {
  ink: "#354c44",
  wood: "#cfac76",
  woodLight: "#e5c691",
  woodEdge: "#986d49",
  wall: "#dce0c8",
  green: "#6b8d64",
  cream: "#fff5d8",
};
const rect = (c, x, y, w, h, color) => {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
};
function label(
  c,
  value,
  x,
  y,
  { size = 13, color = P.ink, align = "left", weight = 500 } = {},
) {
  c.fillStyle = color;
  c.font = `${weight} ${size}px ui-monospace,"PingFang SC",sans-serif`;
  c.textAlign = align;
  c.textBaseline = "middle";
  c.fillText(String(value), x, y);
}
function panel(c, x, y, w, h, bg = "#fff1ce", border = "#9f7953") {
  rect(c, x + 3, y + 4, w, h, "#40594425");
  rect(c, x, y, w, h, border);
  rect(c, x + 3, y + 3, w - 6, h - 6, bg);
  rect(c, x + 5, y + 5, w - 10, 2, "#ffffff60");
}
function plant(c, x, y, size = 1) {
  c.save();
  c.translate(x, y);
  c.scale(size, size);
  rect(c, -8, -2, 16, 12, "#ad7956");
  rect(c, -10, -4, 20, 4, "#d4a074");
  rect(c, -2, -20, 4, 18, "#4e7752");
  rect(c, -12, -16, 11, 7, "#6c9b67");
  rect(c, 1, -23, 11, 9, "#83ac75");
  rect(c, -9, -28, 9, 9, "#7aa06a");
  rect(c, -6, -24, 4, 4, "#a9bf7c");
  c.restore();
}
function tree(c, x, y, size = 1) {
  c.save();
  c.translate(x, y);
  c.scale(size, size);
  rect(c, -22, 12, 44, 8, "#55735a38");
  rect(c, -5, -20, 10, 36, "#8c7150");
  rect(c, -2, -13, 3, 25, "#b09262");
  rect(c, -26, -38, 52, 24, "#426f57");
  rect(c, -32, -57, 64, 28, "#568363");
  rect(c, -26, -73, 52, 25, "#68976b");
  rect(c, -18, -85, 36, 23, "#80a575");
  rect(c, -18, -65, 16, 8, "#91b27b");
  rect(c, 12, -44, 12, 6, "#71975f");
  rect(c, -24, -33, 9, 5, "#38604e");
  c.restore();
}
function books(c, x, y) {
  panel(c, x - 15, y - 22, 30, 56, "#b68c5d", "#795e46");
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 5; i++)
      rect(
        c,
        x - 10 + i * 4,
        y - 16 + row * 24,
        3,
        16 - (i % 3) * 2,
        ["#80947c", "#d0a572", "#94aab0", "#c28270", "#b5a1b2"][i],
      );
    rect(c, x - 12, y + 1 + row * 24, 24, 3, "#725d47");
  }
}
function desk(c, d, h, occupied, t) {
  const { x, y } = d;
  rect(c, x - 27, y - 18, 60, 43, "#5e513c22");
  rect(c, x - 28, y - 22, 58, 38, "#9b744f");
  rect(c, x - 30, y - 25, 60, 32, "#ddbd86");
  rect(c, x - 27, y - 22, 54, 2, "#f5d89e");
  rect(c, x - 26, y + 8, 5, 14, "#a17b52");
  rect(c, x + 22, y + 8, 5, 14, "#a17b52");
  rect(c, x - 15, y - 40, 32, 23, "#475c55");
  rect(c, x - 12, y - 37, 26, 16, "#c4ddd0");
  rect(c, x - 9, y - 34, 17, 2, zoneColor(h));
  rect(c, x - 9, y - 29, occupied ? 11 : 7, 2, "#91afa1");
  rect(c, x - 3, y - 17, 6, 6, "#5d7061");
  rect(c, x - 15, y - 4, 30, 8, "#ede5c6");
  for (let i = 0; i < 4; i++) rect(c, x - 12 + i * 6, y - 2, 3, 2, "#bcb89f");
  rect(c, x + 19, y - 18, 7, 9, "#fff0cf");
  rect(c, x + 26, y - 16, 3, 5, "#c6a57b");
  rect(c, x - 26, y - 14, 6, 10, ["#8b9e76", "#bf9270"][d.id.length % 2]);
  // Empty chairs stay visible when a character walks away.
  rect(c, x - 10, y + 20, 21, 18, "#748b76");
  rect(c, x - 12, y + 17, 24, 9, "#90a58b");
  rect(c, x - 10, y + 26, 3, 14, "#607565");
  rect(c, x + 8, y + 26, 3, 14, "#607565");
}
function sprite(c, a, t, selected) {
  const stride = a.action === "walk" ? Math.floor(a.walked / 7) % 4 : 0,
    bob =
      a.action === "walk"
        ? stride % 2
          ? -1
          : 0
        : Math.sin(t * 2 + (a.seed % 9)) > 0.8
          ? -1
          : 0;
  c.save();
  c.translate(Math.round(a.x), Math.round(a.y));
  rect(c, -12, -2, 24, 5, "#4b584b30");
  if (selected) {
    rect(c, -19, 1, 10, 2, "#e7d17f");
    rect(c, 9, 1, 10, 2, "#e7d17f");
    rect(c, -19, -3, 2, 5, "#e7d17f");
    rect(c, 17, -3, 2, 5, "#e7d17f");
  }
  c.scale(2, 2);
  c.translate(-8, -24 + bob);
  const coat = zoneColor(a.session.harness),
    skin = ["#f0cba3", "#d8ad86", "#b78c6c"][a.seed % 3],
    hair = ["#655243", "#393d3b", "#a77b50", "#886653", "#55515f"][a.seed % 5];
  const side = a.direction === "left" || a.direction === "right",
    back = a.direction === "up";
  const leg = stride === 1 ? 1 : stride === 3 ? -1 : 0;
  rect(c, 4, 18 + leg, 3, 5, "#526069");
  rect(c, 9, 18 - leg, 3, 5, "#526069");
  rect(c, 3, 22 + leg, 4, 2, "#4e4841");
  rect(c, 9, 22 - leg, 4, 2, "#4e4841");
  rect(c, 3, 11, 10, 8, coat);
  rect(c, 3, 12, 2, 7, "#00000013");
  rect(c, 2, 12 + (stride % 2), 2, 6, skin);
  rect(c, 12, 12 - (stride % 2), 2, 6, skin);
  rect(c, 4, 3, 9, 9, skin);
  rect(c, 3, 2, 11, 5, hair);
  rect(c, 3, 6, 2, 4, hair);
  if (a.seed % 2) rect(c, 12, 5, 2, 6, hair);
  if (back) {
    rect(c, 4, 6, 9, 4, hair);
    rect(c, 5, 10, 7, 2, hair);
  } else {
    rect(c, side ? (a.direction === "right" ? 11 : 5) : 6, 7, 1, 2, "#3b403a");
    if (!side) rect(c, 10, 7, 1, 2, "#3b403a");
    rect(c, 8, 10, 2, 1, "#b8856b");
    rect(c, 5, 9, 2, 1, "#e2aa8c");
  }
  if (a.action === "work" || a.action === "review") {
    rect(c, 2, 13 + (Math.floor(t * 6) % 2), 3, 3, skin);
    rect(c, 12, 13 - (Math.floor(t * 6) % 2), 3, 3, skin);
    if (a.action === "review") {
      rect(c, 0, 12, 5, 7, "#fff2ce");
      rect(c, 1, 14, 3, 1, "#849b7c");
    }
  }
  if (["read", "unknown", "supervise", "wait"].includes(a.action)) {
    rect(c, 2, 14, 6, 6, "#ebddad");
    rect(c, 8, 14, 6, 6, "#fff0c9");
    rect(c, 7, 14, 1, 6, "#b59467");
    rect(c, 4, 16, 3, 1, "#8e9e82");
    rect(c, 9, 17, 3, 1, "#a9ad8b");
  }
  if (a.action === "coffee") {
    rect(c, 12, 12, 5, 5, "#fff4d5");
    rect(c, 17, 13, 2, 3, "#c4af8b");
    rect(c, 14, 9 - (Math.floor(t * 2) % 2), 1, 2, "#ffffffaa");
  }
  if (a.action === "water") {
    rect(c, 12, 14, 6, 5, "#78988d");
    rect(c, 17, 13, 3, 2, "#8ba99b");
    rect(c, 18, 11, 2, 3, "#78988d");
    rect(c, 20, 16, 2, 1, "#80aeb6");
    if (Math.floor(t * 5) % 2) rect(c, 21, 18, 1, 2, "#a7d1d4");
  }
  if (a.meeting && a.action === "walk") {
    rect(c, 0, 14, 6, 8, "#f6e9bd");
    rect(c, 1, 16, 4, 1, "#9eb3a2");
    rect(c, 1, 18, 3, 1, "#b9b69a");
  }
  c.restore();
  if (a.mode === "help") {
    panel(c, a.x - 9, a.y - 66, 18, 22, "#f3d49c", "#b58a58");
    label(c, "!", a.x, a.y - 54, {
      size: 15,
      color: "#a66b3b",
      align: "center",
      weight: 800,
    });
  } else if (
    a.mode === "unknown" &&
    !a.meeting &&
    Math.floor(t / 5) % 2 === 0
  ) {
    label(c, "?", a.x + 18, a.y - 48, {
      size: 15,
      color: "#93a39a",
      weight: 800,
    });
  }
}
export class OfficeGame {
  constructor(
    container,
    { onSelect = () => {}, onBoard = () => {}, onEvent = () => {} } = {},
  ) {
    this.container = container;
    this.onSelect = onSelect;
    this.onBoard = onBoard;
    this.onEvent = onEvent;
    this.sim = new OfficeSimulation({ onEvent });
    this.camera = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 };
    this.showNames = true;
    this.selected = null;
    this.hover = null;
    this.reduced = false;
    this.frame = 0;
    this.speed = 1;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "office-canvas";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute(
      "aria-label",
      "2D 像素办公室。点击人物查看对话；滚轮缩放，拖动画面移动视角。",
    );
    container.append(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.back = document.createElement("canvas");
    this.back.width = WORLD_W;
    this.back.height = WORLD_H;
    this.access = document.createElement("div");
    this.access.className = "game-access";
    container.append(this.access);
    this.resize = new ResizeObserver(() => this.paint());
    this.resize.observe(container);
    this.listen();
    this.last = 0;
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }
  sync(snapshot, { harnesses, sessions, filter = "all", query = "" } = {}) {
    this.snapshot = snapshot;
    this.sim.sync(snapshot, { harnesses, sessions });
    this.floorKey = harnesses.join();
    this.filter = filter;
    this.query = query;
    this.paintBackground();
    this.access.replaceChildren();
    for (const a of this.sim.actors.values()) {
      const b = document.createElement("button");
      b.className = "seat game-access-agent";
      b.dataset.session = a.id;
      b.type = "button";
      b.textContent = a.session.title + " · " + a.session.role;
      b.addEventListener("click", () => this.select(a.id));
      b.addEventListener("focus", () => {
        this.selected = a.id;
        this.paint();
      });
      this.access.append(b);
    }
    this.paint();
  }
  setPaused(paused) {
    this.reduced = paused;
    this.sim.paused = paused;
    this.paint();
  }
  setSpeed(speed) {
    this.speed = speed;
  }
  select(id) {
    this.selected = id;
    this.onSelect(id);
    this.paint();
  }
  fit() {
    this.camera = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 };
    this.paint();
  }
  zoom(delta) {
    this.camera.zoom = Math.max(0.8, Math.min(2.4, this.camera.zoom + delta));
    this.paint();
  }
  listen() {
    let down = null;
    this.canvas.addEventListener("pointerdown", (e) => {
      down = {
        x: e.clientX,
        y: e.clientY,
        camera: { ...this.camera },
        drag: false,
      };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (
        down &&
        (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 5 ||
          down.drag)
      ) {
        down.drag = true;
        this.camera.x = down.camera.x - (e.clientX - down.x) / this.unit;
        this.camera.y = down.camera.y - (e.clientY - down.y) / this.unit;
        this.camera.x = Math.max(280, Math.min(WORLD_W - 280, this.camera.x));
        this.camera.y = Math.max(210, Math.min(WORLD_H - 210, this.camera.y));
        this.paint();
      } else if (!down) {
        const p = this.worldPoint(e),
          a = [...this.sim.actors.values()]
            .reverse()
            .find(
              (a) =>
                Math.abs(p.x - a.x) < 22 && p.y < a.y + 8 && p.y > a.y - 55,
            );
        this.hover = a?.id || null;
        this.canvas.style.cursor = a ? "pointer" : "grab";
      }
    });
    this.canvas.addEventListener("pointerup", (e) => {
      if (down && !down.drag) {
        const p = this.worldPoint(e),
          a = [...this.sim.actors.values()]
            .sort((a, b) => b.y - a.y)
            .find(
              (a) =>
                Math.abs(p.x - a.x) < 24 && p.y < a.y + 10 && p.y > a.y - 58,
            );
        if (a) this.select(a.id);
        else if (p.x > 544 && p.x < 606 && p.y > 118 && p.y < 195)
          this.onBoard();
      }
      down = null;
    });
    this.canvas.addEventListener("pointercancel", () => (down = null));
    this.canvas.addEventListener("pointerleave", () => (this.hover = null));
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom(e.deltaY > 0 ? -0.1 : 0.1);
      },
      { passive: false },
    );
    this.canvas.addEventListener("keydown", (e) => {
      if (e.key === "+" || e.key === "=") this.zoom(0.15);
      else if (e.key === "-") this.zoom(-0.15);
      else if (e.key === "0") this.fit();
      else if (e.key === "Enter") {
        const list = [...this.sim.actors.values()];
        if (list.length)
          this.select(
            this.selected && list.some((a) => a.id === this.selected)
              ? this.selected
              : list[0].id,
          );
      } else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        this.camera.x +=
          e.key === "ArrowLeft" ? -35 : e.key === "ArrowRight" ? 35 : 0;
        this.camera.y +=
          e.key === "ArrowUp" ? -35 : e.key === "ArrowDown" ? 35 : 0;
        this.paint();
      }
    });
  }
  worldPoint(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - r.width / 2) / this.unit + this.camera.x,
      y: (e.clientY - r.top - r.height / 2) / this.unit + this.camera.y,
    };
  }
  tick(t) {
    if (t - this.frame > 40) {
      const dt = this.last ? Math.min((t - this.last) / 1000, 0.1) : 0;
      this.last = t;
      this.frame = t;
      if (!document.hidden && !this.reduced) {
        this.sim.update(dt * this.speed);
        this.paint();
      }
    }
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }
  paintBackground() {
    const c = this.back.getContext("2d");
    c.imageSmoothingEnabled = false;
    rect(c, 0, 0, WORLD_W, WORLD_H, "#a9bf91");
    for (let y = 0; y < WORLD_H; y += 12)
      for (let x = 0; x < WORLD_W; x += 12) {
        const seed = (x * 13 + y * 31) % 97;
        if (seed < 18) {
          rect(c, x + 3, y + 5, 2, 3, "#8da77d");
          rect(c, x + 5, y + 3, 2, 3, "#9ab284");
        }
        if (seed === 23) {
          rect(c, x + 3, y + 2, 3, 3, "#efdeb0");
          rect(c, x + 4, y + 5, 1, 2, "#799c6f");
        }
      }
    rect(c, 500, 778, 154, 86, "#d7c6a1");
    for (let y = 790; y < 864; y += 18)
      for (let x = 502; x < 652; x += 24) rect(c, x, y, 20, 2, "#bdad8c");
    for (const [x, y, s] of [
      [32, 162, 1.1],
      [1114, 207, 1.2],
      [40, 507, 1],
      [1110, 577, 1],
      [95, 839, 0.95],
      [1039, 831, 1.1],
    ])
      tree(c, x, y, s);
    rect(c, 74, 84, 1012, 721, "#52614c30");
    rect(c, 66, 68, 1020, 732, "#5d7461");
    rect(c, 72, 72, 1008, 720, "#d5d7bf");
    rect(c, 84, 96, 984, 684, "#e6d5b0");
    for (let y = 96; y < 780; y += 24) {
      rect(c, 84, y, 984, 1, "#cbb98f");
      for (let x = 84 + (y % 48 ? 48 : 0); x < 1068; x += 96)
        rect(c, x, y, 1, 24, "#cfbc942e");
    }
    rect(c, 72, 72, 1008, 10, "#71907a");
    rect(c, 72, 82, 1008, 5, "#b4c2a0");
    rect(c, 72, 772, 1008, 13, "#829077");
    rect(c, 554, 772, 58, 19, "#e4d1aa");
    // The shared lobby is part of one continuous floor, with open room doors.
    rect(c, 94, 380, 964, 78, "#91a699");
    rect(c, 98, 384, 956, 70, "#b1beb0");
    rect(c, 98, 387, 956, 2, "#d0d6bd");
    rect(c, 98, 449, 956, 2, "#d0d6bd");
    for (let x = 105; x < 1050; x += 24) rect(c, x, 392, 2, 48, "#9dac9a25");
    for (const room of this.sim.map.rooms) {
      const { x, y, width: w, height: h } = room,
        top = room.ty < 20;
      rect(c, x, y, w, h, "#a39170");
      rect(c, x + 5, y + 10, w - 10, h - 17, "#e4c38d");
      for (let yy = y + 22; yy < y + h - 9; yy += 24) {
        rect(c, x + 6, yy, w - 12, 1, "#c7a471");
        for (let xx = x + 24 + (yy % 48 ? 24 : 0); xx < x + w - 6; xx += 72)
          rect(c, xx, yy - 22, 1, 22, "#d5b57d");
      }
      rect(c, x + 6, y + 8, w - 12, 23, "#dfe0c5");
      rect(c, x + 6, y + 28, w - 12, 5, "#b8b99c");
      rect(c, x, y, w, 5, "#6f8470");
      rect(c, x, y, 5, h, "#798e75");
      rect(c, x + w - 5, y, 5, h, "#71856d");
      rect(c, x, y + h - 11, w, 11, "#9d8663");
      rect(c, x + 2, y + h - 9, w - 4, 4, "#c5ad7e");
      const doorX = (room.tx + 8) * TILE;
      rect(c, doorX, top ? y + h - 16 : y, 48, top ? 17 : 33, "#d9ba89");
      rect(c, doorX, top ? y + h - 14 : y + 3, 3, top ? 14 : 26, "#8c795b");
      rect(
        c,
        doorX + 45,
        top ? y + h - 14 : y + 3,
        3,
        top ? 14 : 26,
        "#8c795b",
      );
      // Pane windows cast warm light into the room.
      for (const wx of [x + 58, x + w - 108]) {
        rect(c, wx, y + 6, 49, 26, "#829d93");
        rect(c, wx + 3, y + 8, 43, 21, "#c5dfd1");
        rect(c, wx + 23, y + 8, 3, 21, "#92ad9c");
        rect(c, wx + 3, y + 18, 43, 2, "#92ad9c");
        rect(c, wx - 3, y + 31, 55, 4, "#ad986e");
        c.fillStyle = "#fff2bc25";
        c.beginPath();
        c.moveTo(wx, y + 36);
        c.lineTo(wx + 49, y + 36);
        c.lineTo(wx + 88, y + 100);
        c.lineTo(wx + 25, y + 100);
        c.fill();
      }
      panel(
        c,
        x + 156,
        top ? y - 13 : y + h + 3,
        120,
        29,
        "#f3e5c0",
        zoneColor(room.harness),
      );
      label(
        c,
        NAMES[room.harness] || room.harness,
        x + 216,
        top ? y + 2 : y + h + 18,
        { align: "center", size: 14, weight: 700 },
      );
      rect(c, x + 48, y + 41, 34, 24, "#a4835c");
      rect(c, x + 51, y + 44, 28, 18, "#e7e6b9");
      rect(c, x + 55, y + 48, 20, 2, "#a8b58d");
      rect(c, x + 55, y + 53, 14, 2, "#b2bfa0");
    }
    panel(c, 550, 120, 58, 74, "#b78e5d", "#745d43");
    rect(c, 556, 128, 46, 58, "#f4e9c4");
    label(c, "项目", 579, 142, { size: 12, align: "center" });
    label(c, "公告板", 579, 159, { size: 12, align: "center" });
    rect(c, 562, 174, 32, 2, "#b9b48d");
    for (const x of [151, 220, 286]) {
      rect(c, x - 20, 397, 42, 16, "#a67b59");
      rect(c, x - 22, 393, 46, 13, "#90a08a");
      rect(c, x - 18, 408, 5, 9, "#a5825b");
      rect(c, x + 15, 408, 5, 9, "#a5825b");
    }
    label(c, "茶歇角", 230, 373, {
      size: 12,
      align: "center",
      color: "#637e66",
    });
    label(c, "协作长桌", 588, 373, {
      size: 12,
      align: "center",
      color: "#637e66",
    });
    label(c, "实验设备", 878, 373, {
      size: 12,
      align: "center",
      color: "#637e66",
    });
    for (let i = 0; i < 2; i++) {
      const xx = 856 + i * 30;
      panel(c, xx, 384, 26, 48, "#667c72", "#4d6058");
      for (let r = 0; r < 3; r++) {
        rect(c, xx + 4, 391 + r * 11, 18, 7, "#465d55");
        rect(c, xx + 6, 393 + r * 11, 3, 2, "#bbd494");
        rect(c, xx + 12, 393 + r * 11, 8, 1, "#829a89");
      }
    }
    panel(c, 984, 390, 58, 39, "#caa87a", "#8d7255");
    rect(c, 988, 385, 50, 8, "#ead7b1");
    rect(c, 1003, 369, 22, 22, "#708477");
    rect(c, 1008, 373, 12, 7, "#c4ceab");
    rect(c, 1012, 381, 4, 8, "#4d5b4d");
    rect(c, 991, 385, 7, 8, "#fff0cd");
    plant(c, 532, 110, 0.8);
    plant(c, 626, 110, 0.8);
    plant(c, 110, 768, 1);
    plant(c, 1043, 766, 1);
  }
  paint() {
    if (!this.ctx) return;
    const c = this.ctx;
    let r = this.container.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    if (innerWidth > 850 && !document.fullscreenElement) {
      const tools =
          this.container.parentElement
            .querySelector(".game-tools")
            ?.getBoundingClientRect().height || 34,
        story =
          this.container.parentElement
            .querySelector(".game-story")
            ?.getBoundingClientRect().height || 28;
      const target = Math.max(
        340,
        innerHeight - (r.top + scrollY) - tools - story - 45,
      );
      if (Math.abs(r.height - target) > 2) {
        this.container.style.height = target + "px";
        r = this.container.getBoundingClientRect();
      }
    }
    const dpr = Math.min(devicePixelRatio || 1, 2),
      w = Math.round(r.width * dpr),
      h = Math.round(r.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = false;
    rect(c, 0, 0, r.width, r.height, "#a9bf91");
    const fit = Math.min(r.width / WORLD_W, r.height / WORLD_H);
    this.unit = fit * this.camera.zoom;
    c.save();
    c.translate(r.width / 2, r.height / 2);
    c.scale(this.unit, this.unit);
    c.translate(-this.camera.x, -this.camera.y);
    c.drawImage(this.back, 0, 0);
    const t = this.sim.elapsed,
      items = [];
    for (const room of this.sim.map.rooms) {
      for (const d of room.desks)
        items.push({
          y: d.y + 14,
          draw: () => desk(c, d, room.harness, true, t),
        });
      items.push({
        y: room.plant.y + 15,
        draw: () => plant(c, room.plant.x + 12, room.plant.y + 18),
      });
      items.push({
        y: room.books.y + 32,
        draw: () => books(c, room.books.x + 12, room.books.y + 4),
      });
    }
    items.push({
      y: 433,
      draw: () => {
        panel(c, 552, 392, 72, 42, "#d8b980", "#907050");
        rect(c, 558, 397, 60, 2, "#f3d39b");
        rect(c, 559, 403, 18, 15, "#f4e6c1");
        rect(c, 561, 407, 12, 1, "#b0b698");
        rect(c, 590, 402, 16, 14, "#b2c3a4");
      },
    });
    for (const a of this.sim.actors.values())
      items.push({
        y: a.y,
        draw: () =>
          sprite(c, a, t, a.id === this.selected || a.id === this.hover),
      });
    items.sort((a, b) => a.y - b.y);
    for (const item of items) item.draw();
    // A tiny office cat is scenery, never an agent or a task signal.
    const catX = 458 + Math.sin(t / 7) * 70,
      catY = 750;
    rect(c, catX - 8, catY, 22, 5, "#536b5630");
    rect(c, catX - 9, catY - 15, 21, 12, "#ba9164");
    rect(c, catX + 5, catY - 21, 12, 13, "#d8b17e");
    rect(c, catX + 6, catY - 25, 3, 5, "#b78b60");
    rect(c, catX + 13, catY - 25, 3, 5, "#b78b60");
    rect(c, catX + 13, catY - 17, 2, 2, "#48584c");
    rect(
      c,
      catX - 14,
      catY - 16 + Math.round(Math.sin(t * 3)),
      7,
      3,
      "#b48a5e",
    );
    this.paintLabels(c, t);
    for (const m of this.sim.meetings.filter(
      (m) => m.phase === "talking" && !m.completed,
    )) {
      const x = 562 + (1 + Math.sin(t * 3)) * 22;
      panel(c, x, 400, 22, 16, "#fff0c4", "#b1966d");
      rect(c, x + 4, 404, 14, 1, "#aeb99c");
      this.bubble(c, "上下文、任务与成果，一起交接。", 588, 336, 240);
    }
    // Decorative butterflies and coffee steam are local scene effects.
    if (!this.reduced) {
      const bx = 1040 + Math.sin(t / 3) * 12,
        by = 826 + Math.cos(t / 2) * 8;
      rect(c, bx, by, 4, 3, "#fff0b3");
      rect(c, bx + 5, by + Math.sin(t * 10) * 2, 4, 3, "#e8cb8b");
      rect(c, 1010, 363 - ((t * 3) % 8), 3, 5, "#fff1d780");
    }
    c.restore();
    this.drawMini(c, r.width, r.height);
  }
  paintLabels(c, t) {
    const occupied = [];
    for (const a of [...this.sim.actors.values()].sort(
      (a, b) => Number(a.id === this.selected) - Number(b.id === this.selected),
    )) {
      const highlight = a.id === this.hover || a.id === this.selected;
      if (!this.showNames && !highlight) continue;
      const title =
          a.session.title.length > 10
            ? a.session.title.slice(0, 9) + "…"
            : a.session.title,
        w = title.length * 12 + 16;
      const box = { x: a.x - w / 2, y: a.y + 9, w, h: 23 };
      if (
        !highlight &&
        occupied.some(
          (b) =>
            Math.abs(b.x + b.w / 2 - a.x) < (b.w + w) / 2 &&
            Math.abs(b.y - box.y) < 25,
        )
      )
        continue;
      occupied.push(box);
      panel(
        c,
        box.x,
        box.y,
        w,
        23,
        highlight ? "#fff4cc" : "#f5e8cbdc",
        highlight ? "#b29250" : "#b39a7470",
      );
      label(c, title, a.x, box.y + 12, {
        align: "center",
        size: 12,
        color: "#574f3e",
      });
      if (highlight)
        this.bubble(
          c,
          this.sim.label(a),
          a.x,
          a.y - 66,
          Math.max(100, Math.min(230, this.sim.label(a).length * 13 + 24)),
        );
    }
  }
  bubble(c, text, x, y, w = 150) {
    panel(c, x - w / 2, y - 24, w, 26, "#fff8dd", "#a58f68");
    rect(c, x - 3, y + 2, 6, 4, "#a58f68");
    rect(c, x - 2, y, 4, 4, "#fff8dd");
    label(c, text, x, y - 10, { align: "center", size: 12, color: "#5d6249" });
  }
  drawMini(c, w, h) {
    const x = w - 116,
      y = h - 94;
    panel(c, x, y, 101, 76, "#dfdfbfdd", "#8fa182");
    c.save();
    c.translate(x + 7, y + 7);
    c.scale(0.076, 0.068);
    c.drawImage(this.back, 0, 0);
    for (const a of this.sim.actors.values())
      rect(c, a.x - 12, a.y - 12, 24, 24, zoneColor(a.session.harness));
    c.restore();
    label(c, "办公室地图", x + 49, y - 9, {
      size: 9,
      align: "center",
      color: "#4f715a",
    });
  }
  debug() {
    return {
      ...this.sim.state(),
      camera: { ...this.camera },
      paused: this.reduced,
      visibleSessions: this.sim.actors.size,
    };
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
  }
}
