// GENERATED from shared/. Do not edit; run node scripts/sync_shared.mjs.

// =========================
// المجمعون (Collectors)
// =========================

function getCommonRecentTradesWindowFromOrderbooks(snapshotsBySymbol) {
  let maxSnapshotTime = 0;
  for (const symbol of Object.keys(snapshotsBySymbol)) {
    const snaps = snapshotsBySymbol[symbol] || [];
    for (const snap of snaps) {
      const t = Number(snap.snapshotTime);
      if (Number.isFinite(t) && t > maxSnapshotTime) {
        maxSnapshotTime = t;
      }
    }
  }
  const endTime = maxSnapshotTime || getServerTime();
  const startTime = endTime - RECENT_TRADES_WINDOW_MS;
  return { startTime, endTime };
}

async function collectAllKlines(zip, symbol) {
  const fileNames = [];
  const rowCounts = {};
  const candlesStatus = {};
  const rowsByInterval = {};
  const currentTime = getServerTime();

  for (const { interval, limit } of INTERVALS) {
    appendStatus(`${symbol}: تحميل شموع ${interval}...`);
    const result = await fetchKlines(symbol, interval, limit);
    const fileName = `${symbol}/klines_${interval}.csv`;
    if (result.rows.length > 0) {
      let lastRow = result.rows[result.rows.length - 1];
      let closeTime = Number(lastRow[6]);
      let isClosed = currentTime > closeTime;
      
      // Sanity Check: Prevent unclosed candle leak
      if (!isClosed) {
        result.rows.pop(); // Remove the unclosed candle
      }

      lastRow = result.rows.length > 0 ? result.rows[result.rows.length - 1] : null;
      closeTime = lastRow ? Number(lastRow[6]) : null;
      isClosed = lastRow ? currentTime > closeTime : true;

      const latestSavedCandleCloseTime = closeTime
        ? new Date(closeTime).toISOString()
        : null;
      const lastClosedClose = lastRow ? Number(lastRow[4]) : null;

      if (lastRow && !isClosed) {
        appendStatus(`${symbol}: تحذير، تم رصد شمعة غير مغلقة بعد التصفية لمدّة ${interval}.`);
      }

      const csv = klinesToCSV(symbol, interval, result.rows);
      zip.file(fileName, csv);
      
      fileNames.push(fileName);
      rowCounts[`klines_${interval}`] = result.rows.length;
      rowsByInterval[interval] = result.rows;

      candlesStatus[interval] = {
        latest_saved_candle_close_time: latestSavedCandleCloseTime,
        all_saved_candles_closed: isClosed,
        last_closed_candle_time: latestSavedCandleCloseTime,
        is_closed: isClosed,
        last_closed_close: lastClosedClose
      };
    } else {
      const csv = klinesToCSV(symbol, interval, []);
      zip.file(fileName, csv);
      fileNames.push(fileName);
      rowCounts[`klines_${interval}`] = 0;
      rowsByInterval[interval] = [];
      candlesStatus[interval] = {
        latest_saved_candle_close_time: null,
        all_saved_candles_closed: true,
        last_closed_candle_time: null,
        is_closed: true,
        last_closed_close: null
      };
    }
  }

  return { fileNames, rowCounts, candlesStatus, rowsByInterval };
}

async function collectTicker(zip, symbol) {
  appendStatus(`${symbol}: تحميل ملخص السوق 24h...`);
  const collectedAt = nowIso();
  const ticker = await fetchTicker24h(symbol);
  const payload = buildTickerJson(symbol, collectedAt, ticker);
  const fileName = `${symbol}/ticker_24h.json`;
  zip.file(fileName, safeJsonStringify(payload));

  return { fileName, rowCount: 1, data: ticker, collectedAt };
}

async function collectBookTicker(zip, symbol) {
  appendStatus(`${symbol}: تحميل السعر اللحظي (bookTicker)...`);
  const collectedAt = nowIso();
  const ticker = await fetchBookTicker(symbol);
  const payload = {
    symbol, collected_at: collectedAt, source: `${BASE_URL}/ticker/bookTicker`,
    market_type: MARKET_TYPE, exchange: EXCHANGE, data: ticker
  };
  const fileName = `${symbol}/book_ticker.json`;
  zip.file(fileName, safeJsonStringify(payload));

  return { fileName, rowCount: 1, data: ticker, collectedAt };
}

async function collectRecentTrades(zip, symbol, commonWindowStart, commonWindowEnd) {
  appendStatus(`${symbol}: تحميل التداولات الأخيرة بدقة زمنية...`);
  const collectedAt = nowIso();
  const result = await fetchAggTradesWindow(symbol, commonWindowStart, commonWindowEnd, AGG_TRADES_SLICE_MS, AGG_TRADES_LIMIT_PER_CALL);

  const csv = tradesToCSV(symbol, collectedAt, result.startTime, result.endTime, result.rows);
  const fileName = `${symbol}/recent_trades.csv`;
  zip.file(fileName, csv);

  const largeTradeStats = analyzeLargeTradeActivity(result.rows, symbol);

  return {
    fileName,
    keptTrades: result.rows.length,
    rawTradesFetched: result.rows.length,
    rowCount: result.rows.length,
    windowStartIso: new Date(result.startTime).toISOString(),
    windowEndIso: new Date(result.endTime).toISOString(),
    endpoint: "/aggTrades",
    isAggregated: true,
    sliceMs: AGG_TRADES_SLICE_MS,
    truncatedSlices: result.truncatedSlices,
    largeTradeStats,
    rows: result.rows
  };
}

async function collectOrderbookSnapshotsRound(symbolsArray, roundIndex) {
  appendStatus(`جولة دفتر الأوامر ${roundIndex + 1}/${ORDERBOOK_SNAPSHOT_COUNT}...`);
  const snapshotTime = getServerTime();

  const tasks = symbolsArray.map(async (symbol) => {
    const data = await fetchDepth(symbol, ORDERBOOK_LIMIT);
    return { symbol, snapshotId: roundIndex + 1, snapshotTime, data };
  });

  return await Promise.all(tasks);
}

async function collectAllOrderbookSnapshots(symbolsArray) {
  const snapshotsBySymbol = {};
  for (const s of symbolsArray) snapshotsBySymbol[s] = [];

  for (let round = 0; round < ORDERBOOK_SNAPSHOT_COUNT; round++) {
    const roundData = await collectOrderbookSnapshotsRound(symbolsArray, round);
    for (const item of roundData) {
      snapshotsBySymbol[item.symbol].push(item);
    }
    if (round < ORDERBOOK_SNAPSHOT_COUNT - 1) {
      appendStatus(`انتظار ${Math.round(ORDERBOOK_DELAY_MS / 1000)} ثوانٍ قبل الجولة التالية من دفتر الأوامر...`);
      await sleep(ORDERBOOK_DELAY_MS);
    }
  }

  return snapshotsBySymbol;
}
