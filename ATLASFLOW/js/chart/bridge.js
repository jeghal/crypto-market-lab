(function initAtlasFlowChartBridge(global) {
  const CHART = global.AtlasFlowChart || {};
  const SHARED = global.AtlasFlowShared || {};
  const normalizeIntervalLabel = SHARED.normalizeIntervalLabel;
  const toApiInterval = SHARED.toApiInterval;

  function toCandleRow(a) {
    if (!Array.isArray(a) || a.length < 6) return null;
    return {
      t: Number(a[0]),
      o: Number(a[1]),
      h: Number(a[2]),
      l: Number(a[3]),
      c: Number(a[4]),
      v: Number(a[5]),
    };
  }

  function normalizeTradePlan(plan) {
    if (!plan || !Number.isFinite(plan.entry)) return null;
    return {
      direction: plan.direction || "long",
      entry: Number(plan.entry),
      stop: Number(plan.stop || 0),
      target: Number(plan.target || 0),
      rr: Number(plan.rr || 0),
      riskPct: Number(plan.riskPct || 0),
      rewardPct: Number(plan.rewardPct || 0),
    };
  }

  function buildAssistantSnapshotDetail(S) {
    if (!S) return null;
    const completed = Object.keys(S.mtf || []);
    const mtf = Object.fromEntries(
      Object.entries(S.mtf || {}).map(([iv, snap]) => [
        iv,
        {
          interval: snap?.interval || iv,
          candles: (snap?.candles || []).slice(-140).map(c => ({ ...c })),
          ema7: (snap?.ema7 || []).slice(-140),
          ema21: (snap?.ema21 || []).slice(-140),
          ema50: (snap?.ema50 || []).slice(-140),
          sr: {
            supports: (snap?.sr?.supports || []).map(x => ({ idx: x.idx, price: Number(x.price) })),
            resistances: (snap?.sr?.resistances || []).map(x => ({ idx: x.idx, price: Number(x.price) })),
          },
          tradePlan: normalizeTradePlan(snap?.tradePlan),
        },
      ])
    );

    return {
      symbol: S.symbol,
      interval: S.interval,
      fetching: !!S.fetching,
      mtfFetching: !!S.mtfFetching,
      mtfComplete: completed.length >= 4,
      mtfLoaded: completed,
      realtimePrice: Number.isFinite(S.realtimePrice) ? Number(S.realtimePrice) : NaN,
      mtf,
      candles: S.candles.slice(-140).map(c => ({ ...c })),
      ema7: (S.ema7 || []).slice(-140),
      ema21: (S.ema21 || []).slice(-140),
      ema50: (S.ema50 || []).slice(-140),
      sr: {
        supports: (S.sr?.supports || []).map(x => ({ idx: x.idx, price: Number(x.price) })),
        resistances: (S.sr?.resistances || []).map(x => ({ idx: x.idx, price: Number(x.price) })),
      },
      tradePlan: S.tradePlan ? normalizeTradePlan(S.tradePlan) : null,
    };
  }

  function emitAssistantSnapshot(S) {
    if (S) S.lastSnapshotTs = Date.now();
    const detail = buildAssistantSnapshotDetail(S);
    if (!detail) return;
    document.dispatchEvent(new CustomEvent("chart:snapshot", { detail }));
    return detail;
  }

  function buildFrameSnapshot(candles, interval) {
    if (!candles?.length) return null;
    const last = candles[candles.length - 1];
    const closes = candles.map(c => c.c);
    const ema7 = CHART.ema ? CHART.ema(closes, 7) : [];
    const ema21 = CHART.ema ? CHART.ema(closes, 21) : [];
    const ema50 = CHART.ema ? CHART.ema(closes, 50) : [];
    const srData = CHART.sr ? CHART.sr(candles) : { supports: [], resistances: [] };
    const tradePlanData = CHART.tradePlan ? CHART.tradePlan(candles, srData) : null;

    return { 
      price: last.c, 
      ts: last.t, 
      interval,
      candles,
      ema7,
      ema21,
      ema50,
      sr: srData,
      tradePlan: tradePlanData
    };
  }

  async function fetchFrameSnapshot({ symbol, interval, limit, signal }) {
    const normalizedIv = normalizeIntervalLabel(interval);
    const q = new URLSearchParams({ symbol, interval: toApiInterval(normalizedIv), limit: String(limit) });
    const res = await fetch(`https://api.binance.com/api/v3/klines?${q.toString()}`, { signal });
    if (!res.ok) throw new Error(`MTF ${interval} HTTP ${res.status}`);
    const raw = await res.json();
    if (!Array.isArray(raw)) throw new Error(`MTF ${interval} invalid payload`);
    const candles = raw.map(toCandleRow);
    return buildFrameSnapshot(candles, normalizedIv);
  }

  async function refreshMtfSnapshots({ S, symbol, fetchFrameSnapshotFn, emitAssistantSnapshotFn }) {
    if (!S || S.mtfFetching) return;
    S.mtfFetching = true; S.lastMtfRefreshTs = Date.now();
    if (S.mtfAborter) S.mtfAborter.abort();
    S.mtfAborter = new AbortController();
    const sig = S.mtfAborter.signal;
    const frames = ["15m", "1h", "4h", "1d"];
    const reqId = ++S.mtfReqId;
    try {
      for (const iv of frames) {
        if (iv === normalizeIntervalLabel(S.interval)) {
          S.mtf[iv] = buildFrameSnapshot(S.candles, iv);
          continue;
        }
        const snap = await (fetchFrameSnapshotFn || fetchFrameSnapshot)({ symbol, interval: iv, limit: 140, signal: sig });
        if (reqId !== S.mtfReqId || sig.aborted) return;
        S.mtf[iv] = snap;
        (emitAssistantSnapshotFn || (() => emitAssistantSnapshot(S)))();
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (e) {
      if (e.name !== "AbortError" && reqId === S.mtfReqId) {
        console.warn("MTF Refresh failed:", e);
        if (typeof showToast === "function") showToast(`فشل تحديث مقارنة الفريمات: ${e.message}`, "error");
      }
    } finally {
      if (reqId === S.mtfReqId) {
        S.mtfFetching = false;
        (emitAssistantSnapshotFn || (() => emitAssistantSnapshot(S)))();
      }
    }
  }

  global.AtlasFlowChart = {
    ...(global.AtlasFlowChart || {}),
    toCandleRow,
    normalizeTradePlan,
    emitAssistantSnapshot,
    buildFrameSnapshot,
    fetchFrameSnapshot,
    refreshMtfSnapshots,
  };
})(window);
