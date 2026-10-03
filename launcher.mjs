#!/usr/bin/env node
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import { execSync, execFileSync, exec } from "child_process";

const CONFIG_PATH = path.join(import.meta.dirname, "config.json");
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const SCRIPTS_DIR = path.resolve(import.meta.dirname, config.scriptsDir ?? "./scripts");
const BUNDLE_ID = config.bundleId ?? "io.simplelocalize.notch-prompter";
const PORT = config.port ?? 7474;

function parseMeta(content) {
  const lines = content.split("\n");
  let title = null, role = null, labels = [], bodyLines = [];
  for (const line of lines) {
    const t = line.match(/^#\s*title:\s*(.+)/);
    const l = line.match(/^#\s*labels:\s*(.+)/);
    const r = line.match(/^#\s*role:\s*(.+)/);
    if (t) title = t[1].trim();
    else if (l) labels = l[1].split("·").map(s => s.trim());
    else if (r) role = r[1].trim();
    else bodyLines.push(line);
  }
  return { title, role, labels, body: bodyLines.join("\n").trim() };
}

function loadScript(filename, subdir) {
  const filepath = path.join(SCRIPTS_DIR, subdir || "", filename);
  if (!fs.existsSync(filepath)) throw new Error("File not found");
  const { body } = parseMeta(fs.readFileSync(filepath, "utf8"));
  const tmpPlist = path.join(os.tmpdir(), `notch-${Date.now()}.plist`);
  const pyScript = `
import plistlib, sys
text = sys.stdin.buffer.read().decode('utf-8')
with open(sys.argv[1], 'wb') as f:
    plistlib.dump({'PrompterText': text, 'VoiceActivation': False}, f)
`;
  execFileSync("python3", ["-c", pyScript, tmpPlist], { input: body, encoding: "utf8" });
  execFileSync("defaults", ["import", BUNDLE_ID, tmpPlist]);
  fs.unlinkSync(tmpPlist);
  exec(`osascript -e 'quit app "NotchPrompter"'`, () => {
    setTimeout(() => exec(`open -g -a NotchPrompter`), 800);
  });
}

function getScripts(subdir) {
  const dir = subdir ? path.join(SCRIPTS_DIR, subdir) : SCRIPTS_DIR;
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => ({ file: f, dir: subdir || "" }));
}

const PALETTE = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#06b6d4','#f97316','#ec4899','#84cc16','#6366f1','#14b8a6','#a855f7','#ef4444'];

function labelColor(label) {
  let hash = 0;
  for (const c of label) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function buildTabData(entries) {
  return entries.map(({ file, dir }) => ({
    file, dir,
    ...parseMeta(fs.readFileSync(path.join(SCRIPTS_DIR, dir, file), "utf8")),
  }));
}

function buildFilterBar(meta, tabId) {
  const labels = [...new Set(meta.flatMap(m => m.labels))].sort();
  const chips = labels.map(l => {
    const col = labelColor(l);
    return `<button class="filter-chip" data-label="${l.replace(/"/g,'&quot;')}" data-tab="${tabId}" style="--c:${col}">${l}</button>`;
  }).join("");
  return `<div class="filter-bar" data-tab-bar="${tabId}">${chips}<button class="clear-btn" data-tab="${tabId}" onclick="clearFilters('${tabId}')" style="display:none">✕ Clear</button></div>`;
}

function buildCards(meta, tabId) {
  return meta.map(({ file, dir, title, labels, body }) => {
    const displayTitle = title || file.replace(/\.txt$/, "").replace(/[-_]/g, " ");
    const preview = body.slice(0, 110).trim();
    const chips = labels.map(l => `<span class="chip" style="--c:${labelColor(l)}">${l}</span>`).join("");
    const labelAttr = labels.join("|");
    const loadParam = `/load?file=${encodeURIComponent(file)}${dir ? `&subdir=${encodeURIComponent(dir)}` : ""}`;
    return `<button class="card" data-labels="${labelAttr}" data-tab="${tabId}" onclick="load('${loadParam}', this)">
      <div class="name">${displayTitle}</div>
      <div class="chips">${chips}</div>
      <div class="preview">${preview}…</div>
    </button>`;
  }).join("\n");
}

function buildGroupedRows(meta, tabId) {
  // Group by # role: tag, preserving insertion order
  const groups = new Map();
  for (const item of meta) {
    const key = item.role || item.labels[item.labels.length - 1] || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].map(([role, items]) => {
    const buttons = items.map(({ file, dir, title, labels, body }) => {
      const displayTitle = title || file.replace(/\.txt$/, "").replace(/[-_]/g, " ");
      const preview = body.slice(0, 90).trim();
      const chips = labels.slice(0, -1).map(l => `<span class="chip" style="--c:${labelColor(l)}">${l}</span>`).join("");
      const labelAttr = labels.join("|");
      const loadParam = `/load?file=${encodeURIComponent(file)}${dir ? `&subdir=${encodeURIComponent(dir)}` : ""}`;
      return `<button class="cv-card" data-labels="${labelAttr}" data-tab="${tabId}" onclick="load('${loadParam}', this)">
        <div class="name">${displayTitle}</div>
        <div class="chips">${chips}</div>
        <div class="preview">${preview}…</div>
      </button>`;
    }).join("\n");
    const roleColor = labelColor(role);
    return `<div class="role-section">
      <div class="role-header" style="--rc:${roleColor}">${role}</div>
      <div class="role-row">${buttons}</div>
    </div>`;
  }).join("\n");
}

function renderHTML() {
  const tabs = config.tabs.map(tab => ({
    ...tab,
    meta: buildTabData(getScripts(tab.dir)),
  }));

  const tabButtons = tabs.map((tab, i) =>
    `<button class="tab-btn${i === 0 ? ' active' : ''}" onclick="switchTab('${tab.id}', this)">${tab.label}</button>`
  ).join("\n  ");

  const tabPanels = tabs.map((tab, i) => {
    const content = tab.layout === 'grouped'
      ? `${buildFilterBar(tab.meta, tab.id)}\n  ${buildGroupedRows(tab.meta, tab.id)}`
      : `${buildFilterBar(tab.meta, tab.id)}\n  <div class="grid">${buildCards(tab.meta, tab.id)}</div>`;
    return `<div class="tab-panel${i === 0 ? ' active' : ''}" id="panel-${tab.id}">\n  ${content}\n</div>`;
  }).join("\n\n");

  const activeFiltersInit = config.tabs.map(t => `"${t.id}": new Set()`).join(", ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NotchPrompter Launcher</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f0f0f; color: #f0f0f0; min-height: 100vh; padding: 16px 24px; }
  h1 { font-size: 20px; font-weight: 600; color: #fff; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #555; }
  .header { display: none; }
  .controls { display: flex; gap: 10px; align-items: center; }
  .toggle { background: none; border: 1px solid #2ecc71; color: #2ecc71; border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; }
  .toggle:hover { opacity: 0.7; }
  .tabs { display: flex; align-items: center; gap: 0; margin-bottom: 16px; border-bottom: 1px solid #222; }
  .tab-btn { background: none; border: none; color: #555; font-size: 14px; font-weight: 500; padding: 8px 20px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.15s; }
  .tab-btn:hover { color: #aaa; }
  .tab-btn.active { color: #fff; border-bottom-color: #fff; }
  .tabs .controls { margin-left: auto; padding-bottom: 6px; }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }
  .filter-bar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; padding-bottom: 18px; border-bottom: 1px solid #1a1a1a; }
  .filter-chip { font-size: 11px; font-weight: 500; color: var(--c); background: none; border: 1px solid color-mix(in srgb, var(--c) 40%, transparent); border-radius: 20px; padding: 4px 10px; cursor: pointer; transition: all 0.15s; }
  .filter-chip:hover { border-color: var(--c); }
  .filter-chip.active { background: color-mix(in srgb, var(--c) 20%, transparent); border-color: var(--c); color: #fff; }
  .clear-btn { font-size: 11px; background: none; border: 1px solid #444; color: #666; border-radius: 20px; padding: 4px 10px; cursor: pointer; margin-left: 4px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
  .card { background: #1a1a1a; border: 1px solid #252525; border-radius: 12px; padding: 18px 16px; cursor: pointer; text-align: left; transition: background 0.15s, border-color 0.15s, transform 0.1s; width: 100%; }
  .card:hover { background: #222; border-color: #3a3a3a; transform: translateY(-1px); }
  .card.loading { border-color: #3a7bd5; background: #1a2540; }
  .card.done { border-color: #2ecc71; background: #0e2018; }
  .card.hidden { display: none; }
  .name { font-size: 17px; font-weight: 700; color: #fff; margin-bottom: 10px; line-height: 1.3; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }
  .chip { font-size: 10px; font-weight: 500; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); border-radius: 4px; padding: 2px 7px; white-space: nowrap; }
  .preview { font-size: 11px; color: #444; line-height: 1.6; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .status { margin-top: 24px; font-size: 13px; color: #444; min-height: 20px; }
  .status.active { color: #2ecc71; }
  .role-section { margin-bottom: 28px; }
  .role-header { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--rc); margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid color-mix(in srgb, var(--rc) 25%, transparent); }
  .role-row { display: flex; flex-direction: row; gap: 8px; }
  .cv-card { flex: 1 1 0; min-width: 0; background: #1a1a1a; border: 1px solid #252525; border-radius: 10px; padding: 10px 12px; cursor: pointer; text-align: left; transition: background 0.15s, border-color 0.15s; }
  .cv-card:hover { background: #222; border-color: #3a3a3a; }
  .cv-card.loading { border-color: #3a7bd5; background: #1a2540; }
  .cv-card.done { border-color: #2ecc71; background: #0e2018; }
  .cv-card.hidden { display: none; }
  .cv-card .name { font-size: 13px; margin-bottom: 6px; }
  .cv-card .chips { margin-bottom: 0; }
  .cv-card .preview { display: none; }
</style>
</head>
<body>
<div class="tabs">
  ${tabButtons}
  <div class="controls">
    <button class="toggle" id="toggle" onclick="toggleWatcher()">🛡 Auto-hide: ON</button>
    <button class="toggle" style="border-color:#e74c3c;color:#e74c3c" onclick="killAll()">✕ Kill all</button>
  </div>
</div>

${tabPanels}

<p class="status" id="status"></p>
<script>
let watcherOn = true;
const activeFilters = { ${activeFiltersInit} };
let currentTab = '${tabs[0].id}';

function switchTab(tab, btn) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
  document.getElementById('status').textContent = '';
}

document.querySelectorAll('.filter-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const label = btn.dataset.label;
    const tab = btn.dataset.tab;
    const filters = activeFilters[tab];
    if (filters.has(label)) { filters.delete(label); btn.classList.remove('active'); }
    else { filters.add(label); btn.classList.add('active'); }
    applyFilters(tab);
  });
});

function applyFilters(tab) {
  const filters = activeFilters[tab];
  const clearBtn = document.querySelector('.clear-btn[data-tab="' + tab + '"]');
  if (clearBtn) clearBtn.style.display = filters.size > 0 ? 'inline-block' : 'none';
  document.querySelectorAll('.card[data-tab="' + tab + '"], .cv-card[data-tab="' + tab + '"]').forEach(card => {
    if (filters.size === 0) { card.classList.remove('hidden'); return; }
    const cardLabels = card.dataset.labels.split('|');
    card.classList.toggle('hidden', ![...filters].some(f => cardLabels.includes(f)));
  });
}

function clearFilters(tab) {
  activeFilters[tab].clear();
  document.querySelectorAll(\`.filter-chip[data-tab="\${tab}"]\`).forEach(b => b.classList.remove('active'));
  applyFilters(tab);
}

async function load(url, btn) {
  document.querySelectorAll('.card, .cv-card').forEach(c => c.classList.remove('done'));
  btn.classList.add('loading');
  document.getElementById('status').textContent = 'Loading…';
  document.getElementById('status').className = 'status';
  const res = await fetch(url);
  const data = await res.json();
  btn.classList.remove('loading');
  if (data.ok) {
    btn.classList.add('done');
    document.getElementById('status').textContent = '✓ Loaded into NotchPrompter';
    document.getElementById('status').className = 'status active';
  } else {
    document.getElementById('status').textContent = '✗ Error: ' + data.error;
  }
}
async function killAll() { await fetch('/kill').catch(() => {}); window.close(); }
async function toggleWatcher() {
  const res = await fetch('/watcher?enabled=' + (!watcherOn));
  const data = await res.json();
  watcherOn = data.enabled;
  const btn = document.getElementById('toggle');
  btn.textContent = watcherOn ? '🛡 Auto-hide: ON' : '⏸ Auto-hide: OFF';
  btn.style.borderColor = watcherOn ? '#2ecc71' : '#e67e22';
  btn.style.color = watcherOn ? '#2ecc71' : '#e67e22';
}
</script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/kill") {
    exec(`osascript -e 'quit app "NotchPrompter"'`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    setTimeout(() => process.exit(0), 300);
    return;
  }

  if (url.pathname === "/watcher") {
    watcherEnabled = url.searchParams.get("enabled") === "true";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ enabled: watcherEnabled }));
    return;
  }

  if (url.pathname === "/load") {
    const file = decodeURIComponent(url.searchParams.get("file") || "");
    const subdir = decodeURIComponent(url.searchParams.get("subdir") || "");
    try {
      if (!file.endsWith(".txt") || file.includes("/")) throw new Error("Invalid file");
      if (subdir && subdir.includes("/")) throw new Error("Invalid subdir");
      loadScript(file, subdir);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(renderHTML());
});

if (!fs.existsSync(SCRIPTS_DIR)) {
  console.error(`Scripts directory not found: ${SCRIPTS_DIR}`);
  console.error("Run: cp -r examples/* scripts/  or update scriptsDir in config.json");
  process.exit(1);
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`NotchPrompter launcher running at http://localhost:${PORT}`);
  exec(`open http://localhost:${PORT}`);
});

let watcherEnabled = true;

// When NotchPrompter takes focus, immediately return focus to the previous app
let lastFrontApp = null;
let notchWasFront = false;
setInterval(() => {
  exec(
    `osascript -e 'tell application "System Events" to get name of first process where frontmost is true'`,
    (err, stdout) => {
      if (err) return;
      const app = stdout.trim();
      if (app === "NotchPrompter") {
        if (watcherEnabled && !notchWasFront && lastFrontApp) {
          notchWasFront = true;
          exec(`osascript -e 'tell application "${lastFrontApp}" to activate'`);
        }
      } else {
        notchWasFront = false;
        if (app) lastFrontApp = app;
      }
    }
  );
}, 300);
