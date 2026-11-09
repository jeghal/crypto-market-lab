import { BASE, STABLECOIN_BASES, SYMS } from './config.js';
import { loadVolThreshold } from './storage.js';

function shouldRetryStatus(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

function wait(ms, signal) {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function getExchangeSymbols() {
  try {
    const data = await api('/api/v3/exchangeInfo');
    return (data?.symbols ?? [])
      .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
      .map(s => s.symbol);
  } catch (error) {
    console.error('Failed to fetch exchange info:', error);
    return [];
  }
}

export async function api(path, params = {}, options = {}) {
  const {
    signal,
    retries = 1,
    retryDelayMs = 2_000,
    timeoutMs = 0,
    baseUrl = BASE,
    ...fetchOptions
  } = options;
  const url = new URL(baseUrl + path);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = timeoutMs > 0 ? new AbortController() : null;
    const requestSignal = controller ? controller.signal : signal;
    let timeoutId = null;
    let parentAbortHandler = null;

    try {
      if (controller && timeoutMs > 0) {
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        if (signal) {
          parentAbortHandler = () => controller.abort();
          signal.addEventListener('abort', parentAbortHandler, { once: true });
          if (signal.aborted) controller.abort();
        }
      }

      const response = await fetch(url, { ...fetchOptions, signal: requestSignal });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        if (attempt < retries && shouldRetryStatus(response.status)) {
          let delayMs = retryDelayMs;
          if (response.status === 429) {
            const retryAfter = Number(response.headers.get('Retry-After'));
            if (Number.isFinite(retryAfter) && retryAfter > 0) {
              delayMs = retryAfter * 1000;
            } else {
              delayMs = Math.max(retryDelayMs, (attempt + 1) * 1500);
            }
          }
          await wait(delayMs, signal);
          continue;
        }
        throw error;
      }
      return response.json();
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
      const retryable = error?.status == null || shouldRetryStatus(error.status);
      if (attempt >= retries || !retryable) throw error;
      await wait(retryDelayMs, signal);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (signal && parentAbortHandler) signal.removeEventListener('abort', parentAbortHandler);
    }
  }
  throw new Error('Request failed');
}

// In-memory cache for kline data. TTL = 45 s (shorter than the 60 s auto-refresh
// so data is always fresh after a full cycle, but reused within the same cycle).
const _klineCache = new Map();
export function clearKlineCache(sym, interval) {
  _klineCache.delete(`${sym}-${interval}`);
}
// In-flight request coalescing (per AbortSignal) to avoid duplicate klines fetches
// inside the same refresh cycle/controller.
const _klineInflightBySignal = new WeakMap(); // AbortSignal -> Map(key -> { limit, promise })
const _klineInflightNoSignal = new Map(); // key -> { limit, promise }
const KLINE_TTL_MS = 45_000;
const TICKER_24H_TTL_MS = 30_000;
const _ticker24hCache = { ts: 0, data: null, promise: null };

// bookTicker cache — 10 s TTL prevents duplicate requests when switching intervals rapidly.
const BOOK_TICKER_TTL_MS = 10_000;
const _bookTickerCache = new Map(); // sym → { ts, data }

export async function getBookTicker(sym, signal) {
  const hit = _bookTickerCache.get(sym);
  if (hit && Date.now() - hit.ts < BOOK_TICKER_TTL_MS) return hit.data;
  const data = await api('/api/v3/ticker/bookTicker', { symbol: sym }, { signal });
  _bookTickerCache.set(sym, { ts: Date.now(), data });
  return data;
}

function mapCandles(raw) {
  return raw.map(candle => ({
    t: +candle[0],
    o: +candle[1],
    h: +candle[2],
    l: +candle[3],
    c: +candle[4],
    v: +candle[5],
  }));
}

function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    function onAbort() {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    }
    function cleanup() {
      signal.removeEventListener('abort', onAbort);
    }
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => { cleanup(); resolve(value); },
      (error) => { cleanup(); reject(error); },
    );
  });
}

function getInflightMap(signal) {
  if (!signal) return _klineInflightNoSignal;
  const existing = _klineInflightBySignal.get(signal);
  if (existing) return existing;
  const next = new Map();
  _klineInflightBySignal.set(signal, next);
  return next;
}

function isStablecoinPair(entry) {
  const base = String(entry?.symbol ?? '').replace(/USDT$/, '');
  return STABLECOIN_BASES.includes(base);
}

function filterUsdtTickers(data, volMin) {
  return data.filter(s =>
    s.symbol.endsWith('USDT') &&
    !s.symbol.endsWith('UPUSDT') &&
    !s.symbol.endsWith('DOWNUSDT') &&
    !isStablecoinPair(s) &&
    +s.quoteVolume > volMin
  );
}

async function getAll24hrTickers(signal) {
  const now = Date.now();
  if (_ticker24hCache.data && now - _ticker24hCache.ts < TICKER_24H_TTL_MS) {
    return _ticker24hCache.data;
  }
  if (_ticker24hCache.promise) return _ticker24hCache.promise;

  _ticker24hCache.promise = (async () => {
    try {
      const data = await api('/api/v3/ticker/24hr', {}, { signal });
      _ticker24hCache.data = data;
      _ticker24hCache.ts = Date.now();
      return data;
    } finally {
      _ticker24hCache.promise = null;
    }
  })();

  return _ticker24hCache.promise;
}

export async function getCandles(sym, interval, limit, signal) {
  const effectiveLimit = interval === '1h' ? Math.max(limit, 60) : limit;
  const key = `${sym}-${interval}`;
  const hit = _klineCache.get(key);
  if (hit && hit.limit >= effectiveLimit && Date.now() - hit.ts < KLINE_TTL_MS) {
    return hit.data.slice(-effectiveLimit);
  }

  try {
    const inflightMap = getInflightMap(signal);
    const inflight = inflightMap.get(key);
    if (inflight && inflight.limit >= effectiveLimit) {
      return abortable(
        inflight.promise.then((data) => data.slice(-effectiveLimit)),
        signal,
      );
    }

    const requestPromise = (async () => {
      const raw = await api('/api/v3/klines', { symbol: sym, interval, limit: effectiveLimit }, { signal });
      const data = mapCandles(raw);
      _klineCache.set(key, { ts: Date.now(), limit: effectiveLimit, data });
      return data;
    })();
    // Ensure rejections are handled even if every consumer aborts.
    requestPromise.catch(() => {});
    inflightMap.set(key, { limit: effectiveLimit, promise: requestPromise });
    const cleanup = () => {
      const current = inflightMap.get(key);
      if (current?.promise === requestPromise) inflightMap.delete(key);
    };
    requestPromise.then(cleanup, cleanup);

    return await abortable(requestPromise, signal);
  } catch (error) {
    if (error?.name === 'AbortError' && signal?.aborted) {
      throw error;
    }
    // Expired candles must never silently become a successful fresh analysis.
    throw error;
  }
}

export async function getPrices(signal, extraSymbols = []) {
  const symbols = [...new Set([...SYMS, ...extraSymbols.filter(Boolean)])];
  const prices = await api(
    '/api/v3/ticker/24hr',
    { symbols: JSON.stringify(symbols) },
    { signal },
  );
  return Object.fromEntries(
    prices.map(item => [
      item.symbol,
      {
        price: +item.lastPrice,
        chg: +item.priceChangePercent,
      },
    ]),
  );
}

export async function getTopGainers(limit = 10, signal) {
  const volMin = loadVolThreshold();
  const data = await getAll24hrTickers(signal);
  const valid = filterUsdtTickers(data, volMin);
  
  // Sort by highest 24h percentage change
  valid.sort((a, b) => +b.priceChangePercent - +a.priceChangePercent);
  
  return valid.slice(0, limit).map(s => s.symbol);
}

export async function getBreakoutCandidates(limit = 10, signal) {
  const volMin = loadVolThreshold();
  const data = await getAll24hrTickers(signal);
  const valid = filterUsdtTickers(data, volMin);
  if (!valid.length) return [];

  // Calculate 90th percentile of trade counts for "High Activity"
  const allCounts = valid.map(s => +s.count).sort((a, b) => a - b);
  const surgeThreshold = allCounts[Math.floor(allCounts.length * 0.9)] ?? 0;

  const candidates = valid.map(s => {
    const lastPrice = +s.lastPrice;
    const highPrice = +s.highPrice;
    const chgPct = +s.priceChangePercent;
    const count = +s.count;
    const distFromHigh = highPrice > 0 ? (highPrice - lastPrice) / highPrice : 1;
    return { symbol: s.symbol, distFromHigh, chgPct, count };
  });

  const breakouts = candidates.filter(s => 
    s.chgPct >= 1.5 && s.chgPct <= 18 && 
    s.distFromHigh <= 0.025 &&
    s.count >= surgeThreshold
  );

  breakouts.sort((a, b) => a.distFromHigh - b.distFromHigh);

  return breakouts.slice(0, limit).map(s => s.symbol);
}
