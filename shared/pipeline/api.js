
// =========================
// الاتصال بـ Binance API
// =========================
const BASE_URL = "https://data-api.binance.vision/api/v3";

async function fetchJson(url, retries = 3, delay = 1500) {
  return globalThis.BinanceCore.requestJson(url, {
    retries: Math.max(0, retries - 1), retryDelayMs: delay,
    onRetry: ({status, delayMs, attempt}) => appendStatus(`إعادة المحاولة ${attempt}: ${status || 'انقطاع اتصال'}، الانتظار ${delayMs/1000} ثانية...`)
  });
}

async function fetchServerTime() {
  const url = `${BASE_URL}/time`;
  const res = await fetchJson(url);
  return res.serverTime;
}

async function fetchExchangeInfo(symbolsArray) {
  const url = `${BASE_URL}/exchangeInfo?symbols=${JSON.stringify(symbolsArray)}`;
  const data = await fetchJson(url);
  const infoMap = {};
  for (const s of data.symbols) {
    const priceFilter = s.filters.find(f => f.filterType === "PRICE_FILTER");
    const lotFilter = s.filters.find(f => f.filterType === "LOT_SIZE");
    const notionalFilter = s.filters.find(f => f.filterType === "NOTIONAL") || s.filters.find(f => f.filterType === "MIN_NOTIONAL");
    
    infoMap[s.symbol] = {
      baseAssetPrecision: s.baseAssetPrecision,
      quoteAssetPrecision: s.quoteAssetPrecision,
      tickSize: priceFilter ? priceFilter.tickSize : "N/A",
      stepSize: lotFilter ? lotFilter.stepSize : "N/A",
      minQty: lotFilter ? lotFilter.minQty : "N/A",
      maxQty: lotFilter ? lotFilter.maxQty : "N/A",
      minNotional: notionalFilter ? notionalFilter.minNotional : "N/A",
      assumed_maker_fee: 0.001,
      assumed_taker_fee: 0.001
    };
  }
  return infoMap;
}

async function fetchAllSymbols() {
  const url = `${BASE_URL}/exchangeInfo`;
  const data = await fetchJson(url);
  // نكتفي بالأزواج التي يتم تداولها بالـ USDT فقط للتبسيط
  return data.symbols
    .filter(s => s.status === "TRADING" && s.quoteAsset === "USDT")
    .map(s => s.symbol);
}

async function fetchKlines(symbol, interval, limit) {
  const url = `${BASE_URL}/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(limit)}`;
  const rows = await fetchJson(url);
  return { rows };
}

async function fetchTicker24h(symbol) {
  const url = `${BASE_URL}/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;
  return await fetchJson(url);
}

async function fetchBookTicker(symbol) {
  const url = `${BASE_URL}/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`;
  return await fetchJson(url);
}

async function fetchDepth(symbol, limit) {
  const url = `${BASE_URL}/depth?symbol=${encodeURIComponent(symbol)}&limit=${encodeURIComponent(limit)}`;
  return await fetchJson(url);
}

async function fetchAggTradesSlice(symbol, startTime, endTime, limit) {
  const url = `${BASE_URL}/aggTrades?symbol=${encodeURIComponent(symbol)}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&limit=${encodeURIComponent(limit)}`;
  return await fetchJson(url);
}

async function fetchAggTradesWindow(symbol, startTime, endTime, sliceMs, limitPerCall) {
  const dedup = new Map();
  const truncatedSlices = [];

  for (let t = startTime; t <= endTime; t += sliceMs) {
    const sliceStart = t;
    const sliceEnd = Math.min(t + sliceMs - 1, endTime);

    const rows = await fetchAggTradesSlice(symbol, sliceStart, sliceEnd, limitPerCall);

    if (rows.length >= limitPerCall) {
      truncatedSlices.push({
        slice_start: new Date(sliceStart).toISOString(),
        slice_end: new Date(sliceEnd).toISOString(),
        count: rows.length
      });
    }

    for (const r of rows) {
      dedup.set(String(r.a), r);
    }

    await sleep(60);
  }

  const allRows = Array.from(dedup.values()).sort((a, b) => {
    const dt = Number(a.T) - Number(b.T);
    if (dt !== 0) return dt;
    return Number(a.a) - Number(b.a);
  });

  return {
    startTime,
    endTime,
    rows: allRows,
    truncatedSlices
  };
}
