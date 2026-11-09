import { api, getCandles, getPrices, getTopGainers, getBreakoutCandidates, getExchangeSymbols } from './api.js';
import { DEFAULT_ANALYSIS_PROFILE, IV_LABELS, resolveAnalysisProfileKey, SYMS } from './config.js';
import { redrawChart, toggleLayer } from './chart.js';
import { createChartInteractionsController } from './chart-interactions-controller.js';
import { normalizeCandleLimit } from './candle-limit.js';
import { createTradeCalculatorController } from './trade-calculator-controller.js';
import { el } from './dom.js';
import { showToast } from './notifications.js';
import { addToWatchlist, getAllSymbols, loadWatchlist, removeFromWatchlist } from './watchlist.js';
import { destroySentiment, initSentiment } from './market-sentiment.js';
import { buildCoilRow, buildScreenerRow, buildSignal } from './signal.js';
import { state } from './state.js';
import { activateTab } from './utils.js';
import { initMomentumScanner } from './momentum-scanner.js';
import { initPwa } from './pwa.js';
import { createScreenerController } from './screener-controller.js';
import { initAppLifecycle } from './app-lifecycle.js';
import { createAppTeardown } from './app-teardown.js';
import { createEventsController } from './events-controller.js';
import { createProDecisionController } from './pro-decision-controller.js';
import { createRunController } from './run-controller.js';
import { createRealtimeSessionController } from './realtime-session-controller.js';
import { createStartupController } from './startup-controller.js';
import { createSymbolIntervalController } from './symbol-interval-controller.js';
import {
  loadCollapsedCards,
  loadAnalysisProfile,
  loadManualLevels,
  loadSettings,
  loadVolThreshold,
  saveAnalysisProfile,
  saveCollapsedCard,
  saveManualLevels,
  saveSym,
  saveIv,
  saveCandleLimit,
  saveLayer,
} from './storage.js';
import {
  render,
  renderPriceTabs,
  renderCoilScreener,
  renderMomentumScreener,
  renderScreener,
  renderWatchlistTabs,
  setLoading,
  setScreenerLoading,
  sortScreener,
  syncActiveSymbolTab,
  updateStatus,
} from './ui.js';
import { wsManager } from './websocket.js';
import { workerPool } from './worker-pool.js';
import { addListener, removeAllListeners } from './listener-registry.js';

const AUTO_REFRESH_MS = 60_000;
const SCREENER_INTERVAL_MS = 5 * 60_000;

export function startApp() {
  state.runtime.isDisposed = false;
  state.runtime.isBfcacheSuspended = false;

  let momentumScannerController = null;
  const CHART_IV_FALLBACK_CHAIN = ['1M', '1w', '1d', '4h', '1h', '15m', '5m'];

  function getActiveAnalysisProfile() {
    return resolveAnalysisProfileKey(state.analysisProfile ?? DEFAULT_ANALYSIS_PROFILE);
  }

  const screener = createScreenerController({
    getAllSymbols,
    buildScreenerRow,
    buildCoilRow,
    getTopGainers,
    getBreakoutCandidates,
    renderScreener,
    renderCoilScreener,
    renderMomentumScreener,
    setScreenerLoading,
    getActiveAnalysisProfile,
    getMomentumScannerController: () => momentumScannerController,
  });

  const tradeCalc = createTradeCalculatorController({ el: el.tc, state, showToast });
  const proDecision = createProDecisionController({
    el,
    state,
    api,
    getCandles,
    buildScreenerRow,
    buildSignal,
    loadVolThreshold,
    getActiveAnalysisProfile,
  });

  function loadManualLevelsForCurrentContext() {
    state.manualLevels = loadManualLevels(state.curSym, state.curIv);
  }

  function saveManualLevelsForCurrentContext() {
    saveManualLevels(state.curSym, state.curIv, state.manualLevels);
  }

  function clearChartState() {
    // Clear stale data immediately so chart doesn't show old symbol's data
    state.lastResult = null;
    state.chartCandles = [];
    state.hoverIndex = -1;
    state.hoverY = -1;
    redrawChart();
  }

  const runController = createRunController({
    state,
    el,
    wsManager,
    autoRefreshMs: AUTO_REFRESH_MS,
    ivLabels: IV_LABELS,
    fallbackChain: CHART_IV_FALLBACK_CHAIN,
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
    renderSignal: render,
    renderTradeCalculator: () => tradeCalc?.render(),
    showToast,
  });

  const chartInteractions = createChartInteractionsController({
    runController,
    saveManualLevelsForCurrentContext,
  });

  const realtimeSession = createRealtimeSessionController({
    wsManager,
    state,
    redrawChart,
    runController,
  });

  const symbolInterval = createSymbolIntervalController({
    state,
    el,
    tradeCalc,
    syncActiveSymbolTab,
    saveSym,
    saveIv,
    loadManualLevelsForCurrentContext,
    clearChartState,
    wsManager,
    runController,
    activateTab,
    onSymbolChange: notifyRadar,
  });

  function notifyRadar(symbol) {
    const sym = symbol || state.curSym;
    if (!sym) return;
    
    // التحديث المباشر للحقل المخفي في وضع الدمج الأصلي (Native Integration)
    const symInput = document.getElementById("symbolsInput");
    if (symInput) {
      symInput.value = sym;
      // استدعاء وظيفة التحديث في سكربت الرادار إذا كانت موجودة
      if (typeof updateActiveSymbol === "function") {
        updateActiveSymbol(sym);
      }
    }
  }

  // إرسال العملة فوراً عند بدء التطبيق لضمان المزامنة
  notifyRadar();

  function rerunActiveScreenerMode() {
    screener?.runActive();
  }

  function handleCandleCountChange() {
    state.candleLimit = normalizeCandleLimit(el.candleCount.value, el.candleCount, state.candleLimit);
    el.candleCount.value = String(state.candleLimit);
    saveCandleLimit(state.candleLimit);
    runController.run();
  }

  let startup = null;
  let teardownApp = null;

  startup = createStartupController({
    timers: state.runtime.timers,
    state,
    el,
    loadSettings,
    loadAnalysisProfile,
    loadCollapsedCards,
    saveCollapsedCard,
    normalizeCandleLimit,
    activateTab,
    saveCandleLimit,
    syncActiveSymbolTab,
    addListener,
    loadManualLevelsForCurrentContext,
    tradeCalc,
    realtimeSession,
    loadWatchlist,
    renderWatchlistTabs,
    destroySentiment,
    initSentiment,
    initMomentumScanner,
    getMomentumScannerController: () => momentumScannerController,
    setMomentumScannerController: (controller) => { momentumScannerController = controller; },
    switchChartSymbol: symbolInterval.switchChartSymbol,
    runController,
    screener,
    AUTO_REFRESH_MS,
    SCREENER_INTERVAL_MS,
  });

  teardownApp = createAppTeardown({
    getIsDisposed: () => state.runtime.isDisposed,
    setIsDisposed: (next) => { state.runtime.isDisposed = next; },
    runController,
    screener,
    tradeCalc,
    proDecision,
    wsManager,
    workerPool,
    destroySentiment,
    getMomentumScannerController: () => momentumScannerController,
    setMomentumScannerController: (next) => { momentumScannerController = next; },
    getStartup: () => startup,
    removeAllListeners,
  });

  const events = createEventsController({
    initAppLifecycle,
    teardownApp,
    getIsAppDisposed: () => state.runtime.isDisposed,
    runController,
    screener,
    proDecision,
    wsManager,
    startup,
    realtimeSession,
    addListener,
    el,
    state,
    handleSymbolTabClick: symbolInterval.handleSymbolTabClick,
    handleChartSymbolSelectChange: symbolInterval.handleChartSymbolSelectChange,
    handleIntervalTabClick: symbolInterval.handleIntervalTabClick,
    handleCandleCountChange,
    switchChartSymbol: symbolInterval.switchChartSymbol,
    resolveAnalysisProfileKey,
    DEFAULT_ANALYSIS_PROFILE,
    saveAnalysisProfile,
    rerunActiveScreenerMode,
    saveSym,
    loadManualLevelsForCurrentContext,
    syncActiveSymbolTab,
    clearChartState,
    sortScreener,
    toggleLayer,
    saveLayer,
    chartInteractions,
    addToWatchlist,
    removeFromWatchlist,
    renderWatchlistTabs,
    SYMS,
  });

  initPwa(showToast);
  return startup.init({
    bindEvents: events.bindEvents,
    fetchExchangeSymbols: getExchangeSymbols,
  });
}
