export function createRunController({
  state,
  el,
  wsManager,
  autoRefreshMs = 60_000,
  ivLabels = {},
  fallbackChain = ['1M', '1w', '1d', '4h', '1h', '15m', '5m'],

  getActiveAnalysisProfile,
  getAllSymbols,
  getPrices,
  buildSignal,

  saveIv,
  loadManualLevelsForCurrentContext,
  clearChartState,
  activateTab,

  setLoading,
  updateStatus,
  renderPriceTabs,
  renderSignal,
  renderTradeCalculator,
  showToast,
} = {}) {
  if (!state) throw new Error('createRunController: state is required');
  if (!el) throw new Error('createRunController: el is required');
  if (!wsManager) throw new Error('createRunController: wsManager is required');
  if (typeof buildSignal !== 'function') throw new Error('createRunController: buildSignal is required');

  let activeController = null;
  let nextRunAt = 0;

  function isInsufficientDataError(error) {
    return ['INSUFFICIENT_ANALYSIS_DATA', 'INSUFFICIENT_CHART_DATA'].includes(error?.code)
      || String(error?.message ?? '').startsWith('بيانات غير كافية');
  }

  function getFallbackIntervals(iv) {
    const index = fallbackChain.indexOf(iv);
    if (index < 0) return [];
    return fallbackChain.slice(index + 1);
  }

  async function buildSignalWithFallback(sym, chartIv, candleLimit, signal, analysisProfile) {
    const attempts = [chartIv, ...getFallbackIntervals(chartIv)];
    let lastInsufficientError = null;

    for (const iv of attempts) {
      try {
        const result = await buildSignal(sym, iv, candleLimit, signal, analysisProfile);
        return { result, requestedIv: chartIv, usedIv: iv };
      } catch (error) {
        if (signal.aborted || error?.name === 'AbortError') throw error;
        if (error?.code !== 'INSUFFICIENT_CHART_DATA') throw error;
        lastInsufficientError = error;
      }
    }

    throw lastInsufficientError ?? new Error('بيانات غير كافية للتحليل');
  }

  function abort() {
    activeController?.abort();
    activeController = null;
  }

  function updateCountdown() {
    if (!el.countdown) return;
    const remaining = Math.max(0, Math.round((nextRunAt - Date.now()) / 1000));
    el.countdown.textContent = remaining > 0 ? `⏱ ${remaining}s` : '';
  }

  function getNextRunAt() {
    return nextRunAt;
  }

  async function run() {
    nextRunAt = Date.now() + autoRefreshMs;
    const runId = ++state.activeRunId;
    const { curSym, curIv, candleLimit } = state;

    abort();
    const controller = new AbortController();
    activeController = controller;

    setLoading?.(true);
    updateStatus?.(`جارٍ جلب البيانات... ${curSym} · ${ivLabels[curIv] || curIv}`);

    try {
      const pricesPromise = getPrices?.(controller.signal, getAllSymbols?.()).catch((error) => {
        if (controller.signal.aborted || error?.name === 'AbortError') throw error;
        console.warn('Price tabs refresh failed:', error);
        return null;
      });

      const [prices, signalPayload] = await Promise.all([
        pricesPromise,
        buildSignalWithFallback(curSym, curIv, candleLimit, controller.signal, getActiveAnalysisProfile?.()),
      ]);

      if (runId !== state.activeRunId) return;
      const { result, requestedIv, usedIv } = signalPayload;

      const previousIv = state.effectiveIv ?? requestedIv;
      state.effectiveIv = usedIv;
      if (previousIv !== usedIv) {
        loadManualLevelsForCurrentContext?.();
        clearChartState?.();
        wsManager.reconnect(state.curSym, usedIv);
      }
      if (usedIv !== requestedIv && previousIv !== usedIv) {
        showToast?.(
          `تم عرض بيانات فريم ${ivLabels[usedIv] || usedIv} بسبب نقص البيانات على ${ivLabels[requestedIv] || requestedIv}، لكن الفريم الأصلي لم يتأثر.`,
          'info'
        );
      }

      const now = Date.now();
      if (prices) {
        Object.entries(prices).forEach(([sym, data]) => {
          const ws = state.prices[sym];
          if (!ws?.ts || now - ws.ts > 5_000) state.prices[sym] = data;
        });
      }

      renderPriceTabs?.(state.prices);
      
      // Update chart data with monotonic smart merge
      const fetched = result.candles || [];
      state.chartCandles = smartMergeCandles({
        localCandles: state.chartCandles,
        restCandles: fetched,
        intervalMs: intervalToMs(state.effectiveIv ?? state.curIv),
      }).slice(-(state.candleLimit || fetched.length));
      
      renderSignal?.(result);
      renderTradeCalculator?.();
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      if (runId !== state.activeRunId) return;
      updateStatus?.(`⚠ خطأ: ${error.message}`);
      const insufficient = isInsufficientDataError(error);
      if (insufficient) {
        if (el.sigTxt) el.sigTxt.textContent = 'لا توجد بيانات كافية لهذا التحليل';
        if (el.sigSub) el.sigSub.textContent = 'غيّر الأصل أو الفريم ثم أعد المحاولة';
      } else {
        if (el.sigTxt) el.sigTxt.textContent = 'تعذّر الاتصال بـ Binance';
        if (el.sigSub) el.sigSub.textContent = 'تحقق من اتصالك ثم أعد المحاولة';
      }
      if (el.sigOrb) { el.sigOrb.className = 'sig-orb w'; el.sigOrb.textContent = '⚠'; }
      console.error(error);
    } finally {
      if (runId !== state.activeRunId || activeController !== controller) return;
      setLoading?.(false);
    }
  }

  return {
    run,
    abort,
    updateCountdown,
    getNextRunAt,
  };
}

function intervalToMs(iv) {
  const map = {
    '1m': 60_000,
    '3m': 180_000,
    '5m': 300_000,
    '15m': 900_000,
    '30m': 1_800_000,
    '1h': 3_600_000,
    '2h': 7_200_000,
    '4h': 14_400_000,
    '6h': 21_600_000,
    '8h': 28_800_000,
    '12h': 43_200_000,
    '1d': 86_400_000,
    '3d': 259_200_000,
    '1w': 604_800_000,
    '1M': 2_592_000_000,
  };
  return map[iv] || 0;
}

function bucketStart(ts, intervalMs) {
  if (!intervalMs) return ts;
  return Math.floor(ts / intervalMs) * intervalMs;
}

function smartMergeCandles({ localCandles, restCandles, intervalMs, now = Date.now() }) {
  const byT = new Map();
  const currentBucketT = bucketStart(now, intervalMs);

  for (const rc of restCandles) {
    byT.set(rc.t, { ...rc });
  }

  for (const lc of localCandles) {
    const rc = byT.get(lc.t);
    const shouldBeClosed = Boolean(lc.closed || rc?.closed || (intervalMs && lc.t < currentBucketT));

    if (!rc) {
      byT.set(lc.t, { ...lc, closed: shouldBeClosed });
      continue;
    }

    if (shouldBeClosed) {
      byT.set(lc.t, {
        t: lc.t,
        o: rc.o ?? lc.o,
        h: Math.max(Number.isFinite(rc.h) ? rc.h : -Infinity, Number.isFinite(lc.h) ? lc.h : -Infinity),
        l: Math.min(Number.isFinite(rc.l) ? rc.l : Infinity, Number.isFinite(lc.l) ? lc.l : Infinity),
        c: lc.closed ? lc.c : (rc.c ?? lc.c),
        v: Math.max(rc.v ?? 0, lc.v ?? 0),
        closed: true,
      });
    } else {
      byT.set(lc.t, { ...rc, ...lc, closed: false });
    }
  }

  const merged = [...byT.values()].sort((a, b) => a.t - b.t);
  const dedup = [];
  for (const c of merged) {
    const prev = dedup[dedup.length - 1];
    if (!prev || prev.t !== c.t) dedup.push(c);
  }
  return dedup;
}
