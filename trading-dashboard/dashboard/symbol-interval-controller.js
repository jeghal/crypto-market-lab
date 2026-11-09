export function createSymbolIntervalController({
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
  onSymbolChange,
}) {
  function switchChartSymbol(sym) {
    if (!sym || sym === state.curSym) return;
    state.curSym = sym;
    syncActiveSymbolTab(state.curSym);
    saveSym(state.curSym);
    loadManualLevelsForCurrentContext();
    clearChartState();
    // Reset calculator entry/TP/SL (keep amount and fees)
    if (el.tc.entry) el.tc.entry.value = '';
    if (el.tc.target) el.tc.target.value = '';
    if (el.tc.stop) el.tc.stop.value = '';
    if (el.tc.trigger) el.tc.trigger.value = '';
    tradeCalc?.clearQuickButtons();
    tradeCalc?.persist();
    tradeCalc?.render();
    tradeCalc?.renderTriggerWarning();
    wsManager.reconnect(state.curSym, state.curIv);
    runController.run();
    onSymbolChange?.(state.curSym);
  }

  function handleSymbolTabClick(event) {
    const button = event.target.closest('.stab');
    if (!button) return;
    switchChartSymbol(button.dataset.sym);
  }

  function handleChartSymbolSelectChange(event) {
    switchChartSymbol(event.target.value);
  }

  function handleIntervalTabClick(event) {
    const button = event.target.closest('.itab');
    if (!button) return;
    activateTab(el.ivTabs.querySelectorAll('.itab'), button);
    state.curIv = button.dataset.iv;
    saveIv(state.curIv);
    loadManualLevelsForCurrentContext();
    clearChartState();
    wsManager.reconnect(state.curSym, state.curIv);
    runController.run();
  }

  return {
    handleChartSymbolSelectChange,
    handleIntervalTabClick,
    handleSymbolTabClick,
    switchChartSymbol,
  };
}
