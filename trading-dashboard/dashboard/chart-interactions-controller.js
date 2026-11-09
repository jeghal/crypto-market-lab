import { clearHover, getHoveredCandleData, getHitInfo, redrawChart, yToPrice } from './chart.js';
import { el } from './dom.js';
import { addListener } from './listener-registry.js';
import { saveCandleLimit } from './storage.js';
import { state } from './state.js';
import { last } from './utils.js';
import { hideTooltip, renderTooltip, updateOHLC } from './ui-tooltip.js';
import { normalizeCandleLimit } from './candle-limit.js';

export function createChartInteractionsController({
  runController,
  saveManualLevelsForCurrentContext,
}) {
  let undoTimer = null;
  const touchState = { single: null, pinchDist: null, pinchBaseLimit: 100 };

  async function lockLandscapeOrientation() {
    const orientation = screen.orientation;
    if (!orientation?.lock) return;
    try {
      await orientation.lock('landscape');
    } catch (e) {
      if (e.name !== 'NotSupportedError') {
        console.warn('Orientation lock failed:', e);
      }
    }
  }

  function unlockOrientation() {
    const orientation = screen.orientation;
    if (!orientation?.unlock) return;
    try {
      orientation.unlock();
    } catch (e) {
      console.warn('Orientation unlock failed:', e);
    }
  }

  function scheduleFullscreenRedraw() {
    // Retry pattern: Android fullscreen + orientation-lock transition takes ~400-600ms.
    // Each call to redrawChart() skips silently if getFullscreenCanvasHeight() returns null
    // (layout not ready), so extra retries are cheap.
    redrawChart();
    setTimeout(redrawChart, 150);
    setTimeout(redrawChart, 400);
    setTimeout(redrawChart, 750); // Final safety net for slow Android devices
  }

  async function handleFullscreen() {
    const card = document.querySelector('.card-chart');
    if (!card) return;
    if (!document.fullscreenElement) {
      if (!card.requestFullscreen) return;
      try {
        await card.requestFullscreen();
        await lockLandscapeOrientation();
      } catch (e) {
        console.warn('Request fullscreen failed:', e);
      }
    } else {
      document.exitFullscreen?.();
    }
  }

  function handleFullscreenChange() {
    const btn = document.getElementById('btnFullscreen');
    if (!document.fullscreenElement) unlockOrientation();
    if (btn) btn.textContent = document.fullscreenElement ? '\u2922' : '\u26F6';
    scheduleFullscreenRedraw();
  }

  function handleCapture() {
    const sym = state.curSym.replace('USDT', '');
    const now = new Date();
    const ts = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('') + '_' + [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
    ].join('');
    const link = document.createElement('a');
    link.download = `${sym}_${state.curIv}_${ts}.png`;
    link.href = el.cv.toDataURL('image/png');
    link.click();
  }

  function handleCanvasMouseMove(event) {
    const rect = el.cv.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Dragging a manual level
    if (state.draggingLevelIndex >= 0) {
      const price = yToPrice(mouseY);
      if (price !== null) state.manualLevels[state.draggingLevelIndex] = price;
      redrawChart();
      return;
    }

    // Hover detection for manual levels
    const hit = getHitInfo(mouseX, mouseY);
    const newHover = hit ? hit.index : -1;
    state.hoveredLevelIndex = newHover;
    el.cv.style.cursor = newHover >= 0 ? 'ns-resize' : '';

    // Normal crosshair / tooltip
    const hovered = getHoveredCandleData(event);
    if (hovered) {
      updateOHLC(hovered.candle);
      renderTooltip(hovered.candle, event, hovered.rect);
    } else {
      hideTooltip();
      updateOHLC(last(state.chartCandles));
    }
    redrawChart();
  }

  function showUndoToast(price, index) {
    const existing = document.getElementById('undoToast');
    if (existing) { existing.remove(); clearTimeout(undoTimer); }

    const toast = document.createElement('div');
    toast.id = 'undoToast';
    toast.append(document.createTextNode('مستوى محذوف '));
    const undoBtn = document.createElement('button');
    undoBtn.id = 'undoBtn';
    undoBtn.textContent = '\u21A9 تراجع';
    toast.append(undoBtn);
    document.body.appendChild(toast);

    const dismiss = () => { toast.remove(); clearTimeout(undoTimer); };
    undoTimer = setTimeout(dismiss, 4000);

    addListener(undoBtn, 'click', () => {
      dismiss();
      state.manualLevels.splice(index, 0, price);
      saveManualLevelsForCurrentContext();
      redrawChart();
    });
  }

  function handleCanvasMouseDown(event) {
    const rect = el.cv.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const hit = getHitInfo(mouseX, mouseY);
    if (!hit) return;

    if (hit.type === 'delete') {
      const deletedPrice = state.manualLevels[hit.index];
      const deletedIndex = hit.index;
      state.manualLevels.splice(hit.index, 1);
      state.hoveredLevelIndex = -1;
      saveManualLevelsForCurrentContext();
      redrawChart();
      showUndoToast(deletedPrice, deletedIndex);
      return;
    }

    // Start drag
    state.draggingLevelIndex = hit.index;
    el.cv.style.cursor = 'ns-resize';
    event.preventDefault();
  }

  function handleCanvasMouseLeave() {
    if (state.draggingLevelIndex < 0) {
      state.hoveredLevelIndex = -1;
      el.cv.style.cursor = '';
      clearHover();
      hideTooltip();
      updateOHLC(last(state.chartCandles));
      redrawChart();
    }
  }

  function handleWindowMouseUp() {
    if (state.draggingLevelIndex >= 0) {
      saveManualLevelsForCurrentContext();
      state.draggingLevelIndex = -1;
      el.cv.style.cursor = '';
      redrawChart();
    }
  }

  function addManualLevel() {
    const candles = state.chartCandles;
    if (!candles.length) return;
    const price = state.lastResult?.price ?? (candles[candles.length - 1].c);
    state.manualLevels.push(price);
    saveManualLevelsForCurrentContext();
    redrawChart();
  }

  function handleTouchStart(event) {
    if (event.cancelable) event.preventDefault();
    if (event.touches.length === 1) {
      touchState.single = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      touchState.pinchDist = null;
      handleCanvasMouseMove({ clientX: event.touches[0].clientX, clientY: event.touches[0].clientY });
    } else if (event.touches.length === 2) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      touchState.pinchDist = Math.hypot(dx, dy);
      touchState.pinchBaseLimit = state.candleLimit;
      touchState.single = null;
    }
  }

  function handleTouchMove(event) {
    if (event.touches.length === 2 && touchState.pinchDist !== null) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const scale = touchState.pinchDist / newDist;
      const newLimit = normalizeCandleLimit(Math.round(
        Math.max(10, Math.min(200, touchState.pinchBaseLimit * scale)),
      ), el.candleCount, state.candleLimit);
      if (newLimit !== state.candleLimit) {
        state.candleLimit = newLimit;
        saveCandleLimit(newLimit);
        el.candleCount.value = String(newLimit);
        redrawChart();
      }
    } else if (event.touches.length === 1 && touchState.single !== null) {
      touchState.single.x = event.touches[0].clientX;
      touchState.single.y = event.touches[0].clientY;
      handleCanvasMouseMove({ clientX: event.touches[0].clientX, clientY: event.touches[0].clientY });
    }
    
    if (event.cancelable) event.preventDefault();
  }

  function handleTouchEnd(event) {
    if (touchState.pinchDist !== null && event.touches.length < 2) {
      saveCandleLimit(state.candleLimit);
      runController?.run();
      touchState.pinchDist = null;
    }
    if (event.touches.length === 0) {
      handleCanvasMouseLeave();
      touchState.single = null;
    }
  }

  function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  const debouncedRedraw = debounce(redrawChart, 100);

  return {
    addManualLevel,
    debouncedRedraw,
    handleCanvasMouseDown,
    handleCanvasMouseLeave,
    handleCanvasMouseMove,
    handleCapture,
    handleFullscreen,
    handleFullscreenChange,
    handleTouchEnd,
    handleTouchMove,
    handleTouchStart,
    handleWindowMouseUp,
  };
}
