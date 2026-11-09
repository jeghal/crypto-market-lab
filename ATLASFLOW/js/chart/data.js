(function initCreptoChartData(global) {
  function buildAssistantSnapshotDetail({ S, normalizeTradePlan }) {
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

    return {
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
      tradePlan: S.tradePlan ? normalizeTradePlan(S.tradePlan) : null,
    };
  }

  function emitAssistantSnapshot({ S, normalizeTradePlan }) {
    const detail = buildAssistantSnapshotDetail({ S, normalizeTradePlan });
    document.dispatchEvent(new CustomEvent("chart:snapshot", { detail }));
    return detail;
  }

  async function fetchFrameSnapshot({
    symbol,
    interval,
    limit,
    signal,
    normalizeIntervalLabel,
    toApiInterval,
    toCandleRow,
    buildFrameSnapshot,
  }) {
    const normalizedIv = normalizeIntervalLabel(interval);
    const q = new URLSearchParams({ symbol, interval: toApiInterval(normalizedIv), limit: String(limit) });
    const res = await fetch(`https://api.binance.com/api/v3/klines?${q.toString()}`, { signal });
    if (!res.ok) throw new Error(`MTF ${interval} HTTP ${res.status}`);
    const raw = await res.json();
    if (!Array.isArray(raw)) throw new Error(`MTF ${interval} invalid payload`);
    const candles = raw.map(toCandleRow);
    return buildFrameSnapshot(candles, normalizedIv);
  }

  async function refreshMtfSnapshots({
    S,
    symbol,
    isValidSymbol,
    suggestedCandleLimit,
    fetchFrameSnapshotFn,
    buildFrameSnapshot,
    emitAssistantSnapshotFn,
  }) {
    if (!isValidSymbol(symbol)) return;

    S.mtfAborter?.abort();
    const aborter = new AbortController();
    S.mtfAborter = aborter;
    const reqId = ++S.mtfReqId;
    S.mtfFetching = true;
    emitAssistantSnapshotFn();

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
          const snap = await fetchFrameSnapshotFn(symbol, x.interval, x.limit, aborter.signal);
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
      emitAssistantSnapshotFn();
    }
  }

  function disconnectWs({ S, intentional = true }) {
    S.wsIntentional = intentional;
    if (S.wsRetry) {
      clearTimeout(S.wsRetry);
      S.wsRetry = null;
    }
    if (S.ws) {
      S.ws.onmessage = null;
      S.ws.onerror = null;
      S.ws.onclose = null;
      S.ws.close();
      S.ws = null;
    }
  }

  function connectWs({
    S,
    isValidSymbol,
    disconnectWsFn,
    toApiInterval,
    normalizeSymbol,
    fromApiInterval,
    normalizeIntervalLabel,
    recompute,
    buildFrameSnapshot,
    formatSpan,
    spanIndicator,
    emitAssistantSnapshotFn,
    queueDraw,
    connectWsFn,
  }) {
    if (!isValidSymbol(S.symbol)) return;
    disconnectWsFn(true);
    S.wsIntentional = false;
    const symbol = S.symbol.toLowerCase();
    const apiInterval = toApiInterval(S.interval);
    const stream = `${symbol}@kline_${apiInterval}/${symbol}@ticker`;
    const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${stream}`);
    S.ws = ws;
    ws.onmessage = (ev) => {
      let p;
      try {
        p = JSON.parse(ev.data);
      } catch {
        return;
      }
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
        else if (c.t > last.t) {
          S.candles.push(c);
          if (S.candles.length > S.limit) S.candles.splice(0, S.candles.length - S.limit);
        }
        S.realtimePrice = c.c;
        S.realtimeTs = Date.now();
        recompute();
        S.mtf[S.interval] = buildFrameSnapshot(S.candles, S.interval);
        if (S.candles.length > 1) {
          const ms = S.candles[S.candles.length - 1].t - S.candles[0].t;
          spanIndicator.textContent = `المدة الإجمالية ${formatSpan(ms)}`;
        }
        emitAssistantSnapshotFn();
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
    ws.onclose = () => {
      if (S.wsIntentional) return;
      S.wsRetry = setTimeout(connectWsFn, 1800);
    };
  }

  async function fetchCandles({
    S,
    isValidSymbol,
    disconnectWsFn,
    draw,
    emitAssistantSnapshotFn,
    normalizeIntervalLabel,
    toApiInterval,
    toCandleRow,
    recompute,
    connectWsFn,
    buildFrameSnapshot,
    refreshMtfSnapshotsFn,
    formatSpan,
    spanIndicator,
  }) {
    if (!isValidSymbol(S.symbol)) return;
    disconnectWsFn(true);
    S.realtimePrice = NaN;
    S.realtimeTs = 0;
    S.mtfAborter?.abort();
    S.mtfFetching = false;
    S.aborter?.abort();
    const aborter = new AbortController();
    S.aborter = aborter;
    S.fetching = true;
    draw();
    emitAssistantSnapshotFn();
    const reqSym = S.symbol;
    const reqIv = normalizeIntervalLabel(S.interval);
    const isCurrent = () => S.aborter === aborter && !aborter.signal.aborted
      && S.symbol === reqSym && normalizeIntervalLabel(S.interval) === reqIv;
    try {
      const q = new URLSearchParams({ symbol: reqSym, interval: toApiInterval(reqIv), limit: String(S.limit) });
      const res = await fetch(`https://api.binance.com/api/v3/klines?${q.toString()}`, { signal: aborter.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      if (!Array.isArray(raw)) throw new Error("Invalid candles");
      if (!isCurrent()) return;
      S.candles = raw.map(toCandleRow);
      const lastClose = S.candles[S.candles.length - 1]?.c;
      S.realtimePrice = Number.isFinite(lastClose) ? lastClose : NaN;
      S.realtimeTs = Date.now();
      recompute();
      draw();
      connectWsFn();
      S.mtf[S.interval] = buildFrameSnapshot(S.candles, S.interval);
      void refreshMtfSnapshotsFn(reqSym);
      emitAssistantSnapshotFn();
      if (S.candles.length > 1) {
        const ms = S.candles[S.candles.length - 1].t - S.candles[0].t;
        spanIndicator.textContent = `المدة الإجمالية ${formatSpan(ms)}`;
      } else spanIndicator.textContent = "المدة الإجمالية -";
    } catch (e) {
      if (isCurrent() && e?.name !== "AbortError") {
        console.warn("Chart fetch failed:", e);
        S.candles = [];
        draw();
        emitAssistantSnapshotFn();
      }
    } finally {
      if (S.aborter === aborter) {
        S.aborter = null;
        S.fetching = false;
        emitAssistantSnapshotFn();
      }
    }
  }

  global.CreptoChart = {
    ...(global.CreptoChart || {}),
    emitAssistantSnapshot,
    fetchFrameSnapshot,
    refreshMtfSnapshots,
    disconnectWs,
    connectWs,
    fetchCandles,
  };
})(window);
