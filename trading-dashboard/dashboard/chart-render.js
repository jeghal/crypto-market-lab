import { CHART_PADDING, IV_LABELS } from './config.js';
import { ctx, el } from './dom.js';
import { getSupportResistanceLevels } from './levels.js';
import { state } from './state.js';
import { getChartRangeLabel, getDpr, fmt } from './utils.js';
import { drawGrid, drawVolume, drawEmaLines, drawVolumeProfile, drawSupportResistance, drawTrendlines, drawFibonacci, drawTradeZones, drawTradeLevels, drawBollingerBands, drawPatternMarkers, fmtAxisDate } from './chart-indicators.js';

// Per-frame hit zones for manual level × buttons (DPR-pixels)
const _levelDeleteZones = new Map();

function getTradePlanLevels() {
  const result = state.lastResult;
  if (!result) return null;

  const entry = Number(result.price);
  const stop = Number(result.sl);
  const target = Number(result.tp);

  if (![entry, stop, target].every(Number.isFinite)) return null;
  return { entry, stop, target };
}



export function getChartMetrics(candles) {
  const dpr = getDpr();
  const width = el.cv.width;
  const height = el.cv.height;
  const volumeHeight = state.layers.vol ? height * 0.15 : 0;
  const padTop = CHART_PADDING.top * dpr;
  const padBottom = state.layers.vol ? volumeHeight + CHART_PADDING.bottom * dpr : CHART_PADDING.bottom * dpr;
  const padLeft = CHART_PADDING.left * dpr;
  const padRight = CHART_PADDING.right * dpr;
  const chartHeight = height - padTop - padBottom;
  const chartWidth = width - padLeft - padRight;
  const step = chartWidth / candles.length;
  const bodyWidth = Math.max(1.5 * dpr, step * 0.72);
  let maxPrice = -Infinity, minPrice = Infinity;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].h > maxPrice) maxPrice = candles[i].h;
    if (candles[i].l < minPrice) minPrice = candles[i].l;
  }
  const tradeLevels = getTradePlanLevels();
  if (tradeLevels && (state.layers.trade || state.layers.tradeZones)) {
    maxPrice = Math.max(maxPrice, tradeLevels.entry, tradeLevels.stop, tradeLevels.target);
    minPrice = Math.min(minPrice, tradeLevels.entry, tradeLevels.stop, tradeLevels.target);
  }
  maxPrice *= 1.0012;
  minPrice *= 0.9988;
  const priceRange = maxPrice - minPrice || 1;

  return {
    dpr,
    width,
    height,
    padTop,
    padBottom,
    padLeft,
    padRight,
    chartHeight,
    chartWidth,
    volumeHeight,
    step,
    bodyWidth,
    maxPrice,
    minPrice,
    priceRange,
    tradeLevels,
    py(value) {
      return padTop + chartHeight * (1 - (value - minPrice) / priceRange);
    },
    px(index) {
      return padLeft + index * step + step / 2;
    },
  };
}



















function drawCurrentPriceBadge(metrics, price) {
  if (!Number.isFinite(price)) return;
  const py = metrics.py(price);
  
  // Find current change to determine color
  const candle = state.chartCandles.at(-1);
  const isGreen = candle ? price >= candle.o : true;
  const color = isGreen ? '#00e896' : '#ff3a5c';
  const glow = isGreen ? 'rgba(0,232,150,0.35)' : 'rgba(255,58,92,0.35)';

  ctx.save();
  
  // 1. Dashed Horizontal Line
  ctx.beginPath();
  ctx.strokeStyle = `${color}66`; // Low opacity version of the color
  ctx.lineWidth = 1 * metrics.dpr;
  ctx.setLineDash([5 * metrics.dpr, 4 * metrics.dpr]);
  ctx.moveTo(metrics.padLeft, py);
  ctx.lineTo(metrics.width - metrics.padRight, py);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. The Price Badge (Label)
  const label = `$${fmt(price, price > 100 ? 2 : 4)}`;
  ctx.font = `bold ${10 * metrics.dpr}px monospace`;
  const tw = ctx.measureText(label).width;
  const bw = tw + 14 * metrics.dpr;
  const bh = 22 * metrics.dpr;
  
  // Clamp to chart area vertically
  const cappedPy = Math.max(metrics.padTop + bh/2, Math.min(py, metrics.height - metrics.padBottom - bh/2));
  const bx = metrics.width - metrics.padRight + 1 * metrics.dpr;
  const by = cappedPy - bh / 2;

  // Badge background & glow
  ctx.shadowColor = glow;
  ctx.shadowBlur = 6 * metrics.dpr;
  ctx.fillStyle = color;
  ctx.beginPath();
  
  // Polished Tag Shape (pointed on left)
  const tipSize = 6 * metrics.dpr;
  ctx.moveTo(bx + tipSize, by);
  ctx.lineTo(bx + bw, by);
  ctx.lineTo(bx + bw, by + bh);
  ctx.lineTo(bx + tipSize, by + bh);
  ctx.lineTo(bx, by + bh / 2);
  ctx.closePath();
  ctx.fill();
  
  ctx.shadowBlur = 0;

  // Text inside the badge
  ctx.fillStyle = '#070f1c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, bx + (bw + tipSize/2) / 2, by + bh / 2);
  
  ctx.restore();
}



function drawHoverPriceBadge(metrics) {
  if (state.hoverIndex < 0 || state.hoverY < 0) return;

  const py = state.hoverY * metrics.dpr;
  if (py < metrics.padTop || py > metrics.height - metrics.padBottom) return;

  const price = metrics.minPrice + (1 - (py - metrics.padTop) / metrics.chartHeight) * metrics.priceRange;
  if (!Number.isFinite(price) || price <= 0) return;

  const label = `$${fmt(price, price > 100 ? 0 : 3)}`;
  ctx.save();

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(126,184,255,0.28)';
  ctx.lineWidth = metrics.dpr;
  ctx.setLineDash([4 * metrics.dpr, 4 * metrics.dpr]);
  ctx.moveTo(metrics.padLeft, py);
  ctx.lineTo(metrics.width - metrics.padRight, py);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = `700 ${9 * metrics.dpr}px monospace`;
  const tw = ctx.measureText(label).width;
  const bw = tw + 12 * metrics.dpr;
  const bh = 18 * metrics.dpr;
  const bx = metrics.width - metrics.padRight + 2 * metrics.dpr;
  const cappedPy = Math.max(metrics.padTop + bh / 2, Math.min(py, metrics.height - metrics.padBottom - bh / 2));
  const by = cappedPy - bh / 2;

  ctx.fillStyle = 'rgba(7,15,28,0.92)';
  ctx.strokeStyle = 'rgba(126,184,255,0.5)';
  ctx.lineWidth = metrics.dpr;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 8 * metrics.dpr);
  else ctx.rect(bx, by, bw, bh);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#b9d5ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, bx + bw / 2, by + bh / 2);
  ctx.restore();
}



function drawCandles(metrics, candles, rvolArr) {
  const lastIdx = candles.length - 1;

  candles.forEach((candle, index) => {
    const isGreen = candle.c >= candle.o;
    const color = isGreen ? '#00e896' : '#ff3a5c';
    const x = metrics.px(index);
    const yOpen = metrics.py(candle.o);
    const yClose = metrics.py(candle.c);
    const yHigh = metrics.py(candle.h);
    const yLow = metrics.py(candle.l);
    const top = Math.min(yOpen, yClose);
    const bottom = Math.max(yOpen, yClose);
    const bodyHeight = Math.max(1.5 * metrics.dpr, bottom - top);
    const rvol = rvolArr?.[index] ?? null;
    const isLive = index === lastIdx;

    if (index === state.hoverIndex) {
      ctx.fillStyle = 'rgba(255,255,255,.03)';
      ctx.fillRect(x - metrics.step / 2, metrics.padTop, metrics.step, metrics.chartHeight);
    }

    // RVOL > 2× glow — exceptional volume candle
    if (rvol !== null && rvol > 2) {
      ctx.shadowColor = isGreen ? 'rgba(0,232,150,0.55)' : 'rgba(255,58,92,0.55)';
      ctx.shadowBlur = 10 * metrics.dpr;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.8, metrics.dpr * 0.9);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    const alpha = index === state.hoverIndex ? 1 : 0.78;
    ctx.fillStyle = isGreen ? `rgba(0,232,150,${alpha})` : `rgba(255,58,92,${alpha})`;
    ctx.strokeStyle = isLive ? 'rgba(255,215,0,0.9)' : color;
    ctx.lineWidth = isLive ? 1.8 * metrics.dpr : Math.max(0.8, metrics.dpr * 0.9);
    if (isLive) {
      ctx.shadowColor = 'rgba(255,215,0,0.55)';
      ctx.shadowBlur = 8 * metrics.dpr;
    }
    ctx.beginPath();

    if (ctx.roundRect) {
      ctx.roundRect(x - metrics.bodyWidth / 2, top, metrics.bodyWidth, bodyHeight, metrics.dpr);
    } else {
      ctx.rect(x - metrics.bodyWidth / 2, top, metrics.bodyWidth, bodyHeight);
    }

    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Live candle — small gold dot above/below the wick
    if (isLive) {
      const dotY = isGreen ? yHigh - 6 * metrics.dpr : yLow + 6 * metrics.dpr;
      ctx.fillStyle = 'rgba(255,215,0,0.9)';
      ctx.beginPath();
      ctx.arc(x, dotY, 2.5 * metrics.dpr, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawCrosshair(metrics, candles) {
  if (state.hoverIndex < 0 || state.hoverIndex >= candles.length) return;

  const x = metrics.px(state.hoverIndex);
  const iv = state.lastResult?.chartIv ?? '15m';

  ctx.strokeStyle = 'rgba(0,200,255,.18)';
  ctx.lineWidth = metrics.dpr;
  ctx.setLineDash([4 * metrics.dpr, 4 * metrics.dpr]);
  ctx.beginPath();
  ctx.moveTo(x, metrics.padTop);
  ctx.lineTo(x, metrics.height - metrics.padBottom);
  ctx.stroke();
  ctx.setLineDash([]);

  // Date/time badge on X axis below the crosshair
  const ts = candles[state.hoverIndex]?.t;
  if (!ts) return;
  const { line1, line2 } = fmtAxisDate(ts, iv);
  const label = line2 ? `${line1}  ${line2}` : line1;

  ctx.save();
  ctx.font = `${8 * metrics.dpr}px monospace`;
  ctx.textAlign = 'center';
  const tw = ctx.measureText(label).width;
  const bw = tw + 10 * metrics.dpr;
  const bh = 15 * metrics.dpr;
  const bx = x - bw / 2;
  const by = metrics.height - metrics.padBottom + 2 * metrics.dpr;

  ctx.fillStyle = 'rgba(7,15,28,0.88)';
  ctx.strokeStyle = 'rgba(0,200,255,0.45)';
  ctx.lineWidth = metrics.dpr;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 3 * metrics.dpr);
  else ctx.rect(bx, by, bw, bh);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(0,200,255,0.9)';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, by + bh / 2);
  ctx.restore();
}

function drawChartLabel(metrics, candlesCount) {
  const result = state.lastResult;
  if (!result) return;

  const ivLabel = IV_LABELS[result.chartIv] || result.chartIv;

  ctx.fillStyle = 'rgba(45,68,96,.5)';
  ctx.font = `${8 * metrics.dpr}px monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(
    `${result.sym} | ${ivLabel} | EMA (7, 21, 50) | ${candlesCount}`,
    metrics.width - metrics.padRight - 4 * metrics.dpr,
    metrics.padTop - 7 * metrics.dpr,
  );
}

function drawManualLevels(metrics) {
  if (!state.manualLevels.length) return;
  _levelDeleteZones.clear();

  const dpr = metrics.dpr;
  ctx.save();
  ctx.font = `${8 * dpr}px monospace`;

  state.manualLevels.forEach((price, index) => {
    const rawY = metrics.py(price);
    const chartTop = metrics.padTop;
    const chartBottom = metrics.height - metrics.padBottom;
    const offScreen = rawY < chartTop || rawY > chartBottom;
    // Clamp to chart edge so badge + × button remain accessible when level is off-screen
    const y = Math.max(chartTop + 1, Math.min(chartBottom - 1, rawY));

    const isActive = index === state.hoveredLevelIndex || index === state.draggingLevelIndex;

    if (!offScreen) {
      // Dashed horizontal line — only when on-screen
      ctx.strokeStyle = isActive ? 'rgba(255,220,50,1)' : 'rgba(255,220,50,0.55)';
      ctx.lineWidth = isActive ? 1.8 * dpr : dpr;
      ctx.setLineDash([6 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(metrics.padLeft, y);
      ctx.lineTo(metrics.width - metrics.padRight, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Price badge — dimmed when off-screen, shows ▲/▼ arrow to indicate direction
    const arrow = offScreen ? (rawY < chartTop ? ' ▲' : ' ▼') : '';
    const label = `$${fmt(price, price > 100 ? 0 : 3)}${arrow}`;
    const tw = ctx.measureText(label).width;
    const pad = 5 * dpr;
    const xBtnSize = 12 * dpr;
    const bw = tw + pad * 2 + xBtnSize + 4 * dpr;
    const bh = 15 * dpr;
    const bx = metrics.width - metrics.padRight + 3 * dpr;
    const by = y - bh / 2;

    const alpha = offScreen ? 0.5 : 1;
    ctx.fillStyle = isActive ? `rgba(255,220,50,${0.2 * alpha})` : `rgba(255,220,50,${0.07 * alpha})`;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 3 * dpr);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();

    ctx.strokeStyle = isActive ? `rgba(255,220,50,${0.7 * alpha})` : `rgba(255,220,50,${0.28 * alpha})`;
    ctx.lineWidth = dpr;
    ctx.stroke();

    ctx.fillStyle = isActive ? `rgba(255,230,60,${alpha})` : `rgba(255,220,50,${0.85 * alpha})`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, bx + pad, y);

    // × delete button (always drawn, highlighted when active)
    const xBx = bx + bw - xBtnSize - 2 * dpr;
    const xBy = y - xBtnSize / 2;
    ctx.fillStyle = isActive ? `rgba(255,70,70,${0.85 * alpha})` : `rgba(120,60,60,${0.4 * alpha})`;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(xBx, xBy, xBtnSize, xBtnSize, 2 * dpr);
    else ctx.rect(xBx, xBy, xBtnSize, xBtnSize);
    ctx.fill();
    ctx.fillStyle = isActive ? 'rgba(255,255,255,1)' : `rgba(255,255,255,${0.5 * alpha})`;
    ctx.textAlign = 'center';
    ctx.fillText('×', xBx + xBtnSize / 2, y);

    _levelDeleteZones.set(index, { x: xBx, y: xBy, w: xBtnSize, h: xBtnSize });
  });

  ctx.restore();
}

export function getHitInfo(cssMouseX, cssMouseY) {
  if (!state.manualLevels.length || !state.chartCandles.length) return null;
  const metrics = getChartMetrics(state.chartCandles);
  const mx = cssMouseX * metrics.dpr;
  const my = cssMouseY * metrics.dpr;
  const hitZone = 7 * metrics.dpr;

  const chartTop = metrics.padTop;
  const chartBottom = metrics.height - metrics.padBottom;

  for (let i = 0; i < state.manualLevels.length; i++) {
    // × button takes priority (uses stored DZ which is already at clamped y)
    const dz = _levelDeleteZones.get(i);
    if (dz && mx >= dz.x && mx <= dz.x + dz.w && my >= dz.y && my <= dz.y + dz.h) {
      return { type: 'delete', index: i };
    }
    // Line hit — use clamped y so off-screen levels are draggable from edge
    const rawY = metrics.py(state.manualLevels[i]);
    const clampedY = Math.max(chartTop + 1, Math.min(chartBottom - 1, rawY));
    if (Math.abs(clampedY - my) <= hitZone) {
      return { type: 'line', index: i };
    }
  }
  return null;
}

export function drawChart(metrics, candles, ema7arr, ema21arr, ema50arr, bbArr, trendlines, fibData, currentPrice, patterns, rvolArr) {
  drawGrid(metrics, candles, currentPrice);
  drawVolume(metrics, candles, rvolArr);
  drawVolumeProfile(metrics, candles);
  drawTradeZones(metrics);
  drawFibonacci(metrics, fibData);
  drawSupportResistance(metrics, candles);
  drawTrendlines(metrics, trendlines);
  drawBollingerBands(metrics, bbArr);
  drawEmaLines(metrics, candles.length, ema7arr, ema21arr, ema50arr);
  drawCandles(metrics, candles, rvolArr);
  drawPatternMarkers(metrics, candles, patterns);
  drawTradeLevels(metrics);
  drawManualLevels(metrics);
  drawCrosshair(metrics, candles);
  drawCurrentPriceBadge(metrics, currentPrice);
  drawHoverPriceBadge(metrics);
  drawChartLabel(metrics, candles.length);
}