export function createEventsController({
  initAppLifecycle,
  teardownApp,
  getIsAppDisposed,
  runController,
  screener,
  proDecision,
  wsManager,
  startup,
  realtimeSession,
  addListener,
  el,
  state,
  handleSymbolTabClick,
  handleChartSymbolSelectChange,
  handleIntervalTabClick,
  handleCandleCountChange,
  switchChartSymbol,
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
}) {
  function runAsync(task, label) {
    Promise.resolve()
      .then(() => task?.())
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        if (typeof error?.message === 'string' && error.message.toLowerCase().includes('aborted')) return;
        console.error(`${label} failed:`, error);
      });
  }

  function bindEvents() {
    initAppLifecycle({
      teardownApp,
      onPersistedHide: () => {
        runController?.abort();
        screener?.abort();
        proDecision?.abort();
        wsManager.destroy();
        startup?.suspendForBfcache?.();
      },
      onPersistedShow: () => {
        if (getIsAppDisposed()) return;
        startup?.resumeFromBfcache?.();
        realtimeSession.syncRealtimeSymbols();
        realtimeSession.startRealtimeSession();
        runAsync(() => runController.run(), 'Resume run');
      },
    });

    addListener(el.symTabs, 'click', handleSymbolTabClick);
    addListener(el.chartSymbolSelect, 'change', handleChartSymbolSelectChange);
    addListener(el.ivTabs, 'click', handleIntervalTabClick);

    // Screener column sort
    const screenerThead = el.screenerBody?.closest('table')?.querySelector('thead');
    if (screenerThead) {
      addListener(screenerThead, 'click', (event) => {
        const th = event.target.closest('[data-sort]');
        if (th) sortScreener(th.dataset.sort);
      });
    }

    function handleScreenerRowClick(event) {
      const tr = event.target.closest('.scr-row');
      if (!tr || !tr.dataset.sym) return;
      switchChartSymbol(tr.dataset.sym);
    }
    if (el.screenerBody) addListener(el.screenerBody, 'click', handleScreenerRowClick);
    const coilBody = document.getElementById('coilBody');
    if (coilBody) addListener(coilBody, 'click', handleScreenerRowClick);

    addListener(el.candleCount, 'change', handleCandleCountChange);

    addListener(el.analysisProfileSelect, 'change', () => {
      const nextProfile = resolveAnalysisProfileKey(el.analysisProfileSelect?.value ?? DEFAULT_ANALYSIS_PROFILE);
      if (nextProfile === state.analysisProfile) return;
      state.analysisProfile = nextProfile;
      saveAnalysisProfile(nextProfile);
      runAsync(() => runController.run(), 'Analysis rerun');
      runAsync(() => rerunActiveScreenerMode(), 'Screener rerun');
    });

    addListener(el.refreshBtn, 'click', () => runAsync(() => runController.run(), 'Manual refresh'));
    if (el.proDecisionBtn) addListener(el.proDecisionBtn, 'click', () => runAsync(() => proDecision?.run(), 'Professional decision'));

    ['ema', 'vol', 'grid', 'sr', 'tl', 'fib', 'bb', 'vp', 'trade', 'tradeZones'].forEach((layer) => {
      addListener(el.toggles[layer], 'click', () => {
        toggleLayer(layer);
        saveLayer(layer, state.layers[layer]);
      });
    });

    addListener(el.cv, 'mousemove', chartInteractions.handleCanvasMouseMove);
    addListener(el.cv, 'mousedown', chartInteractions.handleCanvasMouseDown);
    addListener(el.cv, 'mouseleave', chartInteractions.handleCanvasMouseLeave);
    addListener(el.cv, 'touchstart', chartInteractions.handleTouchStart, { passive: false });
    addListener(el.cv, 'touchmove', chartInteractions.handleTouchMove, { passive: false });
    addListener(el.cv, 'touchend', chartInteractions.handleTouchEnd);
    addListener(window, 'mouseup', chartInteractions.handleWindowMouseUp);
    addListener(window, 'resize', chartInteractions.debouncedRedraw);
    // On Android, visualViewport fires after the navbar hides and the viewport
    // settles — more reliable than window.resize during fullscreen transitions.
    if (window.visualViewport) {
      addListener(window.visualViewport, 'resize', chartInteractions.debouncedRedraw);
    }
    addListener(document, 'fullscreenchange', chartInteractions.handleFullscreenChange);

    // Inline handlers (wired via listener registry)
    const btnAddLevel = document.getElementById('btnAddLevel');
    if (btnAddLevel) addListener(btnAddLevel, 'click', chartInteractions.addManualLevel);

    const screenerTopBtn = document.getElementById('screenerTopBtn');
    if (screenerTopBtn) addListener(screenerTopBtn, 'click', () => runAsync(() => screener?.runTop(), 'Top screener'));
    const screenerBreakBtn = document.getElementById('screenerBreakBtn');
    if (screenerBreakBtn) addListener(screenerBreakBtn, 'click', () => runAsync(() => screener?.runBreakout(), 'Breakout screener'));
    const screenerCoilBtn = document.getElementById('screenerCoilBtn');
    if (screenerCoilBtn) addListener(screenerCoilBtn, 'click', () => runAsync(() => screener?.runCoil(), 'Coil screener'));
    const screenerMomentumBtn = document.getElementById('screenerMomentumBtn');
    if (screenerMomentumBtn) addListener(screenerMomentumBtn, 'click', () => runAsync(() => screener?.runMomentum(), 'Momentum screener'));
    if (el.screenerScanBtn) addListener(el.screenerScanBtn, 'click', () => runAsync(() => screener?.runDefault(), 'Default screener'));

    const btnFullscreen = document.getElementById('btnFullscreen');
    if (btnFullscreen) addListener(btnFullscreen, 'click', chartInteractions.handleFullscreen);
    const btnCapture = document.getElementById('btnCapture');
    if (btnCapture) addListener(btnCapture, 'click', chartInteractions.handleCapture);

    // -- Watchlist selector ----------------------------------------------------
    const wlInput = document.getElementById('wlInput');

    function commitWlInput() {
      const raw = wlInput?.value.trim().toUpperCase();
      if (!raw) return;
      const sym = raw.endsWith('USDT') ? raw : `${raw}USDT`;
      const updated = addToWatchlist(sym, state.exchangeSymbols);
      if (updated) {
        renderWatchlistTabs(updated, state.curSym);
        realtimeSession.syncRealtimeSymbols();
      }
      if (wlInput) wlInput.value = '';
    }

    // Triggered when user picks from datalist or presses Enter
    if (wlInput) addListener(wlInput, 'change', commitWlInput);
    if (wlInput) addListener(wlInput, 'keydown', (event) => {
      if (event.key === 'Enter')  { event.preventDefault(); commitWlInput(); }
      if (event.key === 'Escape') { wlInput.value = ''; wlInput.blur(); }
    });

    // Watchlist tabs — click to select, × to remove
    const watchlistTabs = document.getElementById('watchlistTabs');
    function removeWatchlistSymbol(sym) {
      if (!sym) return;
      const wasActive = state.curSym === sym;
      if (wasActive) {
        state.curSym = SYMS[0];
        saveSym(state.curSym);
      }
      const updated = removeFromWatchlist(sym);
      renderWatchlistTabs(updated, state.curSym);
      realtimeSession.syncRealtimeSymbols();
      if (wasActive) {
        switchChartSymbol(SYMS[0]);
      }
    }
    if (watchlistTabs) addListener(watchlistTabs, 'click', (event) => {
      const removeBtn = event.target.closest('.wl-remove');
      const tabBtn = event.target.closest('.stab[data-custom="true"]');

      if (removeBtn) {
        event.stopPropagation();
        removeWatchlistSymbol(removeBtn.dataset.sym);
      } else if (tabBtn) {
        switchChartSymbol(tabBtn.dataset.sym);
      }
    });
    if (watchlistTabs) addListener(watchlistTabs, 'watchlist-remove', (event) => {
      event.stopPropagation();
      removeWatchlistSymbol(event.detail?.sym);
    });
    if (watchlistTabs) addListener(watchlistTabs, 'keydown', (event) => {
      const removeBtn = event.target.closest('.wl-remove');
      const tabBtn = event.target.closest('.stab[data-custom="true"]');
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (removeBtn) {
        removeBtn.click();
      } else if (tabBtn) {
        tabBtn.click();
      }
    });
  }

  return { bindEvents };
}
