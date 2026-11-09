import { SYMS } from './config.js';

export function createStartupController({
  timers,
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
  getMomentumScannerController,
  setMomentumScannerController,
  switchChartSymbol,
  runController,
  screener,
  AUTO_REFRESH_MS,
  SCREENER_INTERVAL_MS,
}) {
  function applySettings() {
    const saved = loadSettings({
      curSym: state.curSym,
      curIv: state.curIv,
      candleLimit: state.candleLimit,
      layers: state.layers,
    });

    state.curSym = saved.curSym;
    state.curIv = saved.curIv;
    state.analysisProfile = loadAnalysisProfile();
    state.candleLimit = normalizeCandleLimit(saved.candleLimit, el.candleCount, state.candleLimit);
    state.layers = saved.layers;

    // Sync symbol tab
    syncActiveSymbolTab(saved.curSym);

    // Sync interval tab
    const ivBtn = el.ivTabs.querySelector(`[data-iv="${saved.curIv}"]`);
    if (ivBtn) activateTab(el.ivTabs.querySelectorAll('.itab'), ivBtn);

    // Sync candle count select
    el.candleCount.value = String(saved.candleLimit);
    if (String(state.candleLimit) !== String(saved.candleLimit)) {
      saveCandleLimit(state.candleLimit);
    }
    el.candleCount.value = String(state.candleLimit);

    if (el.analysisProfileSelect) {
      el.analysisProfileSelect.value = state.analysisProfile;
    }

    // Sync layer toggle buttons
    Object.entries(saved.layers).forEach(([key, active]) => {
      el.toggles[key]?.classList.toggle('on', active);
    });
  }

  function initCollapsibleCards() {
    const collapsedCards = loadCollapsedCards();
    const cards = document.querySelectorAll('.sidebar .card:not(.guide-card)');
    cards.forEach((card, index) => {
      const header = card.querySelector(':scope > .ct');
      if (!header) return;
      const cardKey = card.dataset.cardKey || card.id || `sidebar-card-${index}`;
      card.dataset.cardKey = cardKey;
      card.classList.add('is-collapsible');
      if (collapsedCards[cardKey] === true) {
        card.classList.add('is-collapsed');
      }
      header.title = 'انقر على السهم لطي/فتح البطاقة';
      addListener(header, 'click', (event) => {
        if (event.target.closest('button, a, input, select, textarea, label')) return;
        const rect = header.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const isRtl = getComputedStyle(header).direction === 'rtl';
        const inlineStartDistance = isRtl ? rect.width - clickX : clickX;
        if (inlineStartDistance > 18) return;
        const nextCollapsed = !card.classList.contains('is-collapsed');
        card.classList.toggle('is-collapsed', nextCollapsed);
        saveCollapsedCard(cardKey, nextCollapsed);
      });
    });
  }

  function clearInitialStartupTimers() {
    if (timers.initialScreenerTimeoutId) {
      clearTimeout(timers.initialScreenerTimeoutId);
      timers.initialScreenerTimeoutId = null;
    }
  }

  function scheduleInitialBackgroundTasks() {
    clearInitialStartupTimers();
    timers.initialScreenerTimeoutId = setTimeout(() => {
      timers.initialScreenerTimeoutId = null;
      screener?.runDefault();
    }, 2000);
  }

  function startIntervals() {
    stopIntervals();
    timers.countdownIntervalId = setInterval(() => runController.updateCountdown(), 1000);
    timers.runIntervalId = setInterval(() => runController.run(), AUTO_REFRESH_MS);
    timers.screenerIntervalId = setInterval(() => {
      screener?.runActive();
    }, SCREENER_INTERVAL_MS);
  }

  function stopIntervals() {
    if (timers.countdownIntervalId) clearInterval(timers.countdownIntervalId);
    if (timers.runIntervalId) clearInterval(timers.runIntervalId);
    if (timers.screenerIntervalId) clearInterval(timers.screenerIntervalId);
    timers.countdownIntervalId = null;
    timers.runIntervalId = null;
    timers.screenerIntervalId = null;
  }

  async function init({ bindEvents, fetchExchangeSymbols }) {
    if (fetchExchangeSymbols) {
      state.exchangeSymbols = await fetchExchangeSymbols();

      // Auto-purge invalid symbols from current state/storage
      if (state.exchangeSymbols.length > 0) {
        const customSyms = loadWatchlist();
        const verifiedWl = customSyms.filter(s => state.exchangeSymbols.includes(s));

        // If watchlist changed after verification, save and re-render
        if (verifiedWl.length !== customSyms.length) {
          localStorage.setItem('td_watchlist_v1', JSON.stringify(verifiedWl));
          renderWatchlistTabs(verifiedWl, state.curSym);
        }

        // If current symbol is invalid, force reset to BTCUSDT
        const isOfficialFixed = SYMS.includes(state.curSym);
        if (!isOfficialFixed && !state.exchangeSymbols.includes(state.curSym)) {
          console.warn(`Revoking invalid symbol: ${state.curSym}`);
          state.curSym = 'BTCUSDT';
        }
      }
    }

    applySettings();
    initCollapsibleCards();
    bindEvents();
    loadManualLevelsForCurrentContext();
    tradeCalc?.init();

    // Watchlist re-render with verified list
    renderWatchlistTabs(loadWatchlist(), state.curSym);
    realtimeSession.syncRealtimeSymbols();

    initSentiment();
    setMomentumScannerController(initMomentumScanner(switchChartSymbol));
    await runController.run();

    // Start WebSocket after first data load
    realtimeSession.startRealtimeSession();

    // Initial screener scan (slight delay to not compete with main run)
    scheduleInitialBackgroundTasks();
    startIntervals();
  }

  function dispose() {
    stopIntervals();
    clearInitialStartupTimers();
  }

  function suspendForBfcache() {
    if (state.runtime.isDisposed) return;
    state.runtime.isBfcacheSuspended = true;
    stopIntervals();
    clearInitialStartupTimers();
    destroySentiment?.();
    getMomentumScannerController?.()?.pause?.();
  }

  function resumeFromBfcache() {
    if (state.runtime.isDisposed) return;
    state.runtime.isBfcacheSuspended = false;
    initSentiment?.();
    getMomentumScannerController?.()?.resume?.();
    scheduleInitialBackgroundTasks();
    startIntervals();
  }

  return {
    applySettings,
    clearInitialStartupTimers,
    dispose,
    init,
    resumeFromBfcache,
    scheduleInitialBackgroundTasks,
    startIntervals,
    stopIntervals,
    suspendForBfcache,
  };
}
