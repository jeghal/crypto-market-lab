(function initAtlasFlowChartState(global) {
  const SHARED = global.AtlasFlowShared || {};
  const clamp = SHARED.clamp;
  const normalizeIntervalLabel = SHARED.normalizeIntervalLabel;
  const normalizeSymbol = SHARED.normalizeSymbol;

  function createInitialState(symbol, interval, limit) {
    return {
      symbol: normalizeSymbol(symbol || "BTCUSDT"),
      interval: normalizeIntervalLabel(interval || "1d"),
      limit: Number(limit) || 100,
      candles: [],
      ema7: [], ema21: [], ema50: [], vwap: [],
      bbU: [], bbM: [], bbL: [],
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
      wsRetryTimer: null,
      wsRetryCount: 0,
      wsStatus: "idle", // "connecting" | "open" | "retrying" | "error" | "closed" | "idle"
      wsIntentional: false,
      aborter: null,
      fetchReqId: 0,
      lastSnapshotTs: 0,
      lastMtfRefreshTs: 0,
      lastWsCandleTs: 0,
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

  global.AtlasFlowChart = {
    ...(global.AtlasFlowChart || {}),
    createInitialState,
    finiteSeriesBounds,
    mergeBounds,
    suggestedCandleLimit,
  };
})(window);
