import { FIB_COLORS } from './config.js';
import { ctx } from './dom.js';
import { getSupportResistanceLevels } from './levels.js';
import { state } from './state.js';
import { fmt } from './utils.js';

export function fmtAxisDate(ts, iv) {
  const d = new Date(ts);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const dm = `${d.getDate()}/${d.getMonth() + 1}`;
  return ['5m', '15m', '1h', '4h'].includes(iv)
    ? { line1: hm, line2: dm }
    : { line1: dm, line2: null };
}

export function drawGrid(metrics, candles, currentPrice) {
  if (!state.layers.grid) return;

  const candlesCount = candles.length;
  const iv = state.lastResult?.chartIv ?? '15m';
  const gridCount = 6;
  const priceBadgeY = Number.isFinite(currentPrice) ? metrics.py(currentPrice) : -999;
  const skipZone = 13 * metrics.dpr;

  ctx.strokeStyle = 'rgba(20,32,47,.85)';
  ctx.lineWidth = metrics.dpr;

  for (let index = 0; index <= gridCount; index += 1) {
    const y = metrics.padTop + metrics.chartHeight * (index / gridCount);
    ctx.beginPath();
    ctx.moveTo(metrics.padLeft, y);
    ctx.lineTo(metrics.width - metrics.padRight, y);
    ctx.stroke();

    if (Math.abs(y - priceBadgeY) < skipZone) continue;

    const price = metrics.maxPrice - metrics.priceRange * (index / gridCount);
    ctx.fillStyle = 'rgba(45,68,96,.72)';
    ctx.font = `${8.5 * metrics.dpr}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(`$${fmt(price, price > 100 ? 0 : 3)}`, metrics.width - metrics.padRight + 4 * metrics.dpr, y + 3 * metrics.dpr);
  }

  ctx.strokeStyle = 'rgba(20,32,47,.45)';
  const verticalLines = Math.min(8, Math.floor(candlesCount / 10));

  for (let index = 1; index < verticalLines; index += 1) {
    const x = metrics.padLeft + metrics.chartWidth * (index / verticalLines);
    ctx.beginPath();
    ctx.moveTo(x, metrics.padTop);
    ctx.lineTo(x, metrics.height - metrics.padBottom);
    ctx.stroke();

    const ci = Math.min(candlesCount - 1, Math.round((index / verticalLines) * candlesCount));
    const ts = candles[ci]?.t;
    if (ts) {
      const { line1, line2 } = fmtAxisDate(ts, iv);
      ctx.fillStyle = 'rgba(45,68,96,.7)';
      ctx.font = `${7 * metrics.dpr}px monospace`;
      ctx.textAlign = 'center';
      const baseY = metrics.height - metrics.padBottom + 9 * metrics.dpr;
      ctx.fillText(line1, x, baseY);
      if (line2) ctx.fillText(line2, x, baseY + 10 * metrics.dpr);
    }
  }
}

export function drawVolume(metrics, candles, rvolArr) {
  if (!state.layers.vol) return;

  let maxVolume = 0;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].v > maxVolume) maxVolume = candles[i].v;
  }
  if (!maxVolume) maxVolume = 1;
  const volumeTop = metrics.height - metrics.padBottom + 5 * metrics.dpr;

  candles.forEach((candle, index) => {
    const rvol = rvolArr?.[index];
    const alpha = rvol == null ? 0.18 : rvol > 1.5 ? 0.55 : rvol < 0.7 ? 0.06 : 0.18;
    const barHeight = Math.max(1, (candle.v / maxVolume) * metrics.volumeHeight * 0.84);
    ctx.fillStyle = candle.c >= candle.o ? `rgba(0,232,150,${alpha})` : `rgba(255,58,92,${alpha})`;
    ctx.fillRect(
      metrics.px(index) - metrics.bodyWidth / 2,
      volumeTop + (metrics.volumeHeight * 0.84 - barHeight),
      metrics.bodyWidth,
      barHeight,
    );
  });

  ctx.fillStyle = 'rgba(45,68,96,.5)';
  ctx.font = `${8 * metrics.dpr}px monospace`;
  ctx.textAlign = 'right';
  ctx.fillText('VOL', metrics.width - metrics.padRight - 4 * metrics.dpr, metrics.height - metrics.padBottom / 2);
}

export function drawEmaLines(metrics, candlesCount, ema7arr, ema21arr, ema50arr) {
  if (!state.layers.ema || !ema7arr || !ema21arr || !ema50arr) return;

  const bh = 15 * metrics.dpr;
  const placedBadgeY = [];

  const emaConfigs = [
    [ema7arr, 'rgba(0,200,255,.65)', 'rgba(0,200,255,.9)', 'EMA7'],
    [ema21arr, 'rgba(150,110,255,.62)', 'rgba(150,110,255,.9)', 'EMA21'],
    [ema50arr, 'rgba(255,184,48,.52)', 'rgba(255,184,48,.9)', 'EMA50'],
  ];

  emaConfigs.forEach(([values, lineColor, labelColor, label]) => {
    if (values.length < candlesCount - 1) return;
    const vals = values.length < candlesCount ? [...values, values[values.length - 1]] : values;

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.3 * metrics.dpr;
    ctx.setLineDash([]);
    ctx.beginPath();
    let hasSegment = false;

    for (let i = 0; i < vals.length; i++) {
      const value = vals[i];
      if (!Number.isFinite(value)) continue;
      const x = metrics.px(i);
      const y = metrics.py(value);
      if (!hasSegment) { ctx.moveTo(x, y); hasSegment = true; }
      else ctx.lineTo(x, y);
    }
    if (!hasSegment) return;
    ctx.stroke();

    // Micro-badge for identification (Modern Rounded Rectangle)
    const lastVal = vals.at(-1);
    if (Number.isFinite(lastVal)) {
      const bx = metrics.px(vals.length - 1) + 4 * metrics.dpr;
      const by = metrics.py(lastVal);
      
      ctx.save();
      const text = label.replace('EMA ', '');
      ctx.font = `bold ${8 * metrics.dpr}px monospace`;
      const tw = ctx.measureText(text).width;
      const bw = tw + 8 * metrics.dpr;
      const bh = 14 * metrics.dpr;
      const rx = bx;
      const ry = by - bh / 2;

      ctx.fillStyle = lineColor;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(rx, ry, bw, bh, 3 * metrics.dpr);
      } else {
        ctx.rect(rx, ry, bw, bh);
      }
      ctx.fill();
      
      ctx.fillStyle = '#070f1c';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, rx + bw / 2, ry + bh / 2);
      ctx.restore();
    }
  });
}

export function drawVolumeProfile(metrics, candles) {
  if (!state.layers.vp) return;
  const BUCKETS = 36;
  const profile = new Array(BUCKETS).fill(0);
  for (const candle of candles) {
    const hi = Math.min(candle.h, metrics.maxPrice), lo = Math.max(candle.l, metrics.minPrice);
    const range = hi - lo;
    if (range <= 0) {
      const bi = Math.min(BUCKETS - 1, Math.max(0, Math.floor((candle.c - metrics.minPrice) / metrics.priceRange * BUCKETS)));
      profile[bi] += candle.v;
    } else {
      for (let b = 0; b < BUCKETS; b++) {
        const bLo = metrics.minPrice + (b / BUCKETS) * metrics.priceRange, bHi = metrics.minPrice + ((b + 1) / BUCKETS) * metrics.priceRange;
        const overlap = Math.min(hi, bHi) - Math.max(lo, bLo);
        if (overlap > 0) profile[b] += candle.v * (overlap / range);
      }
    }
  }
  const maxVol = Math.max(...profile, 1), totalVol = profile.reduce((s, v) => s + v, 0), maxBarW = 72 * metrics.dpr;
  const poc = profile.indexOf(maxVol), vaTarget = totalVol * 0.70;
  let vaVol = profile[poc], vaLow = poc, vaHigh = poc;
  while (vaVol < vaTarget && (vaLow > 0 || vaHigh < BUCKETS - 1)) {
    const addBelow = vaLow > 0 ? profile[vaLow - 1] : -1, addAbove = vaHigh < BUCKETS - 1 ? profile[vaHigh + 1] : -1;
    if (addBelow >= addAbove && addBelow >= 0) vaLow--; else if (addAbove >= 0) vaHigh++; else break;
    vaVol += Math.max(addBelow, addAbove);
  }
  ctx.save(); ctx.font = `${6.5 * metrics.dpr}px monospace`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  for (let b = 0; b < BUCKETS; b++) {
    const bLo = metrics.minPrice + (b / BUCKETS) * metrics.priceRange, bHi = metrics.minPrice + ((b + 1) / BUCKETS) * metrics.priceRange;
    const yTop = metrics.py(bHi), yBot = metrics.py(bLo), barH = Math.max(1, yBot - yTop), ratio = profile[b] / maxVol;
    const br = Math.round(ratio * 55), alpha = 0.08 + ratio * 0.35;
    ctx.fillStyle = `rgba(${57 + br},${Math.round(213 - ratio * 80)},255,${alpha})`;
    ctx.fillRect(metrics.padLeft, yTop, ratio * maxBarW, barH);
  }
  const pocPrice = metrics.minPrice + ((poc + 0.5) / BUCKETS) * metrics.priceRange, pocY = metrics.py(pocPrice);
  ctx.strokeStyle = 'rgba(57,213,255,0.85)'; ctx.lineWidth = 1.8 * metrics.dpr; ctx.beginPath();
  ctx.moveTo(metrics.padLeft, pocY); ctx.lineTo(metrics.width - metrics.padRight, pocY); ctx.stroke();
  ctx.fillStyle = 'rgba(57,213,255,0.85)'; ctx.font = `${7.5 * metrics.dpr}px monospace`; ctx.fillText(`POC $${fmt(pocPrice, pocPrice > 100 ? 0 : 2)}`, metrics.padLeft + maxBarW + 4 * metrics.dpr, pocY - 3 * metrics.dpr);
  const vYHi = metrics.py(metrics.minPrice + ((vaHigh + 1) / BUCKETS) * metrics.priceRange), vYLo = metrics.py(metrics.minPrice + (vaLow / BUCKETS) * metrics.priceRange);
  ctx.fillStyle = 'rgba(57,213,255,0.05)'; ctx.fillRect(metrics.padLeft, vYHi, metrics.chartWidth, vYLo - vYHi);
  ctx.strokeStyle = 'rgba(57,213,255,0.55)'; ctx.lineWidth = metrics.dpr; ctx.setLineDash([2 * metrics.dpr, 5 * metrics.dpr]);
  ctx.beginPath(); ctx.moveTo(metrics.padLeft, vYHi); ctx.lineTo(metrics.width - metrics.padRight, vYHi); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(metrics.padLeft, vYLo); ctx.lineTo(metrics.width - metrics.padRight, vYLo); ctx.stroke();
  ctx.setLineDash([]); ctx.fillStyle = 'rgba(57,213,255,0.6)'; ctx.fillText('VAH', metrics.padLeft + maxBarW + 4 * metrics.dpr, vYHi - 3 * metrics.dpr);
  ctx.fillText('VAL', metrics.padLeft + maxBarW + 4 * metrics.dpr, vYLo + 9 * metrics.dpr); ctx.restore();
}

export function drawSupportResistance(metrics, candles) {
  if (!state.layers.sr) return;
  const levels = state.lastResult?.srLevels?.length ? state.lastResult.srLevels : getSupportResistanceLevels(candles);
  if (!levels.length) return;
  ctx.save(); ctx.font = `600 ${9 * metrics.dpr}px monospace`; ctx.textBaseline = 'middle';
  const bh = 16 * metrics.dpr, placedY = [];
  levels.forEach(level => {
    const y = metrics.py(level.price); if (y < metrics.padTop + 2 || y > metrics.height - metrics.padBottom - 2) return;
    const isSup = level.kind === 'support', strength = Math.min(1, ((level.netTouches ?? 0) + (level.pivots ?? 1)) / 8), alpha = 0.42 + strength * 0.36;
    ctx.strokeStyle = isSup ? `rgba(0,232,150,${alpha})` : `rgba(255,95,125,${alpha})`;
    ctx.lineWidth = (1 + strength) * metrics.dpr; ctx.setLineDash([6 * metrics.dpr, 4 * metrics.dpr]);
    ctx.beginPath(); ctx.moveTo(metrics.padLeft, y); ctx.lineTo(metrics.width - metrics.padRight, y); ctx.stroke(); ctx.setLineDash([]);
    if (placedY.some(py => Math.abs(py - y) < bh + 2 * metrics.dpr)) return;
    placedY.push(y);
    const label = `${level.label}  ${level.display || `$${fmt(level.price, level.price > 100 ? 0 : 3)}`}`, tw = ctx.measureText(label).width, bw = tw + 10 * metrics.dpr;
    const bx = metrics.padLeft + 4 * metrics.dpr + (state.layers.vp ? 76 * metrics.dpr : 0), by = y - bh / 2, bc = isSup ? 'rgba(0,212,170,0.92)' : 'rgba(255,68,102,0.92)';
    ctx.fillStyle = 'rgba(7,15,28,0.88)'; ctx.strokeStyle = bc; ctx.lineWidth = metrics.dpr; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 4 * metrics.dpr); else ctx.rect(bx, by, bw, bh);
    ctx.fill(); ctx.stroke(); ctx.fillStyle = bc; ctx.textAlign = 'left'; ctx.fillText(label, bx + 5 * metrics.dpr, y);
  });
  ctx.restore();
}

export function drawTrendlines(metrics, trendlines) {
  if (!state.layers.tl || !trendlines) return;
  const drawLine = (line, color) => {
    if (!line?.p1 || !line?.p2) return;
    const x1 = metrics.px(line.p1.index), y1 = metrics.py(line.p1.price), x2 = metrics.px(line.p2.index), y2 = metrics.py(line.p2.price);
    const dx = x2 - x1; if (Math.abs(dx) < 1) return;
    const pixelSlope = (y2 - y1) / dx, endX = metrics.width - metrics.padRight, endY = y2 + pixelSlope * (endX - x2);
    const lw = Math.min(2.2, 1.25 + Math.max(0, (line.touches ?? 2) - 2) * 0.22) * metrics.dpr;
    ctx.save(); ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(((line.touches ?? 0) >= 3 ? [4, 3] : [6, 3]).map(v => v * metrics.dpr));
    ctx.moveTo(x1, y1); ctx.lineTo(endX, endY); ctx.stroke(); ctx.setLineDash([]);
    [[x1, y1], [x2, y2]].forEach(([px, py]) => {
      if (px >= metrics.padLeft && px <= endX && py >= metrics.padTop && py <= metrics.height - metrics.padBottom) {
        ctx.beginPath(); ctx.fillStyle = color; ctx.arc(px, py, (lw / metrics.dpr + 1) * metrics.dpr, 0, Math.PI * 2); ctx.fill();
      }
    });
    ctx.restore();
  };
  if (trendlines.resistance) drawLine(trendlines.resistance, 'rgba(255,68,102,0.82)');
  if (trendlines.support) drawLine(trendlines.support, 'rgba(0,212,170,0.82)');
}

export function drawFibonacci(metrics, fibData) {
  if (!state.layers.fib || !fibData) return;
  ctx.save(); ctx.font = `${8 * metrics.dpr}px monospace`; ctx.textBaseline = 'middle';
  fibData.levels.forEach(({ pct, price }) => {
    const py = metrics.py(price); if (py < metrics.padTop - 2 || py > metrics.height - metrics.padBottom + 2) return;
    const color = FIB_COLORS[String(pct)] ?? 'rgba(200,200,200,0.45)';
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = metrics.dpr; ctx.setLineDash([3 * metrics.dpr, 4 * metrics.dpr]);
    ctx.moveTo(metrics.padLeft, py); ctx.lineTo(metrics.width - metrics.padRight, py); ctx.stroke(); ctx.setLineDash([]);
    const lbl = `${pct}%  $${fmt(price, price > 100 ? 0 : 3)}`, tw = ctx.measureText(lbl).width, bw = tw + 8 * metrics.dpr, bh = 14 * metrics.dpr;
    ctx.fillStyle = 'rgba(7,15,28,0.82)'; ctx.fillRect(metrics.width - metrics.padRight - bw - 2 * metrics.dpr, py - bh / 2, bw + 2 * metrics.dpr, bh);
    ctx.fillStyle = color; ctx.textAlign = 'right'; ctx.fillText(lbl, metrics.width - metrics.padRight - 3 * metrics.dpr, py);
  });
  ctx.restore();
}

export function drawTradeZones(metrics) {
  if (!state.layers.tradeZones || !metrics.tradeLevels) return;
  const { entry, stop, target } = metrics.tradeLevels, chartB = metrics.height - metrics.padBottom;
  const fillBand = (p1, p2, style) => {
    const rTop = metrics.py(Math.max(p1, p2)), rBot = metrics.py(Math.min(p1, p2));
    const top = Math.max(metrics.padTop, Math.min(rTop, rBot)), bot = Math.min(chartB, Math.max(rTop, rBot));
    if (bot <= top) return;
    ctx.fillStyle = style; ctx.fillRect(metrics.padLeft, top, metrics.chartWidth, bot - top);
  };
  ctx.save(); fillBand(entry, target, 'rgba(0,232,150,0.08)'); fillBand(entry, stop, 'rgba(255,58,92,0.08)'); ctx.restore();
}

export function drawTradeLevels(metrics) {
  if (!state.layers.trade || !metrics.tradeLevels) return;
  const chartB = metrics.height - metrics.padBottom, lh = 16 * metrics.dpr, placedY = [];
  const levels = [
    { label: 'target', price: metrics.tradeLevels.target, color: 'rgba(0,232,150,0.92)', fill: 'rgba(0,232,150,0.14)', dash: [5, 4] },
    { label: 'entry', price: metrics.tradeLevels.entry, color: 'rgba(247,147,26,0.96)', fill: 'rgba(247,147,26,0.16)', dash: [3, 3] },
    { label: 'stop', price: metrics.tradeLevels.stop, color: 'rgba(255,58,92,0.92)', fill: 'rgba(255,58,92,0.14)', dash: [5, 4] },
  ];
  levels.forEach(l => {
    const y = metrics.py(l.price); if (y < metrics.padTop || y > chartB) return;
    ctx.save(); ctx.beginPath(); ctx.strokeStyle = l.color; ctx.lineWidth = 1.2 * metrics.dpr; ctx.setLineDash(l.dash.map(v => v * metrics.dpr));
    ctx.moveTo(metrics.padLeft, y); ctx.lineTo(metrics.width - metrics.padRight, y); ctx.stroke(); ctx.restore();
  });
  levels.map(l => ({ ...l, y: metrics.py(l.price) })).filter(l => l.y >= metrics.padTop && l.y <= chartB).sort((a, b) => a.y - b.y).forEach(l => {
    let y = l.y; for (const py of placedY) { if (Math.abs(y - py) < lh + 2 * metrics.dpr) y = py + lh + 2 * metrics.dpr; }
    y = Math.max(metrics.padTop + lh / 2, Math.min(chartB - lh / 2, y)); placedY.push(y);
    const txt = `${l.label} $${fmt(l.price, l.price > 100 ? 0 : 3)}`;
    ctx.save(); ctx.font = `${7.2 * metrics.dpr}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(txt).width, bx = metrics.width - metrics.padRight + 3 * metrics.dpr, by = y - lh / 2, bw = tw + 10 * metrics.dpr;
    ctx.fillStyle = l.fill; ctx.strokeStyle = l.color; ctx.lineWidth = metrics.dpr; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, lh, 4 * metrics.dpr); else ctx.rect(bx, by, bw, lh);
    ctx.fill(); ctx.stroke(); ctx.fillStyle = l.color; ctx.fillText(txt, bx + 5 * metrics.dpr, y); ctx.restore();
  });
}

export function drawBollingerBands(metrics, bbArr) {
  if (!state.layers.bb || !bbArr?.length) return;
  ctx.save(); const uPts = [], lPts = [];
  bbArr.forEach((bb, i) => { if (bb && Number.isFinite(bb.upper)) { uPts.push([metrics.px(i), metrics.py(bb.upper)]); lPts.push([metrics.px(i), metrics.py(bb.lower)]); } });
  if (uPts.length) {
    ctx.beginPath(); ctx.moveTo(uPts[0][0], uPts[0][1]); uPts.slice(1).forEach(p => ctx.lineTo(p[0], p[1])); lPts.slice().reverse().forEach(p => ctx.lineTo(p[0], p[1])); ctx.closePath();
    ctx.fillStyle = 'rgba(255,184,48,.04)'; ctx.fill();
  }
  const lastBB = [...bbArr].reverse().find(bb => bb && Number.isFinite(bb.upper));
  [['upper', 'rgba(255,184,48,.5)', 'rgba(255,184,48,.75)', []], ['mid', 'rgba(255,184,48,.28)', 'rgba(255,184,48,.55)', [4, 4]], ['lower', 'rgba(255,184,48,.5)', 'rgba(255,184,48,.75)', []]].forEach(([k, c, lc, d]) => {
    ctx.strokeStyle = c; ctx.lineWidth = metrics.dpr; ctx.setLineDash(d.map(v => v * metrics.dpr)); ctx.beginPath(); let s = false;
    bbArr.forEach((bb, i) => { if (bb && Number.isFinite(bb[k])) { const x = metrics.px(i), y = metrics.py(bb[k]); if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y); } });
    if (s) ctx.stroke(); ctx.setLineDash([]);
    if (k === 'mid' || !lastBB) return;
    const v = lastBB[k], y = metrics.py(v); if (y < metrics.padTop || y > metrics.height - metrics.padBottom) return;
    const lbl = `BB $${fmt(v, v > 100 ? 0 : 3)}`, tw = ctx.measureText(lbl).width, bx = metrics.width - metrics.padRight + 2 * metrics.dpr;
    ctx.fillStyle = 'rgba(7,15,28,0.75)'; ctx.fillRect(bx, y - 6 * metrics.dpr, tw + 4 * metrics.dpr, 12 * metrics.dpr);
    ctx.fillStyle = lc; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(lbl, bx + 2 * metrics.dpr, y);
  });
  ctx.restore();
}

export function drawPatternMarkers(metrics, candles, patterns) {
  if (!patterns?.length) return;
  ctx.save(); ctx.font = `bold ${11 * metrics.dpr}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const priceGap = metrics.priceRange * 0.018;
  patterns.forEach(pat => {
    if (pat.index < 0 || pat.index >= candles.length) return;
    const candle = candles[pat.index], x = metrics.px(pat.index);
    if (pat.kind === 'bullish') {
      const y = metrics.py(candle.l - priceGap); ctx.fillStyle = '#00e896'; ctx.fillText('▲', x, y);
    } else if (pat.kind === 'bearish') {
      const y = metrics.py(candle.h + priceGap); ctx.fillStyle = '#ff3a5c'; ctx.fillText('▼', x, y);
    } else {
      const y = metrics.py((candle.h + candle.l) / 2); ctx.fillStyle = '#ffc857'; ctx.beginPath(); ctx.arc(x, y, 3 * metrics.dpr, 0, Math.PI * 2); ctx.fill();
    }
  });
  ctx.restore();
}
