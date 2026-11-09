export function createScreenerController({
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
  getMomentumScannerController,
} = {}) {
  let controller = null;
  let mode = 'default'; // 'default' | 'top' | 'breakout' | 'coil' | 'momentum'

  function isCurrentRun(runController) {
    return controller === runController && !runController.signal.aborted;
  }

  function setModeUI(nextMode) {
    document.querySelectorAll('.scr-mode-btn').forEach((btn) => btn.classList.remove('active'));
    const ids = {
      default: 'screenerScanBtn',
      top: 'screenerTopBtn',
      breakout: 'screenerBreakBtn',
      coil: 'screenerCoilBtn',
      momentum: 'screenerMomentumBtn',
    };
    document.getElementById(ids[nextMode])?.classList.add('active');

    const screenerTable = document.getElementById('screenerTable');
    const coilTable = document.getElementById('coilTable');
    if (screenerTable) screenerTable.style.display = nextMode === 'coil' ? 'none' : '';
    if (coilTable) coilTable.style.display = nextMode === 'coil' ? '' : 'none';
  }

  function abort() {
    controller?.abort();
    controller = null;
  }

  function setMode(nextMode) {
    mode = nextMode;
    setModeUI(mode);
  }

  function beginRun(nextMode) {
    abort();
    setMode(nextMode);
    const runController = new AbortController();
    controller = runController;
    setScreenerLoading(true);
    return runController;
  }

  function endRun(runController) {
    if (controller === runController) controller = null;
    if (!runController.signal.aborted) setScreenerLoading(false);
  }

  async function runDefault() {
    const runController = beginRun('default');
    renderScreener([], 'جارٍ المسح...');
    try {
      const screenerSyms = getAllSymbols();
      const settled = await Promise.allSettled(
        screenerSyms.map((sym) => buildScreenerRow(sym, runController.signal, getActiveAnalysisProfile())),
      );

      if (!isCurrentRun(runController)) return;

      const rows = settled.map((res, i) =>
        res.status === 'fulfilled' ? res.value : { sym: screenerSyms[i], error: true },
      );
      renderScreener(rows);
    } catch (err) {
      if (!isCurrentRun(runController) || err.name === 'AbortError') return;
      console.error('Default screener failed:', err);
    } finally {
      endRun(runController);
    }
  }

  async function runTop() {
    const runController = beginRun('top');
    renderScreener([], 'جارٍ المسح...');
    try {
      const topSyms = await getTopGainers(8, runController.signal);
      const settled = await Promise.allSettled(
        topSyms.map((sym) => buildScreenerRow(sym, runController.signal, getActiveAnalysisProfile())),
      );

      if (!isCurrentRun(runController)) return;

      const rows = settled.map((res, i) =>
        res.status === 'fulfilled' ? res.value : { sym: topSyms[i], error: true },
      );
      renderScreener(rows);
    } catch (err) {
      if (!isCurrentRun(runController) || err.name === 'AbortError') return;
      console.error('Top screener failed:', err);
    } finally {
      endRun(runController);
    }
  }

  async function runBreakout() {
    const runController = beginRun('breakout');
    renderScreener([], 'جارٍ المسح...');

    try {
      const breakSyms = await getBreakoutCandidates(8, runController.signal);
      if (!breakSyms.length) {
        if (isCurrentRun(runController)) {
          renderScreener([], 'لا توجد نتائج مطابقة لمعايير البحث');
        }
        return;
      }

      const settled = await Promise.allSettled(
        breakSyms.map((sym) => buildScreenerRow(sym, runController.signal, getActiveAnalysisProfile())),
      );

      if (!isCurrentRun(runController)) return;

      const rows = settled.map((res, i) =>
        res.status === 'fulfilled' ? res.value : { sym: breakSyms[i], error: true },
      );
      renderScreener(rows);
    } catch (err) {
      if (!isCurrentRun(runController) || err.name === 'AbortError') return;
      console.error('Breakout screener failed:', err);
    } finally {
      endRun(runController);
    }
  }

  async function runCoil() {
    const runController = beginRun('coil');

    try {
      const syms = getAllSymbols();
      const settled = await Promise.allSettled(
        syms.map((sym) => buildCoilRow(sym, runController.signal)),
      );
      if (!isCurrentRun(runController)) return;
      const rows = settled
        .map((res) => (res.status === 'fulfilled' ? res.value : null))
        .filter(Boolean);
      renderCoilScreener(rows);
    } catch (err) {
      if (!isCurrentRun(runController) || err.name === 'AbortError') return;
      console.error('Coil screener failed:', err);
    } finally {
      endRun(runController);
    }
  }

  async function runMomentum() {
    abort();
    setMode('momentum');
    const runController = new AbortController();
    controller = runController;
    renderMomentumScreener([], 'جارٍ فحص الانفجارات اللحظية في الخلفية...');
    try {
      const scanner = getMomentumScannerController?.();
      if (!scanner?.run) {
        renderMomentumScreener([], 'ماسح اللحظي غير جاهز حالياً');
        return;
      }

      const rows = await scanner.run(runController.signal);
      if (!isCurrentRun(runController)) return;
      renderMomentumScreener(rows ?? []);
    } catch (err) {
      if (!isCurrentRun(runController) || err.name === 'AbortError') return;
      console.error('Momentum screener failed:', err);
      renderMomentumScreener([], 'فشل فحص الانفجار اللحظي');
    } finally {
      if (controller === runController) controller = null;
    }
  }

  function runActive() {
    if (mode === 'top') return runTop();
    if (mode === 'breakout') return runBreakout();
    if (mode === 'coil') return runCoil();
    if (mode === 'momentum') return runMomentum();
    return runDefault();
  }

  // Set initial UI state early (script is loaded at end of body).
  setModeUI(mode);

  return {
    getMode: () => mode,
    setMode,
    abort,
    runDefault,
    runTop,
    runBreakout,
    runCoil,
    runMomentum,
    runActive,
    dispose: abort,
  };
}
