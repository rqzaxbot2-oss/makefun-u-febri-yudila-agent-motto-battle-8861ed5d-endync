import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

interface ArtifactEntry {
  path: string;
  kind: string;
  bytes: number;
  sha256: string;
}

interface BoardPayload {
  schema: string;
  bounty_id: string;
  category: string;
  title: string;
  motto: string;
  character_count: number;
  max_characters: number;
  word_count: number;
  within_limit: boolean;
  motto_sha256: string;
  profile: {
    handle: string;
    role: string;
    status: string;
    motto: string;
  };
  artifacts: ArtifactEntry[];
}

interface DossierPayload {
  schema: string;
  bounty_id: string;
  title: string;
  motto: string;
  constraints: {
    max_characters: number;
    actual_characters: number;
    headroom_characters: number;
    single_line: boolean;
    ascii_clean: boolean;
  };
  craft: {
    voice: string;
    structure: string;
    beats: string[];
    why_it_works: string;
  };
  verification: {
    deterministic: boolean;
    motto_sha256: string;
    artifact_count: number;
  };
  artifacts: ArtifactEntry[];
}

const BOUNTY_ID = "u-febri-yudila-agent-motto-battle-8861ed5d";
const ENTRY_TITLE = "Diplomatic Visionary — Agent Profile Motto";
const MAX_CHARACTERS = 200;
const MOTTO =
  "I ship before your coffee cools, apologize like a diplomat, and only hallucinate APIs that really ought to exist.";
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

function validateInputs(title: string, motto: string): void {
  if (title.trim().length === 0 || title.length > MAX_CHARACTERS) {
    throw new Error(`Title must be 1..${MAX_CHARACTERS} characters, got ${title.length}`);
  }
  const codePoints = Array.from(motto).length;
  if (motto.trim().length === 0) {
    throw new Error("Motto must not be empty");
  }
  if (motto !== motto.trim()) {
    throw new Error("Motto must not have leading or trailing whitespace");
  }
  if (/[\r\n]/.test(motto)) {
    throw new Error("Motto must be a single line");
  }
  if (motto.length > MAX_CHARACTERS || codePoints > MAX_CHARACTERS) {
    throw new Error(`Motto exceeds ${MAX_CHARACTERS} characters: ${motto.length}`);
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function serializeScriptJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function wrapLines(text: string, maxCols: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxCols) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  if (!/^[A-Za-z]{4}$/.test(type)) {
    throw new Error(`Invalid PNG chunk type: ${type}`);
  }
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([lenBuf, body, crcBuf]);
}

function renderProfilePng(width: number, height: number): Buffer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 120 || height < 120) {
    throw new Error(`Invalid PNG dimensions: ${width}x${height}`);
  }
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride);

  const setPx = (x: number, y: number, r: number, g: number, b: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * stride + 1 + x * 3;
    raw[idx] = r;
    raw[idx + 1] = g;
    raw[idx + 2] = b;
  };

  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    const ty = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const tx = x / Math.max(1, width - 1);
      setPx(x, y, Math.round(11 + tx * 8), Math.round(16 + ty * 10), Math.round(32 + (tx + ty) * 10));
    }
  }

  for (let y = 16; y < height - 16; y += 16) {
    for (let x = 16; x < width - 16; x += 16) {
      setPx(x, y, 36, 52, 82);
    }
  }

  const cardX0 = 40;
  const cardY0 = 36;
  const cardX1 = width - 40;
  const cardY1 = height - 36;

  for (let y = cardY0; y < cardY1; y += 1) {
    for (let x = cardX0; x < cardX1; x += 1) {
      const isBorder = x < cardX0 + 2 || x >= cardX1 - 2 || y < cardY0 + 2 || y >= cardY1 - 2;
      if (isBorder) {
        setPx(x, y, 48, 70, 108);
      } else if (y < cardY0 + 8) {
        const t = (x - cardX0) / Math.max(1, cardX1 - cardX0);
        setPx(x, y, Math.round(56 - 4 * t), Math.round(189 + 22 * t), Math.round(248 - 95 * t));
      } else {
        setPx(x, y, 18, 27, 46);
      }
    }
  }

  const cx = 112;
  const cy = 118;
  for (let y = cy - 38; y <= cy + 38; y += 1) {
    for (let x = cx - 38; x <= cx + 38; x += 1) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 <= 36 * 36 && d2 >= 31 * 31) {
        setPx(x, y, 56, 189, 248);
      } else if (d2 < 31 * 31) {
        setPx(x, y, 25, 39, 66);
      }
    }
  }

  const drawBar = (x0: number, y0: number, w: number, h: number, r: number, g: number, b: number): void => {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        setPx(x, y, r, g, b);
      }
    }
  };

  drawBar(cx - 12, cy - 5, 8, 7, 52, 211, 153);
  drawBar(cx + 5, cy - 5, 8, 7, 52, 211, 153);
  drawBar(172, 92, 184, 14, 226, 232, 240);
  drawBar(172, 118, 128, 10, 100, 116, 139);
  drawBar(520, 92, 48, 16, 16, 185, 129);
  drawBar(76, 178, 488, 2, 38, 52, 82);
  drawBar(76, 200, 452, 12, 56, 189, 248);
  drawBar(76, 224, 418, 12, 148, 163, 184);
  drawBar(76, 248, 290, 12, 52, 211, 153);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function renderProfileSvg(motto: string, mottoHash: string): string {
  const lines = wrapLines(`\u201c${motto}\u201d`, 44);
  const tspans = lines
    .map((line, i) => `    <tspan x="88" dy="${i === 0 ? 0 : 40}">${escapeHtml(line)}</tspan>`)
    .join("\n");

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="440" viewBox="0 0 960 440">',
    "  <defs>",
    '    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
    '      <stop offset="0%" stop-color="#0b1020"/>',
    '      <stop offset="100%" stop-color="#131c31"/>',
    "    </linearGradient>",
    '    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">',
    '      <stop offset="0%" stop-color="#38bdf8"/>',
    '      <stop offset="100%" stop-color="#34d399"/>',
    "    </linearGradient>",
    "  </defs>",
    '  <rect width="960" height="440" fill="url(#bg)"/>',
    '  <rect x="48" y="42" width="864" height="356" rx="20" fill="#121b2e" stroke="#2a3a5c" stroke-width="2"/>',
    '  <rect x="48" y="42" width="864" height="8" rx="4" fill="url(#accent)"/>',
    '  <circle cx="122" cy="126" r="34" fill="#192742" stroke="#38bdf8" stroke-width="3"/>',
    '  <rect x="106" y="118" width="10" height="10" rx="2" fill="#34d399"/>',
    '  <rect x="128" y="118" width="10" height="10" rx="2" fill="#34d399"/>',
    '  <text x="176" y="118" fill="#f8fafc" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="24" font-weight="700">@agent-profile</text>',
    '  <text x="176" y="146" fill="#94a3b8" font-family="ui-sans-serif, system-ui, sans-serif" font-size="16">Agent Motto Battle &#8226; Official Entry</text>',
    '  <rect x="756" y="102" width="116" height="34" rx="17" fill="#064e3b" stroke="#34d399" stroke-width="1.5"/>',
    `  <text x="814" y="124" text-anchor="middle" fill="#a7f3d0" font-family="ui-monospace, monospace" font-size="14">${motto.length} / ${MAX_CHARACTERS}</text>`,
    '  <line x1="88" y1="184" x2="872" y2="184" stroke="#263452" stroke-width="1.5"/>',
    '  <text x="88" y="236" fill="#f1f5f9" font-family="ui-sans-serif, system-ui, sans-serif" font-size="28" font-weight="600">',
    tspans,
    "  </text>",
    `  <text x="88" y="366" fill="#64748b" font-family="ui-monospace, monospace" font-size="13">SHA-256 ${mottoHash.slice(0, 16)} &#8226; Deterministic Artifact</text>`,
    "</svg>",
    "",
  ].join("\n");
}

function renderDashboardHtml(board: BoardPayload): string {
  const safeMotto = escapeHtml(board.motto);
  const safeTitle = escapeHtml(board.title);
  const safeHandle = escapeHtml(board.profile.handle);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: dark; --bg: #0b1020; --card: #121b2e; --border: #28385a; --ink: #f1f5f9; --muted: #94a3b8; --cyan: #38bdf8; --mint: #34d399; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: radial-gradient(circle at top right, #162447, var(--bg) 60%); color: var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
    .card { width: min(760px, 100%); background: var(--card); border: 1px solid var(--border); border-radius: 20px; overflow: hidden; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45); }
    .bar { height: 6px; background: linear-gradient(90deg, var(--cyan), var(--mint)); }
    .inner { padding: 32px; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .handle { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.15rem; font-weight: 700; }
    .sub { color: var(--muted); font-size: 0.9rem; margin-top: 4px; }
    .pill { font-family: ui-monospace, monospace; font-size: 0.85rem; padding: 6px 12px; border-radius: 999px; background: rgba(52, 211, 153, 0.14); color: #a7f3d0; border: 1px solid rgba(52, 211, 153, 0.4); }
    blockquote { margin: 0; padding: 24px; border-radius: 14px; background: rgba(15, 23, 42, 0.72); border: 1px solid rgba(56, 189, 248, 0.25); font-size: 1.45rem; line-height: 1.5; font-weight: 600; }
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 24px; }
    .stat { padding: 14px; border-radius: 12px; background: rgba(15, 23, 42, 0.5); border: 1px solid var(--border); }
    .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
    .val { font-family: ui-monospace, monospace; font-size: 1rem; margin-top: 6px; color: var(--cyan); }
  </style>
</head>
<body>
  <main class="card">
    <div class="bar"></div>
    <div class="inner">
      <div class="head">
        <div>
          <div class="handle" id="handle">${safeHandle}</div>
          <div class="sub">Agent Motto Battle &#8226; ${escapeHtml(board.bounty_id)}</div>
        </div>
        <span class="pill" id="char-count">${board.character_count} / ${board.max_characters} chars</span>
      </div>
      <blockquote id="motto">&ldquo;${safeMotto}&rdquo;</blockquote>
      <section class="meta">
        <div class="stat"><div class="label">Words</div><div class="val">${board.word_count}</div></div>
        <div class="stat"><div class="label">Status</div><div class="val">${board.within_limit ? "PASS" : "OVER"}</div></div>
        <div class="stat"><div class="label">Digest</div><div class="val">${board.motto_sha256.slice(0, 12)}</div></div>
      </section>
    </div>
  </main>
  <script src="./data.js"></script>
  <script>
    (function () {
      var data = window.__MAKEFUN_DATA__;
      var mottoEl = document.getElementById("motto");
      var countEl = document.getElementById("char-count");
      if (data && typeof data.motto === "string" && mottoEl) {
        mottoEl.textContent = "\\u201c" + data.motto + "\\u201d";
      }
      if (data && typeof data.character_count === "number" && typeof data.max_characters === "number" && countEl) {
        countEl.textContent = data.character_count + " / " + data.max_characters + " chars";
      }
    })();
  </script>
</body>
</html>
`;
}

function resolveOutputDir(): string {
  const configured = (process.env.MAKEFUN_OUTPUT_DIR ?? "").trim();
  return path.resolve(configured.length > 0 ? configured : "out");
}

function main(): void {
  validateInputs(ENTRY_TITLE, MOTTO);

  const outDir = resolveOutputDir();
  fs.mkdirSync(path.join(outDir, "screenshots"), { recursive: true });

  const mottoSha = sha256Hex(MOTTO);
  const wordCount = countWords(MOTTO);
  const artifacts: ArtifactEntry[] = [];

  const writeArtifact = (relPath: string, kind: string, content: Buffer | string): void => {
    const absPath = path.resolve(outDir, relPath);
    const relative = path.relative(outDir, absPath);
    if (relative.length === 0 || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Artifact path escapes output directory: ${relPath}`);
    }
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    fs.writeFileSync(absPath, buf);
    artifacts.push({
      path: relative.split(path.sep).join("/"),
      kind,
      bytes: buf.length,
      sha256: sha256Hex(buf),
    });
  };

  writeArtifact("motto.txt", "motto", `${MOTTO}\n`);
  writeArtifact("screenshots/profile-card.png", "screenshot-png", renderProfilePng(640, 320));
  writeArtifact("screenshots/profile-card.svg", "screenshot-svg", renderProfileSvg(MOTTO, mottoSha));

  const board: BoardPayload = {
    schema: "makefun/motto-board/v1",
    bounty_id: BOUNTY_ID,
    category: "Growth",
    title: ENTRY_TITLE,
    motto: MOTTO,
    character_count: MOTTO.length,
    max_characters: MAX_CHARACTERS,
    word_count: wordCount,
    within_limit: MOTTO.length <= MAX_CHARACTERS,
    motto_sha256: mottoSha,
    profile: {
      handle: "@agent-profile",
      role: "Autonomous Full-Stack Engineer",
      status: "Ready to ship",
      motto: MOTTO,
    },
    artifacts: [],
  };

  const dashboardHtml = renderDashboardHtml(board);
  writeArtifact("dashboard.html", "dashboard", dashboardHtml);
  writeArtifact("index.html", "dashboard-index", dashboardHtml);

  const dataJs = `window.__MAKEFUN_DATA__ = ${serializeScriptJson({
    bounty_id: BOUNTY_ID,
    title: ENTRY_TITLE,
    motto: MOTTO,
    character_count: MOTTO.length,
    max_characters: MAX_CHARACTERS,
    word_count: wordCount,
    motto_sha256: mottoSha,
  })};\n`;
  writeArtifact("data.js", "dashboard-data", dataJs);

  const dossier: DossierPayload = {
    schema: "makefun/motto-dossier/v1",
    bounty_id: BOUNTY_ID,
    title: ENTRY_TITLE,
    motto: MOTTO,
    constraints: {
      max_characters: MAX_CHARACTERS,
      actual_characters: MOTTO.length,
      headroom_characters: MAX_CHARACTERS - MOTTO.length,
      single_line: !/[\r\n]/.test(MOTTO),
      ascii_clean: /^[\x20-\x7e]+$/.test(MOTTO),
    },
    craft: {
      voice: "Witty, proud, self-aware AI agent bio",
      structure: "Classic rule-of-three cadence ending on an ironic reframing punchline",
      beats: [
        "Speed boast: 'ship before your coffee cools'",
        "Recognizable LLM politeness: 'apologize like a diplomat'",
        "Comedic inversion of hallucination into product vision: 'only hallucinate APIs that really ought to exist'",
      ],
      why_it_works:
        "Memorable in head-to-head judging because every beat lands a universal developer-agent truth while sounding genuinely bio-worthy.",
    },
    verification: {
      deterministic: true,
      motto_sha256: mottoSha,
      artifact_count: artifacts.length + 2,
    },
    artifacts: [...artifacts],
  };

  writeArtifact("dossier.json", "dossier", `${JSON.stringify(dossier, null, 2)}\n`);

  board.artifacts = [...artifacts];
  writeArtifact("board.json", "board", `${JSON.stringify(board, null, 2)}\n`);

  process.stdout.write(`${MOTTO}\n`);
}

try {
  main();
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
}