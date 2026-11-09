function initContentTabs() {
  const tabsRoot = document.querySelector(".tabs");
  const panels = Array.from(document.querySelectorAll(".panel"));

  if (!tabsRoot || panels.length === 0) {
    console.warn("Tabs initialization skipped: missing .tabs root or .panel sections.");
    return;
  }

  tabsRoot.replaceChildren();

  const isRtl = document.documentElement.dir === "rtl";
  const buttons = panels.map((panel, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab-btn";
    button.dataset.tab = String(index);
    button.textContent = panel.dataset.tabLabel || panel.querySelector("h2")?.textContent || "قسم";
    tabsRoot.appendChild(button);
    return button;
  });

  const maxIndex = buttons.length - 1;

  function activateTab(targetIndex, focusButton = false) {
    if (targetIndex < 0 || targetIndex > maxIndex) return;

    buttons.forEach((button, index) => {
      const isActive = index === targetIndex;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
      button.tabIndex = isActive ? 0 : -1;
      if (isActive) {
        if (tabsRoot.scrollWidth > tabsRoot.clientWidth + 8) {
          button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
      }
    });

    panels.forEach((panel, index) => {
      const isActive = index === targetIndex;
      panel.classList.toggle("active", isActive);
      panel.hidden = !isActive;
    });

    if (focusButton) {
      buttons[targetIndex].focus();
    }

    document.dispatchEvent(
      new CustomEvent("content:tab-change", {
        detail: {
          index: targetIndex,
          label: panels[targetIndex]?.dataset.tabLabel || "",
        },
      })
    );
  }

  buttons.forEach((button, index) => {
    const panel = panels[index];
    const tabId = "tab-" + index;
    const panelId = "panel-" + index;

    button.id = tabId;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", panelId);

    panel.id = panelId;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tabId);

    button.addEventListener("click", () => activateTab(index));
    button.addEventListener("keydown", (event) => {
      const currentIndex = index;
      let nextIndex = null;

      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = maxIndex;

      if (event.key === "ArrowRight") {
        nextIndex = isRtl
          ? (currentIndex - 1 + maxIndex + 1) % (maxIndex + 1)
          : (currentIndex + 1) % (maxIndex + 1);
      }

      if (event.key === "ArrowLeft") {
        nextIndex = isRtl
          ? (currentIndex + 1) % (maxIndex + 1)
          : (currentIndex - 1 + maxIndex + 1) % (maxIndex + 1);
      }

      if (nextIndex !== null) {
        event.preventDefault();
        activateTab(nextIndex, true);
      }
    });
  });

  const initialIndex = Math.max(
    0,
    panels.findIndex((panel) => panel.classList.contains("active"))
  );
  activateTab(initialIndex);
}

const WATCHLIST_STORAGE_KEY = "crypto_watchlist_symbols_v1";
const WATCHLIST_STORAGE_KEY_LEGACY = "crepto_watchlist_symbols_v1";
const SHARED = window.CreptoShared || {};
const migrateStorageKey = SHARED.migrateStorageKey || function migrateStorageKeyFallback(newKey, legacyKey) {
  const hasNew = localStorage.getItem(newKey) !== null;
  const legacy = localStorage.getItem(legacyKey);
  if (!hasNew && legacy !== null) localStorage.setItem(newKey, legacy);
};
const symbolLabel = SHARED.symbolLabel || function symbolLabelFallback(symbol) {
  return String(symbol || "").replace(/USDT$/, "");
};
const normalizeSymbol = SHARED.normalizeSymbol || function normalizeSymbolFallback(input) {
  const cleaned = String(input || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return "";
  if (cleaned.endsWith("USDT")) return cleaned;
  return `${cleaned}USDT`;
};
const isValidSymbol = SHARED.isValidSymbol || function isValidSymbolFallback(symbol) {
  return /^[A-Z0-9]{2,20}USDT$/.test(String(symbol || ""));
};

function loadWatchlistSymbols() {
  migrateStorageKey(WATCHLIST_STORAGE_KEY, WATCHLIST_STORAGE_KEY_LEGACY);
  try {
    const parsed = JSON.parse(localStorage.getItem(WATCHLIST_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map(normalizeSymbol).filter(isValidSymbol))];
  } catch {
    return [];
  }
}

function saveWatchlistSymbols(symbols) {
  localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(symbols));
}

function createHeaderSymbolTab(symbol, { custom = false, active = false } = {}) {
  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = `stab${active ? " active" : ""}`;
  tab.dataset.sym = symbol;
  if (custom) tab.dataset.custom = "true";

  const name = document.createElement("span");
  name.className = "sn";
  name.textContent = symbolLabel(symbol);

  const price = document.createElement("span");
  price.className = "sp";
  price.id = `p-${symbol}`;
  price.textContent = "—";

  const change = document.createElement("span");
  change.className = "sc";
  change.id = `c-${symbol}`;
  change.textContent = "—";

  tab.append(name, price, change);
  if (!custom) return tab;

  const wrap = document.createElement("div");
  wrap.className = "wl-tab-wrap";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "wl-remove";
  remove.dataset.remove = "true";
  remove.dataset.sym = symbol;
  remove.setAttribute("aria-label", `حذف ${symbolLabel(symbol)}`);
  remove.title = "حذف";
  remove.textContent = "×";

  wrap.append(tab, remove);
  return wrap;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) {
    const compact = new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 4,
      minimumFractionDigits: 4,
    }).format(value);
    return `$${compact}`;
  }
  const digits = 4;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function updateSymbolChip(symbol, price, changePct) {
  const priceEl = document.getElementById(`p-${symbol}`);
  const changeEl = document.getElementById(`c-${symbol}`);
  if (!priceEl || !changeEl) return;

  priceEl.textContent = formatPrice(price);
  if (Number.isFinite(changePct)) {
    changeEl.textContent = `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`;
    changeEl.className = `sc ${changePct >= 0 ? "up" : "dn"}`;
  } else {
    changeEl.textContent = "—";
    changeEl.className = "sc";
  }
}

function initHeaderWatchlistAndPrices() {
  const symTabsRoot = document.getElementById("symTabs");
  const watchlistTabsRoot = document.getElementById("watchlistTabs");
  const wlInput = document.getElementById("wlInput");

  if (!symTabsRoot || !watchlistTabsRoot) return;

  const staticSymbols = Array.from(symTabsRoot.querySelectorAll(".stab[data-sym]:not([data-custom='true'])"))
    .map((tab) => normalizeSymbol(tab.dataset.sym))
    .filter(isValidSymbol);

  let customSymbols = loadWatchlistSymbols().filter((sym) => !staticSymbols.includes(sym));
  let activeSymbol = "";

  function getAllHeaderTabs() {
    return Array.from(symTabsRoot.querySelectorAll(".stab[data-sym]"));
  }

  function getTrackedSymbols() {
    return [...new Set(getAllHeaderTabs().map((tab) => normalizeSymbol(tab.dataset.sym)).filter(isValidSymbol))];
  }

  function setActiveSymbol(symbol) {
    const target = normalizeSymbol(symbol);
    const tabs = getAllHeaderTabs();
    let selected = "";
    tabs.forEach((tab) => {
      const tabSymbol = normalizeSymbol(tab.dataset.sym);
      const isActive = tabSymbol === target;
      tab.classList.toggle("active", isActive);
      if (isActive) selected = tabSymbol;
    });
    if (!selected && tabs.length > 0) {
      tabs[0].classList.add("active");
      selected = normalizeSymbol(tabs[0].dataset.sym);
    }

    if (selected && selected !== activeSymbol) {
      activeSymbol = selected;
      document.dispatchEvent(
        new CustomEvent("header:symbol-change", { detail: { symbol: activeSymbol } })
      );
    }
  }

  function getCurrentActiveSymbol() {
    const activeTab = symTabsRoot.querySelector(".stab.active[data-sym]");
    return normalizeSymbol(activeTab?.dataset.sym || staticSymbols[0] || "");
  }

  function renderWatchlistTabs(activeSymbol = getCurrentActiveSymbol()) {
    const nodes = customSymbols.map((sym) =>
      createHeaderSymbolTab(sym, {
        custom: true,
        active: normalizeSymbol(sym) === normalizeSymbol(activeSymbol),
      })
    );
    watchlistTabsRoot.replaceChildren(...nodes);
    setActiveSymbol(activeSymbol);
    document.dispatchEvent(
      new CustomEvent("header:symbol-list-change", { detail: { symbols: getTrackedSymbols() } })
    );
  }

  async function loadPricesFor(symbols) {
    if (!Array.isArray(symbols) || symbols.length === 0) return;
    try {
      const symbolsParam = encodeURIComponent(JSON.stringify(symbols));
      const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbolsParam}`);
      if (!res.ok) throw new Error(`REST ${res.status}`);
      const payload = await res.json();
      if (!Array.isArray(payload)) throw new Error("Unexpected REST payload");

      payload.forEach((item) => {
        const symbol = normalizeSymbol(item?.symbol);
        if (!isValidSymbol(symbol)) return;
        const price = Number(item.lastPrice);
        const chg = Number(item.priceChangePercent);
        updateSymbolChip(symbol, price, chg);
      });
    } catch (error) {
      console.warn("Header prices refresh failed:", error);
    }
  }

  let trackedSymbolSet = new Set();
  function syncTrackedSymbols() {
    trackedSymbolSet = new Set(getTrackedSymbols());
  }

  function tryAddCustomSymbol(rawInput) {
    const symbol = normalizeSymbol(rawInput);
    if (!isValidSymbol(symbol)) return;

    if (staticSymbols.includes(symbol) || customSymbols.includes(symbol)) {
      setActiveSymbol(symbol);
      return;
    }

    customSymbols = [...customSymbols, symbol];
    saveWatchlistSymbols(customSymbols);
    renderWatchlistTabs(symbol);
    syncTrackedSymbols();
    connectWs(true);
    loadPricesFor([symbol]);
  }

  renderWatchlistTabs();
  syncTrackedSymbols();
  loadPricesFor([...trackedSymbolSet]);

  if (wlInput) {
    wlInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const value = wlInput.value;
      wlInput.value = "";
      tryAddCustomSymbol(value);
    });

    wlInput.addEventListener("change", () => {
      const value = wlInput.value;
      wlInput.value = "";
      tryAddCustomSymbol(value);
    });
  }

  symTabsRoot.addEventListener("click", (event) => {
    const removeButton = event.target.closest(".wl-remove[data-remove='true']");
    if (removeButton) {
      const symbol = normalizeSymbol(removeButton.dataset.sym || "");
      if (!symbol) return;
      const tab = symTabsRoot.querySelector(`.stab[data-custom='true'][data-sym="${symbol}"]`);
      const wasActive = !!tab?.classList.contains("active");
      customSymbols = customSymbols.filter((s) => s !== symbol);
      saveWatchlistSymbols(customSymbols);
      renderWatchlistTabs(wasActive ? staticSymbols[0] : getCurrentActiveSymbol());
      syncTrackedSymbols();
      connectWs(true);
      return;
    }

    const tab = event.target.closest(".stab[data-sym]");
    if (!tab) return;
    setActiveSymbol(tab.dataset.sym);
  });

  let reconnectTimer = null;
  let socket = null;
  let socketIntentionalClose = false;
  let socketSymbolsKey = "";

  function disconnectWs(intentional = true) {
    socketIntentionalClose = intentional;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.close();
      socket = null;
    }
  }

  function connectWs(force = false) {
    const symbols = [...trackedSymbolSet].filter(isValidSymbol).sort();
    const nextSymbolsKey = symbols.join(",");

    if (!symbols.length) {
      socketSymbolsKey = "";
      disconnectWs(true);
      return;
    }

    if (
      !force &&
      socket &&
      socketSymbolsKey === nextSymbolsKey &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    disconnectWs(true);
    socketIntentionalClose = false;
    socketSymbolsKey = nextSymbolsKey;

    const streams = symbols.map((sym) => `${sym.toLowerCase()}@ticker`).join("/");
    const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
    socket = ws;

    ws.addEventListener("message", (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      const tick = payload?.data && typeof payload.data === "object" ? payload.data : payload;
      const symbol = normalizeSymbol(tick?.s || tick?.symbol);
      if (!trackedSymbolSet.has(symbol)) return;

      const price = Number(tick?.c ?? tick?.lastPrice);
      const chg = Number(tick?.P ?? tick?.priceChangePercent);
      updateSymbolChip(symbol, price, chg);
    });

    ws.addEventListener("close", () => {
      if (ws !== socket) return;
      socket = null;
      if (socketIntentionalClose) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connectWs(true), 2000);
    });

    ws.addEventListener("error", () => {
      ws.close();
    });
  }

  connectWs(true);
  window.addEventListener("beforeunload", () => disconnectWs(true));
}


function bootstrapApp() {
  if (window.__creptoAppBootstrapped) return;
  window.__creptoAppBootstrapped = true;

  initContentTabs();
  initHeaderWatchlistAndPrices();

  if (typeof initDashboardChart === "function") {
    initDashboardChart();
  } else {
    console.warn("Chart bootstrap: initDashboardChart() is not ready yet.");
    window.addEventListener(
      "load",
      () => {
        if (typeof initDashboardChart === "function") initDashboardChart();
      },
      { once: true }
    );
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const isLocalHost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!window.isSecureContext && !isLocalHost) return;

  navigator.serviceWorker
    .register("./service-worker.js", { scope: "./" })
    .catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
}

registerServiceWorker();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapApp, { once: true });
} else {
  bootstrapApp();
}

