function isValidNumber(value) {
  return Number.isFinite(value);
}

/**
 * Relative Volume: ratio of each bar's volume to the rolling mean of the
 * previous `period` bars. O(n) sliding-window sum — avoids the inner loop.
 */
export function relativeVolume(candles, period = 20) {
  const out = Array(candles.length).fill(null);
  if (candles.length <= period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].v;

  for (let i = period; i < candles.length; i++) {
    const avg = sum / period;
    out[i] = avg > 0 ? candles[i].v / avg : null;
    sum += candles[i].v - candles[i - period].v;
  }
  return out;
}

export function ema(values, period) {
  const output = Array(values.length).fill(null);
  if (values.length < period) return output;

  const factor = 2 / (period + 1);
  let seed = 0;

  for (let index = 0; index < period; index += 1) {
    seed += values[index];
  }

  let prev = seed / period;
  output[period - 1] = prev;

  for (let index = period; index < values.length; index += 1) {
    prev = values[index] * factor + prev * (1 - factor);
    output[index] = prev;
  }

  return output;
}

export function rsi(closes, period = 14) {
  const output = Array(closes.length).fill(null);
  if (closes.length <= period) return output;

  let avgGain = 0;
  let avgLoss = 0;

  for (let index = 1; index <= period; index += 1) {
    const delta = closes[index] - closes[index - 1];
    avgGain += delta > 0 ? delta : 0;
    avgLoss += delta < 0 ? -delta : 0;
  }

  avgGain /= period;
  avgLoss /= period;
  output[period] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);

  for (let index = period + 1; index < closes.length; index += 1) {
    const delta = closes[index] - closes[index - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    output[index] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return output;
}

/**
 * MACD — signal line computed by reusing ema() directly on the MACD line
 * values (stripping leading nulls), eliminating the validLine intermediary.
 */
export function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);

  const line = closes.map((_, i) =>
    isValidNumber(fastEma[i]) && isValidNumber(slowEma[i])
      ? fastEma[i] - slowEma[i]
      : null,
  );

  const signal = Array(closes.length).fill(null);
  const firstValid = line.findIndex(v => v !== null);
  if (firstValid >= 0) {
    const lineSlice = line.slice(firstValid);
    const sigSlice = ema(lineSlice, signalPeriod);
    sigSlice.forEach((v, i) => { if (v !== null) signal[firstValid + i] = v; });
  }

  const hist = line.map((v, i) =>
    isValidNumber(v) && isValidNumber(signal[i]) ? v - signal[i] : null,
  );

  return { line, signal, hist };
}

export function calcPivots(candles, windowSize = 5) {
  const highs = [];
  const lows = [];
  const n = candles.length;

  for (let i = windowSize; i < n - windowSize; i += 1) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - windowSize; j <= i + windowSize; j += 1) {
      if (j === i) continue;
      if (candles[j].h >= candles[i].h) isHigh = false;
      if (candles[j].l <= candles[i].l) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: candles[i].h });
    if (isLow) lows.push({ index: i, price: candles[i].l });
  }

  return { highs: highs.slice(-8), lows: lows.slice(-8) };
}

function projectTrendPrice(line, index) {
  return line.p1.price + line.slope * (index - line.p1.index);
}

function buildTrendlineCandidate(points, candles, kind, tolerance, fi, si) {
  const p1 = points[fi];
  const p2 = points[si];
  const span = p2.index - p1.index;
  if (!Number.isFinite(span) || span < Math.max(3, Math.floor(candles.length / 12))) return null;

  const slope = (p2.price - p1.price) / span;
  const line = { p1, p2, slope };
  const maxViolations = Math.max(1, Math.floor((candles.length - p1.index) / 18));
  let violations = 0;
  let worstViolation = 0;

  for (let index = p1.index; index < candles.length; index += 1) {
    const projected = projectTrendPrice(line, index);
    const breach = kind === 'resistance' ? candles[index].h - projected : projected - candles[index].l;
    if (breach > tolerance) {
      violations += 1;
      worstViolation = Math.max(worstViolation, breach);
      if (violations > maxViolations) return null;
    }
  }

  let touches = 0;
  for (const point of points) {
    if (point.index < p1.index || point.index > candles.length - 1) continue;
    if (Math.abs(point.price - projectTrendPrice(line, point.index)) <= tolerance) touches += 1;
  }

  const recency = p2.index / Math.max(candles.length - 1, 1);
  const score = touches * 8 + span * 0.2 + recency * 4 - violations * 10 - worstViolation / Math.max(tolerance, 1);
  return { ...line, kind, touches, violations, tolerance, score };
}

function selectBestTrendline(points, candles, kind, tolerance) {
  if (!Array.isArray(points) || points.length < 2) return null;
  let best = null;
  for (let i = 0; i < points.length - 1; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const candidate = buildTrendlineCandidate(points, candles, kind, tolerance, i, j);
      if (candidate && (!best || candidate.score > best.score)) best = candidate;
    }
  }
  return best;
}

export function calcTrendlines(candles, pivots) {
  if (!Array.isArray(candles) || candles.length < 8 || !pivots) {
    return { resistance: null, support: null };
  }
  const recentRanges = candles.slice(-Math.min(candles.length, 20)).map(c => c.h - c.l);
  const avgRange = recentRanges.reduce((s, v) => s + v, 0) / recentRanges.length;
  const lastClose = candles.at(-1)?.c ?? 0;
  const tolerance = Math.max(avgRange * 0.28, lastClose * 0.0015);
  return {
    resistance: selectBestTrendline(pivots.highs ?? [], candles, 'resistance', tolerance),
    support: selectBestTrendline(pivots.lows ?? [], candles, 'support', tolerance),
  };
}

/**
 * Calculates Fibonacci retracement levels.
 * When `pivots` is provided, uses the most recent significant pivot high/low
 * for stable levels that don't shift as the user scrolls the candle window.
 * Falls back to scanning all candles when no pivots are available.
 */
export function calcFibonacci(candles, pivots = null) {
  if (!candles || candles.length < 2) return null;

  let highIndex, lowIndex, highPrice, lowPrice;

  const lastPivotHigh = pivots?.highs?.at(-1);
  const lastPivotLow  = pivots?.lows?.at(-1);

  if (lastPivotHigh && lastPivotLow) {
    highPrice = lastPivotHigh.price;
    highIndex = lastPivotHigh.index;
    lowPrice  = lastPivotLow.price;
    lowIndex  = lastPivotLow.index;
  } else {
    highIndex = 0;
    lowIndex  = 0;
    highPrice = candles[0].h;
    lowPrice  = candles[0].l;
    for (let i = 1; i < candles.length; i += 1) {
      if (candles[i].h > highPrice) { highPrice = candles[i].h; highIndex = i; }
      if (candles[i].l < lowPrice)  { lowPrice  = candles[i].l; lowIndex  = i; }
    }
  }

  const range = highPrice - lowPrice;
  if (range === 0) return null;

  const direction = lowIndex < highIndex ? 'up' : 'down';
  const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0].map(ratio => ({
    pct: Math.round(ratio * 1000) / 10,
    price: direction === 'up' ? highPrice - ratio * range : lowPrice + ratio * range,
  }));

  return { highPrice, lowPrice, direction, levels };
}

/**
 * Stochastic RSI — where the RSI sits within its own recent range.
 * Returns { k, d } arrays with values 0–1 (multiply by 100 for display).
 * Uses a strict sliding SMA that requires all `period` values to be non-null,
 * preventing spurious output from partial windows during warmup.
 */
export function stochRsi(closes, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3) {
  const rsiArr = rsi(closes, rsiPeriod);
  const n = closes.length;
  const rawStoch = Array(n).fill(null);

  for (let i = stochPeriod - 1; i < n; i++) {
    if (rsiArr[i] === null) continue;
    let lo = rsiArr[i];
    let hi = rsiArr[i];
    let valid = true;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      if (rsiArr[j] === null) { valid = false; break; }
      if (rsiArr[j] < lo) lo = rsiArr[j];
      if (rsiArr[j] > hi) hi = rsiArr[j];
    }
    if (!valid) continue;
    rawStoch[i] = hi === lo ? 0 : (rsiArr[i] - lo) / (hi - lo);
  }

  // Strict sliding SMA: requires all `period` values to be non-null
  const slidingSma = (arr, period) => {
    const out = Array(n).fill(null);
    for (let i = period - 1; i < n; i++) {
      let sum = 0;
      let ok = true;
      for (let j = i - period + 1; j <= i; j++) {
        if (arr[j] === null) { ok = false; break; }
        sum += arr[j];
      }
      if (ok) out[i] = sum / period;
    }
    return out;
  };

  const k = slidingSma(rawStoch, kPeriod);
  const d = slidingSma(k, dPeriod);
  return { k, d };
}

/**
 * Bollinger Bands — O(n) via Welford's incremental variance for a sliding window.
 * Avoids the O(n×period) slice+reduce of the naive approach, and is numerically
 * more stable (no catastrophic cancellation from sum-of-squares).
 */
export function bollingerBands(closes, period = 20, mult = 2) {
  const output = Array(closes.length).fill(null);
  if (closes.length < period) return output;

  // Bootstrap first window
  let mean = 0;
  for (let i = 0; i < period; i++) mean += closes[i];
  mean /= period;

  let S = 0; // sum of squared deviations
  for (let i = 0; i < period; i++) S += (closes[i] - mean) ** 2;

  const band = (m, s) => {
    const sd = Math.sqrt(Math.max(0, s) / period);
    return { mid: m, upper: m + mult * sd, lower: m - mult * sd };
  };

  output[period - 1] = band(mean, S);

  for (let i = period; i < closes.length; i++) {
    const incoming = closes[i];
    const outgoing = closes[i - period];
    const prevMean = mean;
    mean += (incoming - outgoing) / period;
    // Welford sliding-window update: avoids recomputing the full sum each step
    S += (incoming - outgoing) * (incoming - mean + outgoing - prevMean);
    output[i] = band(mean, S);
  }

  return output;
}

/**
 * Bollinger Band Width Percentile — where does the current BBW sit
 * within its recent range? 0 = maximum squeeze, 1 = maximum expansion.
 * Used to detect coil/compression setups before a breakout.
 */
export function bbWidthPercentile(closes, period = 20, lookback = 50) {
  const bands = bollingerBands(closes, period);
  const widths = [];
  for (let i = Math.max(0, bands.length - lookback); i < bands.length; i++) {
    const b = bands[i];
    if (b && b.mid > 0) widths.push((b.upper - b.lower) / b.mid);
  }
  if (widths.length < 2) return null;
  const current = widths[widths.length - 1];
  let min = widths[0], max = widths[0];
  for (let i = 1; i < widths.length; i++) {
    if (widths[i] < min) min = widths[i];
    if (widths[i] > max) max = widths[i];
  }
  if (max === min) return 0;
  return (current - min) / (max - min);
}

export function atr(candles, period = 14) {
  const output = Array(candles.length).fill(null);
  if (candles.length < period) return output;

  const trueRanges = candles.map((candle, index) => {
    if (index === 0) return candle.h - candle.l;

    const previousClose = candles[index - 1].c;
    return Math.max(
      candle.h - candle.l,
      Math.abs(candle.h - previousClose),
      Math.abs(candle.l - previousClose),
    );
  });

  let prev = 0;
  for (let index = 0; index < period; index += 1) prev += trueRanges[index];
  prev /= period;
  output[period - 1] = prev;

  for (let index = period; index < trueRanges.length; index += 1) {
    prev = (prev * (period - 1) + trueRanges[index]) / period;
    output[index] = prev;
  }

  return output;
}
