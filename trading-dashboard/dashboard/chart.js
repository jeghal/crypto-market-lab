import { CHART_PADDING } from './config.js';
import { ctx, el } from './dom.js';
import { state } from './state.js';
import { getDpr } from './utils.js';
import { drawChart, getChartMetrics, getHitInfo } from './chart-render.js';

export { getHitInfo };

function getFullscreenCanvasHeight(parent) {
  const card = parent.closest('.card-chart');
  if (!card || !document.fullscreenElement?.contains?.(card)) return null;

  const head = card.querySelector('.chart-head');
  const controls = card.querySelector('.chart-ctrls');
  const cardStyle = getComputedStyle(card);
  const gap = parseFloat(cardStyle.rowGap || cardStyle.gap || '0') || 0;
  const paddingTop = parseFloat(cardStyle.paddingTop || '0') || 0;
  const paddingBottom = parseFloat(cardStyle.paddingBottom || '0') || 0;

  // On Android, visualViewport.height is more reliable than window.innerHeight
  // during the orientation-lock + fullscreen transition.
  const viewportHeight = window.visualViewport?.height || window.innerHeight || 0;
  const cardRect = card.getBoundingClientRect();

  // Guard: card hasn't reflowed into fullscreen dimensions yet → skip measurement.
  // This is the main Android race condition: fullscreenchange fires before layout settles.
  if (cardRect.height < 10) return null;

  const cardHeight = Math.min(cardRect.height, viewportHeight > 0 ? viewportHeight : cardRect.height);
  const headHeight = head?.getBoundingClientRect().height ?? 0;
  const controlsHeight = controls?.getBoundingClientRect().height ?? 0;

  // Guard: if head exists but reports height=0, layout hasn't completed yet.
  // Returning null causes resizeCanvas() to skip this frame; scheduleFullscreenRedraw
  // will retry until the layout is stable.
  if (head && headHeight < 1) return null;

  // Number of flex gaps = number of visible sibling elements minus 1
  const numGaps = (head ? 1 : 0) + (controls ? 1 : 0);
  const availableHeight =
    cardHeight - paddingTop - paddingBottom - headHeight - controlsHeight - gap * numGaps;

  return Math.max(Math.floor(availableHeight), 180);
}

function resizeCanvas() {
  const parent = el.cv.parentElement;
  const dpr = getDpr();
  const fullscreenHeight = getFullscreenCanvasHeight(parent);
  const isFullscreenChart = Number.isFinite(fullscreenHeight);

  // In fullscreen but layout not stable yet (guards returned null):
  // skip this frame entirely. scheduleFullscreenRedraw retries at 150/400/750ms.
  // Falling through to the non-fullscreen path is wrong — it applies minHeight:380
  // which overflows a landscape phone screen (~258px available after header/controls).
  if (document.fullscreenElement && !isFullscreenChart) return;

  const parentHeight = Math.round(parent.getBoundingClientRect().height || parent.clientHeight || 0);
  const height = isFullscreenChart
    ? fullscreenHeight
    : Math.max(parentHeight, CHART_PADDING.minHeight);
  const nextWidth = parent.clientWidth * dpr;
  const nextHeight = height * dpr;

  if (el.cv.width === nextWidth && el.cv.height === nextHeight) {
    return;
  }

  if (isFullscreenChart) {
    parent.style.height = `${height}px`;
    parent.style.minHeight = '0px';
  } else {
    parent.style.height = '';
    parent.style.minHeight = '';
  }
  el.cv.width = nextWidth;
  el.cv.height = nextHeight;
  el.cv.style.width = `${parent.clientWidth}px`;
  el.cv.style.height = `${height}px`;
}

export function toggleLayer(layer) {
  state.layers[layer] = !state.layers[layer];
  el.toggles[layer].classList.toggle('on', state.layers[layer]);
  redrawChart();
}

export function getHoveredCandleData(event) {
  const candles = state.chartCandles;
  if (!candles.length) return null;

  const rect = el.cv.getBoundingClientRect();
  const dpr = getDpr();
  const x = (event.clientX - rect.left) * dpr;
  const padLeft = CHART_PADDING.left * dpr;
  const padRight = CHART_PADDING.right * dpr;

  if (x < padLeft || x > el.cv.width - padRight) {
    state.hoverIndex = -1;
    state.hoverY = -1;
    return null;
  }

  state.hoverY = event.clientY - rect.top;
  const step = (el.cv.width - padLeft - padRight) / candles.length;
  const index = Math.round((x - padLeft) / step - 0.5);
  state.hoverIndex = Math.max(0, Math.min(candles.length - 1, index));

  const candle = candles[state.hoverIndex];
  return candle ? { candle, rect } : null;
}

export function clearHover() {
  state.hoverIndex = -1;
  state.hoverY = -1;
}

export function yToPrice(cssMouseY) {
  if (!state.chartCandles.length) return null;
  const metrics = getChartMetrics(state.chartCandles);
  const y = cssMouseY * metrics.dpr;
  const ratio = (y - metrics.padTop) / metrics.chartHeight;
  const price = metrics.maxPrice - ratio * metrics.priceRange;
  return Math.max(metrics.minPrice, Math.min(metrics.maxPrice, price));
}

export function redrawChart() {
  if (!state.lastResult || !state.chartCandles.length) return;
  resizeCanvas();
  const metrics = getChartMetrics(state.chartCandles);
  ctx.clearRect(0, 0, el.cv.width, el.cv.height);

  const r = state.lastResult;
  const livePrice = state.livePrice ?? state.chartCandles.at(-1)?.c ?? r.price;
  drawChart(metrics, state.chartCandles, r.ema7Chart, r.ema21Chart, r.ema50Chart, r.chartBB, r.chartTrendlines, r.chartFib, livePrice, r.patterns, r.chartRvolArr);
}
