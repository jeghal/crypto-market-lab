import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const rootDir = process.cwd();
const scriptFiles = [
  "assets/js/vendor/jszip.min.js",
  "assets/js/ui.js",
  "assets/js/api.js",
  "assets/js/transforms.js",
  "assets/js/collectors.js",
  "assets/js/main.js"
];

const elements = new Map();
const blobStore = new Map();
const savedBundleFiles = [];
const pendingWrites = [];
let blobCounter = 0;

function makeElement(id = "") {
  return {
    id,
    style: {},
    className: "",
    innerHTML: "",
    textContent: "",
    disabled: false,
    scrollTop: 0,
    scrollHeight: 0,
    listeners: {},
    addEventListener(event, handler) {
      this.listeners[event] = handler;
    },
    remove() {}
  };
}

function getOrCreateElement(id) {
  if (!elements.has(id)) {
    elements.set(id, makeElement(id));
  }
  return elements.get(id);
}

globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.document = {
  getElementById(id) {
    return getOrCreateElement(id);
  },
  body: {
    appendChild() {},
    removeChild() {}
  },
  createElement(tagName) {
    if (String(tagName).toLowerCase() !== "a") {
      return makeElement();
    }
    return {
      href: "",
      download: "",
      click() {
        const blob = blobStore.get(this.href);
        if (!blob) return;
        const writePromise = blob
          .arrayBuffer()
          .then((ab) => fs.writeFile(path.join(rootDir, this.download), Buffer.from(ab)))
          .then(() => savedBundleFiles.push(this.download));
        pendingWrites.push(writePromise);
      },
      remove() {}
    };
  }
};

const NativeURL = globalThis.URL;
NativeURL.createObjectURL = (blob) => {
  const key = `blob:local-${++blobCounter}`;
  blobStore.set(key, blob);
  return key;
};
NativeURL.revokeObjectURL = (key) => {
  blobStore.delete(key);
};

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    userAgent: "node",
    clipboard: {
      async writeText() {}
    }
  }
});

const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) => {
  if (typeof input === "string" && input.includes("/exchangeInfo?symbols=[")) {
    const marker = "symbols=";
    const idx = input.indexOf(marker);
    if (idx !== -1) {
      const head = input.slice(0, idx + marker.length);
      const tail = input.slice(idx + marker.length);
      return nativeFetch(`${head}${encodeURIComponent(tail)}`, init);
    }
  }
  return nativeFetch(input, init);
};

globalThis.alert = (msg) => {
  console.error(`[alert] ${msg}`);
};

for (const relPath of scriptFiles) {
  const absPath = path.join(rootDir, relPath);
  const source = await fs.readFile(absPath, "utf8");
  vm.runInThisContext(source, { filename: absPath });
}

if (typeof globalThis.buildMarketBundle !== "function") {
  throw new Error("buildMarketBundle is not available.");
}

await globalThis.buildMarketBundle();
await Promise.all(pendingWrites);

if (savedBundleFiles.length === 0) {
  const statusLog = getOrCreateElement("statusLog")?.innerHTML || "";
  const summary = getOrCreateElement("summary")?.innerHTML || "";
  throw new Error(
    `No market bundle was generated.\nStatusLog:\n${statusLog}\nSummary:\n${summary}`
  );
}

const bundleName = savedBundleFiles[savedBundleFiles.length - 1];
const bundlePath = path.join(rootDir, bundleName);
const zipBuffer = await fs.readFile(bundlePath);
const zip = await globalThis.JSZip.loadAsync(zipBuffer);

const requiredPerSymbol = [
  "klines_1d.csv",
  "klines_4h.csv",
  "klines_1h.csv",
  "klines_15m.csv",
  "ticker_24h.json",
  "book_ticker.json",
  "recent_trades.csv",
  "orderbook_snapshots.csv",
  "derived_metrics.json",
  "execution_check.json",
  "metadata.json",
  "final_market_snapshot.json"
];
const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const failures = [];

function isFiniteNumber(v) {
  return Number.isFinite(Number(v));
}

function isStepAligned(value, step) {
  const n = Number(value);
  const s = Number(step);
  if (!Number.isFinite(n) || !Number.isFinite(s) || s <= 0) return true;
  const ratio = n / s;
  return Math.abs(ratio - Math.round(ratio)) < 1e-8;
}

const manifestText = await zip.file("manifest.json")?.async("string");
if (!manifestText) {
  failures.push("manifest.json is missing");
}

let manifest = null;
if (manifestText) {
  manifest = JSON.parse(manifestText);
  if (!manifest?.final_market_snapshot?.included) {
    failures.push("manifest.final_market_snapshot.included is not true");
  }
}

for (const symbol of symbols) {
  for (const fileName of requiredPerSymbol) {
    const fullPath = `${symbol}/${fileName}`;
    if (!zip.file(fullPath)) {
      failures.push(`missing file: ${fullPath}`);
    }
  }

  const derivedText = await zip.file(`${symbol}/derived_metrics.json`)?.async("string");
  const metadataText = await zip.file(`${symbol}/metadata.json`)?.async("string");
  const finalSnapText = await zip.file(`${symbol}/final_market_snapshot.json`)?.async("string");

  if (!derivedText || !metadataText || !finalSnapText) {
    continue;
  }

  const derived = JSON.parse(derivedText);
  const metadata = JSON.parse(metadataText);
  const finalSnap = JSON.parse(finalSnapText);

  const allLevels = [
    ...(derived?.support_resistance_candidates?.supports || []),
    ...(derived?.support_resistance_candidates?.resistances || [])
  ];
  for (const level of allLevels) {
    const first = level?.first_seen_time ? Date.parse(level.first_seen_time) : NaN;
    const last = level?.last_seen_time ? Date.parse(level.last_seen_time) : NaN;
    if (Number.isFinite(first) && Number.isFinite(last) && first > last) {
      failures.push(`${symbol}: first_seen_time > last_seen_time`);
      break;
    }
  }

  const _tickSize = metadata?.execution_rules?.tickSize;
  const _alignedExampleCheck = isStepAligned(finalSnap?.summary?.latest_price, _tickSize);
}

const report = {
  generated_bundle: bundleName,
  generated_at: new Date().toISOString(),
  checks: {
    required_files: failures.filter((f) => f.startsWith("missing file:")).length === 0,
    level_time_order: !failures.some((f) => f.includes("first_seen_time > last_seen_time")),
    manifest_final_snapshot: !failures.includes("manifest.final_market_snapshot.included is not true")
  },
  failures
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) {
  process.exitCode = 1;
}
