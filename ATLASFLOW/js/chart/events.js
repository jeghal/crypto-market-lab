(function initAtlasFlowChartEvents(global) {
  const SHARED = global.AtlasFlowShared || {};
  const normalizeIntervalLabel = SHARED.normalizeIntervalLabel;
  const normalizeSymbol = SHARED.normalizeSymbol;
  const isValidSymbol = SHARED.isValidSymbol;

  function bindChartEvents(canvas, S, options = {}) {
    const { 
      ivTabs, candleCount, symbolSelect, btns, card, tooltip,
      fetchCandles, queueDraw, queuePointerMove, 
      savePrefs, saveLevels, loadLevels,
      syncToggleButtons, setIntervalActive, syncSymbolSelect,
      applyAutoCandleLimit, emitAssistantSnapshot,
      findDeleteZone, findLevelAtY, yToPrice, showTip, hideTip
    } = options;

    function applyContext(symbol, interval) {
      const sym = normalizeSymbol(symbol); if (!isValidSymbol(sym)) return false;
      const nextInterval = normalizeIntervalLabel(interval || S.interval);
      S.symbol = sym;
      S.interval = nextInterval;
      S.pendingTL = null;
      S.cursorTL = null;
      S.trendlines = [];
      loadLevels();
      syncSymbolSelect(S.symbol); setIntervalActive(S.interval); return true;
    }

    ivTabs.addEventListener("click", (e) => {
      const b = e.target.closest(".itab[data-iv]");
      if (!b) return;
      const nextInterval = normalizeIntervalLabel(b.dataset.iv);
      if (nextInterval === normalizeIntervalLabel(S.interval)) return;
      if (applyContext(S.symbol, nextInterval)) {
        applyAutoCandleLimit(S.interval);
        fetchCandles();
      }
    });

    candleCount.addEventListener("change", () => {
      S.limit = SHARED.clamp(Number(candleCount.value) || 100, 10, 400); 
      fetchCandles(); 
    });

    symbolSelect.addEventListener("change", () => {
      const sym = normalizeSymbol(symbolSelect.value);
      const tab = document.querySelector(`#symTabs .stab[data-sym="${sym}"], #watchlistTabs .stab[data-sym="${sym}"]`);
      if (tab) tab.click();
      else if (applyContext(sym, S.interval)) fetchCandles();
    });

    Object.keys(S.layers).forEach((k) => { 
      const b = btns[k]; if (!b) return; 
      b.addEventListener("click", () => { 
        S.layers[k] = !S.layers[k]; 
        if (k === "tl" && !S.layers.tl) { S.pendingTL = null; S.cursorTL = null; } 
        syncToggleButtons(); savePrefs(); queueDraw(); 
      }); 
    });

    if (btns.addLevel) btns.addLevel.addEventListener("click", () => { 
      const last = S.candles[S.candles.length - 1]; if (!last) return; 
      S.levels.push(last.c); S.levels = [...new Set(S.levels.map(Number).filter(Number.isFinite))].sort((a, b) => a - b); 
      saveLevels(); queueDraw(); 
    });

    if (btns.fs) {
      btns.fs.addEventListener("click", async () => {
        try {
          if (document.fullscreenElement === card) await document.exitFullscreen();
          else await card?.requestFullscreen();
        } catch (e) {
          console.warn(e);
        }
      });
    }

    if (btns.capture) btns.capture.addEventListener("click", () => { 
      const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); 
      a.download = `chart-${S.symbol}-${S.interval}.png`; a.click(); 
    });

    function handlePointerMove(clientX, clientY, withTip = true) {
      if (!S.metrics || !S.candles.length) return;
      const r = canvas.getBoundingClientRect();
      const x = clientX - r.left; const y = clientY - r.top;
      if (S.dragLevel >= 0) {
        const nextPrice = yToPrice(S.metrics, y);
        if (Number.isFinite(nextPrice)) { S.levels[S.dragLevel] = nextPrice; queueDraw(); }
        hideTip({ tooltip, S }); return;
      }
      const prevHoverIndex = S.hoverIndex; const prevHoverY = S.hoverY; const prevHoverLevel = S.hoverLevel; const hadCursorTL = !!S.cursorTL;
      const deleteHit = findDeleteZone(S.deleteZones, x, y); const levelHit = findLevelAtY(S.metrics, S.levels, y, 6);
      S.hoverLevel = levelHit;
      if (deleteHit) canvas.style.cursor = "pointer";
      else if (levelHit >= 0) canvas.style.cursor = "ns-resize";
      else canvas.style.cursor = S.layers.tl ? "cell" : "crosshair";
      const idx = Math.floor((x - S.metrics.pad.l) / S.metrics.step);
      if (idx < 0 || idx >= S.candles.length) {
        S.hoverIndex = null; S.hoverY = -1; S.cursorTL = null; hideTip({ tooltip, S });
        if (prevHoverIndex !== null || prevHoverY >= 0 || prevHoverLevel !== -1 || hadCursorTL) queueDraw();
        return;
      }
      const ratio = S.candles.length > 1 ? idx / (S.candles.length - 1) : 0;
      const price = yToPrice(S.metrics, y);
      S.cursorTL = Number.isFinite(price) ? { r: ratio, p: price } : null;
      S.hoverIndex = idx; S.hoverY = y;
      if (withTip) showTip({ tooltip, canvas, S, clientX, clientY, candle: S.candles[idx], idx });
      else hideTip({ tooltip, S });
      const changed = prevHoverIndex !== idx || Math.abs(prevHoverY - y) >= 0.5 || prevHoverLevel !== levelHit || hadCursorTL !== !!S.cursorTL;
      if (changed) queueDraw();
    }

    canvas.addEventListener("mousedown", (e) => {
      if (!S.metrics) return;
      const r = canvas.getBoundingClientRect(); const x = e.clientX - r.left; const y = e.clientY - r.top;
      const deleteHit = findDeleteZone(S.deleteZones, x, y);
      if (deleteHit) { S.levels.splice(deleteHit.index, 1); saveLevels(); queueDraw(); return; }
      const hit = findLevelAtY(S.metrics, S.levels, y, 7);
      if (hit >= 0) { S.dragLevel = hit; canvas.style.cursor = "ns-resize"; e.preventDefault(); }
    });

    window.addEventListener("mouseup", () => {
      if (S.dragLevel >= 0) { S.dragLevel = -1; saveLevels(); canvas.style.cursor = S.layers.tl ? "cell" : "crosshair"; queueDraw(); }
    });

    canvas.addEventListener("mousemove", (e) => { queuePointerMove(e.clientX, e.clientY, true); });
    canvas.addEventListener("click", (e) => {
      if (!S.layers.tl || !S.metrics || !S.candles.length || S.dragLevel >= 0) return;
      const r = canvas.getBoundingClientRect(); const x = e.clientX - r.left; const y = e.clientY - r.top;
      if (findDeleteZone(S.deleteZones, x, y) || findLevelAtY(S.metrics, S.levels, y, 7) >= 0) return;
      const idx = Math.floor((x - S.metrics.pad.l) / S.metrics.step); if (idx < 0 || idx >= S.candles.length) return;
      const ratio = S.candles.length > 1 ? idx / (S.candles.length - 1) : 0; const p = yToPrice(S.metrics, y);
      if (!Number.isFinite(p)) return; if (!S.pendingTL) S.pendingTL = { r: ratio, p }; else { S.trendlines.push({ r1: S.pendingTL.r, p1: S.pendingTL.p, r2: ratio, p2: p }); S.pendingTL = null; } queueDraw();
    });

    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (S.layers.tl && (S.pendingTL || S.trendlines.length)) { if (S.pendingTL) S.pendingTL = null; else S.trendlines.pop(); queueDraw(); return; }
      if (!S.metrics || !S.levels.length) return;
      const r = canvas.getBoundingClientRect(); const y = e.clientY - r.top; const i = findLevelAtY(S.metrics, S.levels, y, 7);
      if (i >= 0) { S.levels.splice(i, 1); saveLevels(); queueDraw(); }
    });

    canvas.addEventListener("mouseleave", () => {
      if (S.dragLevel >= 0) return;
      S.pendingPointer = null; S.hoverIndex = null; S.hoverY = -1; S.cursorTL = null; S.hoverLevel = -1;
      canvas.style.cursor = S.layers.tl ? "cell" : "crosshair"; hideTip({ tooltip, S }); queueDraw();
    });

    canvas.addEventListener("touchstart", (e) => {
      if (!S.metrics) return; const t = e.touches[0]; if (!t) return;
      const r = canvas.getBoundingClientRect(); const x = t.clientX - r.left; const y = t.clientY - r.top;
      const deleteHit = findDeleteZone(S.deleteZones, x, y);
      if (deleteHit) { S.levels.splice(deleteHit.index, 1); saveLevels(); queueDraw(); e.preventDefault(); return; }
      const levelHit = findLevelAtY(S.metrics, S.levels, y, 9);
      if (levelHit >= 0) { S.dragLevel = levelHit; S.touchDragging = true; e.preventDefault(); return; }
      S.touchDragging = false; queuePointerMove(t.clientX, t.clientY, false); e.preventDefault();
    }, { passive: false });

    canvas.addEventListener("touchmove", (e) => {
      const t = e.touches[0]; if (!t) return; queuePointerMove(t.clientX, t.clientY, false); e.preventDefault();
    }, { passive: false });

    canvas.addEventListener("touchend", () => {
      S.pendingPointer = null; if (S.dragLevel >= 0) { S.dragLevel = -1; S.touchDragging = false; saveLevels(); }
      S.hoverIndex = null; S.hoverY = -1; S.cursorTL = null; S.hoverLevel = -1; hideTip({ tooltip, S }); queueDraw();
    });

    document.addEventListener("header:symbol-change", (e) => { 
      const next = normalizeSymbol(e.detail?.symbol); 
      if (!isValidSymbol(next) || next === S.symbol) return; 
      if (applyContext(next, S.interval)) fetchCandles(); 
    });
    document.addEventListener("header:symbol-list-change", () => syncSymbolSelect(S.symbol));
    document.addEventListener("assistant:apply-preset", (e) => {
      const preset = e.detail || {};
      let needsFetch = false;
      if (preset.interval && preset.interval !== S.interval) {
        if (applyContext(S.symbol, preset.interval)) { applyAutoCandleLimit(S.interval); needsFetch = true; }
      }
      if (preset.layers && typeof preset.layers === "object") {
        Object.keys(S.layers).forEach((k) => { if (typeof preset.layers[k] === "boolean") S.layers[k] = preset.layers[k]; });
        syncToggleButtons(); savePrefs();
      }
      if (needsFetch) fetchCandles(); else { queueDraw(); emitAssistantSnapshot(); }
    });

    window.addEventListener("resize", () => queueDraw());
    document.addEventListener("fullscreenchange", () => {
      if (btns.fs) btns.fs.textContent = document.fullscreenElement ? "EXIT" : "FS";
      queueDraw(); setTimeout(queueDraw, 150);
    });

    return { applyContext, handlePointerMove };
  }

  global.AtlasFlowChart = {
    ...(global.AtlasFlowChart || {}),
    bindChartEvents,
  };
})(window);
