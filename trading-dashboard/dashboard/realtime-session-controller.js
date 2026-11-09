import { loadWatchlist } from './watchlist.js';

export function createRealtimeSessionController({
  wsManager,
  state,
  redrawChart,
  runController,
}) {
  function getRealtimeSymbols() {
    return [...new Set(loadWatchlist())];
  }

  function syncRealtimeSymbols() {
    wsManager.setExtraMiniSymbols(getRealtimeSymbols());
  }

  function startRealtimeSession() {
    const realtimeIv = state.effectiveIv ?? state.curIv;
    wsManager
      .onKlineClose(() => runController.run())
      .connect(state.curSym, realtimeIv);
    wsManager.setRedrawChart(redrawChart);
  }

  return {
    startRealtimeSession,
    syncRealtimeSymbols,
  };
}
