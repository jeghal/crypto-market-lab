import { CFG } from './config.js';
import { atr } from './indicators.js';
import { fmt } from './utils.js';

// Strict symmetric window: both sides [i-w, i+w] must be fully available.
// Avoids the asymmetric bias where the last candles were near-automatic pivots.
function detectPivots(candles, windowSize) {
  const count = candles.length;
  const highs = [];
  const lows = [];

  for (let index = windowSize; index < count - windowSize; index += 1) {
    const slice = candles.slice(index - windowSize, index + windowSize + 1);
    const localMax = Math.max(...slice.map(c => c.h));
    const localMin = Math.min(...slice.map(c => c.l));

    if (candles[index].h >= localMax * 0.995) {
      highs.push({ price: candles[index].h, index });
    }
    if (candles[index].l <= localMin * 1.005) {
      lows.push({ price: candles[index].l, index });
    }
  }

  return { highs, lows };
}

// Sort by price first, then cluster using the running mean for proximity.
// O(n) single pass: since the array is sorted, only compare against the last cluster.
function clusterLevels(levels, tolerance) {
  if (!levels.length) return [];

  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const clusters = [];

  for (const level of sorted) {
    const last = clusters.length > 0 ? clusters[clusters.length - 1] : null;
    if (last && Math.abs(last.price - level.price) <= tolerance) {
      last.total += level.price;
      last.pivots += 1;
      last.firstIndex = Math.min(last.firstIndex, level.index);
      last.lastIndex = Math.max(last.lastIndex, level.index);
      last.price = last.total / last.pivots;
    } else {
      clusters.push({
        price: level.price,
        total: level.price,
        pivots: 1,
        netTouches: 0,
        firstIndex: level.index,
        lastIndex: level.index,
      });
    }
  }

  return clusters;
}

// Count candle bodies/wicks that came within tolerance of the cluster mean,
// excluding the founding pivot candles to avoid double-counting.
function enrichTouches(clusters, candles, tolerance, kind) {
  clusters.forEach(cluster => {
    const pivotIndices = new Set();
    candles.forEach((candle, i) => {
      const probe = kind === 'resistance' ? candle.h : candle.l;
      if (Math.abs(probe - cluster.price) <= tolerance) {
        if (i < cluster.firstIndex || i > cluster.lastIndex) {
          cluster.netTouches += 1;
        } else {
          pivotIndices.add(i);
        }
      }
    });
  });
}

// Strength = pivot quality × 5 + independent touches × 4 + recency × 2.
// Pivots (actual reversals) weigh more than passive touches.
// Distance is a pure tiebreaker.
function sortCandidateLevels(levels, lastClose, candlesCount) {
  return levels.sort((a, b) => {
    const aStrength = a.pivots * 5 + a.netTouches * 4 + (a.lastIndex / candlesCount) * 2;
    const bStrength = b.pivots * 5 + b.netTouches * 4 + (b.lastIndex / candlesCount) * 2;
    const aDistance = Math.abs(a.price - lastClose);
    const bDistance = Math.abs(b.price - lastClose);
    return bStrength - aStrength || aDistance - bDistance;
  });
}

export function getSupportResistanceLevels(candles) {
  if (!candles?.length || candles.length < 17) return [];

  const windowSize = Math.min(8, Math.floor(candles.length / 10));
  const highs = candles.map(candle => candle.h);
  const lows = candles.map(candle => candle.l);
  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  const lastClose = candles.at(-1).c || 1;
  const atrValues = atr(candles, CFG.atrP);
  const lastAtr = [...atrValues].reverse().find(Number.isFinite) ?? 0;

  const tolerance = lastAtr > 0
    ? lastAtr * 0.5
    : Math.max(lastClose * 0.003, (maxPrice - minPrice) * 0.004);

  const { highs: pivotHighs, lows: pivotLows } = detectPivots(candles, windowSize);

  const resistances = clusterLevels(pivotHighs, tolerance);
  const supports = clusterLevels(pivotLows, tolerance);
  enrichTouches(resistances, candles, tolerance, 'resistance');
  enrichTouches(supports, candles, tolerance, 'support');

  let rankedResistances = sortCandidateLevels(
    resistances.filter(level => level.price > lastClose),
    lastClose,
    candles.length,
  )
    .slice(0, 4)
    .sort((a, b) => a.price - b.price)
    .map((level, index) => ({
      ...level,
      kind: 'resistance',
      label: `R${index + 1}`,
      display: `$${fmt(level.price, level.price > 100 ? 0 : 3)}`,
    }));

  let rankedSupports = sortCandidateLevels(
    supports.filter(level => level.price < lastClose),
    lastClose,
    candles.length,
  )
    .slice(0, 4)
    .sort((a, b) => b.price - a.price)
    .map((level, index) => ({
      ...level,
      kind: 'support',
      label: `S${index + 1}`,
      display: `$${fmt(level.price, level.price > 100 ? 0 : 3)}`,
    }));

  const fallbackStep = lastAtr > 0
    ? lastAtr
    : Math.max(lastClose * 0.006, (maxPrice - minPrice) * 0.08);
  const makeFallbackLevel = (kind, price, label) => ({
    price,
    kind,
    label,
    display: `$${fmt(price, price > 100 ? 0 : 3)}`,
    pivots: 0,
    netTouches: 0,
    firstIndex: candles.length - 1,
    lastIndex: candles.length - 1,
    projected: true,
  });

  if (!rankedResistances.length) {
    const fallbackResistance = maxPrice > lastClose * 1.001
      ? maxPrice
      : lastClose + fallbackStep;
    rankedResistances = [makeFallbackLevel('resistance', fallbackResistance, 'R1')];
  }

  if (!rankedSupports.length) {
    const fallbackSupport = minPrice < lastClose * 0.999
      ? minPrice
      : Math.max(lastClose - fallbackStep, 0);
    rankedSupports = [makeFallbackLevel('support', fallbackSupport, 'S1')];
  }

  return [...rankedResistances, ...rankedSupports];
}
