import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, extname, join } from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const configPath = join(root, "lark-image-sync.config.json");

async function main() {
  const watch = process.argv.includes("--watch");
  const publish = process.argv.includes("--publish");
  const config = await loadConfig();

  if (watch) {
    await syncOnce(config, { publish });
    setInterval(() => {
      syncOnce(config, { publish }).catch((error) => {
        console.error(`[lark-image-sync] ${error.message}`);
      });
    }, config.pollSeconds * 1000);
    console.log(`[lark-image-sync] Watching every ${config.pollSeconds}s.`);
    return;
  }

  await syncOnce(config, { publish });
}

async function syncOnce(config, options = {}) {
  const state = await loadState(config.stateFile);
  const sheetResults = await readSheets(config);
  const entries = sheetResults.flatMap(({ rows, sheet }) => parseRows(rows, config, sheet));
  const styleMetadata = sheetResults.flatMap(({ rows, sheet }) => parseStyleMetadata(rows, config, sheet));
  const activeIds = new Set(entries.map((entry) => entry.sourceId).filter(Boolean));
  let changed = false;

  for (const entry of entries) {
    const existing = state.synced[entry.sourceId];
    let output = existing?.output;

    if (!existing) {
      const fileName = buildFileName(entry);
      const outputPath = join(root, config.outputDir, slugify(entry.productId), slugify(entry.styleId), fileName);
      await downloadImage(entry.token, outputPath, config.identity);
      output = relativePath(outputPath);
      console.log(`[lark-image-sync] Synced ${output}`);
    }

    const nextState = {
      output,
      token: entry.token,
      category: entry.category,
      productId: entry.productId,
      productName: entry.productName,
      styleId: entry.styleId,
      styleLabel: entry.styleLabel,
      order: entry.order,
      title: entry.title,
      fileName: entry.fileName,
      updatedAt: new Date().toISOString(),
    };

    if (!existing || hasStateChanged(existing, nextState)) {
      state.synced[entry.sourceId] = nextState;
      changed = true;
      if (existing) console.log(`[lark-image-sync] Updated metadata for ${output}`);
    }
  }

  if (config.pruneMissing) {
    for (const [sourceId, item] of Object.entries(state.synced)) {
      if (activeIds.has(sourceId)) continue;
      delete state.synced[sourceId];
      changed = true;
      if (item.output) await removeSyncedFile(item.output, config.outputDir);
      console.log(`[lark-image-sync] Removed stale image: ${item.output || sourceId}`);
    }
  }

  if (changed) {
    await saveState(config.stateFile, state);
    const dataChanged = await writeDataFile(config, state, styleMetadata);
    if (options.publish && dataChanged) await publishChanges(config);
  } else {
    const dataChanged = await writeDataFile(config, state, styleMetadata);
    if (dataChanged) {
      console.log("[lark-image-sync] Updated screenshot metadata.");
      if (options.publish) await publishChanges(config);
    } else {
      console.log("[lark-image-sync] No image changes.");
      if (options.publish) await pushPendingCommits();
    }
  }
}

function hasStateChanged(current, next) {
  return (
    current.output !== next.output ||
    current.token !== next.token ||
    current.category !== next.category ||
    current.productId !== next.productId ||
    current.productName !== next.productName ||
    current.styleId !== next.styleId ||
    current.styleLabel !== next.styleLabel ||
    Number(current.order || 0) !== Number(next.order || 0) ||
    current.title !== next.title ||
    current.fileName !== next.fileName
  );
}

async function writeDataFile(config, state, styleMetadata = []) {
  const groups = new Map();
  const baseData = await loadBaseData(config.baseDataFile);

  for (const style of baseData.styles || []) {
    if (!style.id || !style.label || !Array.isArray(style.screenshots)) continue;
    const key = `${style.productId || "haomai"}:${style.id}`;
    groups.set(key, {
      category: style.category || "",
      productId: style.productId || "haomai",
      id: style.id,
      label: style.label,
      screenshots: style.screenshots.map((item) => ({ ...item })),
    });
  }

  for (const style of styleMetadata) {
    const key = `${style.productId || "haomai"}:${style.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        category: style.category || "",
        productId: style.productId || "haomai",
        id: style.id,
        label: style.label,
        screenshots: [],
      });
    }

    const group = groups.get(key);
    group.category = style.category || group.category || "";
    group.label = style.label || group.label;

    for (const screenshot of style.screenshots || []) {
      const existing = group.screenshots.find((item) => Number(item.order || 0) === Number(screenshot.order || 0));
      if (existing && screenshot.title) existing.title = screenshot.title;
    }
  }

  for (const item of Object.values(state.synced)) {
    if (!item.output || !item.styleId || !item.styleLabel) continue;
    const key = `${item.productId || "haomai"}:${item.styleId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        category: item.category || "",
        productId: item.productId || "haomai",
        id: item.styleId,
        label: item.styleLabel,
        screenshots: [],
      });
    }

    const screenshots = groups.get(key).screenshots;
    const nextScreenshot = {
      title: item.title || item.fileName || basename(item.output),
      src: item.output,
      order: Number(item.order || 0),
      version: item.updatedAt || Date.now(),
    };
    const existingIndex = screenshots.findIndex((screenshot) => Number(screenshot.order || 0) === Number(item.order || 0));
    if (existingIndex >= 0) screenshots[existingIndex] = nextScreenshot;
    else screenshots.push(nextScreenshot);
  }

  const data = {
    version: new Date().toISOString(),
    styles: [...groups.values()].map((style) => ({
      ...style,
      screenshots: style.screenshots.sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    })),
  };

  const output = `${JSON.stringify(data, null, 2)}\n`;
  const current = await readExistingData(config.dataFile);
  if (current && normalizeDataForCompare(current) === normalizeDataForCompare(output)) return false;

  await mkdir(dirname(join(root, config.dataFile)), { recursive: true });
  await writeFile(join(root, config.dataFile), output);
  return true;
}

async function readExistingData(file) {
  try {
    return await readFile(join(root, file), "utf8");
  } catch {
    return "";
  }
}

function normalizeDataForCompare(raw) {
  try {
    const data = JSON.parse(raw);
    delete data.version;
    return JSON.stringify(data);
  } catch {
    return raw;
  }
}

async function loadBaseData(file) {
  if (!file) return { styles: [] };
  try {
    const raw = await readFile(join(root, file), "utf8");
    return JSON.parse(raw);
  } catch {
    return { styles: [] };
  }
}

async function publishChanges(config) {
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const files = await listPublishFiles(config);
  await publishFilesToGitHub({
    repo: config.githubRepo,
    files,
    deleteDirs: [config.outputDir],
    message: `Sync App Store preview images ${stamp}`,
  });
  console.log("[lark-image-sync] Published changes to GitHub Pages.");
}

async function pushPendingCommits() {
  return;
}

async function listPublishFiles(config) {
  const files = [config.baseDataFile, config.dataFile].filter(Boolean);
  try {
    files.push(...(await walkFiles(config.outputDir)));
  } catch {
    // No synced images yet.
  }
  return [...new Set(files)].sort();
}

async function walkFiles(dir) {
  const base = join(root, dir);
  const entries = await readdir(base, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

async function publishFilesToGitHub({ repo, files, deleteDirs, message }) {
  if (!repo) throw new Error("Config needs githubRepo to publish through GitHub API.");

  const ref = await ghApi(`repos/${repo}/git/ref/heads/main`);
  const headSha = ref.object.sha;
  const headCommit = await ghApi(`repos/${repo}/git/commits/${headSha}`);
  const remoteTree = await ghApi(`repos/${repo}/git/trees/${headCommit.tree.sha}?recursive=1`);
  const localPaths = new Set(files);
  const tree = [];

  for (const file of files) {
    const bytes = await readFile(join(root, file));
    const blob = await ghApi(`repos/${repo}/git/blobs`, "POST", {
      content: bytes.toString("base64"),
      encoding: "base64",
    });
    tree.push({
      path: file,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  for (const item of remoteTree.tree || []) {
    if (item.type !== "blob") continue;
    if (!deleteDirs.some((dir) => item.path.startsWith(`${dir}/`))) continue;
    if (localPaths.has(item.path)) continue;
    tree.push({
      path: item.path,
      mode: "100644",
      type: "blob",
      sha: null,
    });
  }

  const nextTree = await ghApi(`repos/${repo}/git/trees`, "POST", {
    base_tree: headCommit.tree.sha,
    tree,
  });

  if (nextTree.sha === headCommit.tree.sha) {
    console.log("[lark-image-sync] Nothing to publish.");
    return;
  }

  const nextCommit = await ghApi(`repos/${repo}/git/commits`, "POST", {
    message,
    tree: nextTree.sha,
    parents: [headSha],
  });

  await ghApi(`repos/${repo}/git/refs/heads/main`, "PATCH", {
    sha: nextCommit.sha,
    force: false,
  });
}

async function ghApi(path, method = "GET", payload = null) {
  const args = ["api", path];
  if (method !== "GET") args.push("--method", method);
  if (payload) args.push("--input", "-");
  const output = await run("gh", args, {
    cwd: root,
    input: payload ? JSON.stringify(payload) : undefined,
  });
  return JSON.parse(output);
}

async function loadConfig() {
  let raw;
  try {
    raw = await readFile(configPath, "utf8");
  } catch {
    throw new Error("Missing lark-image-sync.config.json.");
  }

  const config = JSON.parse(raw);
  if (!config.spreadsheetToken) throw new Error("Config needs spreadsheetToken.");
  if (!config.headerRow) config.headerRow = 1;
  if (!config.identity) config.identity = "user";
  if (!config.pollSeconds) config.pollSeconds = 10;
  if (!config.outputDir) config.outputDir = "images/lark";
  if (!config.baseDataFile) config.baseDataFile = "data/default-screenshots.json";
  if (!config.dataFile) config.dataFile = "data/screenshots.json";
  if (!config.stateFile) config.stateFile = ".sync/lark-image-state.json";
  if (!config.githubRepo) config.githubRepo = "A1m0nd-bao/haomai-app-store-preview";
  if (!config.defaultProductId) config.defaultProductId = "haomai";
  if (!config.defaultProductName) config.defaultProductName = "好麦 AI";
  if (config.pruneMissing == null) config.pruneMissing = true;
  if (!config.columns) config.columns = {};
  if (!config.columns.category) config.columns.category = "风格分类";
  if (!config.columns.styleId) config.columns.styleId = "风格ID";
  if (!config.columns.styleLabel) config.columns.styleLabel = "风格名称";
  if (!config.columns.order) config.columns.order = "排序";
  if (!config.columns.image) config.columns.image = "图片";
  if (!config.columns.title) config.columns.title = "标题";
  if (!config.columns.enabled) config.columns.enabled = "启用";
  if (!config.columns.productId) config.columns.productId = "产品ID";
  if (!config.columns.productName) config.columns.productName = "产品名称";
  if (!Array.isArray(config.sheets) || config.sheets.length === 0) {
    if (!config.sheetId) throw new Error("Config needs sheetId or sheets[].");
    config.sheets = [
      {
        sheetId: config.sheetId,
        range: config.range || "A1:G200",
        defaultProductId: config.defaultProductId,
        defaultProductName: config.defaultProductName,
      },
    ];
  }
  config.sheets = config.sheets.map((sheet) => ({
    range: "A1:H300",
    headerRow: config.headerRow,
    defaultProductId: config.defaultProductId,
    defaultProductName: config.defaultProductName,
    ...sheet,
  }));
  return config;
}

async function readSheets(config) {
  const results = [];

  for (const sheet of config.sheets) {
    const output = await run(
      "lark-cli",
      [
        "sheets",
        "+read",
        "--as",
        config.identity,
        "--spreadsheet-token",
        config.spreadsheetToken,
        "--sheet-id",
        sheet.sheetId,
        "--range",
        sheet.range,
      ],
      { cwd: root },
    );
    const data = JSON.parse(output);
    const rows = data.values || data.data?.valueRange?.values || data.data?.values || [];
    results.push({ rows, sheet });
  }

  return results;
}

function parseRows(rows, config, sheet = {}) {
  const headerIndex = Math.max(0, Number(sheet.headerRow || config.headerRow || 1) - 1);
  const headers = (rows[headerIndex] || []).map((cell) => normalizeCellText(cell));
  const columns = {
    category: findColumn(headers, config.columns.category),
    styleId: findColumn(headers, config.columns.styleId),
    styleLabel: findColumn(headers, config.columns.styleLabel),
    productId: findColumn(headers, config.columns.productId),
    productName: findColumn(headers, config.columns.productName),
    order: findColumn(headers, config.columns.order),
    image: findColumn(headers, config.columns.image),
    title: findColumn(headers, config.columns.title),
    enabled: findColumn(headers, config.columns.enabled),
  };

  if (columns.image < 0) throw new Error(`Cannot find image column "${config.columns.image}".`);

  let inheritedCategory = "";
  let inheritedStyleId = "";
  let inheritedStyleLabel = "";

  return rows.slice(headerIndex + 1).flatMap((row, index) => {
    const rowNumber = headerIndex + index + 2;
    const enabled = readCell(row, columns.enabled) || "是";
    if (["否", "no", "false", "0"].includes(enabled.toLowerCase())) return [];

    inheritedCategory = readCell(row, columns.category) || inheritedCategory;
    inheritedStyleId = readCell(row, columns.styleId) || inheritedStyleId;
    inheritedStyleLabel = readCell(row, columns.styleLabel) || inheritedStyleLabel;

    const styleId = inheritedStyleId;
    const styleLabel = inheritedStyleLabel;
    if (!styleId || !styleLabel) return [];

    return extractFileRefs(row[columns.image]).map((fileRef, refIndex) => ({
      rowNumber,
      sheetId: sheet.sheetId,
      category: inheritedCategory,
      productId: readCell(row, columns.productId) || sheet.defaultProductId || config.defaultProductId,
      productName: readCell(row, columns.productName) || sheet.defaultProductName || config.defaultProductName,
      styleId,
      styleLabel,
      order: Number(readCell(row, columns.order) || rowNumber),
      title: readCell(row, columns.title) || fileRef.name,
      token: fileRef.token,
      sourceId: `${sheet.sheetId || "sheet"}:${fileRef.token || fileRef.url}`,
      fileName: fileRef.name || `row-${rowNumber}-${refIndex + 1}.png`,
    }));
  });
}

function parseStyleMetadata(rows, config, sheet = {}) {
  const headerIndex = Math.max(0, Number(sheet.headerRow || config.headerRow || 1) - 1);
  const headers = (rows[headerIndex] || []).map((cell) => normalizeCellText(cell));
  const columns = {
    category: findColumn(headers, config.columns.category),
    styleId: findColumn(headers, config.columns.styleId),
    styleLabel: findColumn(headers, config.columns.styleLabel),
    productId: findColumn(headers, config.columns.productId),
    productName: findColumn(headers, config.columns.productName),
    order: findColumn(headers, config.columns.order),
    title: findColumn(headers, config.columns.title),
    enabled: findColumn(headers, config.columns.enabled),
  };
  const styles = new Map();
  let inheritedCategory = "";
  let inheritedStyleId = "";
  let inheritedStyleLabel = "";

  for (const row of rows.slice(headerIndex + 1)) {
    const enabled = readCell(row, columns.enabled) || "是";
    if (["否", "no", "false", "0"].includes(enabled.toLowerCase())) continue;

    inheritedCategory = readCell(row, columns.category) || inheritedCategory;
    inheritedStyleId = readCell(row, columns.styleId) || inheritedStyleId;
    inheritedStyleLabel = readCell(row, columns.styleLabel) || inheritedStyleLabel;

    if (!inheritedStyleId || !inheritedStyleLabel) continue;

    const productId = readCell(row, columns.productId) || sheet.defaultProductId || config.defaultProductId;
    const productName = readCell(row, columns.productName) || sheet.defaultProductName || config.defaultProductName;
    const key = `${productId}:${inheritedStyleId}`;
    if (!styles.has(key)) {
      styles.set(key, {
        category: inheritedCategory,
        productId,
        productName,
        id: inheritedStyleId,
        label: inheritedStyleLabel,
        screenshots: [],
      });
    }

    const order = Number(readCell(row, columns.order) || 0);
    const title = readCell(row, columns.title);
    if (order > 0 || title) {
      styles.get(key).screenshots.push({ order, title });
    }
  }

  return [...styles.values()];
}

function findColumn(headers, label) {
  return headers.findIndex((header) => header === String(label || "").trim());
}

function readCell(row, index) {
  if (index < 0) return "";
  return normalizeCellText(row[index]);
}

function normalizeCellText(cell) {
  if (cell == null) return "";
  if (typeof cell === "string" || typeof cell === "number") return String(cell).trim();
  if (Array.isArray(cell)) return cell.map(normalizeCellText).filter(Boolean).join(" ").trim();
  if (typeof cell === "object") {
    return [
      cell.text,
      cell.name,
      cell.file_name,
      cell.link,
      cell.url,
      cell.fileToken,
      cell.file_token,
      cell.token,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return String(cell).trim();
}

function extractFileRefs(cell) {
  const refs = [];
  const visit = (value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object") {
      const token = value.fileToken || value.file_token || value.token;
      const url = value.url || value.link;
      const name = value.name || value.file_name || value.text || "";
      if (token || url) refs.push({ token, url, name });
      Object.values(value).forEach(visit);
      return;
    }
  };
  visit(cell);
  return refs.filter((ref, index, list) => list.findIndex((item) => (item.token || item.url) === (ref.token || ref.url)) === index);
}

function buildFileName(entry) {
  const ext = [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extname(entry.fileName).toLowerCase())
    ? extname(entry.fileName).toLowerCase()
    : ".png";
  const hash = createHash("sha1").update(entry.sourceId || entry.token).digest("hex").slice(0, 8);
  return `${String(entry.order).padStart(2, "0")}-${slugify(entry.title || entry.fileName)}-${hash}${ext}`;
}

async function downloadImage(token, outputPath, identity) {
  await mkdir(dirname(outputPath), { recursive: true });
  await run(
    "lark-cli",
    [
      "api",
      "--as",
      identity,
      "GET",
      `/open-apis/drive/v1/medias/${token}/download`,
      "--output",
      outputPath,
    ],
    { cwd: root },
  );
}

async function removeSyncedFile(output, outputDir) {
  if (!output.startsWith(`./${outputDir}/`) && !output.startsWith(`${outputDir}/`)) return;
  await rm(join(root, output.replace(/^\.\//, "")), { force: true });
}

async function loadState(file) {
  try {
    const raw = await readFile(join(root, file), "utf8");
    const state = JSON.parse(raw);
    if (!state.synced) state.synced = {};
    return state;
  } catch {
    return { synced: {} };
  }
}

async function saveState(file, state) {
  const path = join(root, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
}

function relativePath(path) {
  return `./${path.replace(`${root}/`, "")}`;
}

function slugify(value) {
  return String(value || "untitled")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "untitled";
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || root,
      stdio: [options.input ? "pipe" : "ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    if (options.input) {
      child.stdin?.end(options.input);
    }
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with ${code}`));
    });
  });
}

main().catch((error) => {
  console.error(`[lark-image-sync] ${error.message}`);
  process.exit(1);
});
