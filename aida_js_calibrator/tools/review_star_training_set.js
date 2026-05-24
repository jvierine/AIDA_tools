#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {URL} = require("node:url");

const ROOT = path.join(__dirname, "..");
const DEFAULT_DATASET_DIR = path.join(ROOT, "star_training");
const LABELS = ["yes", "no", "unsure"];
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function parseArgs(argv) {
    const options = {
        datasetDir: DEFAULT_DATASET_DIR,
        host: "127.0.0.1",
        port: 8787,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--dir" && argv[i + 1]) {
            options.datasetDir = path.resolve(argv[i + 1]);
            i += 1;
        } else if (arg.startsWith("--dir=")) {
            options.datasetDir = path.resolve(arg.slice("--dir=".length));
        } else if (arg === "--host" && argv[i + 1]) {
            options.host = argv[i + 1];
            i += 1;
        } else if (arg.startsWith("--host=")) {
            options.host = arg.slice("--host=".length);
        } else if (arg === "--port" && argv[i + 1]) {
            options.port = Number(argv[i + 1]);
            i += 1;
        } else if (arg.startsWith("--port=")) {
            options.port = Number(arg.slice("--port=".length));
        }
    }
    return options;
}

function ensureDatasetDirs(datasetDir) {
    fs.mkdirSync(datasetDir, {recursive: true});
    for (const label of LABELS) {
        fs.mkdirSync(path.join(datasetDir, label), {recursive: true});
    }
}

function safeLabel(label) {
    return LABELS.includes(label) ? label : null;
}

function safeRelativeImagePath(value) {
    const rel = String(value || "").replace(/\\/g, "/");
    const parts = rel.split("/").filter(Boolean);
    if (parts.length !== 2 || !safeLabel(parts[0])) {
        return null;
    }
    const basename = path.basename(parts[1]);
    if (basename !== parts[1] || !IMAGE_EXTENSIONS.has(path.extname(basename).toLowerCase())) {
        return null;
    }
    return `${parts[0]}/${basename}`;
}

function listItems(datasetDir) {
    const items = [];
    for (const label of LABELS) {
        const labelDir = path.join(datasetDir, label);
        if (!fs.existsSync(labelDir)) {
            continue;
        }
        for (const name of fs.readdirSync(labelDir).sort((a, b) => a.localeCompare(b))) {
            if (!IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase())) {
                continue;
            }
            const filePath = path.join(labelDir, name);
            const stat = fs.statSync(filePath);
            if (!stat.isFile()) {
                continue;
            }
            items.push({
                id: `${label}/${name}`,
                label,
                name,
                size: stat.size,
                mtimeMs: stat.mtimeMs,
                url: `/crop/${encodeURIComponent(label)}/${encodeURIComponent(name)}`,
            });
        }
    }
    return items;
}

function uniqueDestination(targetDir, filename) {
    const ext = path.extname(filename);
    const stem = path.basename(filename, ext);
    let candidate = path.join(targetDir, filename);
    let index = 1;
    while (fs.existsSync(candidate)) {
        candidate = path.join(targetDir, `${stem}_${index}${ext}`);
        index += 1;
    }
    return candidate;
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", chunk => {
            body += chunk;
            if (body.length > 1_000_000) {
                reject(new Error("request body too large"));
                req.destroy();
            }
        });
        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(error);
            }
        });
        req.on("error", reject);
    });
}

function sendJson(res, status, payload) {
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
    });
    res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, status, contentType, text) {
    res.writeHead(status, {
        "content-type": contentType,
        "cache-control": "no-store",
    });
    res.end(text);
}

function appendManifestEvent(datasetDir, event) {
    const manifestPath = path.join(datasetDir, "review_manifest.jsonl");
    fs.appendFileSync(manifestPath, `${JSON.stringify({
        ...event,
        timestampUtc: new Date().toISOString(),
    })}\n`);
}

function htmlPage() {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AIDA Star Training Review</title>
<style>
body { margin: 0; font: 15px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #dbe4ef; background: #10131a; }
header { display: flex; justify-content: space-between; gap: 20px; align-items: center; padding: 16px 22px; background: #171d28; border-bottom: 1px solid #2d3748; }
h1 { margin: 0; font-size: 20px; }
.subtle { color: #93a4ba; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 18px; padding: 18px; }
.viewer { min-height: calc(100vh - 110px); display: grid; place-items: center; background: #07090d; border: 1px solid #2d3748; border-radius: 8px; overflow: hidden; }
.crop-wrap { display: grid; grid-template-columns: auto 150px; gap: 14px; align-items: start; }
.crop-frame { image-rendering: pixelated; width: min(78vh, 78vw); max-width: 720px; aspect-ratio: 1; display: grid; place-items: center; background: #000; border: 1px solid #334155; }
.crop-frame img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
.image-label { position: sticky; top: 12px; display: grid; gap: 8px; }
.image-label .label { width: 100%; box-sizing: border-box; text-align: center; font-size: 24px; padding: 10px 12px; border-radius: 8px; }
.image-label .hint { color: #93a4ba; font-size: 13px; text-align: center; }
.empty { color: #93a4ba; padding: 24px; text-align: center; }
.panel { display: flex; flex-direction: column; gap: 12px; }
.card { background: #171d28; border: 1px solid #2d3748; border-radius: 8px; padding: 14px; }
.big { font-size: 26px; font-weight: 800; }
.label { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #334155; color: white; font-weight: 700; }
.label.yes { background: #15803d; }
.label.no { background: #b91c1c; }
.label.unsure { background: #a16207; }
button, select, input { width: 100%; box-sizing: border-box; margin-top: 5px; padding: 8px 10px; border: 1px solid #475569; border-radius: 6px; background: #0f172a; color: #e2e8f0; font: inherit; }
button { cursor: pointer; font-weight: 700; }
.buttons { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.yes-button { background: #15803d; }
.no-button { background: #991b1b; }
.unsure-button { background: #854d0e; }
.meta { overflow-wrap: anywhere; color: #b8c4d6; }
kbd { background: #263244; border: 1px solid #40506a; border-radius: 4px; padding: 1px 5px; font-weight: 700; }
ul { padding-left: 18px; margin: 8px 0 0; color: #aebbd0; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } .crop-wrap { grid-template-columns: 1fr; } .image-label { position: static; } .crop-frame { width: min(88vw, 70vh); } }
</style>
</head>
<body>
<header>
    <div>
        <h1>AIDA Star Training Review</h1>
        <div class="subtle">Keyboard: <kbd>Y</kbd>/<kbd>G</kbd> yes, <kbd>N</kbd>/<kbd>B</kbd> no, <kbd>U</kbd> unsure, arrows navigate.</div>
    </div>
    <div id="counts" class="subtle"></div>
</header>
<main class="layout">
    <section class="viewer">
        <div class="crop-wrap">
            <div class="crop-frame" id="cropFrame"><div class="empty">Loading...</div></div>
            <div class="image-label">
                <div id="imageSideLabel"></div>
                <div class="hint">current label</div>
            </div>
        </div>
    </section>
    <aside class="panel">
        <section class="card">
            <div id="position" class="subtle"></div>
            <div id="currentLabel" class="big"></div>
            <div id="filename" class="meta"></div>
        </section>
        <section class="card">
            <label>Show label
                <select id="filter">
                    <option value="all">all</option>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                    <option value="unsure">unsure</option>
                </select>
            </label>
            <label>Search filename
                <input id="search" type="search" placeholder="case, star, source...">
            </label>
        </section>
        <section class="card buttons">
            <button class="yes-button" id="yesButton">Y yes</button>
            <button class="no-button" id="noButton">N no</button>
            <button class="unsure-button" id="unsureButton">U unsure</button>
        </section>
        <section class="card buttons">
            <button id="prevButton">← prev</button>
            <button id="reloadButton">reload</button>
            <button id="nextButton">next →</button>
        </section>
        <section class="card">
            <strong>Workflow</strong>
            <ul>
                <li>Use this only after crops exist in <code>star_training/yes</code>, <code>no</code>, or <code>unsure</code>.</li>
                <li>Relabeling moves the image file and appends to <code>review_manifest.jsonl</code>.</li>
                <li>Use <code>unsure</code> for saturated, cloudy, blended, or ambiguous crops.</li>
            </ul>
        </section>
    </aside>
</main>
<script>
let items = [];
let filtered = [];
let index = 0;

const cropFrame = document.getElementById("cropFrame");
const imageSideLabel = document.getElementById("imageSideLabel");
const countsEl = document.getElementById("counts");
const positionEl = document.getElementById("position");
const labelEl = document.getElementById("currentLabel");
const filenameEl = document.getElementById("filename");
const filterEl = document.getElementById("filter");
const searchEl = document.getElementById("search");

async function loadItems(keepId = null) {
    const response = await fetch("/api/items");
    const payload = await response.json();
    items = payload.items || [];
    applyFilter(keepId);
}

function applyFilter(keepId = null) {
    const label = filterEl.value;
    const search = searchEl.value.trim().toLowerCase();
    filtered = items.filter(item =>
        (label === "all" || item.label === label) &&
        (!search || item.id.toLowerCase().includes(search))
    );
    if (keepId) {
        const found = filtered.findIndex(item => item.id === keepId);
        index = found >= 0 ? found : Math.min(index, Math.max(0, filtered.length - 1));
    } else {
        index = Math.min(index, Math.max(0, filtered.length - 1));
    }
    render();
}

function count(label) {
    return items.filter(item => item.label === label).length;
}

function render() {
    countsEl.textContent = \`yes \${count("yes")}  no \${count("no")}  unsure \${count("unsure")}  total \${items.length}\`;
    if (filtered.length === 0) {
        cropFrame.innerHTML = '<div class="empty">No crops match this filter.</div>';
        imageSideLabel.innerHTML = "";
        positionEl.textContent = "0 / 0";
        labelEl.innerHTML = "";
        filenameEl.textContent = "";
        return;
    }
    const item = filtered[index];
    cropFrame.innerHTML = \`<img src="\${item.url}?t=\${Date.now()}" alt="\${item.id}">\`;
    imageSideLabel.innerHTML = \`<span class="label \${item.label}">\${item.label}</span>\`;
    positionEl.textContent = \`\${index + 1} / \${filtered.length}\`;
    labelEl.innerHTML = \`<span class="label \${item.label}">\${item.label}</span>\`;
    filenameEl.textContent = item.id;
}

async function setLabel(label) {
    if (filtered.length === 0) {
        return;
    }
    const item = filtered[index];
    const response = await fetch("/api/label", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({id: item.id, label}),
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        alert(payload.error || "failed to relabel item");
        return;
    }
    await loadItems();
}

function step(delta) {
    if (filtered.length === 0) {
        return;
    }
    index = (index + delta + filtered.length) % filtered.length;
    render();
}

document.getElementById("yesButton").addEventListener("click", () => setLabel("yes"));
document.getElementById("noButton").addEventListener("click", () => setLabel("no"));
document.getElementById("unsureButton").addEventListener("click", () => setLabel("unsure"));
document.getElementById("prevButton").addEventListener("click", () => step(-1));
document.getElementById("nextButton").addEventListener("click", () => step(1));
document.getElementById("reloadButton").addEventListener("click", () => loadItems(filtered[index] && filtered[index].id));
filterEl.addEventListener("change", () => applyFilter());
searchEl.addEventListener("input", () => applyFilter());

window.addEventListener("keydown", event => {
    if (event.target === searchEl) {
        return;
    }
    const key = event.key.toLowerCase();
    if (key === "y" || key === "g") {
        event.preventDefault();
        setLabel("yes");
    } else if (key === "n" || key === "b") {
        event.preventDefault();
        setLabel("no");
    } else if (key === "u") {
        event.preventDefault();
        setLabel("unsure");
    } else if (key === "arrowright" || key === " ") {
        event.preventDefault();
        step(1);
    } else if (key === "arrowleft") {
        event.preventDefault();
        step(-1);
    }
});

loadItems().catch(error => {
    cropFrame.innerHTML = \`<div class="empty">\${error.message || error}</div>\`;
});
</script>
</body>
</html>`;
}

async function handleRequest(req, res, datasetDir) {
    const url = new URL(req.url, "http://localhost");
    try {
        if (req.method === "GET" && url.pathname === "/") {
            sendText(res, 200, "text/html; charset=utf-8", htmlPage());
            return;
        }
        if (req.method === "GET" && url.pathname === "/api/items") {
            sendJson(res, 200, {items: listItems(datasetDir)});
            return;
        }
        if (req.method === "POST" && url.pathname === "/api/label") {
            const body = await readJsonBody(req);
            const rel = safeRelativeImagePath(body.id);
            const targetLabel = safeLabel(body.label);
            if (!rel || !targetLabel) {
                sendJson(res, 400, {error: "invalid id or target label"});
                return;
            }
            const source = path.join(datasetDir, rel);
            if (!fs.existsSync(source)) {
                sendJson(res, 404, {error: "crop no longer exists"});
                return;
            }
            const filename = path.basename(rel);
            const targetDir = path.join(datasetDir, targetLabel);
            fs.mkdirSync(targetDir, {recursive: true});
            const target = path.dirname(source) === targetDir ?
                source :
                uniqueDestination(targetDir, filename);
            if (source !== target) {
                fs.renameSync(source, target);
            }
            const newId = `${targetLabel}/${path.basename(target)}`;
            appendManifestEvent(datasetDir, {
                action: "label",
                from: rel,
                to: newId,
                label: targetLabel,
            });
            sendJson(res, 200, {ok: true, id: newId});
            return;
        }
        if (req.method === "GET" && url.pathname.startsWith("/crop/")) {
            const parts = url.pathname.split("/").slice(2).map(decodeURIComponent);
            const rel = safeRelativeImagePath(parts.join("/"));
            if (!rel) {
                sendJson(res, 400, {error: "invalid crop path"});
                return;
            }
            const filePath = path.join(datasetDir, rel);
            if (!fs.existsSync(filePath)) {
                sendJson(res, 404, {error: "crop not found"});
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            const type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
            res.writeHead(200, {"content-type": type, "cache-control": "no-store"});
            fs.createReadStream(filePath).pipe(res);
            return;
        }
        sendJson(res, 404, {error: "not found"});
    } catch (error) {
        sendJson(res, 500, {error: error.message || String(error)});
    }
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (!Number.isFinite(options.port) || options.port <= 0) {
        throw new Error("invalid --port");
    }
    ensureDatasetDirs(options.datasetDir);
    const server = http.createServer((req, res) => {
        handleRequest(req, res, options.datasetDir);
    });
    server.listen(options.port, options.host, () => {
        const url = `http://${options.host}:${options.port}/`;
        process.stdout.write(`AIDA star training reviewer: ${url}\n`);
        process.stdout.write(`Dataset: ${options.datasetDir}\n`);
    });
}

if (require.main === module) {
    main();
}
