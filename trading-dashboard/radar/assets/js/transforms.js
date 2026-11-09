// GENERATED from shared/. Do not edit; run node scripts/sync_shared.mjs.
globalThis.BinancePipelineProfile = {"limits":[150,400,500,700]};

// =========================
// الإعدادات الثابتة وتحويل البيانات
// =========================

const MARKET_TYPE = "spot";
const EXCHANGE = "binance";
const PAGE_VERSION = "2.0.0";

const INTERVALS = ["1d", "4h", "1h", "15m"].map((interval, i) => ({
  interval, limit: (globalThis.BinancePipelineProfile?.limits || [150,400,500,700])[i]
}));

const ORDERBOOK_LIMIT = 10;
const ORDERBOOK_SNAPSHOT_COUNT = 3;
const ORDERBOOK_DELAY_MS = 10000;

const RECENT_TRADES_WINDOW_MS = 2 * 60 * 1000;
const AGG_TRADES_SLICE_MS = 10 * 1000;
const AGG_TRADES_LIMIT_PER_CALL = 1000;
const EXECUTION_REFERENCE_CAPITAL_USDT = 100;
const VALIDATED_LEVEL_MIN_TOUCHES = 2;
const TRADE_PLAN_RECENT_BARS = 40;
const TOTAL_EXECUTION_COST_PCT = 0.0025;

function csvEscape(value) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowsToCSV(headers, rows) {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

function klinesToCSV(symbol, interval, rows) {
  const headers = [
    "open_time", "open", "high", "low", "close", "volume",
    "close_time", "quote_asset_volume", "number_of_trades",
    "taker_buy_base_asset_volume", "taker_buy_quote_asset_volume"
  ];
  const csvRows = rows.map(r => [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10]]);
  return rowsToCSV(headers, csvRows);
}

function tradesToCSV(symbol, collectedAt, windowStartMs, windowEndMs, trades) {
  const headers = [
    "symbol", "collected_at", "window_start_iso", "window_end_iso",
    "agg_trade_id", "price", "qty", "quote_qty", "first_trade_id",
    "last_trade_id", "trade_time", "trade_time_iso", "is_buyer_maker", "is_best_match"
  ];
  const csvRows = trades.map(t => {
    const qty = Number(t.q);
    const price = Number(t.p);
    const quoteQty = Number.isFinite(qty) && Number.isFinite(price) ? (qty * price) : "";
    return [
      symbol, collectedAt, new Date(windowStartMs).toISOString(),
      new Date(windowEndMs).toISOString(), t.a, t.p, t.q, quoteQty,
      t.f, t.l, t.T, new Date(Number(t.T)).toISOString(), t.m, t.M
    ];
  });
  return rowsToCSV(headers, csvRows);
}

function orderbookSnapshotsToCSV(symbol, snapshots) {
  const headers = [
    "symbol", "snapshot_id", "snapshot_time", "snapshot_time_iso",
    "last_update_id", "side", "level", "price", "quantity"
  ];
  const csvRows = [];
  for (const snap of snapshots) {
    const { snapshotId, snapshotTime, data } = snap;
    const bids = Array.isArray(data.bids) ? data.bids : [];
    const asks = Array.isArray(data.asks) ? data.asks : [];

    bids.forEach((levelData, idx) => {
      csvRows.push([symbol, snapshotId, snapshotTime, new Date(Number(snapshotTime)).toISOString(), data.lastUpdateId ?? "", "bid", idx + 1, levelData[0], levelData[1]]);
    });
    asks.forEach((levelData, idx) => {
      csvRows.push([symbol, snapshotId, snapshotTime, new Date(Number(snapshotTime)).toISOString(), data.lastUpdateId ?? "", "ask", idx + 1, levelData[0], levelData[1]]);
    });
  }
  return rowsToCSV(headers, csvRows);
}

function buildTickerJson(symbol, collectedAt, ticker) {
  return {
    symbol, collected_at: collectedAt, source: `${BASE_URL}/ticker/24hr`,
    market_type: MARKET_TYPE, exchange: EXCHANGE, data: ticker
  };
}

function buildFinalMarketSnapshot(symbol, capturedAt, bookTickerData, ticker24hData, initialReferences = {}) {
  const bidPrice = toFiniteNumber(bookTickerData?.bidPrice);
  const askPrice = toFiniteNumber(bookTickerData?.askPrice);
  const midPrice = Number.isFinite(bidPrice) && Number.isFinite(askPrice)
    ? (bidPrice + askPrice) / 2
    : null;
  const initialBookTickerCollectedAt = initialReferences.book_ticker_collected_at || null;
  const initialTickerCollectedAt = initialReferences.ticker_24h_collected_at || null;
  const capturedMs = new Date(capturedAt).getTime();
  const initialBookMs = initialBookTickerCollectedAt ? new Date(initialBookTickerCollectedAt).getTime() : null;
  const initialTickerMs = initialTickerCollectedAt ? new Date(initialTickerCollectedAt).getTime() : null;

  return {
    symbol,
    captured_at: capturedAt,
    source: "bundle_close_refresh",
    exchange: EXCHANGE,
    market_type: MARKET_TYPE,
    book_ticker_final: {
      source: `${BASE_URL}/ticker/bookTicker`,
      data: bookTickerData
    },
    ticker_24h_final: {
      source: `${BASE_URL}/ticker/24hr`,
      data: ticker24hData
    },
    summary: {
      bid_price: roundTo(bidPrice),
      ask_price: roundTo(askPrice),
      latest_price: roundTo(midPrice),
      spread: roundTo(Number.isFinite(bidPrice) && Number.isFinite(askPrice) ? askPrice - bidPrice : null),
      ticker_price_change_pct_24h: roundTo(toFiniteNumber(ticker24hData?.priceChangePercent), 4),
      ticker_quote_volume_24h: roundTo(toFiniteNumber(ticker24hData?.quoteVolume), 2)
    },
    staleness_vs_initial_collection_ms: {
      book_ticker: Number.isFinite(initialBookMs) ? capturedMs - initialBookMs : null,
      ticker_24h: Number.isFinite(initialTickerMs) ? capturedMs - initialTickerMs : null
    }
  };
}

const {toFiniteNumber, roundTo, floorToStep, ceilToStep, roundToStep} = globalThis.BinanceCore;

function countDecimals(value) {
  const [coefficient, exponent = "0"] = String(value ?? "").toLowerCase().split("e");
  const decimals = (coefficient.split(".")[1] || "").replace(/0+$/, "").length;
  return Math.max(0, decimals - Number(exponent));
}

function calculateSMA(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return sum / period;
}

function calculateEMA(values, period) {
  return globalThis.BinanceCore.ema(values, period).at(-1) ?? null;
}

function calculateChangePct(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current / previous) - 1) * 100;
}

function toTypedKlineRows(rows) {
  return rows.map((row) => ({
    openTime: toFiniteNumber(row[0]),
    open: toFiniteNumber(row[1]),
    high: toFiniteNumber(row[2]),
    low: toFiniteNumber(row[3]),
    close: toFiniteNumber(row[4]),
    volume: toFiniteNumber(row[5]),
    closeTime: toFiniteNumber(row[6])
  })).filter((row) => row.close !== null);
}

function summarizeInterval(interval, rows, latestPrice = null) {
  const typedRows = toTypedKlineRows(rows);

  if (typedRows.length === 0) {
    return {
      interval,
      candles_count: 0
    };
  }

  const closes = typedRows.map((row) => row.close);
  const volumes = typedRows.map((row) => row.volume || 0);
  const latestRow = typedRows[typedRows.length - 1];
  const recent20 = typedRows.slice(-20);
  const recent10 = typedRows.slice(-10);
  const closeForDistance = Number.isFinite(latestPrice) ? latestPrice : latestRow.close;
  const high20 = recent20.length ? Math.max(...recent20.map((row) => row.high)) : null;
  const low20 = recent20.length ? Math.min(...recent20.map((row) => row.low)) : null;
  const sma20 = calculateSMA(closes, 20);
  const ema20 = calculateEMA(closes, 20);
  const avgVolume10 = recent10.length ? recent10.reduce((sum, row) => sum + (row.volume || 0), 0) / recent10.length : null;
  const avgVolume20 = recent20.length ? recent20.reduce((sum, row) => sum + (row.volume || 0), 0) / recent20.length : null;

  return {
    interval,
    candles_count: typedRows.length,
    last_closed_open_time: latestRow.openTime ? new Date(latestRow.openTime).toISOString() : null,
    last_closed_close_time: latestRow.closeTime ? new Date(latestRow.closeTime).toISOString() : null,
    last_close: latestRow.close,
    last_high: latestRow.high,
    last_low: latestRow.low,
    last_volume: latestRow.volume,
    sma20: roundTo(sma20),
    ema20: roundTo(ema20),
    change_vs_prev_close_pct: roundTo(calculateChangePct(latestRow.close, closes[closes.length - 2]), 4),
    change_5_bars_pct: roundTo(calculateChangePct(latestRow.close, closes[Math.max(0, closes.length - 6)]), 4),
    high_20: roundTo(high20),
    low_20: roundTo(low20),
    range_20_pct: roundTo(calculateChangePct(high20, low20), 4),
    avg_volume_10: roundTo(avgVolume10),
    avg_volume_20: roundTo(avgVolume20),
    last_volume_vs_avg10_ratio: roundTo(avgVolume10 ? latestRow.volume / avgVolume10 : null, 4),
    last_volume_vs_avg20_ratio: roundTo(avgVolume20 ? latestRow.volume / avgVolume20 : null, 4),
    distance_to_high_20_pct: roundTo(calculateChangePct(high20, closeForDistance), 4),
    distance_to_low_20_pct: roundTo(calculateChangePct(closeForDistance, low20), 4)
  };
}

function getPivotCandidates(rows, kind, interval) {
  const pivots = [];
  const lookbackRows = rows.slice(-80);

  for (let i = 2; i < lookbackRows.length - 2; i++) {
    const row = lookbackRows[i];
    const prev1 = lookbackRows[i - 1];
    const prev2 = lookbackRows[i - 2];
    const next1 = lookbackRows[i + 1];
    const next2 = lookbackRows[i + 2];

    if (kind === "resistance") {
      if (row.high >= prev1.high && row.high >= prev2.high && row.high >= next1.high && row.high >= next2.high) {
        pivots.push({
          kind,
          interval,
          level: row.high,
          time: row.closeTime,
          source: "swing_high"
        });
      }
    } else if (
      row.low <= prev1.low && row.low <= prev2.low && row.low <= next1.low && row.low <= next2.low
    ) {
      pivots.push({
        kind,
        interval,
        level: row.low,
        time: row.closeTime,
        source: "swing_low"
      });
    }
  }

  return pivots;
}

function mergePivotCandidates(pivots, latestPrice) {
  const sorted = [...pivots].sort((a, b) => a.level - b.level);
  const merged = [];

  for (const pivot of sorted) {
    const tolerance = Number.isFinite(latestPrice)
      ? latestPrice * 0.0025
      : pivot.level * 0.0025;
    const last = merged[merged.length - 1];

    if (last && Math.abs(last.level - pivot.level) <= tolerance && last.kind === pivot.kind) {
      const totalTouches = last.touches + 1;
      last.level = ((last.level * last.touches) + pivot.level) / totalTouches;
      last.touches = totalTouches;
      last.intervals = Array.from(new Set([...last.intervals, pivot.interval]));
      if (Number.isFinite(pivot.time)) {
        last.first_seen_time = Math.min(last.first_seen_time, pivot.time);
        last.last_seen_time = Math.max(last.last_seen_time, pivot.time);
      }
    } else {
      merged.push({
        kind: pivot.kind,
        level: pivot.level,
        touches: 1,
        intervals: [pivot.interval],
        first_seen_time: pivot.time,
        last_seen_time: pivot.time,
        source: pivot.source
      });
    }
  }

  return merged.map((item) => {
    const bandSize = Number.isFinite(latestPrice)
      ? latestPrice * 0.0015
      : item.level * 0.0015;

    return {
      kind: item.kind,
      level: roundTo(item.level),
      band_low: roundTo(item.level - bandSize),
      band_high: roundTo(item.level + bandSize),
      touches: item.touches,
      touches_confirmed: item.touches,
      intervals: item.intervals,
      first_seen_time: item.first_seen_time ? new Date(item.first_seen_time).toISOString() : null,
      last_seen_time: item.last_seen_time ? new Date(item.last_seen_time).toISOString() : null,
      distance_from_price_pct: roundTo(calculateChangePct(item.level, latestPrice), 4),
      is_validated: item.touches >= VALIDATED_LEVEL_MIN_TOUCHES,
      validation_grade: item.touches >= VALIDATED_LEVEL_MIN_TOUCHES ? "validated" : "weak_candidate",
      source: item.source
    };
  });
}

function buildSupportResistanceCandidates(klineRowsByInterval, latestPrice) {
  const fourHourRows = toTypedKlineRows(klineRowsByInterval["4h"] || []);
  const oneHourRows = toTypedKlineRows(klineRowsByInterval["1h"] || []);

  const supportPivots = [
    ...getPivotCandidates(fourHourRows, "support", "4h"),
    ...getPivotCandidates(oneHourRows, "support", "1h")
  ];
  const resistancePivots = [
    ...getPivotCandidates(fourHourRows, "resistance", "4h"),
    ...getPivotCandidates(oneHourRows, "resistance", "1h")
  ];

  const supports = mergePivotCandidates(supportPivots, latestPrice)
    .filter((item) => {
      if (!Number.isFinite(latestPrice)) return true;
      // Support candidates must stay structurally below current price.
      return item.level <= latestPrice;
    })
    .sort((a, b) => b.level - a.level)
    .slice(0, 4);

  const resistances = mergePivotCandidates(resistancePivots, latestPrice)
    .filter((item) => {
      if (!Number.isFinite(latestPrice)) return true;
      // Resistance candidates must stay structurally above current price.
      return item.level >= latestPrice;
    })
    .sort((a, b) => a.level - b.level)
    .slice(0, 4);

  return {
    supports,
    resistances
  };
}

function buildValidatedLevels(levels) {
  return {
    supports: (levels.supports || [])
      .filter((item) => item.touches >= VALIDATED_LEVEL_MIN_TOUCHES)
      .sort((a, b) => b.level - a.level),
    resistances: (levels.resistances || [])
      .filter((item) => item.touches >= VALIDATED_LEVEL_MIN_TOUCHES)
      .sort((a, b) => a.level - b.level)
  };
}

function buildRetestZoneCandidates(levels, latestPrice) {
  const zones = [];
  const nearestSupport = (levels.supports || []).find((item) => item.level <= latestPrice);
  const nearestResistance = (levels.resistances || []).find((item) => item.level >= latestPrice);

  if (nearestSupport) {
    zones.push({
      type: "bullish_retest_support",
      reference_level: nearestSupport.level,
      zone_from: nearestSupport.band_low,
      zone_to: nearestSupport.band_high,
      invalidation_below: roundTo(nearestSupport.band_low * 0.9975),
      distance_from_price_pct: nearestSupport.distance_from_price_pct,
      rationale: "nearest confirmed support below current price"
    });
  }

  if (nearestResistance) {
    zones.push({
      type: "breakout_barrier_or_retest_after_break",
      reference_level: nearestResistance.level,
      zone_from: nearestResistance.band_low,
      zone_to: nearestResistance.band_high,
      invalidation_below: roundTo(nearestResistance.band_low * 0.9975),
      distance_from_price_pct: nearestResistance.distance_from_price_pct,
      rationale: "nearest resistance above current price that requires break or clean retest"
    });
  }

  return zones;
}

function buildExecutionWindow(latestPrice, levels) {
  const nearestSupport = (levels.supports || []).find((item) => item.level <= latestPrice);
  const nearestResistance = (levels.resistances || []).find((item) => item.level >= latestPrice);

  if (!nearestSupport) {
    return {
      status: "no_validated_support_zone",
      ideal_entry_zone: null,
      max_acceptable_entry: null,
      invalidation_level: null,
      reference_support: null,
      reference_resistance: nearestResistance ? nearestResistance.level : null
    };
  }

  const gapToResistance = nearestResistance ? nearestResistance.level - nearestSupport.level : latestPrice * 0.01;
  const maxAcceptableEntry = roundTo(nearestSupport.band_high + Math.min(gapToResistance * 0.35, latestPrice * 0.006));
  const invalidationLevel = roundTo(nearestSupport.band_low - Math.min(gapToResistance * 0.2, latestPrice * 0.004));

  let status = "above_ideal_zone";
  if (latestPrice >= nearestSupport.band_low && latestPrice <= nearestSupport.band_high) {
    status = "inside_ideal_zone";
  } else if (latestPrice > maxAcceptableEntry) {
    status = "extended_above_zone";
  }

  return {
    status,
    ideal_entry_zone: {
      from: nearestSupport.band_low,
      to: nearestSupport.band_high
    },
    max_acceptable_entry: maxAcceptableEntry,
    invalidation_level: invalidationLevel,
    reference_support: nearestSupport.level,
    reference_resistance: nearestResistance ? nearestResistance.level : null
  };
}

function getRecentTypedRows(klineRowsByInterval, interval, bars = TRADE_PLAN_RECENT_BARS) {
  const rows = toTypedKlineRows(klineRowsByInterval?.[interval] || []);
  return rows.slice(-bars);
}

function findZoneStructuralLow(klineRowsByInterval, zoneFrom, zoneTo) {
  const lows = [];
  ["4h", "1h", "15m"].forEach((interval) => {
    const rows = getRecentTypedRows(klineRowsByInterval, interval);
    rows.forEach((row) => {
      if (Number.isFinite(row.low) && row.low >= zoneFrom && row.low <= zoneTo) {
        lows.push(row.low);
      }
    });
  });
  if (!lows.length) return null;
  return Math.min(...lows);
}

function findZoneStructuralHigh(klineRowsByInterval, zoneFrom, zoneTo) {
  const highs = [];
  ["4h", "1h", "15m"].forEach((interval) => {
    const rows = getRecentTypedRows(klineRowsByInterval, interval);
    rows.forEach((row) => {
      if (Number.isFinite(row.high) && row.high >= zoneFrom && row.high <= zoneTo) {
        highs.push(row.high);
      }
    });
  });
  if (!highs.length) return null;
  return Math.max(...highs);
}

function calculateNetRr(entryPrice, takeProfitPrice, stopPrice) {
  if (![entryPrice, takeProfitPrice, stopPrice].every(Number.isFinite)) return null;
  const grossProfit = takeProfitPrice - entryPrice;
  const grossLoss = entryPrice - stopPrice;
  if (grossProfit <= 0 || grossLoss <= 0) return null;

  const executionCost = entryPrice * TOTAL_EXECUTION_COST_PCT;
  const netProfit = grossProfit - executionCost;
  const netLoss = grossLoss + executionCost;

  if (netProfit <= 0 || netLoss <= 0) return null;
  return netProfit / netLoss;
}

function inferTradePlanStatus(latestPrice, entryZone, maxAcceptableEntry, hasTarget) {
  if (!entryZone || !Number.isFinite(latestPrice)) return "insufficient_context";
  if (!hasTarget) {
    if (latestPrice >= entryZone.from && latestPrice <= entryZone.to) return "inside_zone_without_validated_tp";
    if (latestPrice > entryZone.to) return "extended_above_zone_without_validated_tp";
    return "below_zone_without_validated_tp";
  }
  if (latestPrice >= entryZone.from && latestPrice <= entryZone.to) return "inside_ideal_zone";
  if (latestPrice > (maxAcceptableEntry ?? entryZone.to)) return "extended_above_zone";
  if (latestPrice > entryZone.to) return "above_ideal_zone";
  return "below_ideal_zone";
}

function calculateDistanceToZonePct(latestPrice, entryZone) {
  if (!Number.isFinite(latestPrice) || !entryZone) return null;
  if (latestPrice >= entryZone.from && latestPrice <= entryZone.to) return 0;
  if (latestPrice > entryZone.to) return roundTo(((latestPrice - entryZone.to) / latestPrice) * 100, 4);
  return roundTo(((entryZone.from - latestPrice) / latestPrice) * 100, 4);
}

function isStepAligned(value, step) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return false;
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-8;
}

function getTradePlanStatusPriority(candidate) {
  if (!candidate) return 99;
  if (candidate.is_tradeable_at_bundle_price) return 0;
  const status = candidate.status;
  if (status === "inside_ideal_zone" || status === "inside_zone_without_validated_tp") return 1;
  if (status === "above_ideal_zone" || status === "below_ideal_zone" || status === "below_zone_without_validated_tp") return 2;
  if (status === "extended_above_zone" || status === "extended_above_zone_without_validated_tp") return 3;
  return 4;
}

function finalizeTradePlanCandidate(candidate, executionRules) {
  if (!candidate) return null;

  const tickSize = toFiniteNumber(executionRules?.tickSize);
  const stepSize = toFiniteNumber(executionRules?.stepSize);
  const minNotional = toFiniteNumber(executionRules?.minNotional);
  const hasEntryZone = Boolean(
    candidate.entry_zone &&
    Number.isFinite(candidate.entry_zone.from) &&
    Number.isFinite(candidate.entry_zone.to) &&
    candidate.entry_zone.from < candidate.entry_zone.to
  );
  const hasStop = Number.isFinite(candidate.stop_level) &&
    Number.isFinite(candidate.entry_reference_price) &&
    candidate.stop_level < candidate.entry_reference_price;
  const hasValidatedTp = Number.isFinite(candidate.first_tp_level) &&
    Number.isFinite(candidate.entry_reference_price) &&
    candidate.first_tp_level > candidate.entry_reference_price;
  const hasCurrentRr = Number.isFinite(candidate.net_rr_at_bundle_price);
  const hasExecutionPrecision = Number.isFinite(tickSize) && tickSize > 0 &&
    Number.isFinite(stepSize) && stepSize > 0 &&
    Number.isFinite(minNotional) && minNotional > 0;
  const pricesAligned = hasExecutionPrecision &&
    [candidate.entry_reference_price, candidate.stop_level, candidate.first_tp_level]
      .filter((value) => Number.isFinite(value))
      .every((value) => isStepAligned(value, tickSize));
  const passesExecutionRules = hasExecutionPrecision && pricesAligned;
  const structurallyValid = hasEntryZone && hasStop && hasValidatedTp && passesExecutionRules;

  let rejectionReason = null;
  if (!hasEntryZone) {
    rejectionReason = "missing_entry_zone";
  } else if (!hasStop) {
    rejectionReason = "missing_or_invalid_stop_level";
  } else if (!hasValidatedTp) {
    rejectionReason = "missing_validated_take_profit";
  } else if (!passesExecutionRules) {
    rejectionReason = "missing_execution_rules_context";
  }

  return {
    ...candidate,
    structurally_valid: structurallyValid,
    candidate_completeness: {
      has_entry_zone: hasEntryZone,
      has_stop: hasStop,
      has_validated_tp: hasValidatedTp,
      has_current_rr: hasCurrentRr,
      passes_execution_rules: passesExecutionRules,
      raw_prices_aligned_to_tick_size: pricesAligned
    },
    rejection_reason: structurallyValid ? null : rejectionReason
  };
}

function buildTradePlanCandidateFromSupport(level, targetLevel, latestPrice, klineRowsByInterval, executionRules) {
  if (!level) return null;

  const tickSize = toFiniteNumber(executionRules?.tickSize);
  const hasTickSize = Number.isFinite(tickSize) && tickSize > 0;
  const entryZone = {
    from: hasTickSize ? floorToStep(level.band_low, tickSize) : level.band_low,
    to: hasTickSize ? ceilToStep(level.band_high, tickSize) : level.band_high
  };
  const structuralLow = findZoneStructuralLow(klineRowsByInterval, entryZone.from, entryZone.to) ?? level.level;
  const protectedLow = Math.min(structuralLow, level.level);
  const stopLevel = hasTickSize
    ? floorToStep(protectedLow - tickSize, tickSize)
    : roundTo(protectedLow * 0.99975);
  const rawFirstTpLevel = targetLevel
    ? (findZoneStructuralHigh(klineRowsByInterval, targetLevel.band_low, targetLevel.band_high) ?? targetLevel.level)
    : null;
  const firstTpLevel = hasTickSize ? floorToStep(rawFirstTpLevel, tickSize) : rawFirstTpLevel;
  const entryReferencePrice = hasTickSize ? roundToStep(level.level, tickSize) : level.level;
  const maxAcceptableEntry = entryZone.to;

  return finalizeTradePlanCandidate({
    plan_type: "validated_support_retest_long",
    strategy_type: "support_retest",
    basis_level: {
      kind: "support",
      level: level.level,
      touches: level.touches,
      intervals: level.intervals,
      band_low: level.band_low,
      band_high: level.band_high
    },
    target_level: targetLevel ? {
      kind: "resistance",
      level: targetLevel.level,
      touches: targetLevel.touches,
      intervals: targetLevel.intervals,
      band_low: targetLevel.band_low,
      band_high: targetLevel.band_high
    } : null,
    entry_zone: entryZone,
    entry_reference_price: roundTo(entryReferencePrice),
    max_acceptable_entry: roundTo(maxAcceptableEntry),
    stop_level: roundTo(stopLevel),
    first_tp_level: roundTo(firstTpLevel),
    net_rr_at_entry_reference: roundTo(calculateNetRr(entryReferencePrice, firstTpLevel, stopLevel), 4),
    net_rr_at_bundle_price: roundTo(calculateNetRr(latestPrice, firstTpLevel, stopLevel), 4),
    status: inferTradePlanStatus(latestPrice, entryZone, maxAcceptableEntry, Number.isFinite(firstTpLevel)),
    distance_to_entry_zone_pct: calculateDistanceToZonePct(latestPrice, entryZone),
    is_tradeable_at_bundle_price: Boolean(
      Number.isFinite(firstTpLevel) &&
      latestPrice >= entryZone.from &&
      latestPrice <= entryZone.to &&
      calculateNetRr(latestPrice, firstTpLevel, stopLevel) >= 1.5
    ),
    rationale: [
      "entry zone derived from nearest validated support band",
      Number.isFinite(firstTpLevel)
        ? "first target derived from nearest validated resistance band"
        : "no validated resistance above support to build a conservative first target"
    ]
  }, executionRules);
}

function buildTradePlanCandidateFromBreakout(level, nextResistanceLevel, latestPrice, klineRowsByInterval, executionRules) {
  if (!level) return null;

  const fourHourRows = getRecentTypedRows(klineRowsByInterval, "4h", 12);
  const oneHourRows = getRecentTypedRows(klineRowsByInterval, "1h", 24);
  const breakoutConfirmed = [...fourHourRows, ...oneHourRows].some((row) => Number.isFinite(row.close) && row.close > level.level);
  if (!breakoutConfirmed) return null;

  const tickSize = toFiniteNumber(executionRules?.tickSize);
  const hasTickSize = Number.isFinite(tickSize) && tickSize > 0;
  const entryZone = {
    from: hasTickSize ? floorToStep(level.band_low, tickSize) : level.band_low,
    to: hasTickSize ? ceilToStep(level.band_high, tickSize) : level.band_high
  };
  const structuralLow = findZoneStructuralLow(klineRowsByInterval, entryZone.from, entryZone.to) ?? level.level;
  const protectedLow = Math.min(structuralLow, level.level);
  const stopLevel = hasTickSize
    ? floorToStep(protectedLow - tickSize, tickSize)
    : roundTo(protectedLow * 0.99975);
  const rawFirstTpLevel = nextResistanceLevel
    ? (findZoneStructuralHigh(klineRowsByInterval, nextResistanceLevel.band_low, nextResistanceLevel.band_high) ?? nextResistanceLevel.level)
    : null;
  const firstTpLevel = hasTickSize ? floorToStep(rawFirstTpLevel, tickSize) : rawFirstTpLevel;
  const entryReferencePrice = hasTickSize ? roundToStep(level.level, tickSize) : level.level;
  const maxAcceptableEntry = entryZone.to;

  return finalizeTradePlanCandidate({
    plan_type: "validated_breakout_retest_long",
    strategy_type: "breakout_retest",
    basis_level: {
      kind: "breakout_retest",
      level: level.level,
      touches: level.touches,
      intervals: level.intervals,
      band_low: level.band_low,
      band_high: level.band_high
    },
    target_level: nextResistanceLevel ? {
      kind: "resistance",
      level: nextResistanceLevel.level,
      touches: nextResistanceLevel.touches,
      intervals: nextResistanceLevel.intervals,
      band_low: nextResistanceLevel.band_low,
      band_high: nextResistanceLevel.band_high
    } : null,
    entry_zone: entryZone,
    entry_reference_price: roundTo(entryReferencePrice),
    max_acceptable_entry: roundTo(maxAcceptableEntry),
    stop_level: roundTo(stopLevel),
    first_tp_level: roundTo(firstTpLevel),
    net_rr_at_entry_reference: roundTo(calculateNetRr(entryReferencePrice, firstTpLevel, stopLevel), 4),
    net_rr_at_bundle_price: roundTo(calculateNetRr(latestPrice, firstTpLevel, stopLevel), 4),
    status: inferTradePlanStatus(latestPrice, entryZone, maxAcceptableEntry, Number.isFinite(firstTpLevel)),
    distance_to_entry_zone_pct: calculateDistanceToZonePct(latestPrice, entryZone),
    is_tradeable_at_bundle_price: Boolean(
      Number.isFinite(firstTpLevel) &&
      latestPrice >= entryZone.from &&
      latestPrice <= entryZone.to &&
      calculateNetRr(latestPrice, firstTpLevel, stopLevel) >= 1.5
    ),
    rationale: [
      "entry zone derived from validated breakout level after closed-candle confirmation",
      Number.isFinite(firstTpLevel)
        ? "first target derived from next validated resistance above the breakout level"
        : "breakout is confirmed but no next validated resistance exists for a conservative first target"
    ]
  }, executionRules);
}

function buildTradePlanCandidates(symbol, collectedAt, latestPrice, validatedLevels, klineRowsByInterval, executionRules) {
  const supports = validatedLevels?.supports || [];
  const resistances = validatedLevels?.resistances || [];
  const nearestSupport = supports.find((item) => item.level <= latestPrice) || supports[0] || null;
  const nearestResistance = resistances.find((item) => item.level >= latestPrice) || resistances[0] || null;
  const nextResistanceAboveNearest = nearestResistance
    ? resistances.find((item) => item.level > nearestResistance.level) || null
    : null;

  const candidates = [];
  const supportCandidate = buildTradePlanCandidateFromSupport(
    nearestSupport,
    nearestResistance,
    latestPrice,
    klineRowsByInterval,
    executionRules
  );
  if (supportCandidate) candidates.push(supportCandidate);

  const breakoutCandidate = buildTradePlanCandidateFromBreakout(
    nearestResistance,
    nextResistanceAboveNearest,
    latestPrice,
    klineRowsByInterval,
    executionRules
  );
  if (breakoutCandidate) candidates.push(breakoutCandidate);

  const sortCandidates = (a, b) => {
    const priorityA = getTradePlanStatusPriority(a);
    const priorityB = getTradePlanStatusPriority(b);
    if (priorityA !== priorityB) return priorityA - priorityB;

    const scoreA = Number.isFinite(a.net_rr_at_bundle_price) ? a.net_rr_at_bundle_price : -1;
    const scoreB = Number.isFinite(b.net_rr_at_bundle_price) ? b.net_rr_at_bundle_price : -1;
    if (scoreA !== scoreB) return scoreB - scoreA;

    if (a.is_tradeable_at_bundle_price !== b.is_tradeable_at_bundle_price) {
      return a.is_tradeable_at_bundle_price ? -1 : 1;
    }

    const distanceA = Number.isFinite(a.distance_to_entry_zone_pct) ? a.distance_to_entry_zone_pct : Number.POSITIVE_INFINITY;
    const distanceB = Number.isFinite(b.distance_to_entry_zone_pct) ? b.distance_to_entry_zone_pct : Number.POSITIVE_INFINITY;
    if (distanceA !== distanceB) return distanceA - distanceB;

    return 0;
  };

  const structurallyValidCandidates = candidates
    .filter((candidate) => candidate.structurally_valid)
    .sort(sortCandidates);
  const incompleteCandidates = candidates
    .filter((candidate) => !candidate.structurally_valid)
    .sort(sortCandidates);
  const primaryCandidate = structurallyValidCandidates[0] || null;
  const bestIncompleteCandidate = incompleteCandidates[0] || null;

  return {
    symbol,
    collected_at: collectedAt,
    source: "validated_levels + closed_candles",
    exchange: EXCHANGE,
    market_type: MARKET_TYPE,
    latest_price: roundTo(latestPrice),
    assumptions: {
      total_execution_cost_pct: TOTAL_EXECUTION_COST_PCT,
      reference_capital_usdt: EXECUTION_REFERENCE_CAPITAL_USDT
    },
    candidates,
    primary_candidate: primaryCandidate,
    best_incomplete_candidate: bestIncompleteCandidate
  };
}

function inferTrendLabel(latestClose, sma20, ema20) {
  if (![latestClose, sma20, ema20].every(Number.isFinite)) return "unknown";
  if (latestClose > sma20 && sma20 >= ema20) return "bullish";
  if (latestClose < sma20 && sma20 <= ema20) return "bearish";
  return "mixed";
}

function buildDerivedMetrics(symbol, collectedAt, klineRowsByInterval, latestPrice, bookTickerData, ticker24hData, largeTradeActivity) {
  const intervalMetrics = {};
  for (const [interval, rows] of Object.entries(klineRowsByInterval || {})) {
    intervalMetrics[interval] = summarizeInterval(interval, rows, latestPrice);
    intervalMetrics[interval].trend_bias = inferTrendLabel(
      intervalMetrics[interval].last_close,
      intervalMetrics[interval].sma20,
      intervalMetrics[interval].ema20
    );
  }

  const supportResistanceCandidates = buildSupportResistanceCandidates(klineRowsByInterval, latestPrice);
  const validatedLevels = buildValidatedLevels(supportResistanceCandidates);
  const retestZoneCandidates = buildRetestZoneCandidates(validatedLevels, latestPrice);
  const executionWindow = buildExecutionWindow(latestPrice, validatedLevels);
  const bidPrice = toFiniteNumber(bookTickerData?.bidPrice);
  const askPrice = toFiniteNumber(bookTickerData?.askPrice);
  const spread = Number.isFinite(bidPrice) && Number.isFinite(askPrice) ? askPrice - bidPrice : null;

  return {
    symbol,
    collected_at: collectedAt,
    source: "derived_from_bundle",
    exchange: EXCHANGE,
    market_type: MARKET_TYPE,
    latest_price: roundTo(latestPrice),
    market_snapshot: {
      bid_price: roundTo(bidPrice),
      ask_price: roundTo(askPrice),
      spread: roundTo(spread),
      spread_pct_of_mid: roundTo(latestPrice ? (spread / latestPrice) * 100 : null, 6),
      ticker_price_change_pct_24h: roundTo(toFiniteNumber(ticker24hData?.priceChangePercent), 4),
      ticker_quote_volume_24h: roundTo(toFiniteNumber(ticker24hData?.quoteVolume), 2),
      ticker_trade_count_24h: toFiniteNumber(ticker24hData?.count)
    },
    trend_snapshot: {
      bias_1d: intervalMetrics["1d"]?.trend_bias || "unknown",
      bias_4h: intervalMetrics["4h"]?.trend_bias || "unknown",
      bias_1h: intervalMetrics["1h"]?.trend_bias || "unknown",
      bias_15m: intervalMetrics["15m"]?.trend_bias || "unknown"
    },
    large_trade_activity: largeTradeActivity || {},
    support_resistance_candidates: supportResistanceCandidates,
    validated_levels: validatedLevels,
    retest_zone_candidates: retestZoneCandidates,
    execution_window: executionWindow,
    intervals: intervalMetrics
  };
}

function buildExecutionCheck(symbol, collectedAt, latestPrice, executionRules) {
  const tickSize = toFiniteNumber(executionRules?.tickSize);
  const stepSize = toFiniteNumber(executionRules?.stepSize);
  const minQty = toFiniteNumber(executionRules?.minQty);
  const maxQty = toFiniteNumber(executionRules?.maxQty);
  const minNotional = toFiniteNumber(executionRules?.minNotional);
  const rawQty = Number.isFinite(latestPrice) && latestPrice > 0
    ? EXECUTION_REFERENCE_CAPITAL_USDT / latestPrice
    : null;
  const roundedQty = floorToStep(rawQty, stepSize);
  const roundedEntry = floorToStep(latestPrice, tickSize);
  const notional = Number.isFinite(roundedQty) && Number.isFinite(roundedEntry)
    ? roundedQty * roundedEntry
    : null;
  const quantityDecimals = Number.isFinite(stepSize) ? countDecimals(stepSize) : null;
  const priceDecimals = Number.isFinite(tickSize) ? countDecimals(tickSize) : null;

  const checks = {
    has_reference_price: Number.isFinite(latestPrice) && latestPrice > 0 && Number.isFinite(roundedEntry) && roundedEntry > 0,
    has_tick_size: Number.isFinite(tickSize) && tickSize > 0,
    has_step_size: Number.isFinite(stepSize) && stepSize > 0,
    passes_min_qty: Number.isFinite(roundedQty) && Number.isFinite(minQty) ? roundedQty >= minQty : null,
    passes_max_qty: Number.isFinite(roundedQty) && Number.isFinite(maxQty) ? roundedQty <= maxQty : null,
    passes_min_notional: Number.isFinite(notional) && Number.isFinite(minNotional) ? notional >= minNotional : null
  };

  const allPassed = Object.values(checks).every((value) => value !== false && value !== null);

  return {
    symbol,
    collected_at: collectedAt,
    source: "execution_rules + current_reference_price",
    exchange: EXCHANGE,
    market_type: MARKET_TYPE,
    capital_reference_usdt: EXECUTION_REFERENCE_CAPITAL_USDT,
    reference_price: roundTo(latestPrice),
    rounded_entry_reference: roundTo(roundedEntry, priceDecimals ?? 8),
    raw_quantity_at_reference_price: roundTo(rawQty, 12),
    rounded_quantity: roundTo(roundedQty, quantityDecimals ?? 12),
    estimated_notional: roundTo(notional, 8),
    precision: {
      tick_size: executionRules?.tickSize ?? null,
      step_size: executionRules?.stepSize ?? null,
      price_decimals: priceDecimals,
      quantity_decimals: quantityDecimals
    },
    limits: {
      min_qty: executionRules?.minQty ?? null,
      max_qty: executionRules?.maxQty ?? null,
      min_notional: executionRules?.minNotional ?? null
    },
    assumed_fees: {
      maker_fee: executionRules?.assumed_maker_fee ?? null,
      taker_fee: executionRules?.assumed_taker_fee ?? null
    },
    checks,
    status: allPassed ? "valid_at_reference_price" : "invalid_at_reference_price"
  };
}

function analyzeLargeTradeActivity(trades, symbol) {
  let thresholdUsd = 10000;
  if (symbol.includes("BTC")) thresholdUsd = 50000;
  else if (symbol.includes("ETH")) thresholdUsd = 20000;
  else if (symbol.includes("SOL")) thresholdUsd = 10000;

  let buyVol = 0, sellVol = 0, buyCount = 0, sellCount = 0, maxTrade = 0;
  
  trades.forEach(t => {
    const val = Number(t.p) * Number(t.q);
    if (val >= thresholdUsd) {
      if (t.m) { // Maker is buyer -> Aggressive Seller
        sellVol += val;
        sellCount++;
      } else { // Maker is seller -> Aggressive Buyer
        buyVol += val;
        buyCount++;
      }
      if (val > maxTrade) maxTrade = val;
    }
  });

  return {
    threshold_usd: thresholdUsd,
    large_buy_vol: Number(buyVol.toFixed(2)),
    large_sell_vol: Number(sellVol.toFixed(2)),
    large_buy_count: buyCount,
    large_sell_count: sellCount,
    max_large_trade: Number(maxTrade.toFixed(2)),
    large_trade_sentiment: buyVol > sellVol ? "BULLISH" : (sellVol > buyVol ? "BEARISH" : "NEUTRAL")
  };
}

function buildSymbolMetadata(symbol, startedAt, finishedAt, extras = {}) {
  return {
    symbol,
    exchange: EXCHANGE,
    market_type: MARKET_TYPE,
    collected_started_at: startedAt,
    collected_finished_at: finishedAt,
    intervals: INTERVALS.map(x => ({ interval: x.interval, limit: x.limit })),
    orderbook: { // renamed conceptually, though key stays orderbook
      depth_levels_per_side: ORDERBOOK_LIMIT,
      snapshot_count: ORDERBOOK_SNAPSHOT_COUNT,
      delay_between_snapshots_ms: ORDERBOOK_DELAY_MS
    },
    recent_trades: {
      source_endpoint: "/aggTrades",
      is_aggregated: true,
      retained_window_ms: RECENT_TRADES_WINDOW_MS,
      slice_ms: AGG_TRADES_SLICE_MS,
      limit_per_call: AGG_TRADES_LIMIT_PER_CALL
    },
    summary: extras.summary || {},
    files: extras.files || [],
    counts: extras.counts || {},
    execution_rules: extras.execution_rules || {},
    candles_status: extras.candles_status || {},
    large_trade_activity: extras.large_trade_activity || {},
    derived_metrics_overview: extras.derived_metrics_overview || {},
    execution_check: extras.execution_check || {},
    final_market_snapshot: extras.final_market_snapshot || {},
    notes: extras.notes || []
  };
}

function buildManifest(startedAt, finishedAt, serverTimeReference, symbols, symbolResults, commonRecentTradesWindow, allFiles, finalMarketSnapshot = {}) {
  const startedMs = new Date(startedAt).getTime();
  const finishedMs = new Date(finishedAt).getTime();
  const ageMs = finishedMs - startedMs;

  return {
    bundle_type: "market_bundle",
    schema_version: "2.1.0",
    version: PAGE_VERSION,
    bundle_generator_version: PAGE_VERSION,
    exchange: EXCHANGE,
    market_type: MARKET_TYPE,
    collection_started_at: startedAt,
    collection_finished_at: finishedAt,
    server_time_reference: new Date(serverTimeReference).toISOString(),
    bundle_duration_ms: ageMs,
    age_at_bundle_close_ms: ageMs,
    symbols: symbols,
    files_included: allFiles,
    intervals: INTERVALS,
    orderbook: {
      depth_levels_per_side: ORDERBOOK_LIMIT,
      snapshot_count: ORDERBOOK_SNAPSHOT_COUNT,
      delay_between_snapshots_ms: ORDERBOOK_DELAY_MS
    },
    recent_trades: {
      source_endpoint: "/aggTrades",
      is_aggregated: true,
      retained_window_ms: RECENT_TRADES_WINDOW_MS,
      slice_ms: AGG_TRADES_SLICE_MS,
      limit_per_call: AGG_TRADES_LIMIT_PER_CALL,
      common_window_start_iso: new Date(commonRecentTradesWindow.startTime).toISOString(),
      common_window_end_iso: new Date(commonRecentTradesWindow.endTime).toISOString()
    },
    final_market_snapshot: finalMarketSnapshot,
    symbol_results: symbolResults
  };
}

function buildExecutionMicrostructureSummary(symbol, windowSeconds, trades, orderbookSnapshots, bookTickerData) {
  let aggressiveBuyVolume = 0;
  let aggressiveSellVolume = 0;
  let largestBuyTrade = { price: 0, quantity: 0 };
  let largestSellTrade = { price: 0, quantity: 0 };
  let totalVolume = 0;
  let totalValue = 0;

  trades.forEach(t => {
    const qty = Number(t.q);
    const price = Number(t.p);
    const value = price * qty;
    
    totalVolume += qty;
    totalValue += value;

    if (t.m) { // Maker is buyer -> Aggressive Seller
      aggressiveSellVolume += qty;
      if (qty > largestSellTrade.quantity) {
        largestSellTrade = { price, quantity: qty };
      }
    } else { // Maker is seller -> Aggressive Buyer
      aggressiveBuyVolume += qty;
      if (qty > largestBuyTrade.quantity) {
        largestBuyTrade = { price, quantity: qty };
      }
    }
  });

  const shortVwap = totalVolume > 0 ? (totalValue / totalVolume) : null;
  const bidPrice = toFiniteNumber(bookTickerData?.bidPrice);
  const askPrice = toFiniteNumber(bookTickerData?.askPrice);
  const spread = (Number.isFinite(bidPrice) && Number.isFinite(askPrice)) ? askPrice - bidPrice : null;
  const spreadBps = spread && bidPrice ? (spread / bidPrice) * 10000 : null;
  const latestPrice = bidPrice && askPrice ? (bidPrice + askPrice) / 2 : null;
  const lastPriceVsVwap = (latestPrice && shortVwap) ? (latestPrice > shortVwap ? 'above' : 'below') : 'unknown';
  
  const delta = aggressiveBuyVolume - aggressiveSellVolume;
  const buySellRatio = aggressiveSellVolume > 0 ? (aggressiveBuyVolume / aggressiveSellVolume) : null;
  
  let tradeFlowBias = 'neutral';
  let flowStrength = 'neutral';
  if (buySellRatio > 1.5) { tradeFlowBias = 'bullish'; flowStrength = 'strong'; }
  else if (buySellRatio > 1.1) { tradeFlowBias = 'slightly_bullish'; flowStrength = 'weak'; }
  else if (buySellRatio < 0.66) { tradeFlowBias = 'bearish'; flowStrength = 'strong'; }
  else if (buySellRatio < 0.9) { tradeFlowBias = 'slightly_bearish'; flowStrength = 'weak'; }

  let bidLiquidityNear = 0;
  let askLiquidityNear = 0;

  const lastSnapshot = orderbookSnapshots.length > 0 ? orderbookSnapshots[orderbookSnapshots.length - 1].data : null;
  if (lastSnapshot) {
    const bids = Array.isArray(lastSnapshot.bids) ? lastSnapshot.bids : [];
    const asks = Array.isArray(lastSnapshot.asks) ? lastSnapshot.asks : [];
    bids.forEach(level => {
      bidLiquidityNear += Number(level[1]);
    });
    asks.forEach(level => {
      askLiquidityNear += Number(level[1]);
    });
  }

  const imbalanceNear = (bidLiquidityNear + askLiquidityNear > 0) ? (bidLiquidityNear - askLiquidityNear) / (bidLiquidityNear + askLiquidityNear) : null;

  let executionQuality = 'acceptable';
  if (spreadBps > 5) executionQuality = 'poor_spread';
  else if (tradeFlowBias.includes('bearish') && imbalanceNear < -0.2) executionQuality = 'acceptable_but_weak';
  else if (tradeFlowBias.includes('bullish') && imbalanceNear > 0.2) executionQuality = 'strong';

  if (executionQuality === 'strong' && lastPriceVsVwap === 'below') {
    executionQuality = 'good_with_minor_caution';
  }

  let confidenceScore = 50;
  if (executionQuality === 'strong') confidenceScore += 25;
  if (executionQuality === 'good_with_minor_caution') confidenceScore += 15;
  if (executionQuality === 'poor_spread') confidenceScore -= 30;
  if (executionQuality === 'acceptable_but_weak') confidenceScore -= 10;
  
  if (tradeFlowBias === 'bullish') confidenceScore += 15;
  else if (tradeFlowBias === 'slightly_bullish') confidenceScore += 5;
  else if (tradeFlowBias === 'bearish') confidenceScore -= 15;
  else if (tradeFlowBias === 'slightly_bearish') confidenceScore -= 5;
  
  if (imbalanceNear > 0.3) confidenceScore += 10;
  else if (imbalanceNear < -0.3) confidenceScore -= 10;
  
  if (lastPriceVsVwap === 'above') confidenceScore += 10;
  else if (lastPriceVsVwap === 'below') confidenceScore -= 10;

  if (spreadBps < 2) confidenceScore += 5;

  confidenceScore = Math.max(0, Math.min(100, Math.round(confidenceScore)));

  const notes = [];
  if (spreadBps < 2) notes.push('spread is excellent');
  else if (spreadBps > 5) notes.push('spread is elevated');
  
  if (aggressiveSellVolume > aggressiveBuyVolume) notes.push('recent aggressive selling exceeds buying');
  else if (aggressiveBuyVolume > aggressiveSellVolume) notes.push('recent aggressive buying exceeds selling');

  if (tradeFlowBias.includes('bearish') && imbalanceNear < 0) notes.push('no clear execution support for immediate long');

  const supportingFlags = [];
  const riskFlags = [];
  
  if (lastPriceVsVwap === 'above') supportingFlags.push('price_above_short_vwap');
  else if (lastPriceVsVwap === 'below') riskFlags.push('price_below_short_vwap');
  
  if (delta > 0) supportingFlags.push('positive_trade_delta');
  else if (delta < 0) riskFlags.push('negative_trade_delta');
  
  if (bidLiquidityNear > askLiquidityNear * 1.2) supportingFlags.push('bid_liquidity_dominates_ask');
  else if (askLiquidityNear > bidLiquidityNear * 1.2) riskFlags.push('ask_liquidity_dominates_bid');

  if (spreadBps > 10) riskFlags.push('high_spread_risk');
  else if (spreadBps < 2) supportingFlags.push('excellent_spread');

  return {
    window_seconds: windowSeconds,
    aggressive_buy_volume: roundTo(aggressiveBuyVolume, 2),
    aggressive_sell_volume: roundTo(aggressiveSellVolume, 2),
    delta: roundTo(delta, 2),
    buy_sell_ratio: roundTo(buySellRatio, 2),
    largest_buy_trade: largestBuyTrade,
    largest_sell_trade: largestSellTrade,
    short_vwap: roundTo(shortVwap, 2),
    last_price_vs_vwap: lastPriceVsVwap,
    trade_flow_bias: tradeFlowBias,
    flow_strength: flowStrength,
    near_liquidity_definition: "top_10_levels_per_side",
    orderbook_bid_liquidity_near: roundTo(bidLiquidityNear, 2),
    orderbook_ask_liquidity_near: roundTo(askLiquidityNear, 2),
    orderbook_imbalance_near: roundTo(imbalanceNear, 2),
    spread_bps: roundTo(spreadBps, 4),
    execution_quality: executionQuality,
    execution_confidence_score: confidenceScore,
    supporting_flags: supportingFlags,
    risk_flags: riskFlags,
    notes: notes
  };
}
