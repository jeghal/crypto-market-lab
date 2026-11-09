import { el } from './dom.js';
import { state } from './state.js';
import { fmt, formatCandleTimestamp, formatVolume } from './utils.js';

function makeTextCell(text, style = {}) {
  const node = document.createElement('span');
  node.textContent = text;
  Object.assign(node.style, style);
  return node;
}

export function updateOHLC(candle) {
  if (!candle) return;
  [candle.o, candle.h, candle.l, candle.c].forEach((value, index) => {
    if (el.ohlc[index]) el.ohlc[index].textContent = fmt(value);
  });
}

export function renderTooltip(candle, event, rect) {
  const remainingX = rect.width - (event.clientX - rect.left);
  el.tt.style.opacity = '1';
  el.tt.style.right = `${remainingX + 14}px`;
  el.tt.style.top = `${event.clientY - rect.top - 6}px`;
  const timestamp = document.createElement('div');
  timestamp.style.color = 'var(--muted)';
  timestamp.style.marginBottom = '3px';
  timestamp.textContent = formatCandleTimestamp(candle.t, state.curIv);

  const makeLine = (label, value, color) => {
    const line = document.createElement('div');
    line.append(document.createTextNode(`${label} `), makeTextCell(value, { color }));
    return line;
  };

  el.tt.replaceChildren(
    timestamp,
    makeLine('O', fmt(candle.o), '#fff'),
    makeLine('H', fmt(candle.h), 'var(--green)'),
    makeLine('L', fmt(candle.l), 'var(--red)'),
    makeLine('C', fmt(candle.c), '#fff'),
    makeLine('Vol', formatVolume(candle.v), 'var(--muted)'),
  );
}

export function hideTooltip() {
  el.tt.style.opacity = '0';
}
