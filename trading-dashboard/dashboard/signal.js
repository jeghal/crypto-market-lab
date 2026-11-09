import { getBookTicker, getCandles } from './api.js';
import {
  BEAR_SIGNAL_PILLS,
  CFG,
  getAnalysisProfileConfig,
  resolveAnalysisProfileKey,
  SIGNAL_ANALYSIS_LABEL,
  SIGNAL_PILLS,
} from './config.js';

import { atr, bbWidthPercentile, bollingerBands, calcFibonacci, calcPivots, calcTrendlines, ema, macd, relativeVolume, rsi, stochRsi } from './indicators.js';
import { getSupportResistanceLevels } from './levels.js';
import { detectPatterns } from './patterns.js';
import { last } from './utils.js';
import { workerPool } from './worker-pool.js';

import {
  classifyRegime as classifyRegimeShared,
  computeRiskLevels as computeRiskLevelsShared,
  getNearestRangeBox as getNearestRangeBoxShared,
  getStochRsiBearReversal as getStochRsiBearReversalShared,
  getStochRsiReversal as getStochRsiReversalShared,
  isBearTrendHealthy as isBearTrendHealthyShared,
  isBreakdownCandle as isBreakdownCandleShared,
  isBreakoutCandle as isBreakoutCandleShared,
  isDailyRsiAllowed as isDailyRsiAllowedShared,
  isDailyRsiBearAllowed as isDailyRsiBearAllowedShared,
  isMacdBearMomentum as isMacdBearMomentumShared,
  isMacdMomentumHealthy as isMacdMomentumHealthyShared,
  isMidRangeLocation as isMidRangeLocationShared,
  isTrendHealthy as isTrendHealthyShared,
  resolveAnalysisConfidence as resolveAnalysisConfidenceShared,
  resolveThresholds as resolveThresholdsShared,
  wasPullbackRecent as wasPullbackRecentShared,
} from './signal-shared.js';

function requireEnoughCandles(candles4h, candles15m) {
  const min4hCandles = CFG.ema50;
  const min15mCandles = Math.max(CFG.macdS + CFG.macdSig, CFG.atrP, CFG.rsiP + 1);
  const missing = [];
  if (candles4h.length < min4hCandles) missing.push(`4h (${candles4h.length}/${min4hCandles})`);
  if (candles15m.length < min15mCandles) missing.push(`15m (${candles15m.length}/${min15mCandles})`);
  if (missing.length) {
    const error = new Error(`بيانات غير كافية للتحليل: ${missing.join(', ')}`);
    error.code = 'INSUFFICIENT_ANALYSIS_DATA';
    throw error;
  }
}

function isTrendHealthy(ema7, ema21, ema50) { return isTrendHealthyShared(ema7, ema21, ema50); }
function wasPullbackRecent(candles, ema7, atrValue, lookback = CFG.pullLookback) { return wasPullbackRecentShared(candles, ema7, atrValue, lookback); }
function isBreakoutCandle(curr, prev) { return isBreakoutCandleShared(curr, prev); }
function getStochRsiReversal(k, d, kp, dp) { return getStochRsiReversalShared(k, d, kp, dp); }
function isMacdMomentumHealthy(v, s, hc, hp) { return isMacdMomentumHealthyShared(v, s, hc, hp); }
function isBearTrendHealthy(ema7, ema21, ema50) { return isBearTrendHealthyShared(ema7, ema21, ema50); }
function isBreakdownCandle(curr, prev) { return isBreakdownCandleShared(curr, prev); }
function getStochRsiBearReversal(k, d, kp, dp) { return getStochRsiBearReversalShared(k, d, kp, dp); }
function isMacdBearMomentum(hc, hp) { return isMacdBearMomentumShared(hc, hp); }
function isDailyRsiBearAllowed(closes) { return isDailyRsiBearAllowedShared(closes); }
function isDailyRsiAllowed(closes) { return isDailyRsiAllowedShared(closes); }
function computeRiskLevels(p, a, s, side) { return computeRiskLevelsShared(p, a, s, side); }
function getNearestRangeBox(p, s) { return getNearestRangeBoxShared(p, s); }
function isMidRangeLocation(p, s, c) { return isMidRangeLocationShared(p, s, c); }
function classifyRegime(p, a, e7, e50, c) { return classifyRegimeShared(p, a, e7, e50, c); }
function resolveThresholds(r, m, c) { return resolveThresholdsShared(r, m, c); }

function computeScreenerRowSnapshot(sym, c4, c15, c1, c1d, profileConfig) {
  const cl4 = c4.map(c => c.c);
  const e7_4 = ema(cl4, CFG.ema7);
  const e21_4 = ema(cl4, CFG.ema21);
  const e50_4 = ema(cl4, CFG.ema50);
  const trendOk = isTrendHealthy(e7_4, e21_4, e50_4);

  const cl1 = c1.map(c => c.c);
  const e7_1 = ema(cl1, CFG.ema7);
  const e21_1 = ema(cl1, CFG.ema21);
  const e50_1 = ema(cl1, CFG.ema50);
  const trend1hOk = isTrendHealthy(e7_1, e21_1, e50_1);

  const cl15 = c15.map(c => c.c);
  const e7_15 = ema(cl15, CFG.ema7);
  const atr15 = last(atr(c15, CFG.atrP)) ?? cl15.at(-1) * 0.01;
  const curr = last(c15);
  const prev = last(c15, 2);
  const pullOk = wasPullbackRecent(c15, e7_15, atr15);
  const breakOk = isBreakoutCandle(curr, prev);

  const sr15 = stochRsi(cl15, CFG.rsiP, CFG.stochP, CFG.stochK, CFG.stochD);
  const sk15 = last(sr15.k);
  const sd15 = last(sr15.d);
  const skp15 = sr15.k[sr15.k.length - 2];
  const sdp15 = sr15.d[sr15.d.length - 2];
  const stochSignal = getStochRsiReversal(sk15, sd15, skp15, sdp15);
  const rsiOk = stochSignal.ok;

  const rvol = last(relativeVolume(c15, 20));
  const rvolOk = rvol !== null && rvol > CFG.rvolMin;

  const mc15 = macd(cl15, CFG.macdF, CFG.macdS, CFG.macdSig);
  const mv = last(mc15.line);
  const sv = last(mc15.signal);
  const hc = last(mc15.hist);
  const hp = mc15.hist[mc15.hist.length - 2];
  const macdOk = isMacdMomentumHealthy(mv, sv, hc, hp);

  const cl1d = c1d.map(c => c.c);
  const e7_1d = ema(cl1d, CFG.ema7);
  const e21_1d = ema(cl1d, CFG.ema21);
  const e50_1d = ema(cl1d, CFG.ema50);
  const d1TrendOk = isTrendHealthy(e7_1d, e21_1d, e50_1d);
  const rsiDailyOk = isDailyRsiAllowed(cl1d);
  const condCount = [trendOk, trend1hOk, pullOk, breakOk, rsiOk, macdOk, rvolOk, rsiDailyOk].filter(Boolean).length;

  const sr = getSupportResistanceLevels(c4);
  const price = curr?.c ?? last(cl4);
  const { midRange: mid, position } = isMidRangeLocation(price, sr, profileConfig);
  const atr4h = last(atr(c4, CFG.atrP)) ?? 0;
  const regime = classifyRegime(price, atr4h, last(e7_4), last(e50_4), profileConfig);
  const { bullThreshold, bearThreshold } = resolveThresholds(regime, mid, profileConfig);

  const bearTrendOk = isBearTrendHealthy(e7_4, e21_4, e50_4);
  const bearTrend1hOk = isBearTrendHealthy(e7_1, e21_1, e50_1);
  const bearBreakdownOk = isBreakdownCandle(curr, prev);
  const bearRsiOk = getStochRsiBearReversal(sk15, sd15, skp15, sdp15);
  const bearMacdOk = isMacdBearMomentum(hc, hp);
  const bearD1TrendOk = isBearTrendHealthy(e7_1d, e21_1d, e50_1d);
  const bearRvolOk = rvolOk;
  const bearRsiDailyOk = isDailyRsiBearAllowed(cl1d);
  const bearCondCount = [bearTrendOk, bearTrend1hOk, bearBreakdownOk, bearRsiOk, bearMacdOk, bearRvolOk, bearRsiDailyOk].filter(Boolean).length;

  const bullSetupOk = d1TrendOk && trendOk && trend1hOk && !mid && condCount >= bullThreshold;
  const bearSignal = bearD1TrendOk && bearTrendOk && bearTrend1hOk && !mid && bearCondCount >= bearThreshold;
  const riskSide = bearSignal && !bullSetupOk ? 'short' : 'long';
  const riskLevels = computeRiskLevels(price, atr15, sr, riskSide);
  const signal = bullSetupOk && riskLevels.rrOk;
  const analysisConfidence = resolveAnalysisConfidenceShared({
    signal,
    bearSignal,
    condCount,
    bearCondCount,
    bullThreshold,
    bearThreshold,
    rrOk: riskLevels.rrOk,
    midRangeBlock: mid,
    regime,
  });

  return {
    sym,
    signal,
    bearSignal,
    condCount,
    bearCondCount,
    trend: last(e7_4) > last(e50_4) ? 'bull' : 'bear',
    trendOk,
    trend1hOk,
    pullOk,
    breakOk,
    rsiOk,
    macdOk,
    rvolOk,
    rsiDailyOk,
    bearTrendOk,
    bearTrend1hOk,
    bearBreakOk: bearBreakdownOk,
    bearBreakdownOk,
    bearRsiOk,
    bearMacdOk,
    bearRvolOk,
    bearRsiDailyOk,
    d1TrendOk,
    bearD1TrendOk,
    regime,
    midRangeBlock: mid,
    rangePosition: position,
    bullThreshold,
    bearThreshold,
    analysisConfidence,
    stochKPct: sk15 * 100,
    price,
    analysisIv: SIGNAL_ANALYSIS_LABEL,
    riskAnalysisIv: SIGNAL_ANALYSIS_LABEL,
    macdDir: mv > sv ? 'bull' : 'bear',
    riskSide: riskLevels.side,
    sl: riskLevels.sl,
    tp: riskLevels.tp,
    rr: riskLevels.rr,
    rrOk: riskLevels.rrOk,
    slPct: riskLevels.slPct,
    tpPct: riskLevels.tpPct,
  };
}

export async function buildScreenerRow(sym, signal, analysisProfile = 'balanced') {
  const profileKey = resolveAnalysisProfileKey(analysisProfile);
  const profileConfig = getAnalysisProfileConfig(profileKey);
  const [c4r, c15r, c1r, c1dr] = await Promise.all([
    getCandles(sym, '4h', 80, signal), getCandles(sym, '15m', 80, signal),
    getCandles(sym, '1h', 60, signal), getCandles(sym, '1d', 80, signal),
  ]);
  const c4 = c4r.slice(0, -1), c15 = c15r.slice(0, -1), c1 = c1r.slice(0, -1), c1d = c1dr.slice(0, -1);

  if (workerPool) {
    try {
      return await workerPool.run({ type: 'SCREENER_ROW', sym, candles4h: c4, candles15m: c15, candles1h: c1, candles1d: c1d, analysisProfile: profileKey });
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      console.warn('[signal] Worker failed, falling back to main thread:', e?.message ?? e);
    }
  }

  return computeScreenerRowSnapshot(sym, c4, c15, c1, c1d, profileConfig);
}

export async function buildSignal(sym, chartIv, limit, signal, analysisProfile = 'balanced') {
  const profileKey = resolveAnalysisProfileKey(analysisProfile);
  const profileConfig = getAnalysisProfileConfig(profileKey);
  const need1h = chartIv !== '1h';
  const need1d = chartIv !== '1d';
  const WARMUP = 150;

  const [cRaw, c4r, c15r, book, r1h, r1d] = await Promise.all([
    getCandles(sym, chartIv, limit + WARMUP + 1, signal),
    getCandles(sym, '4h', 201, signal),
    getCandles(sym, '15m', 201, signal),
    getBookTicker(sym, signal),
    need1h ? getCandles(sym, '1h', 101, signal) : Promise.resolve(null),
    need1d ? getCandles(sym, '1d', 101, signal) : Promise.resolve(null),
  ]);

  const cFull = cRaw.slice(0, -1);
  const cVisible = cFull.slice(-limit);
  const c4 = c4r.slice(0, -1);
  const c15 = c15r.slice(0, -1);
  const c1 = chartIv === '1h' ? cFull : (r1h?.slice(0, -1) ?? []);
  const c1d = chartIv === '1d' ? cFull : (r1d?.slice(0, -1) ?? []);

  requireEnoughCandles(c4, c15);
  if (cFull.length < CFG.atrP) {
    const error = new Error(`بيانات غير كافية للتحليل: ${chartIv} (${cFull.length}/${CFG.atrP})`);
    error.code = 'INSUFFICIENT_CHART_DATA';
    throw error;
  }

  const cl4 = c4.map(c => c.c);
  const e7_4 = ema(cl4, CFG.ema7);
  const e21_4 = ema(cl4, CFG.ema21);
  const e50_4 = ema(cl4, CFG.ema50);
  const trendOk = isTrendHealthy(e7_4, e21_4, e50_4);

  const cl1h = c1.map(c => c.c);
  const e7_1h = ema(cl1h, CFG.ema7);
  const e21_1h = ema(cl1h, CFG.ema21);
  const e50_1h = ema(cl1h, CFG.ema50);
  const trend1hOk = isTrendHealthy(e7_1h, e21_1h, e50_1h);

  const cl15 = c15.map(c => c.c);
  const e7_15 = ema(cl15, CFG.ema7);
  const atr15 = last(atr(c15, CFG.atrP)) ?? cl15.at(-1) * 0.01;
  const curr15 = last(c15);
  const prev15 = last(c15, 2);
  const pullOk = wasPullbackRecent(c15, e7_15, atr15);
  const breakOk = isBreakoutCandle(curr15, prev15);

  const sr15 = stochRsi(cl15, CFG.rsiP, CFG.stochP, CFG.stochK, CFG.stochD);
  const sk15 = last(sr15.k);
  const sd15 = last(sr15.d);
  const skp15 = sr15.k[sr15.k.length - 2];
  const sdp15 = sr15.d[sr15.d.length - 2];
  const rsiOk = getStochRsiReversal(sk15, sd15, skp15, sdp15).ok;

  const mc15 = macd(cl15, CFG.macdF, CFG.macdS, CFG.macdSig);
  const mv = last(mc15.line);
  const sv = last(mc15.signal);
  const hc = last(mc15.hist);
  const hp = mc15.hist[mc15.hist.length - 2];
  const macdOk = isMacdMomentumHealthy(mv, sv, hc, hp);

  const bid = +book.bidPrice;
  const ask = +book.askPrice;
  const rvolArr = relativeVolume(c15, 20);
  const rvolOk = last(rvolArr) > CFG.rvolMin;

  const cl1d = c1d.map(c => c.c);
  const e7_1d = ema(cl1d, CFG.ema7);
  const e21_1d = ema(cl1d, CFG.ema21);
  const e50_1d = ema(cl1d, CFG.ema50);
  const d1TrendOk = isTrendHealthy(e7_1d, e21_1d, e50_1d);
  const rsiDailyOk = isDailyRsiAllowed(cl1d);

  const condCount = [trendOk, trend1hOk, pullOk, breakOk, rsiOk, macdOk, rvolOk, rsiDailyOk].filter(Boolean).length;

  const bearTrendOk = isBearTrendHealthy(e7_4, e21_4, e50_4);
  const bearTrend1hOk = isBearTrendHealthy(e7_1h, e21_1h, e50_1h);
  const bearBreakOk = isBreakdownCandle(curr15, prev15);
  const bearRsiOk = getStochRsiBearReversal(sk15, sd15, skp15, sdp15);
  const bearMacdOk = isMacdBearMomentum(hc, hp);
  const bearD1TrendOk = isBearTrendHealthy(e7_1d, e21_1d, e50_1d);
  const bearRsiDailyOk = isDailyRsiBearAllowed(cl1d);
  const bearCondCount = [bearTrendOk, bearTrend1hOk, bearBreakOk, bearRsiOk, bearMacdOk, rvolOk, bearRsiDailyOk].filter(Boolean).length;

  const clFull = cFull.map(c => c.c);
  const e7f = ema(clFull, CFG.ema7);
  const e21f = ema(clFull, CFG.ema21);
  const e50f = ema(clFull, CFG.ema50);

  const e7c = e7f.slice(-limit);
  const e21c = e21f.slice(-limit);
  const e50c = e50f.slice(-limit);
  const bbFull = bollingerBands(clFull).slice(-limit);

  const clVis = cVisible.map(c => c.c);
  const cAtr = atr(cFull, CFG.atrP).slice(-limit);
  const cRsi = last(rsi(clFull, CFG.rsiP));
  const cMacd = macd(clFull, CFG.macdF, CFG.macdS, CFG.macdSig);
  const cSt = stochRsi(clFull, CFG.rsiP, CFG.stochP, CFG.stochK, CFG.stochD);
  const pat = detectPatterns(cVisible);
  const cpiv = calcPivots(cVisible);

  const sr = getSupportResistanceLevels(c4);
  const rSr = getSupportResistanceLevels(cVisible);
  const price = ask > 0 ? ask : last(clVis);
  const atr4h = last(atr(c4, CFG.atrP)) ?? 0;

  const { midRange: mid, position } = isMidRangeLocation(price, sr, profileConfig);
  const regime = classifyRegime(price, atr4h, last(e7_4), last(e50_4), profileConfig);
  const { bullThreshold, bearThreshold } = resolveThresholds(regime, mid, profileConfig);

  const bullSetupOk = d1TrendOk && trendOk && trend1hOk && !mid && condCount >= bullThreshold;
  const bearSigOk = bearD1TrendOk && bearTrendOk && bearTrend1hOk && !mid && bearCondCount >= bearThreshold;

  const riskSide = bearSigOk && !bullSetupOk ? 'short' : 'long';
  const atr15Value = last(atr(c15, CFG.atrP));
  const riskAtr = Number.isFinite(atr15Value) && atr15Value > 0
    ? atr15Value
    : (Number.isFinite(atr4h) && atr4h > 0 ? atr4h : Math.max(price * 0.01, 0));
  const rl = computeRiskLevels(price, riskAtr, sr, riskSide);
  const sigOk = bullSetupOk && rl.rrOk;
  const confidence = resolveAnalysisConfidenceShared({
    signal: sigOk,
    bearSignal: bearSigOk,
    condCount,
    bearCondCount,
    bullThreshold,
    bearThreshold,
    rrOk: rl.rrOk,
    midRangeBlock: mid,
    regime,
  });

  return {
    sym,
    signal: sigOk,
    bearSignal: bearSigOk,
    condCount,
    bearCondCount,
    trend: last(e7_4) > last(e50_4) ? 'bull' : 'bear',
    trendOk,
    trend1hOk,
    pullOk,
    breakOk,
    rsiOk,
    macdOk,
    rvolOk,
    rsiDailyOk,
    bearTrendOk,
    bearTrend1hOk,
    bearBreakOk,
    bearBreakdownOk: bearBreakOk,
    bearRsiOk,
    bearMacdOk,
    bearRvolOk: rvolOk,
    bearRsiDailyOk,
    d1TrendOk,
    bearD1TrendOk,
    regime,
    midRangeBlock: mid,
    rangePosition: position,
    bullThreshold,
    bearThreshold,
    analysisConfidence: confidence,
    rsiStrength: getStochRsiReversal(sk15, sd15, skp15, sdp15).strength,
    chartRsiV: cRsi,
    chartMacdV: last(cMacd.line),
    chartSigV: last(cMacd.signal),
    chartHistCurr: last(cMacd.hist),
    chartHistSlice: cMacd.hist.slice(-24),
    chartStochK: last(cSt.k),
    chartStochD: last(cSt.d),
    currentRvol: last(relativeVolume(cVisible, 20)),
    patterns: pat,
    mtf: [
      { tf: '15m', ...analyzeTf(c15) },
      { tf: '1h', ...analyzeTf(c1) },
      { tf: '4h', ...analyzeTf(c4) },
      { tf: '1d', ...analyzeTf(c1d) },
    ],
    bid,
    ask,
    spreadPct: ask > 0 ? ((ask - bid) / ask) * 100 : 0,
    atrV: Number.isFinite(last(cAtr)) && last(cAtr) > 0 ? last(cAtr) : riskAtr,
    ema7_4h: last(e7_4),
    ema21_4h: last(e21_4),
    ema50_4h: last(e50_4),
    ema7Chart: e7c,
    ema21Chart: e21c,
    ema50Chart: e50c,
    chartBB: bbFull,
    chartTrendlines: calcTrendlines(cVisible, cpiv),
    chartFib: calcFibonacci(cVisible, cpiv),
    price,
    riskSide,
    sl: rl.sl,
    tp: rl.tp,
    rr: rl.rr,
    rrOk: rl.rrOk,
    slPct: rl.slPct,
    tpPct: rl.tpPct,
    srLevels: rSr,
    candles: cVisible,
    analysisProfile: profileKey,
    analysisCandleTime: c15.at(-1)?.t,
    evaluationCandles: c15,
    receivedAt: Math.min(...[cRaw,c4r,c15r,r1h,r1d].filter(Array.isArray).map(c=>c.at(-1)?.receivedAt || Date.now())),
    chartRvolArr: relativeVolume(cVisible, 20),
    chartIv,
    analysisIv: SIGNAL_ANALYSIS_LABEL,
    riskAnalysisIv: SIGNAL_ANALYSIS_LABEL,
  };
}

function analyzeTf(c) {
  if (c.length < CFG.ema50 + 1) return { emaTrend: null, stochKPct: null, macdDir: null };
  const cl = c.map(x => x.c);
  const e7 = ema(cl, CFG.ema7);
  const e21 = ema(cl, CFG.ema21);
  const e50 = ema(cl, CFG.ema50);
  const st = stochRsi(cl, CFG.rsiP, CFG.stochP, CFG.stochK, CFG.stochD);
  const mc = macd(cl, CFG.macdF, CFG.macdS, CFG.macdSig);
  return {
    emaTrend: (last(e7) > last(e21) && last(e21) > last(e50)) ? 'bull' : 'bear',
    stochKPct: last(st.k) * 100,
    macdDir: last(mc.line) > last(mc.signal) ? 'bull' : 'bear',
  };
}

export async function buildCoilRow(sym, signal) {
  const [c4r, c1r, c15r] = await Promise.all([
    getCandles(sym, '4h', 120, signal),
    getCandles(sym, '1h', 120, signal),
    getCandles(sym, '15m', 120, signal),
  ]);
  const c4 = c4r.slice(0, -1);
  const c1 = c1r.slice(0, -1);
  const c15 = c15r.slice(0, -1);
  const cl1 = c1.map(x => x.c);
  const cl15 = c15.map(x => x.c);
  const price = cl15.at(-1);
  if (!price) return null;

  const bbwPct = bbWidthPercentile(cl1, 20, 50);
  const sqzS = bbwPct <= 0.2 ? 35 : bbwPct <= 0.35 ? 15 : 0;
  const sr = getSupportResistanceLevels(c4);
  const nRes = sr.find(l => l.kind === 'resistance' && l.price > price);
  const gap = nRes ? (nRes.price - price) / price : Infinity;
  const resS = gap <= 0.01 ? 25 : gap <= 0.02 ? 15 : 0;
  const rv = last(relativeVolume(c15, 20));
  const rvolS = rv >= 0.5 && rv <= 1.2 ? 20 : 0;
  const rsiV = last(rsi(cl1, CFG.rsiP));
  const rsiS = rsiV >= 40 && rsiV <= 65 ? 10 : 0;
  const mc = macd(cl1, CFG.macdF, CFG.macdS, CFG.macdSig);
  const hv = last(mc.hist);
  const av = last(atr(c1, CFG.atrP)) ?? price * 0.01;
  const macdS = Math.abs(hv) < av * 0.1 ? 10 : 0;
  const score = sqzS + resS + rvolS + rsiS + macdS;
  const cl4 = c4.map(x => x.c);
  const e7_4 = last(ema(cl4, CFG.ema7));
  const e50_4 = last(ema(cl4, CFG.ema50));

  return {
    sym,
    score,
    coil: score >= 60,
    bbwPct,
    gapToRes: gap,
    rvol: rv,
    rsiVal: rsiV,
    histVal: hv,
    bias: e7_4 > e50_4 ? 'bull' : 'bear',
    nearestRes: nRes?.price ?? null,
    price,
    sqzScore: sqzS,
    resScore: resS,
    rvolScore: rvolS,
    rsiScore: rsiS,
    macdScore: macdS,
  };
}
