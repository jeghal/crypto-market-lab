import { calculateSpotTrade, parseNumericInput } from '../dashboard/trade-calculator.js';
import { CFG, SIGNAL_ANALYSIS_LABEL, SYMS } from '../dashboard/config.js';
import {
  atr,
  bollingerBands,
  ema,
  macd,
  relativeVolume,
  rsi,
  stochRsi,
} from '../dashboard/indicators.js';
import { getSupportResistanceLevels } from '../dashboard/levels.js';
import { getBreakoutCandidates, getCandles, getPrices, getTopGainers } from '../dashboard/api.js';
import { buildCoilRow, buildScreenerRow, buildSignal } from '../dashboard/signal.js';
import { pathToFileURL } from 'node:url';

const results = [];
let failureCount = 0;

// Minimal localStorage polyfill for Node integration tests.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
}

function ok(name, details = '') {
  results.push({ status: 'PASS', name, details });
}

function fail(name, details = '') {
  failureCount += 1;
  results.push({ status: 'FAIL', name, details });
}

function assert(condition, name, details = '') {
  if (condition) ok(name, details);
  else fail(name, details);
}

function toNum(v) {
  return Number.parseFloat(v.toFixed(10));
}

function approxEqual(a, b, epsilon = 1e-6) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= epsilon;
}

function makeSyntheticCandles(count = 220) {
  const candles = [];
  const start = Date.now() - count * 60_000;
  let prevClose = 100;

  for (let i = 0; i < count; i += 1) {
    const drift = Math.sin(i / 10) * 0.7 + i * 0.015;
    const open = prevClose;
    const close = open + drift * 0.2;
    const high = Math.max(open, close) + 0.4 + (i % 3) * 0.08;
    const low = Math.min(open, close) - 0.35 - (i % 2) * 0.05;
    const volume = 1000 + i * 6 + (i % 5) * 30;

    candles.push({
      t: start + i * 60_000,
      o: open,
      h: high,
      l: low,
      c: close,
      v: volume,
    });
    prevClose = close;
  }

  return candles;
}

function runUnitTests() {
  console.log('Running unit tests...');

  assert(parseNumericInput('1,000') === 1000, 'parseNumericInput handles US grouping');
  assert(parseNumericInput('68,423.5') === 68423.5, 'parseNumericInput handles comma+dot (US)');
  assert(parseNumericInput('68.423,5') === 68423.5, 'parseNumericInput handles dot+comma (EU)');
  assert(parseNumericInput('1 234,56') === 1234.56, 'parseNumericInput handles spaces');
  assert(parseNumericInput('1’234,56') === 1234.56, 'parseNumericInput handles apostrophe grouping');
  assert(parseNumericInput('abc') === null, 'parseNumericInput rejects invalid');

  const trade = calculateSpotTrade({
    amount: '1000',
    entry: '100',
    target: '112',
    stop: '95',
    buyFeePct: '0.1',
    sellFeePct: '0.1',
  });

  assert(!!trade, 'calculateSpotTrade returns result for valid input');
  if (trade) {
    assert(toNum(trade.qty) === 10, 'calculateSpotTrade qty');
    assert(trade.qtyAfterBuy < trade.qty, 'calculateSpotTrade net qty lower after fees');
    assert(Number.isFinite(trade.breakeven) && trade.breakeven > 0, 'calculateSpotTrade breakeven finite');
    assert(Number.isFinite(trade.rewardAmount), 'calculateSpotTrade reward finite');
    assert(Number.isFinite(trade.riskAmount), 'calculateSpotTrade risk finite');
    assert(Number.isFinite(trade.riskReward) && trade.riskReward > 0, 'calculateSpotTrade risk/reward positive');
    assert(
      approxEqual(trade.qtyAfterBuy, trade.qty * (1 - 0.001)),
      'calculateSpotTrade qtyAfterBuy formula consistency',
    );
    assert(
      approxEqual(trade.targetNet, trade.qtyAfterBuy * 112 * (1 - 0.001)),
      'calculateSpotTrade target net formula consistency',
    );
    assert(
      approxEqual(trade.stopNet, trade.qtyAfterBuy * 95 * (1 - 0.001)),
      'calculateSpotTrade stop net formula consistency',
    );
    assert(
      approxEqual(trade.rewardAmount, trade.targetNet - 1000),
      'calculateSpotTrade reward amount consistency',
    );
    assert(
      approxEqual(trade.riskAmount, 1000 - trade.stopNet),
      'calculateSpotTrade risk amount consistency',
    );
    assert(
      trade.riskAmount > 0 && approxEqual(trade.riskReward, trade.rewardAmount / trade.riskAmount),
      'calculateSpotTrade risk/reward formula consistency',
    );
  }

  assert(
    calculateSpotTrade({ amount: '1000', entry: '100', stop: '95', target: '110', sellFeePct: '100' }) === null,
    'calculateSpotTrade rejects sell fee = 100%',
  );
  assert(
    calculateSpotTrade({ amount: '1000', entry: '100', stop: '95', target: '110', buyFeePct: '-1' }) === null,
    'calculateSpotTrade rejects negative buy fee',
  );

  const candles = makeSyntheticCandles(260);
  const closes = candles.map((c) => c.c);

  const e21 = ema(closes, CFG.ema21);
  const e50 = ema(closes, CFG.ema50);
  const r = rsi(closes, CFG.rsiP);
  const m = macd(closes, CFG.macdF, CFG.macdS, CFG.macdSig);
  const s = stochRsi(closes, CFG.rsiP, CFG.stochP, CFG.stochK, CFG.stochD);
  const a = atr(candles, CFG.atrP);
  const rv = relativeVolume(candles, 20);
  const bb = bollingerBands(closes, 20, 2);
  const sr = getSupportResistanceLevels(candles);

  const lastRsi = r.at(-1);
  const lastAtr = a.at(-1);
  const lastK = s.k.at(-1);
  const lastD = s.d.at(-1);

  assert(Number.isFinite(e21.at(-1)), 'EMA21 last value finite');
  assert(Number.isFinite(e50.at(-1)), 'EMA50 last value finite');
  assert(Number.isFinite(lastRsi) && lastRsi >= 0 && lastRsi <= 100, 'RSI last value in [0,100]');
  assert(Number.isFinite(m.line.at(-1)), 'MACD line finite');
  assert(Number.isFinite(m.signal.at(-1)), 'MACD signal finite');
  assert(Number.isFinite(m.hist.at(-1)), 'MACD histogram finite');
  assert(Number.isFinite(lastK) && lastK >= 0 && lastK <= 1, 'StochRSI %K in [0,1]');
  assert(Number.isFinite(lastD) && lastD >= 0 && lastD <= 1, 'StochRSI %D in [0,1]');
  assert(Number.isFinite(lastAtr) && lastAtr > 0, 'ATR positive');
  assert(Number.isFinite(rv.at(-1)) && rv.at(-1) > 0, 'RVOL positive');
  assert(bb.filter(Boolean).length > 0, 'Bollinger returns non-empty computed values');
  assert(sr.length <= 8, 'Support/Resistance count <= 8');
}

async function runIntegrationTests() {
  console.log('Running integration tests (live Binance)...');
  const ac = new AbortController();
  const testSymbols = SYMS;
  const intervals = ['15m', '1h', '4h', '1d'];

  // API level checks
  try {
    const prices = await getPrices(ac.signal, ['DOGEUSDT']);
    assert(typeof prices === 'object' && prices !== null, 'API getPrices returns object');
    assert(
      Object.values(prices).every((p) => Number.isFinite(p.price) && Number.isFinite(p.chg)),
      'API getPrices values are numeric',
    );
  } catch (error) {
    fail('API getPrices failed', error?.message ?? String(error));
  }

  for (const sym of testSymbols) {
    for (const iv of intervals) {
      try {
        const candles = await getCandles(sym, iv, 120, ac.signal);
        assert(Array.isArray(candles) && candles.length === 120, `API getCandles length (${sym}-${iv})`);
        const last = candles.at(-1);
        assert(
          Number.isFinite(last?.o)
            && Number.isFinite(last?.h)
            && Number.isFinite(last?.l)
            && Number.isFinite(last?.c)
            && Number.isFinite(last?.v),
          `API getCandles OHLCV finite (${sym}-${iv})`,
        );
      } catch (error) {
        fail(`API getCandles failed (${sym}-${iv})`, error?.message ?? String(error));
      }
    }
  }

  try {
    const top = await getTopGainers(8, ac.signal);
    assert(Array.isArray(top), 'API getTopGainers returns array');
    assert(top.length <= 8, 'API getTopGainers limit respected');
    assert(top.every((s) => typeof s === 'string' && s.endsWith('USDT')), 'API getTopGainers symbol format');
  } catch (error) {
    fail('API getTopGainers failed', error?.message ?? String(error));
  }

  try {
    const breakout = await getBreakoutCandidates(8, ac.signal);
    assert(Array.isArray(breakout), 'API getBreakoutCandidates returns array');
    assert(breakout.length <= 8, 'API getBreakoutCandidates limit respected');
    assert(breakout.every((s) => typeof s === 'string' && s.endsWith('USDT')), 'API getBreakoutCandidates symbol format');
  } catch (error) {
    fail('API getBreakoutCandidates failed', error?.message ?? String(error));
  }

  for (const sym of testSymbols) {
    try {
      const row = await buildScreenerRow(sym, ac.signal);
      assert(typeof row.sym === 'string' && row.sym === sym, `Screener row symbol (${sym})`);
      assert(Number.isInteger(row.condCount) && row.condCount >= 0 && row.condCount <= 8, `Screener condCount range (${sym})`);
      assert(Number.isInteger(row.bearCondCount) && row.bearCondCount >= 0 && row.bearCondCount <= 7, `Screener bearCondCount range (${sym})`);
      assert(Number.isFinite(row.price) && row.price > 0, `Screener price finite (${sym})`);
      assert(typeof row.signal === 'boolean', `Screener signal boolean (${sym})`);
      assert(typeof row.bearSignal === 'boolean', `Screener bearSignal boolean (${sym})`);
      assert(typeof row.rrOk === 'boolean', `Screener rrOk boolean (${sym})`);
      assert(row.rrOk === (row.rr >= 1.5), `Screener rrOk consistency (${sym})`);
      assert(['trend', 'range', 'volatile', 'unknown'].includes(row.regime), `Screener regime label (${sym})`);
      assert(typeof row.midRangeBlock === 'boolean', `Screener midRange block boolean (${sym})`);
      assert(
        Number.isInteger(row.bullThreshold) && row.bullThreshold >= CFG.minConditions && row.bullThreshold <= 8,
        `Screener bullThreshold range (${sym})`,
      );
      assert(
        Number.isInteger(row.bearThreshold) && row.bearThreshold >= 4 && row.bearThreshold <= 7,
        `Screener bearThreshold range (${sym})`,
      );
      assert(
        ['high', 'medium', 'low'].includes(row.analysisConfidence),
        `Screener analysis confidence label (${sym})`,
      );
      assert(
        row.signal === (row.d1TrendOk && row.trend === 'bull' && row.trend1hOk && !row.midRangeBlock && row.condCount >= row.bullThreshold && row.rrOk),
        `Screener signal threshold consistency (${sym})`,
      );
      assert(
        row.bearSignal === (
          row.bearD1TrendOk
          && row.bearTrendOk
          && row.bearTrend1hOk
          && !row.midRangeBlock
          && row.bearCondCount >= row.bearThreshold
        ),
        `Screener bearSignal consistency (${sym})`,
      );
      assert(row.analysisIv === SIGNAL_ANALYSIS_LABEL, `Screener analysis label (${sym})`);
    } catch (error) {
      fail(`Screener fetch/build failed (${sym})`, error?.message ?? String(error));
    }
  }

  for (const sym of testSymbols) {
    try {
      const row = await buildCoilRow(sym, ac.signal);
      assert(row && row.sym === sym, `Coil row symbol (${sym})`);
      assert(Number.isFinite(row.price) && row.price > 0, `Coil row price finite (${sym})`);
      assert(Number.isFinite(row.score) && row.score >= 0, `Coil row score finite (${sym})`);
      assert(typeof row.coil === 'boolean', `Coil row flag boolean (${sym})`);
      assert(['bull', 'bear'].includes(row.bias), `Coil row bias (${sym})`);
      assert(
        row.score === row.sqzScore + row.resScore + row.rvolScore + row.rsiScore + row.macdScore,
        `Coil score composition (${sym})`,
      );
      assert(row.coil === (row.score >= 60), `Coil threshold consistency (${sym})`);
      assert(row.gapToRes === Infinity || row.gapToRes >= 0, `Coil gap to resistance non-negative (${sym})`);
    } catch (error) {
      fail(`Coil row build failed (${sym})`, error?.message ?? String(error));
    }
  }

  const signalSymbols = SYMS;
  for (const signalSym of signalSymbols) {
    for (const iv of intervals) {
      try {
        const limit = 120;
        const result = await buildSignal(signalSym, iv, limit, ac.signal);
        assert(result.sym === signalSym, `Signal symbol (${signalSym}-${iv})`);
        assert(result.chartIv === iv, `Signal interval (${signalSym}-${iv})`);
        assert(Array.isArray(result.candles) && result.candles.length === limit, `Signal candles length (${signalSym}-${iv})`);
        assert(Array.isArray(result.mtf) && result.mtf.length === 4, `Signal MTF rows (${signalSym}-${iv})`);
        assert(Number.isFinite(result.price) && result.price > 0, `Signal price finite (${signalSym}-${iv})`);
        assert(Number.isFinite(result.sl) && Number.isFinite(result.tp), `Signal SL/TP finite (${signalSym}-${iv})`);
        assert(result.sl < result.price && result.tp > result.price, `Signal SL<price<TP (${signalSym}-${iv})`);
        assert(Number.isFinite(result.rr) && result.rr > 0, `Signal RR finite positive (${signalSym}-${iv})`);
        assert(result.rrOk === (result.rr >= 1.5), `Signal rrOk consistency (${signalSym}-${iv})`);
        const calcCondCount = [
          result.trendOk,
          result.trend1hOk,
          result.pullOk,
          result.breakOk,
          result.rsiOk,
          result.macdOk,
          result.rvolOk,
          result.rsiDailyOk,
        ].filter(Boolean).length;
        const calcBearCondCount = [
          result.bearTrendOk,
          result.bearTrend1hOk,
          result.bearBreakdownOk,
          result.bearRsiOk,
          result.bearMacdOk,
          result.bearRvolOk,
          result.bearRsiDailyOk,
        ].filter(Boolean).length;
        assert(result.condCount === calcCondCount, `Signal condCount formula consistency (${signalSym}-${iv})`);
        assert(result.bearCondCount === calcBearCondCount, `Signal bearCondCount formula consistency (${signalSym}-${iv})`);
        assert(
          result.signal === (
            result.d1TrendOk
            && result.trendOk
            && result.trend1hOk
            && !result.midRangeBlock
            && result.condCount >= result.bullThreshold
            && result.rrOk
          ),
          `Signal boolean consistency (${signalSym}-${iv})`,
        );
        assert(
          result.bearSignal === (
            result.bearD1TrendOk
            && result.bearTrendOk
            && result.bearTrend1hOk
            && !result.midRangeBlock
            && result.bearCondCount >= result.bearThreshold
          ),
          `Signal bear boolean consistency (${signalSym}-${iv})`,
        );
        assert(['trend', 'range', 'volatile', 'unknown'].includes(result.regime), `Signal regime label (${signalSym}-${iv})`);
        assert(typeof result.midRangeBlock === 'boolean', `Signal midRange block boolean (${signalSym}-${iv})`);
        assert(
          Number.isInteger(result.bullThreshold) && result.bullThreshold >= CFG.minConditions && result.bullThreshold <= 8,
          `Signal bullThreshold range (${signalSym}-${iv})`,
        );
        assert(
          Number.isInteger(result.bearThreshold) && result.bearThreshold >= 4 && result.bearThreshold <= 7,
          `Signal bearThreshold range (${signalSym}-${iv})`,
        );
        assert(
          ['high', 'medium', 'low'].includes(result.analysisConfidence),
          `Signal analysis confidence label (${signalSym}-${iv})`,
        );
        const riskSide = result.riskSide || ((result.bearSignal && !result.signal) ? 'short' : 'long');
        const risk = riskSide === 'short' ? (result.sl - result.price) : (result.price - result.sl);
        const reward = riskSide === 'short' ? (result.price - result.tp) : (result.tp - result.price);
        assert(
          risk > 0 && approxEqual(result.rr, reward / risk, 1e-4),
          `Signal RR formula consistency (${signalSym}-${iv})`,
        );
        assert(
          approxEqual(
            result.slPct,
            (riskSide === 'short'
              ? ((result.sl - result.price) / result.price) * 100
              : ((result.price - result.sl) / result.price) * 100),
            1e-4,
          ),
          `Signal slPct formula consistency (${signalSym}-${iv})`,
        );
        assert(
          approxEqual(
            result.tpPct,
            (riskSide === 'short'
              ? ((result.price - result.tp) / result.price) * 100
              : ((result.tp - result.price) / result.price) * 100),
            1e-4,
          ),
          `Signal tpPct formula consistency (${signalSym}-${iv})`,
        );
        assert(result.riskAnalysisIv === SIGNAL_ANALYSIS_LABEL, `Signal riskAnalysisIv label (${signalSym}-${iv})`);
        assert(Number.isInteger(result.condCount) && result.condCount >= 0 && result.condCount <= 8, `Signal condCount range (${signalSym}-${iv})`);
        assert(Number.isInteger(result.bearCondCount) && result.bearCondCount >= 0 && result.bearCondCount <= 7, `Signal bearCondCount range (${signalSym}-${iv})`);
        assert(Number.isFinite(result.spreadPct) && result.spreadPct >= 0, `Signal spread finite (${signalSym}-${iv})`);
        assert(Number.isFinite(result.atrV) && result.atrV > 0, `Signal ATR finite positive (${signalSym}-${iv})`);
        assert(
          Array.isArray(result.ema21Chart) && result.ema21Chart.length === limit,
          `Signal EMA21 chart length (${signalSym}-${iv})`,
        );
        assert(
          Array.isArray(result.ema50Chart) && result.ema50Chart.length === limit,
          `Signal EMA50 chart length (${signalSym}-${iv})`,
        );
        assert(
          Array.isArray(result.chartBB) && result.chartBB.length === limit,
          `Signal BB chart length (${signalSym}-${iv})`,
        );
        assert(
          Array.isArray(result.chartHistSlice) && result.chartHistSlice.length <= 24,
          `Signal MACD histogram slice size (${signalSym}-${iv})`,
        );
        assert(
          Array.isArray(result.srLevels) && result.srLevels.length <= 8,
          `Signal S/R levels size (${signalSym}-${iv})`,
        );
        assert(
          ['15m', '1h', '4h', '1d'].every((tf, idx) => result.mtf[idx]?.tf === tf),
          `Signal MTF labels/order (${signalSym}-${iv})`,
        );
        assert(
          result.mtf.every((row) =>
            ['bull', 'bear', null].includes(row.emaTrend)
            && ['bull', 'bear', null].includes(row.macdDir)
            && (row.stochKPct == null || (Number.isFinite(row.stochKPct) && row.stochKPct >= 0 && row.stochKPct <= 100))),
          `Signal MTF row values (${signalSym}-${iv})`,
        );
        assert(
          result.chartStochK == null || (Number.isFinite(result.chartStochK) && result.chartStochK >= 0 && result.chartStochK <= 1),
          `Signal chartStochK range (${signalSym}-${iv})`,
        );
        assert(
          result.chartStochD == null || (Number.isFinite(result.chartStochD) && result.chartStochD >= 0 && result.chartStochD <= 1),
          `Signal chartStochD range (${signalSym}-${iv})`,
        );
      } catch (error) {
        fail(`Signal fetch/build failed (${signalSym}-${iv})`, error?.message ?? String(error));
      }
    }
  }
}

function printReport() {
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL');
  console.log('');
  console.log('=== Test Summary ===');
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed.length}`);
  console.log('');

  if (failed.length) {
    console.log('Failures:');
    for (const f of failed) {
      console.log(`- ${f.name}${f.details ? ` -> ${f.details}` : ''}`);
    }
  } else {
    console.log('No failures detected.');
  }
}

function resetResults() {
  results.length = 0;
  failureCount = 0;
}

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set(argv);

  // Default: deterministic unit tests only.
  const liveFromEnv = String(process.env.LIVE_BINANCE || '').trim() === '1';
  let unit = true;
  let live = liveFromEnv;

  if (flags.has('--help') || flags.has('-h')) {
    return { help: true };
  }

  if (flags.has('--all')) {
    unit = true;
    live = true;
  }
  if (flags.has('--unit')) unit = true;
  if (flags.has('--no-unit')) unit = false;
  if (flags.has('--live')) live = true;
  if (flags.has('--no-live')) live = false;
  if (flags.has('--live-only')) {
    unit = false;
    live = true;
  }

  const known = new Set(['--help', '-h', '--all', '--unit', '--no-unit', '--live', '--no-live', '--live-only']);
  const unknown = argv.filter((a) => a.startsWith('-') && !known.has(a));
  if (unknown.length) {
    return { error: `Unknown option(s): ${unknown.join(', ')}`, help: true };
  }

  return { unit, live, help: false };
}

export async function run({ unit = true, live = false } = {}) {
  if (unit) runUnitTests();
  if (live) await runIntegrationTests();
  if (!live) ok('Live smoke tests skipped', 'Run with --live or set LIVE_BINANCE=1');
}

export function getFailureCount() {
  return failureCount;
}

export async function runAndExit(options) {
  try {
    resetResults();
    await run(options);
    printReport();
    process.exit(getFailureCount() === 0 ? 0 : 1);
  } catch (error) {
    console.error('Fatal test runner error:', error);
    process.exit(2);
  }
}

function isDirectInvocation() {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  return import.meta.url === pathToFileURL(invokedPath).href;
}

if (isDirectInvocation()) {
  const parsed = parseArgs();
  if (parsed.help) {
    if (parsed.error) console.error(parsed.error);
    console.log('Usage:');
    console.log('  node scripts/run_result_tests.mjs            # unit only (default)');
    console.log('  node scripts/run_result_tests.mjs --live     # unit + live smoke');
    console.log('  node scripts/run_result_tests.mjs --live-only');
    console.log('  LIVE_BINANCE=1 node scripts/run_result_tests.mjs');
    process.exit(parsed.error ? 1 : 0);
  }
  await runAndExit({ unit: parsed.unit, live: parsed.live });
}
