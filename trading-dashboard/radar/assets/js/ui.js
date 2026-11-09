
// =========================
// واجهة المستخدم والأدوات العامة
// =========================
const buildBtn = document.getElementById("buildBtn");
const clearBtn = document.getElementById("clearBtn");
const copyPromptBtn = document.getElementById("copyPromptBtn");
const copyFastPromptBtn = document.getElementById("copyFastPromptBtn");
const copyPrompt2Btn = document.getElementById("copyPrompt2Btn");
const statusLog = document.getElementById("statusLog");
const summaryEl = document.getElementById("summary");
const progressWrap = document.getElementById("progressWrap");
const progressCount = document.getElementById("progressCount");
const progressBarFill = document.getElementById("progressBarFill");
const symbolsInput = document.getElementById("symbolsInput");
const radarSymbol = document.getElementById("radarSymbol");

let globalTimeOffset = 0;

function getServerTime() {
  return Date.now() + globalTimeOffset;
}

function nowIso() {
  return new Date(getServerTime()).toISOString();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const maxLogLines = 100;
const logLines = [];

function appendStatus(message) {
  const timeStr = new Date().toLocaleTimeString("ar-MA");
  statusLog.innerHTML = `[${timeStr}] ${message}`;
}

function setSummaryOk(html) {
  summaryEl.className = "summary ok";
  summaryEl.innerHTML = html;
  summaryEl.style.display = "block";
}

function setSummaryErr(html) {
  summaryEl.className = "summary err";
  summaryEl.innerHTML = html;
  summaryEl.style.display = "block";
}

function clearSummary() {
  summaryEl.className = "summary";
  summaryEl.innerHTML = "";
  summaryEl.style.display = "none";
}

function updateProgress(current, total) {
  const safeTotal = total > 0 ? total : 0;
  const pct = safeTotal > 0 ? (current / safeTotal) * 100 : 0;
  progressCount.textContent = `${current}/${total}`;
  progressBarFill.style.width = `${pct}%`;
}

function resetProgress() {
  updateProgress(0, 0);
  progressWrap.style.display = "none";
}

function safeJsonStringify(obj) {
  return JSON.stringify(obj, null, 2);
}

function countCsvRows(csvText) {
  if (!csvText) return 0;
  const lines = csvText.split("\n");
  return Math.max(0, lines.length - 1);
}

resetProgress();

function updateActiveSymbol(symbol) {
  if (!symbol) return;
  const sym = symbol.toUpperCase();
  if (symbolsInput) symbolsInput.value = sym;
  if (radarSymbol) radarSymbol.textContent = sym;
  appendStatus(`تزامن العملة: ${sym}`);
}
