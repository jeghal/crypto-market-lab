export function createAppTeardown({
  getIsDisposed,
  setIsDisposed,
  runController,
  screener,
  tradeCalc,
  proDecision,
  wsManager,
  workerPool,
  destroySentiment,
  getMomentumScannerController,
  setMomentumScannerController,
  getStartup,
  removeAllListeners,
}) {
  return function teardownApp() {
    if (getIsDisposed?.()) return;
    setIsDisposed?.(true);

    runController?.abort?.();
    screener?.abort?.();
    tradeCalc?.dispose?.();
    proDecision?.abort?.();
    wsManager?.destroy?.();
    workerPool?.terminate?.();
    destroySentiment?.();

    const scannerController = getMomentumScannerController?.();
    scannerController?.dispose?.();
    setMomentumScannerController?.(null);

    const startup = getStartup?.();
    startup?.dispose?.();

    removeAllListeners?.();
  };
}
