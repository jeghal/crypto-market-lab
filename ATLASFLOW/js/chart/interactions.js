(function initCreptoChartInteractions(global) {
  const SHARED = global.CreptoShared || {};
  const clamp = SHARED.clamp || function clampFallback(v, min, max) {
    return Math.max(min, Math.min(max, v));
  };

  function findDeleteZone(deleteZones, x, y) {
    return (Array.isArray(deleteZones) ? deleteZones : []).find(
      (z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h
    );
  }

  function findLevelAtY(metrics, levels, y, tolerance = 7) {
    if (!metrics || !Array.isArray(levels)) return -1;
    for (let i = 0; i < levels.length; i += 1) {
      if (Math.abs(metrics.y(levels[i]) - y) <= tolerance) return i;
    }
    return -1;
  }

  function yToPrice(metrics, localY) {
    if (!metrics) return null;
    const y = clamp(localY, metrics.pad.t, metrics.pad.t + metrics.chH);
    return metrics.max - ((y - metrics.pad.t) / metrics.chH) * metrics.range;
  }

  function showTip({ tooltip, canvas, S, priceLabel, clientX, clientY, candle, idx }) {
    if (!tooltip || !canvas || !S || !candle) return;
    if (!S.tipRows) {
      const rows = Array.from({ length: 8 }, () => document.createElement("div"));
      rows[0].style.cssText = "color:#8aa3bd;margin-bottom:3px;";
      tooltip.replaceChildren(...rows);
      S.tipRows = rows;
    }
    if (S.tipLastIdx !== idx || S.tipLastTs !== candle.t) {
      const d = new Date(candle.t);
      const lines = [
        d.toLocaleString(),
        `O ${priceLabel(candle.o)}`,
        `H ${priceLabel(candle.h)}`,
        `L ${priceLabel(candle.l)}`,
        `C ${priceLabel(candle.c)}`,
        `EMA7 ${priceLabel(S.ema7[idx])}`,
        `EMA21 ${priceLabel(S.ema21[idx])}`,
        `EMA50 ${priceLabel(S.ema50[idx])}`,
      ];
      lines.forEach((line, i) => {
        S.tipRows[i].textContent = line;
      });
      S.tipLastIdx = idx;
      S.tipLastTs = candle.t;
    }

    const r = canvas.parentElement?.getBoundingClientRect();
    if (!r) return;
    const lx = clientX - r.left;
    const ly = clientY - r.top;
    tooltip.style.right = `${Math.max(8, r.width - lx + 10)}px`;
    tooltip.style.top = `${Math.max(8, ly - 8)}px`;
    tooltip.style.opacity = "1";
  }

  function hideTip({ tooltip, S }) {
    if (tooltip) tooltip.style.opacity = "0";
    if (S) {
      S.tipLastIdx = -1;
      S.tipLastTs = 0;
    }
  }

  global.CreptoChart = {
    ...(global.CreptoChart || {}),
    findDeleteZone,
    findLevelAtY,
    yToPrice,
    showTip,
    hideTip,
  };
})(window);
