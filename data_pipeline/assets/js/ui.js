
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
  logLines.push(`[${new Date().toLocaleTimeString("ar-MA")}] ${message}`);
  if (logLines.length > maxLogLines) logLines.shift();
  statusLog.innerHTML = logLines.join('<br>');
  statusLog.scrollTop = statusLog.scrollHeight;
}

function setSummaryOk(html) {
  summaryEl.className = "summary ok";
  summaryEl.innerHTML = html;
}

function setSummaryErr(html) {
  summaryEl.className = "summary err";
  summaryEl.innerHTML = html;
}

function clearSummary() {
  summaryEl.className = "summary";
  summaryEl.innerHTML = "";
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

// =========================
// منطق البحث والعملات (Tags)
// =========================
const symbolSearch = document.getElementById("symbolSearch");
const searchResults = document.getElementById("searchResults");
const selectedTagsContainer = document.getElementById("selectedTags");
const symbolsInput = document.getElementById("symbolsInput");
const symbolCountBadge = document.getElementById("symbolCount");

let allSymbols = [];
let selectedSymbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

async function initSymbolSearch() {
  try {
    // جلب القائمة الكاملة من Binance عند تحميل الصفحة
    allSymbols = await fetchAllSymbols();
    renderTags();
  } catch (err) {
    console.error("فشل جلب قائمة العملات:", err);
  }
}

function renderTags() {
  selectedTagsContainer.innerHTML = "";
  selectedSymbols.forEach(symbol => {
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.innerHTML = `
      ${symbol}
      <span class="tag-remove" onclick="removeSymbol('${symbol}')">×</span>
    `;
    selectedTagsContainer.appendChild(tag);
  });
  // تحديث الحقل المخفي لكي يقرأه ملف main.js
  symbolsInput.value = selectedSymbols.join(", ");
  symbolCountBadge.textContent = `${selectedSymbols.length} عملات`;
}

window.removeSymbol = function(symbol) {
  selectedSymbols = selectedSymbols.filter(s => s !== symbol);
  renderTags();
};

function addSymbol(symbol) {
  if (!selectedSymbols.includes(symbol)) {
    selectedSymbols.push(symbol);
    renderTags();
  }
  symbolSearch.value = "";
  searchResults.style.display = "none";
}

symbolSearch.addEventListener("input", (e) => {
  const query = e.target.value.trim().toUpperCase();
  if (!query) {
    searchResults.style.display = "none";
    return;
  }

  // فلترة العملات التي تبدأ بالاستعلام ولم يتم اختيارها بعد
  const filtered = allSymbols
    .filter(s => s.includes(query) && !selectedSymbols.includes(s))
    .slice(0, 10);

  if (filtered.length > 0) {
    searchResults.innerHTML = "";
    filtered.forEach(s => {
      const item = document.createElement("div");
      item.textContent = s;
      item.addEventListener("click", () => addSymbol(s));
      searchResults.appendChild(item);
    });
    searchResults.style.display = "block";
  } else {
    searchResults.style.display = "none";
  }
});

// إخفاء النتائج عند الضغط خارج صندوق البحث
document.addEventListener("click", (e) => {
  if (!symbolSearch.contains(e.target) && !searchResults.contains(e.target)) {
    searchResults.style.display = "none";
  }
});

initSymbolSearch();

