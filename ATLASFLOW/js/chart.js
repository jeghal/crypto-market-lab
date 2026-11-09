function initDashboardChart() {
  const canvas = document.getElementById("cv");
  const tooltip = document.getElementById("tt");
  const card = document.querySelector(".card-chart");
  const ivTabs = document.getElementById("ivTabs");
  const candleCount = document.getElementById("candleCount");
  const symbolSelect = document.getElementById("chartSymbolSelect");
  const spanIndicator = document.getElementById("chartSpanIndicator");

  const btns = {
    grid: document.getElementById("togGrid"),
    ema: document.getElementById("togEMA"),
    vwap: document.getElementById("togVWAP"),
    bb: document.getElementById("togBB"),
    vol: document.getElementById("togVol"),
    sr: document.getElementById("togSR"),
    tl: document.getElementById("togTL"),
    fib: document.getElementById("togFib"),
    vp: document.getElementById("togVP"),
    trade: document.getElementById("togTrade"),
    tradeZones: document.getElementById("togTradeZones"),
    addLevel: document.getElementById("btnAddLevel"),
    fs: document.getElementById("btnFullscreen"),
    capture: document.getElementById("btnCapture"),
  };
  if (!canvas || !ivTabs || !candleCount || !symbolSelect || !spanIndicator) {
    console.warn("Chart init failed: missing required DOM nodes");
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.warn("Chart init failed: 2D canvas context is unavailable");
    return;
  }

  const PREFS_KEY = "crypto_chart_prefs_v1";
  const PREFS_KEY_LEGACY = "crepto_chart_prefs_v1";
  const LEVELS_KEY = "crypto_chart_levels_v1";
  const LEVELS_KEY_LEGACY = "crepto_chart_levels_v1";
  const CHART = window.CreptoChart || {};
  const SHARED = window.CreptoShared || {};
  const migrateStorageKey = SHARED.migrateStorageKey || function migrateStorageKeyFallback(newKey, legacyKey) {
    const hasNew = localStorage.getItem(newKey) !== null;
    const legacy = localStorage.getItem(legacyKey);
    if (!hasNew && legacy !== null) localStorage.setItem(newKey, legacy);
  };
  const normalizeIntervalLabel = SHARED.normalizeIntervalLabel || function normalizeIntervalLabelFallback(interval) {
    const v = String(interval || "").trim();
    if (!v) return "1d";
    if (v === "1M") return "1m";
    const low = v.toLowerCase();
    if (low === "1mo") return "1m";
    return low;
  };
  const toApiInterval = SHARED.toApiInterval || function toApiIntervalFallback(interval) {
    const iv = normalizeIntervalLabel(interval);
    return iv === "1m" ? "1M" : iv;
  };
  const fromApiInterval = SHARED.fromApiInterval || function fromApiIntervalFallback(interval) {
    return normalizeIntervalLabel(interval);
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
  const symbolLabel = SHARED.symbolLabel || function symbolLabelFallback(symbol) {
    return String(symbol || "").replace(/USDT$/, "");
  };
  const clamp = SHARED.clamp || function clampFallback(v, min, max) {
    return Math.max(min, Math.min(max, v));
  };

  migrateStorageKey(PREFS_KEY, PREFS_KEY_LEGACY);
  migrateStorageKey(LEVELS_KEY, LEVELS_KEY_LEGACY);

  function isSupportedInterval(interval) {
    const iv = normalizeIntervalLabel(interval);
    return iv === "5m" || iv === "15m" || iv === "1h" || iv === "4h" || iv === "1d" || iv === "1w" || iv === "1m";
  }

  const S = {
    symbol: normalizeSymbol(document.querySelector(".stab.active[data-sym]")?.dataset.sym || "BTCUSDT"),
    interval: normalizeIntervalLabel(ivTabs.querySelector(".itab.active")?.dataset.iv || "1d"),
    limit: Number(candleCount.value) || 100,
    candles: [],
    ema7: [],
    ema21: [],
    ema50: [],
    vwap: [],
    bbU: [],
    bbM: [],
    bbL: [],
    sr: { supports: [], resistances: [] },
    fib: [],
    vp: null,
    tradePlan: null,
    trendlines: [],
    pendingTL: null,
    cursorTL: null,
    levels: [],
    deleteZones: [],
    hoverIndex: null,
    hoverY: -1,
    hoverLevel: -1,
    dragLevel: -1,
    touchDragging: false,
    metrics: null,
    fetching: false,
    redrawQueued: false,
    pointerMoveQueued: false,
    pendingPointer: null,
    redrawLastTs: 0,
    tipRows: null,
    tipLastIdx: -1,
    tipLastTs: 0,
    seriesBounds: null,
    ws: null,
    wsRetry: null,
    wsIntentional: false,
    aborter: null,
    realtimePrice: NaN,
    realtimeTs: 0,
    mtf: {},
    mtfFetching: false,
    mtfAborter: null,
    mtfReqId: 0,
    layers: {
      grid: true, ema: true, vwap: false, bb: false, vol: true, sr: true, tl: false, fib: false,
      vp: false, trade: true, tradeZones: true,
    },
  };

  function isPlainObject(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }
  function parseJson(key, fallback, validator = null) {
    try {
      const x = JSON.parse(localStorage.getItem(key) || "null");
      if (validator) return validator(x) ? x : fallback;
      if (Array.isArray(fallback)) return Array.isArray(x) ? x : fallback;
      if (isPlainObject(fallback)) return isPlainObject(x) ? x : fallback;
      if (x === null || x === undefined) return fallback;
      return typeof x === typeof fallback ? x : fallback;
    } catch {
      return fallback;
    }
  }
  function finiteSeriesBounds(arr) {
    if (!Array.isArray(arr) || !arr.length) return null;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < arr.length; i += 1) {
      const v = arr[i];
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
  }
  function mergeBounds(currentMin, currentMax, mm) {
    if (!mm || !Number.isFinite(mm.min) || !Number.isFinite(mm.max)) return { min: currentMin, max: currentMax };
    return {
      min: Math.min(currentMin, mm.min),
      max: Math.max(currentMax, mm.max),
    };
  }
  function suggestedCandleLimit(interval) {
    const iv = normalizeIntervalLabel(interval);
    if (iv === "5m") return 30;
    if (iv === "15m") return 50;
    if (iv === "1h") return 80;
    if (iv === "4h") return 100;
    if (iv === "1d") return 150;
    if (iv === "1w" || iv === "1m") return 200;
    return 100;
  }
  function applyAutoCandleLimit(interval) {
    const nextLimit = clamp(suggestedCandleLimit(interval), 10, 400);
    S.limit = nextLimit;
    if (String(candleCount.value) !== String(nextLimit)) {
      candleCount.value = String(nextLimit);
    }
  }
  function priceLabel(v) {
    if (typeof CHART.priceLabel === "function") return CHART.priceLabel(v);
    if (!Number.isFinite(v)) return "-";
    const d = v >= 100 ? 2 : v >= 1 ? 3 : 5;
    return `$${v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  }
  function formatSpan(ms) {
    if (typeof CHART.formatSpan === "function") return CHART.formatSpan(ms);
    if (!Number.isFinite(ms) || ms <= 0) return "-";
    const MIN = 60 * 1000;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;
    const YEAR = 365 * DAY;

    if (ms < HOUR) {
      const mins = Math.max(1, Math.round(ms / MIN));
      return `${mins}m`;
    }
    if (ms < DAY) {
      const hours = Math.floor(ms / HOUR);
      const mins = Math.floor((ms % HOUR) / MIN);
      return mins ? `${hours}h ${mins}m` : `${hours}h`;
    }
    if (ms < WEEK) {
      const days = Math.floor(ms / DAY);
      const hours = Math.floor((ms % DAY) / HOUR);
      return hours ? `${days}d ${hours}h` : `${days}d`;
    }
    if (ms < MONTH) {
      const weeks = Math.floor(ms / WEEK);
      const days = Math.floor((ms % WEEK) / DAY);
      return days ? `${weeks}w ${days}d` : `${weeks}w`;
    }
    if (ms < YEAR) {
      const months = Math.floor(ms / MONTH);
      const weeks = Math.floor((ms % MONTH) / WEEK);
      return weeks ? `${months}mo ${weeks}w` : `${months}mo`;
    }

    const years = Math.floor(ms / YEAR);
    const months = Math.floor((ms % YEAR) / MONTH);
    return months ? `${years}y ${months}mo` : `${years}y`;
  }
  function fmtAxisDate(ts, iv) {
    if (typeof CHART.fmtAxisDate === "function") return CHART.fmtAxisDate(ts, iv);
    const d = new Date(ts);
    const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const dm = `${d.getDate()}/${d.getMonth() + 1}`;
    const nIv = normalizeIntervalLabel(iv);
    if (nIv === "5m" || nIv === "15m" || nIv === "1h" || nIv === "4h") return { line1: hm, line2: dm };
    return { line1: dm, line2: null };
  }
  function levelKey() { return `${S.symbol}__${S.interval}`; }
  function savePrefs() { localStorage.setItem(PREFS_KEY, JSON.stringify({ layers: S.layers })); }
  function saveLevels() {
    const all = parseJson(LEVELS_KEY, {}, isPlainObject);
    all[levelKey()] = [...new Set(S.levels.map(Number).filter(Number.isFinite))].sort((a, b) => a - b).slice(0, 20);
    localStorage.setItem(LEVELS_KEY, JSON.stringify(all));
  }
  function loadPrefs() {
    const p = parseJson(PREFS_KEY, {}, (x) => isPlainObject(x) && (!("layers" in x) || isPlainObject(x.layers)));
    if (p.layers && isPlainObject(p.layers)) {
      Object.keys(S.layers).forEach((k) => { if (typeof p.layers[k] === "boolean") S.layers[k] = p.layers[k]; });
    }
  }
  function loadLevels() {
    const all = parseJson(LEVELS_KEY, {}, isPlainObject);
    const arr = all[levelKey()];
    S.levels = Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite).slice(0, 20) : [];
    S.hoverLevel = -1;
    S.dragLevel = -1;
  }
  function toggleBtn(button, on) { if (button) button.classList.toggle("on", !!on); }
  function syncToggleButtons() {
    Object.keys(S.layers).forEach((k) => toggleBtn(btns[k], S.layers[k]));
    if (card) card.classList.toggle("tl-mode", S.layers.tl);
    if (canvas) canvas.style.cursor = S.layers.tl ? "cell" : "crosshair";
  }
  function toCandleRow(a) {
    if (typeof CHART.toCandleRow === "function") return CHART.toCandleRow(a);
    return { t: Number(a[0]), o: Number(a[1]), h: Number(a[2]), l: Number(a[3]), c: Number(a[4]), v: Number(a[5]) };
  }
  function normalizeTradePlan(plan) {
    if (typeof CHART.normalizeTradePlan === "function") return CHART.normalizeTradePlan(plan);
    if (!plan) return null;
    return {
      direction: plan.direction || "long",
      planType: plan.planType || "preview",
      entry: Number(plan.entry),
      stop: Number(plan.stop),
      target: Number(plan.target),
      rr: Number(plan.rr),
    };
  }
  function buildFrameSnapshot(candles, interval) {
    if (typeof CHART.buildFrameSnapshot === "function") return CHART.buildFrameSnapshot(candles, interval);
    if (!Array.isArray(candles) || !candles.length) {
      return {
        interval,
        candles: [],
        ema7: [],
        ema21: [],
        ema50: [],
        sr: { supports: [], resistances: [] },
        tradePlan: null,
      };
    }

    const closes = candles.map((c) => c.c);
    const ema7v = ema(closes, 7);
    const ema21v = ema(closes, 21);
    const ema50v = ema(closes, 50);
    const levels = sr(candles);
    const plan = tradePlan(candles, levels);

    return {
      interval,
      candles: candles.slice(-140).map((c) => ({ ...c })),
      ema7: ema7v.slice(-140),
      ema21: ema21v.slice(-140),
      ema50: ema50v.slice(-140),
      sr: {
        supports: (levels?.supports || []).map((x) => ({ idx: x.idx, price: Number(x.price) })),
        resistances: (levels?.resistances || []).map((x) => ({ idx: x.idx, price: Number(x.price) })),
      },
      tradePlan: normalizeTradePlan(plan),
    };
  }
  async function fetchFrameSnapshot(symbol, interval, limit, signal) {
    if (typeof CHART.fetchFrameSnapshot === "function") {
      return CHART.fetchFrameSnapshot({
        symbol,
        interval,
        limit,
        signal,
        normalizeIntervalLabel,
        toApiInterval,
        toCandleRow,
        buildFrameSnapshot,
      });
    }
    const normalizedIv = normalizeIntervalLabel(interval);
    const q = new URLSearchParams({ symbol, interval: toApiInterval(normalizedIv), limit: String(limit) });
    const res = await fetch(`https://api.binance.com/api/v3/klines?${q.toString()}`, { signal });
    if (!res.ok) throw new Error(`MTF ${interval} HTTP ${res.status}`);
    const raw = await res.json();
    if (!Array.isArray(raw)) throw new Error(`MTF ${interval} invalid payload`);
    const candles = raw.map(toCandleRow);
    return buildFrameSnapshot(candles, normalizedIv);
  }
  async function refreshMtfSnapshots(symbol) {
    if (typeof CHART.refreshMtfSnapshots === "function") {
      return CHART.refreshMtfSnapshots({
        S,
        symbol,
        isValidSymbol,
        suggestedCandleLimit,
        fetchFrameSnapshotFn: (sym, iv, limit, signal) => fetchFrameSnapshot(sym, iv, limit, signal),
        buildFrameSnapshot,
        emitAssistantSnapshotFn: () => emitAssistantSnapshot(),
      });
    }
    if (!isValidSymbol(symbol)) return;

    S.mtfAborter?.abort();
    const aborter = new AbortController();
    S.mtfAborter = aborter;
    const reqId = ++S.mtfReqId;
    S.mtfFetching = true;
    emitAssistantSnapshot();

    const plan = [
      { interval: "1d", limit: suggestedCandleLimit("1d") },
      { interval: "4h", limit: suggestedCandleLimit("4h") },
      { interval: "1h", limit: suggestedCandleLimit("1h") },
      { interval: "15m", limit: suggestedCandleLimit("15m") },
    ];

    try {
      const pairs = await Promise.all(
        plan.map(async (x) => {
          if (x.interval === S.interval && S.candles.length) {
            return [x.interval, buildFrameSnapshot(S.candles, x.interval)];
          }
          const snap = await fetchFrameSnapshot(symbol, x.interval, x.limit, aborter.signal);
          return [x.interval, snap];
        })
      );

      if (aborter.signal.aborted || reqId !== S.mtfReqId || S.symbol !== symbol) return;
      S.mtf = Object.fromEntries(pairs);
    } catch (e) {
      if (e?.name !== "AbortError") {
        console.warn("MTF fetch failed:", e);
      }
    } finally {
      if (S.mtfAborter === aborter) {
        S.mtfAborter = null;
        S.mtfFetching = false;
      }
      emitAssistantSnapshot();
    }
  }

  function emitAssistantSnapshot() {
    if (typeof CHART.emitAssistantSnapshot === "function") {
      CHART.emitAssistantSnapshot({ S, normalizeTradePlan });
      return;
    }
    const mtf = Object.fromEntries(
      Object.entries(S.mtf || {}).map(([iv, snap]) => [
        iv,
        {
          interval: snap?.interval || iv,
          candles: (snap?.candles || []).slice(-140).map((c) => ({ ...c })),
          ema7: (snap?.ema7 || []).slice(-140),
          ema21: (snap?.ema21 || []).slice(-140),
          ema50: (snap?.ema50 || []).slice(-140),
          sr: {
            supports: (snap?.sr?.supports || []).map((x) => ({ idx: x.idx, price: Number(x.price) })),
            resistances: (snap?.sr?.resistances || []).map((x) => ({ idx: x.idx, price: Number(x.price) })),
          },
          tradePlan: normalizeTradePlan(snap?.tradePlan),
        },
      ])
    );

    document.dispatchEvent(
      new CustomEvent("chart:snapshot", {
        detail: {
          symbol: S.symbol,
          interval: S.interval,
          fetching: !!S.fetching,
          mtfFetching: !!S.mtfFetching,
          realtimePrice: Number.isFinite(S.realtimePrice) ? Number(S.realtimePrice) : NaN,
          mtf,
          candles: S.candles.slice(-140).map((c) => ({ ...c })),
          ema7: S.ema7.slice(-140),
          ema21: S.ema21.slice(-140),
          ema50: S.ema50.slice(-140),
          sr: {
            supports: (S.sr?.supports || []).map((x) => ({ idx: x.idx, price: Number(x.price) })),
            resistances: (S.sr?.resistances || []).map((x) => ({ idx: x.idx, price: Number(x.price) })),
          },
          tradePlan: S.tradePlan
            ? normalizeTradePlan(S.tradePlan)
            : null,
        },
      })
    );
  }

  function headerSymbols() {
    return [...new Set(Array.from(document.querySelectorAll("#symTabs .stab[data-sym], #watchlistTabs .stab[data-sym]"))
      .map((e) => normalizeSymbol(e.dataset.sym)).filter(isValidSymbol))];
  }
  function syncSymbolSelect(preferred = S.symbol) {
    const syms = headerSymbols();
    if (!syms.length) return;
    symbolSelect.replaceChildren(...syms.map((sym) => {
      const o = document.createElement("option");
      o.value = sym;
      o.textContent = `${symbolLabel(sym)}/USDT`;
      return o;
    }));
    S.symbol = syms.includes(preferred) ? preferred : syms[0];
    symbolSelect.value = S.symbol;
  }
  function setIntervalActive(iv) {
    const normalized = normalizeIntervalLabel(iv);
    ivTabs.querySelectorAll(".itab").forEach((b) => {
      b.classList.toggle("active", normalizeIntervalLabel(b.dataset.iv) === normalized);
    });
  }

  function ema(values, p) {
    if (typeof CHART.ema === "function") return CHART.ema(values, p);
    if (!values.length) return [];
    const k = 2 / (p + 1); const out = []; let prev = values[0];
    for (let i = 0; i < values.length; i += 1) { prev = i ? values[i] * k + prev * (1 - k) : values[i]; out.push(prev); }
    return out;
  }
  function vwap(candles) {
    if (typeof CHART.vwap === "function") return CHART.vwap(candles);
    let pv = 0; let vol = 0;
    return candles.map((c) => { const tp = (c.h + c.l + c.c) / 3; pv += tp * c.v; vol += c.v; return vol > 0 ? pv / vol : NaN; });
  }
  function boll(values, p = 20, m = 2) {
    if (typeof CHART.boll === "function") return CHART.boll(values, p, m);
    const u = []; const md = []; const l = [];
    for (let i = 0; i < values.length; i += 1) {
      if (i < p - 1) { u.push(NaN); md.push(NaN); l.push(NaN); continue; }
      const w = values.slice(i - p + 1, i + 1);
      const avg = w.reduce((a, b) => a + b, 0) / p;
      const vr = w.reduce((a, b) => a + (b - avg) * (b - avg), 0) / p;
      const sd = Math.sqrt(vr);
      md.push(avg); u.push(avg + m * sd); l.push(avg - m * sd);
    }
    return { u, md, l };
  }
  function sr(candles) {
    if (typeof CHART.sr === "function") return CHART.sr(candles);
    if (candles.length < 10) return { supports: [], resistances: [] };
    const piv = 3; const highs = []; const lows = [];
    for (let i = piv; i < candles.length - piv; i += 1) {
      let hi = true; let lo = true;
      for (let j = i - piv; j <= i + piv; j += 1) { if (j === i) continue; if (candles[j].h >= candles[i].h) hi = false; if (candles[j].l <= candles[i].l) lo = false; }
      if (hi) highs.push({ idx: i, price: candles[i].h });
      if (lo) lows.push({ idx: i, price: candles[i].l });
    }
    return { supports: lows.slice(-4), resistances: highs.slice(-4) };
  }
  function fib(candles) {
    if (typeof CHART.fib === "function") return CHART.fib(candles);
    if (candles.length < 8) return [];
    const hi = Math.max(...candles.map((c) => c.h)); const lo = Math.min(...candles.map((c) => c.l));
    if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi <= lo) return [];
    return [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((r) => ({ ratio: r, price: hi - (hi - lo) * r }));
  }
  function tradePlan(candles, levels) {
    if (typeof CHART.tradePlan === "function") return CHART.tradePlan(candles, levels);
    if (candles.length < 14) return null;
    const entry = candles[candles.length - 1].c;
    const atr = candles.slice(-14).reduce((a, c) => a + Math.max(0, c.h - c.l), 0) / 14;
    const sp = levels.supports.map((x) => Number(x.price)).filter(Number.isFinite).sort((a, b) => a - b);
    const rs = levels.resistances.map((x) => Number(x.price)).filter(Number.isFinite).sort((a, b) => a - b);
    const closes = candles.map((c) => c.c);
    const e7 = ema(closes, 7);
    const e21 = ema(closes, 21);
    const e50 = ema(closes, 50);
    const idx = closes.length - 1;
    const last = closes[idx];
    const prev = closes[idx - 1] ?? last;
    const fast = e7[idx];
    const mid = e21[idx];
    const slow = e50[idx];
    const recent = candles.slice(-20);
    const recentHi = Math.max(...recent.map((c) => c.h));
    const recentLo = Math.min(...recent.map((c) => c.l));
    const recentMid = (recentHi + recentLo) / 2;

    let direction = "long";
    if (Number.isFinite(fast) && Number.isFinite(mid) && Number.isFinite(slow)) {
      if (fast > mid && mid > slow && last >= mid) direction = "long";
      else if (fast < mid && mid < slow && last <= mid) direction = "short";
      else direction = last >= recentMid ? "long" : "short";
    } else {
      direction = last >= prev ? "long" : "short";
    }

    const stopDist = Math.max(entry * 0.005, atr * 1.15);
    const targetDist = Math.max(entry * 0.008, atr * 1.95);
    const minTargetGap = Math.max(entry * 0.002, atr * 0.4);

    let stop;
    let target;
    if (direction === "long") {
      const nearSupport = [...sp].filter((x) => x < entry).pop();
      const candidateRes = rs.find((x) => x > entry + minTargetGap);
      stop = nearSupport ?? (entry - stopDist);
      target = candidateRes ?? (entry + targetDist);
      if (!(stop < entry)) stop = entry - stopDist;
      if (!(target > entry)) target = entry + targetDist;
    } else {
      const nearRes = rs.find((x) => x > entry);
      const belowSupports = sp.filter((x) => x < entry);
      const candidateSup = belowSupports.length ? belowSupports[belowSupports.length - 1] : null;
      stop = nearRes ?? (entry + stopDist);
      target = candidateSup ?? (entry - targetDist);
      if (!(stop > entry)) stop = entry + stopDist;
      if (!(target < entry)) target = entry - targetDist;
    }

    const risk = direction === "long" ? (entry - stop) : (stop - entry);
    const reward = direction === "long" ? (target - entry) : (entry - target);
    const rr = risk > 0 ? reward / risk : 0;
    return { direction, planType: "preview", entry, stop, target, rr };
  }
  function volProfile(candles, bins = 24) {
    if (typeof CHART.volProfile === "function") return CHART.volProfile(candles, bins);
    if (!candles.length) return null;
    const hi = Math.max(...candles.map((c) => c.h)); const lo = Math.min(...candles.map((c) => c.l));
    if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi <= lo) return null;
    const step = (hi - lo) / bins; const arr = Array.from({ length: bins }, () => 0);
    candles.forEach((c) => { const p = (c.h + c.l + c.c) / 3; const i = clamp(Math.floor((p - lo) / step), 0, bins - 1); arr[i] += c.v; });
    return { lo, hi, step, arr, max: Math.max(...arr, 1) };
  }
  function recompute() {
    const closes = S.candles.map((c) => c.c);
    S.ema7 = ema(closes, 7); S.ema21 = ema(closes, 21); S.ema50 = ema(closes, 50); S.vwap = vwap(S.candles);
    const b = boll(closes, 20, 2); S.bbU = b.u; S.bbM = b.md; S.bbL = b.l;
    S.sr = sr(S.candles); S.fib = fib(S.candles); S.tradePlan = tradePlan(S.candles, S.sr); S.vp = volProfile(S.candles, 24);

    let candleMin = Infinity;
    let candleMax = -Infinity;
    S.candles.forEach((c) => {
      if (Number.isFinite(c.l) && c.l < candleMin) candleMin = c.l;
      if (Number.isFinite(c.h) && c.h > candleMax) candleMax = c.h;
    });
    S.seriesBounds = {
      candleMin: Number.isFinite(candleMin) ? candleMin : NaN,
      candleMax: Number.isFinite(candleMax) ? candleMax : NaN,
      ema7: finiteSeriesBounds(S.ema7),
      ema21: finiteSeriesBounds(S.ema21),
      ema50: finiteSeriesBounds(S.ema50),
      vwap: finiteSeriesBounds(S.vwap),
      bbU: finiteSeriesBounds(S.bbU),
      bbM: finiteSeriesBounds(S.bbM),
      bbL: finiteSeriesBounds(S.bbL),
    };
  }

  function getFullscreenCanvasHeight(host) {
    const fullEl = document.fullscreenElement;
    const cardEl = host.closest(".card-chart");
    if (!fullEl || !cardEl || !fullEl.contains(cardEl)) return null;

    const head = cardEl.querySelector(".chart-head");
    const controls = cardEl.querySelector(".chart-ctrls");
    const styles = getComputedStyle(cardEl);
    const gap = parseFloat(styles.rowGap || styles.gap || "0") || 0;
    const paddingTop = parseFloat(styles.paddingTop || "0") || 0;
    const paddingBottom = parseFloat(styles.paddingBottom || "0") || 0;

    const viewportHeight = window.visualViewport?.height || window.innerHeight || 0;
    const cardRect = cardEl.getBoundingClientRect();
    if (cardRect.height < 10) return null;

    const cardHeight = Math.min(cardRect.height, viewportHeight > 0 ? viewportHeight : cardRect.height);
    const headHeight = head?.getBoundingClientRect().height ?? 0;
    const controlsHeight = controls?.getBoundingClientRect().height ?? 0;
    if (head && headHeight < 1) return null;

    const gapsCount = (head ? 1 : 0) + (controls ? 1 : 0);
    const available = cardHeight - paddingTop - paddingBottom - headHeight - controlsHeight - gap * gapsCount;
    return Math.max(Math.floor(available), 180);
  }

  function resize() {
    const host = canvas.parentElement;
    if (!host) return null;

    const dpr = window.devicePixelRatio || 1;
    const fullscreenHeight = getFullscreenCanvasHeight(host);
    const inFullscreenChart = Number.isFinite(fullscreenHeight);
    if (document.fullscreenElement && !inFullscreenChart) return null;

    const r = host.getBoundingClientRect();
    const w = Math.max(320, Math.floor(r.width));
    const h = inFullscreenChart ? fullscreenHeight : Math.max(220, Math.floor(r.height));
    const pw = Math.floor(w * dpr);
    const ph = Math.floor(h * dpr);

    if (inFullscreenChart) {
      host.style.height = `${h}px`;
      host.style.minHeight = "0px";
    } else {
      host.style.height = "";
      host.style.minHeight = "";
    }

    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }
  function queueDraw() {
    if (S.redrawQueued) return;
    const now = performance.now();
    if (now - S.redrawLastTs < 30) return; // ~33 FPS cap for mobile/perf
    S.redrawLastTs = now;
    S.redrawQueued = true;
    requestAnimationFrame(() => {
      S.redrawQueued = false;
      draw();
    });
  }
  function queuePointerMove(clientX, clientY, withTip = true) {
    S.pendingPointer = { clientX, clientY, withTip };
    if (S.pointerMoveQueued) return;
    S.pointerMoveQueued = true;
    requestAnimationFrame(() => {
      S.pointerMoveQueued = false;
      const p = S.pendingPointer;
      S.pendingPointer = null;
      if (!p) return;
      handlePointerMove(p.clientX, p.clientY, p.withTip);
    });
  }

  function draw() {
    const sz = resize(); if (!sz) return; const { w, h } = sz;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#121c2a"; ctx.fillRect(0, 0, w, h);
    if (!S.candles.length) { ctx.fillStyle = "#8aa3bd"; ctx.font = "13px Share Tech Mono, monospace"; ctx.textAlign = "center"; ctx.fillText(S.fetching ? "تحميل الشارت..." : "لا توجد بيانات", w / 2, h / 2); return; }

    const volZone = S.layers.vol ? Math.max(58, Math.floor(h * 0.18)) : 0; const vpPad = S.layers.vp ? 64 : 0;
    const pad = { t: 20, r: 74, b: 24 + volZone, l: 8 + vpPad }; const chW = w - pad.l - pad.r; const chH = h - pad.t - pad.b;
    const step = chW / S.candles.length; const bodyW = Math.max(2, step * 0.66);
    let min = S.seriesBounds?.candleMin;
    let max = S.seriesBounds?.candleMax;
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = Infinity;
      max = -Infinity;
      S.candles.forEach((c) => { min = Math.min(min, c.l); max = Math.max(max, c.h); });
    }
    if (S.layers.ema) {
      ({ min, max } = mergeBounds(min, max, S.seriesBounds?.ema7));
      ({ min, max } = mergeBounds(min, max, S.seriesBounds?.ema21));
      ({ min, max } = mergeBounds(min, max, S.seriesBounds?.ema50));
    }
    if (S.layers.vwap) ({ min, max } = mergeBounds(min, max, S.seriesBounds?.vwap));
    if (S.layers.bb) {
      ({ min, max } = mergeBounds(min, max, S.seriesBounds?.bbU));
      ({ min, max } = mergeBounds(min, max, S.seriesBounds?.bbM));
      ({ min, max } = mergeBounds(min, max, S.seriesBounds?.bbL));
    }
    S.levels.forEach((p) => { min = Math.min(min, p); max = Math.max(max, p); });
    if (S.tradePlan) { min = Math.min(min, S.tradePlan.stop, S.tradePlan.entry, S.tradePlan.target); max = Math.max(max, S.tradePlan.stop, S.tradePlan.entry, S.tradePlan.target); }
    if (min === max) { min *= 0.999; max *= 1.001; } else { const rg = (max - min) * 0.08; min -= rg; max += rg; }
    const range = max - min || 1;
    const y = (p) => pad.t + chH * (1 - (p - min) / range);
    const x = (i) => pad.l + step * i + step / 2;
    const xr = (r) => pad.l + clamp(r, 0, 1) * chW;
    const currentPrice = Number.isFinite(S.realtimePrice) ? S.realtimePrice : S.candles[S.candles.length - 1]?.c;
    const line = (arr, color, lw, dash = null, sampled = true) => {
      if (!Array.isArray(arr) || !arr.length) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      let started = false;
      const stride = sampled ? Math.max(1, Math.ceil(2 / Math.max(step, 0.001))) : 1;
      for (let i = 0; i < arr.length; i += stride) {
        const v = arr[i];
        if (!Number.isFinite(v)) continue;
        const xi = x(i);
        const yi = y(v);
        if (!started) {
          ctx.moveTo(xi, yi);
          started = true;
        } else ctx.lineTo(xi, yi);
      }
      if (stride > 1) {
        const li = arr.length - 1;
        const lv = arr[li];
        if (Number.isFinite(lv)) {
          const xi = x(li);
          const yi = y(lv);
          if (!started) {
            ctx.moveTo(xi, yi);
            started = true;
          } else {
            ctx.lineTo(xi, yi);
          }
        }
      }
      if (started) ctx.stroke();
      ctx.setLineDash([]);
    };
    const rightBadges = [];
    const reserveBadgeY = (rawY, bh = 16) => {
      const top = pad.t + bh / 2;
      const bottom = h - pad.b - bh / 2;
      let badgeY = clamp(rawY, top, bottom);
      if (Number.isFinite(currentPrice) && Math.abs(badgeY - y(currentPrice)) < bh + 2) {
        badgeY = clamp(badgeY + bh + 2, top, bottom);
      }
      rightBadges.forEach((py) => {
        if (Math.abs(badgeY - py) < bh + 2) {
          badgeY = clamp(py + bh + 2, top, bottom);
        }
      });
      rightBadges.push(badgeY);
      return badgeY;
    };
    const drawRightBadge = (text, price, borderColor, fillColor = "rgba(7,15,28,0.75)", textColor = borderColor) => {
      if (!Number.isFinite(price)) return;
      const py = y(price);
      if (py < pad.t || py > h - pad.b) return;
      const roundedBox = (bx, by, bw, bh, radius = 4) => {
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, radius);
        else ctx.rect(bx, by, bw, bh);
      };
      ctx.save();
      ctx.font = "10px Share Tech Mono, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(text).width;
      const bh = 16;
      const bw = tw + 10;
      const badgeY = reserveBadgeY(py, bh);
      const bx = w - pad.r + 4;
      const by = badgeY - bh / 2;

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w - pad.r, py);
      ctx.lineTo(bx, badgeY);
      ctx.stroke();

      ctx.fillStyle = fillColor;
      ctx.strokeStyle = borderColor;
      roundedBox(bx, by, bw, bh, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = textColor;
      ctx.fillText(text, bx + 5, badgeY);
      ctx.restore();
    };
    const getLastFinite = (arr) => {
      for (let i = arr.length - 1; i >= 0; i -= 1) {
        if (Number.isFinite(arr[i])) return arr[i];
      }
      return NaN;
    };

    if (S.layers.grid) {
      const priceBadgeY = Number.isFinite(currentPrice) ? y(currentPrice) : -9999;
      const skipZone = 14;
      ctx.strokeStyle = "rgba(20,32,47,0.85)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      for (let i = 0; i <= 6; i += 1) {
        const yi = pad.t + (chH / 6) * i;
        ctx.beginPath();
        ctx.moveTo(pad.l, yi);
        ctx.lineTo(w - pad.r, yi);
        ctx.stroke();

        if (Math.abs(yi - priceBadgeY) > skipZone) {
          const price = max - (range / 6) * i;
          ctx.fillStyle = "rgba(45,68,96,0.72)";
          ctx.font = "10px Share Tech Mono, monospace";
          ctx.textAlign = "left";
          ctx.fillText(priceLabel(price), w - pad.r + 6, yi + 3);
        }
      }
      const verticalLines = Math.max(3, Math.min(8, Math.floor(S.candles.length / 10)));
      ctx.strokeStyle = "rgba(20,32,47,0.45)";
      for (let i = 1; i < verticalLines; i += 1) {
        const xi = pad.l + chW * (i / verticalLines);
        ctx.beginPath();
        ctx.moveTo(xi, pad.t);
        ctx.lineTo(xi, h - pad.b);
        ctx.stroke();

        const ci = Math.min(S.candles.length - 1, Math.round((i / verticalLines) * S.candles.length));
        const ts = S.candles[ci]?.t;
        if (ts) {
          const { line1, line2 } = fmtAxisDate(ts, S.interval);
          ctx.fillStyle = "rgba(45,68,96,0.7)";
          ctx.font = "9px Share Tech Mono, monospace";
          ctx.textAlign = "center";
          const baseY = h - pad.b + 10;
          ctx.fillText(line1, xi, baseY);
          if (line2) ctx.fillText(line2, xi, baseY + 10);
        }
      }
      ctx.setLineDash([]);
    }
    if (S.layers.vp && S.vp) {
      const aX = 8;
      const aW = Math.max(16, pad.l - aX - 8);
      const profile = S.vp.arr;
      const totalVol = profile.reduce((sum, v) => sum + v, 0);
      const poc = profile.indexOf(S.vp.max);

      let vaLow = poc;
      let vaHigh = poc;
      let vaVol = profile[poc] || 0;
      const targetVA = totalVol * 0.7;
      while (vaVol < targetVA && (vaLow > 0 || vaHigh < profile.length - 1)) {
        const below = vaLow > 0 ? profile[vaLow - 1] : -1;
        const above = vaHigh < profile.length - 1 ? profile[vaHigh + 1] : -1;
        if (below >= above && below >= 0) vaLow -= 1;
        else if (above >= 0) vaHigh += 1;
        else break;
        vaVol += Math.max(below, above);
      }

      profile.forEach((vv, i) => {
        const p0 = S.vp.lo + i * S.vp.step;
        const p1 = p0 + S.vp.step;
        const y0 = y(p1);
        const y1 = y(p0);
        const hh = Math.max(1, y1 - y0);
        const ratio = vv / S.vp.max;
        const ww = Math.max(1, aW * ratio);
        const inVA = i >= vaLow && i <= vaHigh;
        const alpha = inVA ? (0.14 + ratio * 0.30) : (0.08 + ratio * 0.20);
        ctx.fillStyle = `rgba(${inVA ? 90 : 57}, ${inVA ? 220 : 190}, 255, ${alpha})`;
        ctx.fillRect(aX + aW - ww, y0, ww, hh);
      });

      const pocPrice = S.vp.lo + ((poc + 0.5) / profile.length) * (S.vp.hi - S.vp.lo);
      const pocY = y(pocPrice);
      ctx.strokeStyle = "rgba(57,213,255,0.86)";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(pad.l, pocY);
      ctx.lineTo(w - pad.r, pocY);
      ctx.stroke();

      const vahPrice = S.vp.lo + ((vaHigh + 1) / profile.length) * (S.vp.hi - S.vp.lo);
      const valPrice = S.vp.lo + (vaLow / profile.length) * (S.vp.hi - S.vp.lo);
      const vahY = y(vahPrice);
      const valY = y(valPrice);

      ctx.fillStyle = "rgba(57,213,255,0.05)";
      ctx.fillRect(pad.l, vahY, chW, valY - vahY);

      ctx.strokeStyle = "rgba(57,213,255,0.55)";
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(pad.l, vahY);
      ctx.lineTo(w - pad.r, vahY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pad.l, valY);
      ctx.lineTo(w - pad.r, valY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(100,220,255,0.72)";
      ctx.font = "9px Share Tech Mono, monospace";
      ctx.textAlign = "left";
      ctx.fillText(`POC ${priceLabel(pocPrice)}`, pad.l + 4, pocY - 4);
      ctx.fillText("VAH", pad.l + 4, vahY - 4);
      ctx.fillText("VAL", pad.l + 4, valY + 10);
    }
    if (S.layers.fib) {
      S.fib.forEach((f) => {
        const yi = y(f.price);
        ctx.strokeStyle = "rgba(255,184,48,0.45)";
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(pad.l, yi);
        ctx.lineTo(w - pad.r, yi);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }
    if (S.layers.sr) {
      const drawSRLine = (level, kind) => {
        const yi = y(level.price);
        const color = kind === "S" ? "rgba(0,232,150,0.82)" : "rgba(255,95,125,0.82)";
        if (yi < pad.t || yi > h - pad.b) return;
        ctx.strokeStyle = color;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.l, yi);
        ctx.lineTo(w - pad.r, yi);
        ctx.stroke();
        ctx.setLineDash([]);

        const label = `${kind} ${priceLabel(level.price)}`;
        ctx.font = "10px Share Tech Mono, monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const tw = ctx.measureText(label).width;
        const bw = tw + 8;
        const bh = 14;
        const leftPad = S.layers.vp ? 76 : 6;
        const bx = pad.l + leftPad;
        const by = yi - bh / 2;
        ctx.fillStyle = "rgba(7,15,28,0.86)";
        ctx.strokeStyle = color;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, 4);
        else ctx.rect(bx, by, bw, bh);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.fillText(label, bx + 4, yi);
      };
      S.sr.resistances.forEach((l) => drawSRLine(l, "R"));
      S.sr.supports.forEach((l) => drawSRLine(l, "S"));
    }
    if (S.layers.tradeZones && S.tradePlan) {
      const ye = y(S.tradePlan.entry);
      const ys = y(S.tradePlan.stop);
      const yt = y(S.tradePlan.target);
      ctx.fillStyle = "rgba(255,58,92,0.08)";
      ctx.fillRect(pad.l, Math.min(ye, ys), chW, Math.abs(ye - ys));
      ctx.fillStyle = "rgba(0,232,150,0.08)";
      ctx.fillRect(pad.l, Math.min(ye, yt), chW, Math.abs(yt - ye));
    }

    if (S.layers.vol) {
      const vt = h - volZone + 8;
      const vh = volZone - 14;
      const maxV = Math.max(...S.candles.map((c) => c.v || 0), 1);
      S.candles.forEach((c, i) => {
        const hh = Math.max(1, ((c.v || 0) / maxV) * vh);
        ctx.fillStyle = c.c >= c.o ? "rgba(0,232,150,0.24)" : "rgba(255,58,92,0.24)";
        ctx.fillRect(x(i) - bodyW / 2, vt + vh - hh, bodyW, hh);
      });
      ctx.fillStyle = "rgba(45,68,96,0.5)";
      ctx.font = "9px Share Tech Mono, monospace";
      ctx.textAlign = "right";
      ctx.fillText("VOL", w - pad.r - 4, h - pad.b / 2);
    }
    if (S.layers.bb) {
      const upperPts = [];
      const lowerPts = [];
      S.bbU.forEach((v, i) => {
        if (!Number.isFinite(v) || !Number.isFinite(S.bbL[i])) return;
        upperPts.push([x(i), y(v)]);
        lowerPts.push([x(i), y(S.bbL[i])]);
      });
      if (upperPts.length) {
        ctx.beginPath();
        ctx.moveTo(upperPts[0][0], upperPts[0][1]);
        upperPts.slice(1).forEach(([xp, yp]) => ctx.lineTo(xp, yp));
        lowerPts.slice().reverse().forEach(([xp, yp]) => ctx.lineTo(xp, yp));
        ctx.closePath();
        ctx.fillStyle = "rgba(255,184,48,0.04)";
        ctx.fill();
      }
      line(S.bbU, "rgba(255,184,48,0.75)", 1.1);
      line(S.bbM, "rgba(255,184,48,0.55)", 1, [4, 4]);
      line(S.bbL, "rgba(255,184,48,0.75)", 1.1);
      const lastU = getLastFinite(S.bbU);
      const lastL = getLastFinite(S.bbL);
      if (Number.isFinite(lastU)) drawRightBadge(`BBU ${priceLabel(lastU)}`, lastU, "rgba(255,184,48,0.82)", "rgba(255,184,48,0.12)", "rgba(255,184,48,0.9)");
      if (Number.isFinite(lastL)) drawRightBadge(`BBL ${priceLabel(lastL)}`, lastL, "rgba(255,184,48,0.82)", "rgba(255,184,48,0.12)", "rgba(255,184,48,0.9)");
    }
    const lastIdx = S.candles.length - 1;
    S.candles.forEach((c, i) => {
      const xi = x(i);
      const yo = y(c.o);
      const yh = y(c.h);
      const yl = y(c.l);
      const yc = y(c.c);
      const up = c.c >= c.o;
      const bodyTop = Math.min(yo, yc);
      const bodyHeight = Math.max(1.2, Math.abs(yo - yc));
      const isLive = i === lastIdx;

      ctx.strokeStyle = up ? "#00e896" : "#ff3a5c";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xi, yh);
      ctx.lineTo(xi, yl);
      ctx.stroke();

      ctx.fillStyle = up ? "rgba(0,232,150,0.92)" : "rgba(255,58,92,0.92)";
      ctx.strokeStyle = isLive ? "rgba(255,215,0,0.9)" : (up ? "#00e896" : "#ff3a5c");
      ctx.lineWidth = isLive ? 1.6 : 1;
      if (isLive) {
        ctx.shadowColor = "rgba(255,215,0,0.55)";
        ctx.shadowBlur = 8;
      }
      ctx.fillRect(xi - bodyW / 2, bodyTop, bodyW, bodyHeight);
      ctx.strokeRect(xi - bodyW / 2, bodyTop, bodyW, bodyHeight);
      ctx.shadowBlur = 0;

      if (isLive) {
        const dotY = up ? yh - 6 : yl + 6;
        ctx.fillStyle = "rgba(255,215,0,0.92)";
        ctx.beginPath();
        ctx.arc(xi, dotY, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    if (S.layers.ema) {
      line(S.ema7, "rgba(0,220,255,0.96)", 1.35);
      line(S.ema21, "rgba(247,147,26,0.9)", 1.2);
      line(S.ema50, "rgba(255,184,48,0.88)", 1.15);
    }
    if (S.layers.vwap) {
      line(S.vwap, "rgba(197,130,255,0.95)", 1.2, [7, 4]);
      const lastVwap = getLastFinite(S.vwap);
      if (Number.isFinite(lastVwap)) drawRightBadge(`VWAP ${priceLabel(lastVwap)}`, lastVwap, "rgba(197,130,255,0.92)", "rgba(197,130,255,0.12)", "rgba(217,165,255,0.95)");
    }
    if (S.layers.trade && S.tradePlan) {
      const ye = y(S.tradePlan.entry);
      const ys = y(S.tradePlan.stop);
      const yt = y(S.tradePlan.target);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(247,147,26,0.92)";
      ctx.beginPath();
      ctx.moveTo(pad.l, ye);
      ctx.lineTo(w - pad.r, ye);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,58,92,0.92)";
      ctx.beginPath();
      ctx.moveTo(pad.l, ys);
      ctx.lineTo(w - pad.r, ys);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,232,150,0.92)";
      ctx.beginPath();
      ctx.moveTo(pad.l, yt);
      ctx.lineTo(w - pad.r, yt);
      ctx.stroke();
      ctx.setLineDash([]);
      drawRightBadge(`TP ${priceLabel(S.tradePlan.target)}`, S.tradePlan.target, "rgba(0,232,150,0.9)", "rgba(0,232,150,0.14)", "rgba(0,232,150,0.96)");
      drawRightBadge(`ENTRY ${priceLabel(S.tradePlan.entry)}`, S.tradePlan.entry, "rgba(247,147,26,0.92)", "rgba(247,147,26,0.16)", "rgba(255,176,90,0.98)");
      drawRightBadge(`SL ${priceLabel(S.tradePlan.stop)}`, S.tradePlan.stop, "rgba(255,58,92,0.92)", "rgba(255,58,92,0.14)", "rgba(255,130,150,0.96)");
    }

    if (Number.isFinite(currentPrice)) {
      const py = y(currentPrice);
      if (py >= pad.t && py <= h - pad.b) {
        ctx.strokeStyle = "rgba(247,147,26,0.48)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.l, py);
        ctx.lineTo(w - pad.r, py);
        ctx.stroke();
        ctx.setLineDash([]);

        const lbl = priceLabel(currentPrice);
        ctx.font = "bold 10px Share Tech Mono, monospace";
        const tw = ctx.measureText(lbl).width;
        const bw = tw + 14;
        const bh = 20;
        const bx = w - pad.r + 4;
        const by = py - bh / 2;
        ctx.fillStyle = "#f7931a";
        ctx.strokeStyle = "rgba(247,147,26,0.6)";
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, 8);
        else ctx.rect(bx, by, bw, bh);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#07101c";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(lbl, bx + bw / 2, by + bh / 2);
      }
    }

    if (S.hoverIndex != null && S.hoverIndex >= 0 && S.hoverY >= 0) {
      const hoverY = clamp(S.hoverY, pad.t, h - pad.b);
      const hoverPrice = max - ((hoverY - pad.t) / chH) * range;
      ctx.strokeStyle = "rgba(126,184,255,0.28)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, hoverY);
      ctx.lineTo(w - pad.r, hoverY);
      ctx.stroke();
      ctx.setLineDash([]);

      const lbl = priceLabel(hoverPrice);
      ctx.font = "bold 10px Share Tech Mono, monospace";
      const tw = ctx.measureText(lbl).width;
      const bw = tw + 12;
      const bh = 18;
      const bx = w - pad.r + 4;
      const by = clamp(hoverY - bh / 2, pad.t, h - pad.b - bh);
      ctx.fillStyle = "rgba(7,15,28,0.92)";
      ctx.strokeStyle = "rgba(126,184,255,0.5)";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, 8);
      else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#b9d5ff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(lbl, bx + bw / 2, by + bh / 2);
    }

    S.deleteZones = [];
    S.levels.forEach((p, i) => {
      const rawY = y(p);
      const chartTop = pad.t;
      const chartBottom = pad.t + chH;
      const yi = clamp(rawY, chartTop + 1, chartBottom - 1);
      const active = i === S.hoverLevel || i === S.dragLevel;

      ctx.strokeStyle = active ? "rgba(255,220,50,0.95)" : "rgba(255,220,50,0.6)";
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, yi);
      ctx.lineTo(w - pad.r, yi);
      ctx.stroke();
      ctx.setLineDash([]);

      const arrow = rawY < chartTop ? " ▲" : rawY > chartBottom ? " ▼" : "";
      const label = `${priceLabel(p)}${arrow}`;
      ctx.font = "10px Share Tech Mono, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      const tw = ctx.measureText(label).width;
      const bw = Math.ceil(tw + 28);
      const bh = 16;
      const bx = w - pad.r + 6;
      const by = yi - bh / 2;

      ctx.fillStyle = active ? "rgba(255,220,50,0.20)" : "rgba(255,220,50,0.08)";
      ctx.strokeStyle = active ? "rgba(255,220,50,0.8)" : "rgba(255,220,50,0.35)";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, 4);
      else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = active ? "rgba(255,230,60,1)" : "rgba(255,220,50,0.92)";
      ctx.fillText(label, bx + 6, yi);

      const dx = bx + bw - 14;
      const dy = yi - 6;
      const dw = 12;
      const dh = 12;
      ctx.fillStyle = active ? "rgba(255,95,125,0.85)" : "rgba(120,60,60,0.45)";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(dx, dy, dw, dh, 2);
      else ctx.rect(dx, dy, dw, dh);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText("x", dx + 6, yi);

      S.deleteZones.push({ index: i, x: dx, y: dy, w: dw, h: dh });
    });
    ctx.textBaseline = "alphabetic";
    S.trendlines.forEach((tl, i) => { ctx.strokeStyle = "rgba(57,213,255,0.9)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(xr(tl.r1), y(tl.p1)); ctx.lineTo(xr(tl.r2), y(tl.p2)); ctx.stroke(); if (S.layers.tl) { ctx.fillStyle = "rgba(57,213,255,0.9)"; ctx.font = "9px Share Tech Mono, monospace"; ctx.fillText(`TL${i + 1}`, xr(tl.r2) + 3, y(tl.p2) - 3); } });
    if (S.layers.tl && S.pendingTL && S.cursorTL) { ctx.strokeStyle = "rgba(57,213,255,0.65)"; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(xr(S.pendingTL.r), y(S.pendingTL.p)); ctx.lineTo(xr(S.cursorTL.r), y(S.cursorTL.p)); ctx.stroke(); ctx.setLineDash([]); }

    if (S.hoverIndex != null && S.hoverIndex >= 0 && S.hoverIndex < S.candles.length) {
      const crossX = x(S.hoverIndex);
      ctx.strokeStyle = "rgba(0,200,255,0.18)";
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(crossX, pad.t);
      ctx.lineTo(crossX, h - pad.b);
      ctx.stroke();
      ctx.setLineDash([]);

      const ts = S.candles[S.hoverIndex]?.t;
      if (ts) {
        const { line1, line2 } = fmtAxisDate(ts, S.interval);
        const label = line2 ? `${line1}  ${line2}` : line1;
        ctx.font = "10px Share Tech Mono, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const tw = ctx.measureText(label).width;
        const bw = tw + 10;
        const bh = 16;
        const bx = clamp(crossX - bw / 2, pad.l, w - pad.r - bw);
        const by = h - pad.b + 2;
        ctx.fillStyle = "rgba(7,15,28,0.88)";
        ctx.strokeStyle = "rgba(0,200,255,0.45)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, 4);
        else ctx.rect(bx, by, bw, bh);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(0,200,255,0.92)";
        ctx.fillText(label, bx + bw / 2, by + bh / 2);
      }
    }
    ctx.fillStyle = "#e6f1ff"; ctx.font = "11px Share Tech Mono, monospace"; ctx.textAlign = "left"; ctx.fillText(`${symbolLabel(S.symbol)}/USDT`, pad.l + 4, 14);

    S.metrics = { pad, chW, chH, step, min, max, range, x, y };
  }

  function showTip(clientX, clientY, candle, idx) {
    if (typeof CHART.showTip === "function") {
      CHART.showTip({ tooltip, canvas, S, priceLabel, clientX, clientY, candle, idx });
      return;
    }
    if (!tooltip || !candle) return;
    if (!S.tipRows) {
      const rows = Array.from({ length: 8 }, () => document.createElement("div"));
      rows[0].style.cssText = "color:#8aa3bd;margin-bottom:3px;";
      tooltip.replaceChildren(...rows);
      S.tipRows = rows;
    }
    if (S.tipLastIdx !== idx || S.tipLastTs !== candle.t) {
      const d = new Date(candle.t);
      const lines = [
        d.toLocaleString(),
        `O ${priceLabel(candle.o)}`,
        `H ${priceLabel(candle.h)}`,
        `L ${priceLabel(candle.l)}`,
        `C ${priceLabel(candle.c)}`,
        `EMA7 ${priceLabel(S.ema7[idx])}`,
        `EMA21 ${priceLabel(S.ema21[idx])}`,
        `EMA50 ${priceLabel(S.ema50[idx])}`,
      ];
      lines.forEach((line, i) => {
        S.tipRows[i].textContent = line;
      });
      S.tipLastIdx = idx;
      S.tipLastTs = candle.t;
    }
    const r = canvas.parentElement?.getBoundingClientRect(); if (!r) return;
    const lx = clientX - r.left; const ly = clientY - r.top;
    tooltip.style.right = `${Math.max(8, r.width - lx + 10)}px`; tooltip.style.top = `${Math.max(8, ly - 8)}px`; tooltip.style.opacity = "1";
  }
  function hideTip() {
    if (typeof CHART.hideTip === "function") {
      CHART.hideTip({ tooltip, S });
      return;
    }
    if (tooltip) tooltip.style.opacity = "0";
    S.tipLastIdx = -1;
    S.tipLastTs = 0;
  }

  function disconnectWs(intentional = true) {
    if (typeof CHART.disconnectWs === "function") {
      CHART.disconnectWs({ S, intentional });
      return;
    }
    S.wsIntentional = intentional;
    if (S.wsRetry) { clearTimeout(S.wsRetry); S.wsRetry = null; }
    if (S.ws) { S.ws.onmessage = null; S.ws.onerror = null; S.ws.onclose = null; S.ws.close(); S.ws = null; }
  }
  function connectWs() {
    if (typeof CHART.connectWs === "function") {
      CHART.connectWs({
        S,
        isValidSymbol,
        disconnectWsFn: (intentional = true) => disconnectWs(intentional),
        toApiInterval,
        normalizeSymbol,
        fromApiInterval,
        normalizeIntervalLabel,
        recompute,
        buildFrameSnapshot,
        formatSpan,
        spanIndicator,
        emitAssistantSnapshotFn: () => emitAssistantSnapshot(),
        queueDraw,
        connectWsFn: () => connectWs(),
      });
      return;
    }
    if (!isValidSymbol(S.symbol)) return;
    disconnectWs(true); S.wsIntentional = false;
    const symbol = S.symbol.toLowerCase();
    const apiInterval = toApiInterval(S.interval);
    const stream = `${symbol}@kline_${apiInterval}/${symbol}@ticker`;
    const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${stream}`);
    S.ws = ws;
    ws.onmessage = (ev) => {
      let p;
      try { p = JSON.parse(ev.data); } catch { return; }
      const d = p?.data ?? p;

      const k = d?.k;
      if (
        k &&
        normalizeSymbol(k.s) === S.symbol &&
        fromApiInterval(k.i) === normalizeIntervalLabel(S.interval) &&
        S.candles.length
      ) {
        const c = { t: Number(k.t), o: Number(k.o), h: Number(k.h), l: Number(k.l), c: Number(k.c), v: Number(k.v) };
        const last = S.candles[S.candles.length - 1];
        if (last.t === c.t) S.candles[S.candles.length - 1] = c;
        else if (c.t > last.t) { S.candles.push(c); if (S.candles.length > S.limit) S.candles.splice(0, S.candles.length - S.limit); }
        S.realtimePrice = c.c;
        S.realtimeTs = Date.now();
        recompute();
        S.mtf[S.interval] = buildFrameSnapshot(S.candles, S.interval);
        if (S.candles.length > 1) {
          const ms = S.candles[S.candles.length - 1].t - S.candles[0].t;
          spanIndicator.textContent = `المدة الإجمالية ${formatSpan(ms)}`;
        }
        emitAssistantSnapshot();
        queueDraw();
        return;
      }

      const tickSymbol = normalizeSymbol(d?.s || d?.symbol);
      const tickPrice = Number(d?.c ?? d?.lastPrice);
      if (tickSymbol === S.symbol && Number.isFinite(tickPrice)) {
        S.realtimePrice = tickPrice;
        S.realtimeTs = Date.now();
        queueDraw();
      }
    };
    ws.onerror = () => ws.close();
    ws.onclose = () => { if (S.wsIntentional) return; S.wsRetry = setTimeout(connectWs, 1800); };
  }

  async function fetchCandles() {
    if (typeof CHART.fetchCandles === "function") {
      return CHART.fetchCandles({
        S,
        isValidSymbol,
        disconnectWsFn: (intentional = true) => disconnectWs(intentional),
        draw,
        emitAssistantSnapshotFn: () => emitAssistantSnapshot(),
        normalizeIntervalLabel,
        toApiInterval,
        toCandleRow,
        recompute,
        connectWsFn: () => connectWs(),
        buildFrameSnapshot,
        refreshMtfSnapshotsFn: (symbol) => refreshMtfSnapshots(symbol),
        formatSpan,
        spanIndicator,
      });
    }
    if (!isValidSymbol(S.symbol)) return;
    disconnectWs(true);
    S.realtimePrice = NaN;
    S.realtimeTs = 0;
    S.mtfAborter?.abort();
    S.mtfFetching = false;
    S.aborter?.abort(); const aborter = new AbortController(); S.aborter = aborter; S.fetching = true; draw(); emitAssistantSnapshot();
    const reqSym = S.symbol; const reqIv = normalizeIntervalLabel(S.interval);
    try {
      const q = new URLSearchParams({ symbol: reqSym, interval: toApiInterval(reqIv), limit: String(S.limit) });
      const res = await fetch(`https://api.binance.com/api/v3/klines?${q.toString()}`, { signal: aborter.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json(); if (!Array.isArray(raw)) throw new Error("Invalid candles");
      if (S.aborter !== aborter || aborter.signal.aborted || S.symbol !== reqSym || normalizeIntervalLabel(S.interval) !== reqIv) return;
      S.candles = raw.map(toCandleRow);
      const lastClose = S.candles[S.candles.length - 1]?.c;
      S.realtimePrice = Number.isFinite(lastClose) ? lastClose : NaN;
      S.realtimeTs = Date.now();
      recompute(); draw(); connectWs();
      S.mtf[S.interval] = buildFrameSnapshot(S.candles, S.interval);
      void refreshMtfSnapshots(reqSym);
      emitAssistantSnapshot();
      if (S.candles.length > 1) { const ms = S.candles[S.candles.length - 1].t - S.candles[0].t; spanIndicator.textContent = `المدة الإجمالية ${formatSpan(ms)}`; }
      else spanIndicator.textContent = "المدة الإجمالية -";
    } catch (e) {
      if (S.aborter === aborter && !aborter.signal.aborted && e?.name !== "AbortError") { console.warn("Chart fetch failed:", e); S.candles = []; draw(); emitAssistantSnapshot(); }
    } finally {
      if (S.aborter === aborter) {
        S.aborter = null;
        S.fetching = false;
        emitAssistantSnapshot();
      }
    }
  }

  function findDeleteZone(x, y) {
    if (typeof CHART.findDeleteZone === "function") return CHART.findDeleteZone(S.deleteZones, x, y);
    return S.deleteZones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
  }

  function findLevelAtY(y, tolerance = 7) {
    if (typeof CHART.findLevelAtY === "function") return CHART.findLevelAtY(S.metrics, S.levels, y, tolerance);
    if (!S.metrics) return -1;
    for (let i = 0; i < S.levels.length; i += 1) {
      if (Math.abs(S.metrics.y(S.levels[i]) - y) <= tolerance) return i;
    }
    return -1;
  }

  function yToPrice(localY) {
    if (typeof CHART.yToPrice === "function") return CHART.yToPrice(S.metrics, localY);
    if (!S.metrics) return null;
    const y = clamp(localY, S.metrics.pad.t, S.metrics.pad.t + S.metrics.chH);
    return S.metrics.max - ((y - S.metrics.pad.t) / S.metrics.chH) * S.metrics.range;
  }

  function scheduleFullscreenRedraw() {
    queueDraw();
    setTimeout(queueDraw, 150);
    setTimeout(queueDraw, 400);
    setTimeout(queueDraw, 750);
  }

  async function tryLockLandscapeOrientation() {
    const orientation = window.screen?.orientation;
    if (!orientation || typeof orientation.lock !== "function") return;
    try {
      await orientation.lock("landscape");
    } catch {}
  }

  function tryUnlockOrientation() {
    const orientation = window.screen?.orientation;
    if (!orientation || typeof orientation.unlock !== "function") return;
    try {
      orientation.unlock();
    } catch {}
  }

  function applyContext(symbol, interval) {
    const sym = normalizeSymbol(symbol); if (!isValidSymbol(sym)) return false;
    const nextInterval = normalizeIntervalLabel(interval || S.interval);
    S.symbol = sym;
    S.interval = isSupportedInterval(nextInterval) ? nextInterval : S.interval;
    S.pendingTL = null;
    S.cursorTL = null;
    S.trendlines = [];
    loadLevels();
    syncSymbolSelect(S.symbol); setIntervalActive(S.interval); return true;
  }

  ivTabs.addEventListener("click", (e) => {
    const b = e.target.closest(".itab[data-iv]");
    if (!b) return;
    const nextInterval = normalizeIntervalLabel(b.dataset.iv);
    if (nextInterval === normalizeIntervalLabel(S.interval)) return;
    if (applyContext(S.symbol, nextInterval)) {
      applyAutoCandleLimit(S.interval);
      fetchCandles();
    }
  });
  candleCount.addEventListener("change", () => { S.limit = clamp(Number(candleCount.value) || 100, 10, 400); fetchCandles(); });
  symbolSelect.addEventListener("change", () => {
    const sym = normalizeSymbol(symbolSelect.value);
    const tab = document.querySelector(
      `#symTabs .stab[data-sym="${sym}"], #watchlistTabs .stab[data-sym="${sym}"]`
    );
    if (tab) tab.click();
    else if (applyContext(sym, S.interval)) fetchCandles();
  });
  Object.keys(S.layers).forEach((k) => { const b = btns[k]; if (!b) return; b.addEventListener("click", () => { S.layers[k] = !S.layers[k]; if (k === "tl" && !S.layers.tl) { S.pendingTL = null; S.cursorTL = null; } syncToggleButtons(); savePrefs(); queueDraw(); }); });
  if (btns.addLevel) btns.addLevel.addEventListener("click", () => { const last = S.candles[S.candles.length - 1]; if (!last) return; S.levels.push(last.c); S.levels = [...new Set(S.levels.map(Number).filter(Number.isFinite))].sort((a, b) => a - b); saveLevels(); queueDraw(); });
  if (btns.fs) {
    btns.fs.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement === card) {
          await document.exitFullscreen();
          tryUnlockOrientation();
        } else {
          await card?.requestFullscreen();
          await tryLockLandscapeOrientation();
        }
      } catch (e) {
        console.warn(e);
      } finally {
        scheduleFullscreenRedraw();
      }
    });
  }
  if (btns.capture) btns.capture.addEventListener("click", () => { const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = `chart-${S.symbol}-${S.interval}.png`; a.click(); });

  function handlePointerMove(clientX, clientY, withTip = true) {
    if (!S.metrics || !S.candles.length) return;
    const r = canvas.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;

    if (S.dragLevel >= 0) {
      const nextPrice = yToPrice(y);
      if (Number.isFinite(nextPrice)) {
        S.levels[S.dragLevel] = nextPrice;
        queueDraw();
      }
      hideTip();
      return;
    }

    const prevHoverIndex = S.hoverIndex;
    const prevHoverY = S.hoverY;
    const prevHoverLevel = S.hoverLevel;
    const hadCursorTL = !!S.cursorTL;

    const deleteHit = findDeleteZone(x, y);
    const levelHit = findLevelAtY(y, 6);
    S.hoverLevel = levelHit;

    if (deleteHit) canvas.style.cursor = "pointer";
    else if (levelHit >= 0) canvas.style.cursor = "ns-resize";
    else canvas.style.cursor = S.layers.tl ? "cell" : "crosshair";

    const idx = Math.floor((x - S.metrics.pad.l) / S.metrics.step);
    if (idx < 0 || idx >= S.candles.length) {
      S.hoverIndex = null;
      S.hoverY = -1;
      S.cursorTL = null;
      hideTip();
      if (prevHoverIndex !== null || prevHoverY >= 0 || prevHoverLevel !== -1 || hadCursorTL) {
        queueDraw();
      }
      return;
    }

    const ratio = S.candles.length > 1 ? idx / (S.candles.length - 1) : 0;
    const price = yToPrice(y);
    S.cursorTL = Number.isFinite(price) ? { r: ratio, p: price } : null;
    S.hoverIndex = idx;
    S.hoverY = y;
    if (withTip) showTip(clientX, clientY, S.candles[idx], idx);
    else hideTip();

    const changed =
      prevHoverIndex !== idx ||
      Math.abs(prevHoverY - y) >= 0.5 ||
      prevHoverLevel !== levelHit ||
      hadCursorTL !== !!S.cursorTL;
    if (changed) queueDraw();
  }

  canvas.addEventListener("mousedown", (e) => {
    if (!S.metrics) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    const deleteHit = findDeleteZone(x, y);
    if (deleteHit) {
      S.levels.splice(deleteHit.index, 1);
      saveLevels();
      queueDraw();
      return;
    }

    const hit = findLevelAtY(y, 7);
    if (hit >= 0) {
      S.dragLevel = hit;
      canvas.style.cursor = "ns-resize";
      e.preventDefault();
    }
  });

  window.addEventListener("mouseup", () => {
    if (S.dragLevel >= 0) {
      S.dragLevel = -1;
      saveLevels();
      canvas.style.cursor = S.layers.tl ? "cell" : "crosshair";
      queueDraw();
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    queuePointerMove(e.clientX, e.clientY, true);
  });
  canvas.addEventListener("click", (e) => {
    if (!S.layers.tl || !S.metrics || !S.candles.length || S.dragLevel >= 0) return;
    const r = canvas.getBoundingClientRect(); const x = e.clientX - r.left; const y = e.clientY - r.top;
    if (findDeleteZone(x, y) || findLevelAtY(y, 7) >= 0) return;
    const idx = Math.floor((x - S.metrics.pad.l) / S.metrics.step); if (idx < 0 || idx >= S.candles.length) return;
    const ratio = S.candles.length > 1 ? idx / (S.candles.length - 1) : 0; const p = yToPrice(y);
    if (!Number.isFinite(p)) return; if (!S.pendingTL) S.pendingTL = { r: ratio, p }; else { S.trendlines.push({ r1: S.pendingTL.r, p1: S.pendingTL.p, r2: ratio, p2: p }); S.pendingTL = null; } queueDraw();
  });
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (S.layers.tl && (S.pendingTL || S.trendlines.length)) { if (S.pendingTL) S.pendingTL = null; else S.trendlines.pop(); queueDraw(); return; }
    if (!S.metrics || !S.levels.length) return;
    const r = canvas.getBoundingClientRect(); const y = e.clientY - r.top; const i = findLevelAtY(y, 7);
    if (i >= 0) { S.levels.splice(i, 1); saveLevels(); queueDraw(); }
  });
  canvas.addEventListener("mouseleave", () => {
    if (S.dragLevel >= 0) return;
    S.pendingPointer = null;
    S.hoverIndex = null;
    S.hoverY = -1;
    S.cursorTL = null;
    S.hoverLevel = -1;
    canvas.style.cursor = S.layers.tl ? "cell" : "crosshair";
    hideTip();
    queueDraw();
  });

  canvas.addEventListener("touchstart", (e) => {
    if (!S.metrics) return;
    const t = e.touches[0];
    if (!t) return;
    const r = canvas.getBoundingClientRect();
    const x = t.clientX - r.left;
    const y = t.clientY - r.top;

    const deleteHit = findDeleteZone(x, y);
    if (deleteHit) {
      S.levels.splice(deleteHit.index, 1);
      saveLevels();
      queueDraw();
      e.preventDefault();
      return;
    }

    const levelHit = findLevelAtY(y, 9);
    if (levelHit >= 0) {
      S.dragLevel = levelHit;
      S.touchDragging = true;
      e.preventDefault();
      return;
    }

    S.touchDragging = false;
    queuePointerMove(t.clientX, t.clientY, false);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    if (!t) return;
    queuePointerMove(t.clientX, t.clientY, false);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchend", () => {
    S.pendingPointer = null;
    if (S.dragLevel >= 0) {
      S.dragLevel = -1;
      S.touchDragging = false;
      saveLevels();
    }
    S.hoverIndex = null;
    S.hoverY = -1;
    S.cursorTL = null;
    S.hoverLevel = -1;
    hideTip();
    queueDraw();
  });

  document.addEventListener("header:symbol-change", (e) => { const next = normalizeSymbol(e.detail?.symbol); if (!isValidSymbol(next) || next === S.symbol) return; if (applyContext(next, S.interval)) fetchCandles(); });
  document.addEventListener("header:symbol-list-change", () => syncSymbolSelect(S.symbol));
  document.addEventListener("assistant:apply-preset", (e) => {
    const preset = e.detail || {};
    let needsFetch = false;
    if (preset.interval && preset.interval !== S.interval) {
      if (applyContext(S.symbol, preset.interval)) {
        applyAutoCandleLimit(S.interval);
        needsFetch = true;
      }
    }
    if (preset.layers && typeof preset.layers === "object") {
      Object.keys(S.layers).forEach((k) => {
        if (typeof preset.layers[k] === "boolean") S.layers[k] = preset.layers[k];
      });
      syncToggleButtons();
      savePrefs();
    }
    if (needsFetch) fetchCandles();
    else { queueDraw(); emitAssistantSnapshot(); }
  });
  window.addEventListener("resize", () => queueDraw());
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => queueDraw());
  }
  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement === card) void tryLockLandscapeOrientation();
    else tryUnlockOrientation();
    if (btns.fs) btns.fs.textContent = document.fullscreenElement ? "EXIT" : "FS";
    scheduleFullscreenRedraw();
  });
  window.addEventListener("beforeunload", () => {
    tryUnlockOrientation();
    disconnectWs(true);
    S.aborter?.abort();
    S.mtfAborter?.abort();
  });

  loadPrefs();
  syncToggleButtons();
  syncSymbolSelect(S.symbol);
  setIntervalActive(S.interval);
  applyContext(S.symbol, S.interval);
  applyAutoCandleLimit(S.interval);
  document.dispatchEvent(
    new CustomEvent("chart:ready", {
      detail: {
        symbol: S.symbol,
        interval: S.interval,
      },
    })
  );
  fetchCandles();
}

