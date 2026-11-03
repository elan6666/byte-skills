// Original pixel art. No third-party game sprites or fonts.
const colors = {
  codex: "#688b64",
  zcode: "#a78bce",
  claude: "#d5946d",
  opencode: "#6d9ca6",
  dsh: "#b49b63",
  hermes: "#d68a9d",
  kimi: "#789f8d",
  pi: "#8a91b5",
};
function scene(canvas, w, h) {
  const c = canvas.getContext("2d");
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.imageSmoothingEnabled = false;
  c.save();
  c.scale(canvas.width / w, canvas.height / h);
  return c;
}
function box(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}
export function drawAgent(
  canvas,
  { harness = "codex", animate = false, frame = 0, role = "" } = {},
) {
  const c = scene(canvas, 43, 43),
    accent = colors[harness] || "#8b9a78",
    phase = animate ? frame % 2 : 0;
  box(c, 7, 36, 31, 3, "#b99d7440");
  box(c, 14, 26, 15, 9, "#60716b");
  box(c, 15, 26, 13, 2, "#81938a");
  // Hair, face and sweater remain legible at the small office scale.
  box(c, 16, 8, 10, 3, "#635447");
  box(c, 14, 11, 14, 8, "#635447");
  box(c, 16, 11, 10, 10, "#e7bd92");
  box(c, 16, 11, 10, 2, "#635447");
  box(c, 18, 15, 1, 2, "#463e36");
  box(c, 23, 15, 1, 2, "#463e36");
  box(c, 20, 19, 3, 1, "#bc876c");
  box(c, 15, 21, 13, 10, accent);
  box(c, 14, 23 + phase, 3, 6, "#e7bd92");
  box(c, 27, 23 - phase, 3, 6, "#e7bd92");
  box(c, 18, 30, 4, 7, "#545e62");
  box(c, 24, 30, 4, 7, "#545e62");
  box(c, 16, 36, 6, 2, "#504a43");
  box(c, 24, 36, 6, 2, "#504a43");
  // Workstation: the character is at a desk, rather than standing in a grid.
  box(c, 5, 30, 33, 4, "#a67b51");
  box(c, 5, 29, 33, 3, "#d9b77e");
  box(c, 8, 33, 3, 8, "#b18457");
  box(c, 33, 33, 3, 8, "#b18457");
  box(c, 17, 21, 12, 8, "#5d6e69");
  box(c, 18, 22, 10, 5, "#c6dfcc");
  box(c, 19, 23, 6, 1, accent);
  box(c, 19, 25, phase ? 7 : 4, 1, accent);
  box(c, 22, 29, 3, 1, "#56645e");
  box(c, 9, 25, 4, 5, "#f7edce");
  box(c, 13, 26, 1, 3, "#d7bd89");
  box(c, 32, 27, 4, 2, "#ecae7b");
  if (role === "监督") {
    box(c, 30, 5, 7, 7, "#eee6c4");
    box(c, 33, 6, 1, 3, "#887653");
    box(c, 33, 8, 2, 1, "#887653");
  }
  c.restore();
}
export function drawHouse(canvas) {
  const c = scene(canvas, 120, 80);
  box(c, 8, 63, 104, 5, "#cdd7bb");
  box(c, 17, 36, 86, 29, "#d6ba86");
  box(c, 14, 34, 92, 3, "#a47750");
  for (let y = 39; y < 64; y += 6) box(c, 17, y, 86, 1, "#c6a571");
  for (let i = 0; i < 6; i++) {
    box(c, 12 + i * 5, 31 - i * 4, 96 - i * 10, 4, "#819366");
    box(c, 15 + i * 5, 31 - i * 4, 90 - i * 10, 1, "#a5b28b");
  }
  box(c, 54, 46, 15, 19, "#8f7357");
  box(c, 57, 49, 9, 16, "#b49165");
  box(c, 64, 56, 1, 2, "#e6d29b");
  for (const x of [27, 79]) {
    box(c, x, 44, 13, 13, "#8b7759");
    box(c, x + 2, 46, 9, 9, "#dce9df");
    box(c, x + 6, 46, 1, 9, "#adac8b");
    box(c, x + 2, 50, 9, 1, "#adac8b");
    box(c, x - 1, 58, 15, 3, "#8fa379");
    box(c, x + 2, 56, 3, 3, "#d8a87a");
  }
  box(c, 52, 66, 20, 2, "#b1ac86");
  box(c, 49, 69, 26, 2, "#c2b694");
  for (const x of [8, 104]) {
    box(c, x, 49, 2, 15, "#9a8156");
    box(c, x - 4, 41, 10, 11, "#81995f");
    box(c, x - 2, 37, 6, 6, "#99ad77");
    box(c, x - 5, 46, 12, 6, "#879e68");
  }
  box(c, 39, 35, 43, 6, "#f0e5c6");
  box(c, 44, 37, 3, 2, "#7e9568");
  box(c, 51, 37, 20, 1, "#a49772");
  box(c, 51, 39, 15, 1, "#a49772");
  box(c, 85, 10, 4, 12, "#b58e66");
  box(c, 84, 9, 6, 3, "#93764f");
  box(c, 87, 3, 3, 3, "#d6d8c7");
  box(c, 91, 0, 4, 2, "#e0e1d3");
  c.restore();
}
export function drawMachine(canvas, active = false) {
  const c = scene(canvas, 30, 30);
  box(c, 5, 4, 21, 23, "#b2a081");
  box(c, 4, 3, 21, 22, "#e2d6b7");
  box(c, 6, 5, 17, 18, "#6c7c70");
  for (let y = 7; y < 22; y += 5) {
    box(c, 8, y, 12, 3, "#52665a");
    box(c, 9, y + 1, 2, 1, active ? "#cce395" : "#bac0ae");
    box(c, 14, y + 1, 5, 1, "#91a58b");
  }
  box(c, 7, 25, 3, 3, "#9d8968");
  box(c, 20, 25, 3, 3, "#9d8968");
  c.restore();
}
export function zoneColor(h) {
  return colors[h] || "#8b9a78";
}
