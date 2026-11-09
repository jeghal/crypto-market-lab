import { BEAR_SIGNAL_PILLS, CFG, SIGNAL_PILLS } from './config.js';
import { rsi } from './indicators.js';
import { last } from './utils.js';

export const MIN_RR = 1.5;
export const MIN_BEAR_CONDITIONS = 4; // out of 7 bear conditions

export function isTrendHealthy(ema7Arr, ema21Arr, ema50Arr) {
  const ema7Now = last(ema7Arr);
  const ema21Now = last(ema21Arr);
  const ema50Now = last(ema50Arr);
  const ema7Prev = ema7Arr.length > CFG.trendSlopeLookback
    ? ema7Arr[ema7Arr.length - CFG.trendSlopeLookback]
    : null;
  return Number.isFinite(ema7Now) && Number.isFinite(ema21Now) && Number.isFinite(ema50Now)
    && Number.isFinite(ema7Prev)
    && ema7Now > ema21Now && ema21Now > ema50Now && ema7Now >= ema7Prev;
}

export function wasPullbackRecent(candles, ema7Arr, atrValue, lookback = CFG.pullLookback) {
  if (!Number.isFinite(atrValue) || atrValue <= 0) return false;
  const n = candles.length;
  const start = Math.max(0, n - lookback);
  for (let i = start; i < n; i++) {
    const c = candles[i];
    const ema7Val = ema7Arr[i];
    if (!Number.isFinite(ema7Val)) continue;
    const nearestTouch = Math.min(Math.abs(c.c - ema7Val), Math.abs(c.l - ema7Val));
    if (nearestTouch < atrValue * CFG.pullAtrMult && c.c >= ema7Val * 0.998) return true;
  }
  return false;
}

export function isBreakoutCandle(curr, prev) {
  if (!curr || !prev) return false;
  const range = curr.h - curr.l;
  if (!Number.isFinite(range) || range <= 0) return false;
  const closeInRange = (curr.c - curr.l) / range;
  return curr.c >= curr.o && curr.c > prev.h && closeInRange >= CFG.breakoutCloseMin;
}

export function getStochRsiReversal(stochK, stochD, stochKPrev, stochDPrev) {
  const values = [stochK, stochD, stochKPrev, stochDPrev];
  if (values.some((value) => value == null || !Number.isFinite(value))) {
    return { ok: false, strength: null };
  }
  const crossedUp = stochK >= stochD && stochKPrev <= stochDPrev;
  const currentPct = stochK * 100;
  const originPct = Math.min(stochK, stochKPrev) * 100;
  if (!crossedUp || currentPct >= CFG.stochOB) return { ok: false, strength: null };
  if (originPct < 20) return { ok: true, strength: 'strong' };
  if (originPct < 50) return { ok: true, strength: 'normal' };
  return { ok: false, strength: null };
}

export function isMacdMomentumHealthy(macdV, sigV, histCurr, histPrev) {
  const values = [macdV, sigV, histCurr, histPrev];
  if (values.some(v => v == null || !Number.isFinite(v))) return false;
  return histCurr > 0 && histCurr > histPrev;
}

export function isBearTrendHealthy(ema7Arr, ema21Arr, ema50Arr) {
  const ema7Now = last(ema7Arr);
  const ema21Now = last(ema21Arr);
  const ema50Now = last(ema50Arr);
  const ema7Prev = ema7Arr.length > CFG.trendSlopeLookback
    ? ema7Arr[ema7Arr.length - CFG.trendSlopeLookback]
    : null;
  return Number.isFinite(ema7Now) && Number.isFinite(ema21Now) && Number.isFinite(ema50Now) && Number.isFinite(ema7Prev)
    && ema7Now < ema21Now && ema21Now < ema50Now // bear: 7 < 21 < 50
    && ema7Now <= ema7Prev; // bear: ema7 falling
}

export function isBreakdownCandle(curr, prev) {
  if (!curr || !prev) return false;
  const range = curr.h - curr.l;
  if (!Number.isFinite(range) || range <= 0) return false;
  const closeInRange = (curr.h - curr.c) / range; // close near bottom
  return curr.c <= curr.o && curr.c < prev.l && closeInRange >= CFG.breakoutCloseMin;
}

export function getStochRsiBearReversal(stochK, stochD, stochKPrev, stochDPrev) {
  if ([stochK, stochD, stochKPrev, stochDPrev].some(v => v == null || !Number.isFinite(v))) return false;
  const crossedDown = stochK <= stochD && stochKPrev >= stochDPrev;
  const originPct = Math.max(stochK, stochKPrev) * 100;
  return crossedDown && originPct > 50;
}

export function isMacdBearMomentum(histCurr, histPrev) {
  if (histCurr == null || !Number.isFinite(histCurr)) return false;
  if (histPrev == null || !Number.isFinite(histPrev)) return false;
  return histCurr < 0 && histCurr < histPrev; // negative and growing
}

export function isDailyRsiBearAllowed(closes) {
  if (!Array.isArray(closes) || closes.length <= CFG.rsiP) return false;
  const rsiDailyVal = last(rsi(closes, CFG.rsiP));
  return Number.isFinite(rsiDailyVal) && rsiDailyVal >= 30; // not already oversold
}

export function isDailyRsiAllowed(closes) {
  if (!Array.isArray(closes) || closes.length <= CFG.rsiP) return false;
  const rsiDailyVal = last(rsi(closes, CFG.rsiP));
  return Number.isFinite(rsiDailyVal) && rsiDailyVal <= CFG.rsiDailyMax;
}

export function computeRiskLevels(price, atrValue, srLevels = [], side = 'long') {
  if (side === 'short') {
    const nearestResistance = srLevels.find(level => level.kind === 'resistance' && level.price > price);
    const slFromRes = nearestResistance ? nearestResistance.price + atrValue * 0.3 : null;
    const slFromAtr = price + atrValue * CFG.slAtrMult;
    const sl = slFromRes != null && slFromRes < slFromAtr && slFromRes > price
      ? slFromRes
      : slFromAtr;

    const risk = sl - price;
    const tpFromAtr = price - atrValue * CFG.tpAtrMult;
    const validSupport = risk > 0
      ? srLevels.find(level =>
        level.kind === 'support'
        && level.price < price
        && (price - level.price) / risk >= MIN_RR)
      : null;
    const tp = validSupport ? validSupport.price : tpFromAtr;
    const reward = price - tp;
    const rr = sl > 0 && risk > 0 ? reward / risk : 0;

    return {
      side: 'short',
      sl,
      tp,
      rr,
      rrOk: rr >= MIN_RR,
      slPct: price > 0 ? ((sl - price) / price) * 100 : 0,
      tpPct: price > 0 ? ((price - tp) / price) * 100 : 0,
    };
  }

  const nearestSupport = srLevels.find(level => level.kind === 'support' && level.price < price);
  const slFromSupport = nearestSupport ? nearestSupport.price - atrValue * 0.3 : null;
  const slFromAtr = price - atrValue * CFG.slAtrMult;
  const sl = slFromSupport != null && slFromSupport > slFromAtr && slFromSupport < price
    ? slFromSupport
    : slFromAtr;

  const risk = price - sl;
  const tpFromAtr = price + atrValue * CFG.tpAtrMult;
  const validResistance = risk > 0
    ? srLevels.find(level =>
      level.kind === 'resistance'
      && level.price > price
      && (level.price - price) / risk >= MIN_RR)
    : null;
  const tp = validResistance ? validResistance.price : tpFromAtr;
  const rr = sl > 0 && risk > 0 ? (tp - price) / risk : 0;

  return {
    side: 'long',
    sl,
    tp,
    rr,
    rrOk: rr >= MIN_RR,
    slPct: price > 0 ? ((price - sl) / price) * 100 : 0,
    tpPct: price > 0 ? ((tp - price) / price) * 100 : 0,
  };
}

export function getNearestRangeBox(price, srLevels = []) {
  const support = srLevels.find((level) => level.kind === 'support' && level.price < price) ?? null;
  const resistance = srLevels.find((level) => level.kind === 'resistance' && level.price > price) ?? null;
  return { support, resistance };
}

export function isMidRangeLocation(price, srLevels = [], profileConfig) {
  const { support, resistance } = getNearestRangeBox(price, srLevels);
  if (!support || !resistance) return { midRange: false, position: null };
  const range = resistance.price - support.price;
  if (!Number.isFinite(range) || range <= 0) return { midRange: false, position: null };
  const position = (price - support.price) / range;
  const midRange = position >= profileConfig.midRangeLow && position <= profileConfig.midRangeHigh;
  return { midRange, position };
}

export function classifyRegime(price, atrValue, ema7Value, ema50Value, profileConfig) {
  if (!Number.isFinite(price) || price <= 0) return 'unknown';
  const atrPct = Number.isFinite(atrValue) && atrValue > 0 ? (atrValue / price) * 100 : 0;
  const emaGapPct = Number.isFinite(ema7Value) && Number.isFinite(ema50Value)
    ? (Math.abs(ema7Value - ema50Value) / price) * 100
    : 0;
  if (atrPct >= profileConfig.volatileAtrPctMin) return 'volatile';
  if (atrPct <= profileConfig.rangeAtrPctMax && emaGapPct <= profileConfig.rangeEmaGapPctMax) return 'range';
  return 'trend';
}

export function resolveThresholds(regime, midRangeBlock, profileConfig) {
  const minBearConditions = Number.isInteger(profileConfig?.minBearConditions)
    ? profileConfig.minBearConditions
    : MIN_BEAR_CONDITIONS;
  let bullThreshold = profileConfig.minConditions;
  let bearThreshold = minBearConditions;

  if (regime === 'range') {
    bullThreshold += profileConfig.dynamicThresholdBoostRange;
    bearThreshold += profileConfig.dynamicThresholdBoostRange;
  }
  if (regime === 'volatile') {
    bullThreshold += profileConfig.dynamicThresholdBoostVolatile;
    bearThreshold += profileConfig.dynamicThresholdBoostVolatile;
  }
  if (midRangeBlock) {
    bullThreshold += profileConfig.dynamicThresholdBoostMidRange;
    bearThreshold += profileConfig.dynamicThresholdBoostMidRange;
  }

  return {
    bullThreshold: Math.min(SIGNAL_PILLS.length, Math.max(profileConfig.minConditions, bullThreshold)),
    bearThreshold: Math.min(BEAR_SIGNAL_PILLS.length, Math.max(minBearConditions, bearThreshold)),
  };
}

export function resolveAnalysisConfidence({
  signal,
  bearSignal,
  condCount,
  bearCondCount,
  bullThreshold,
  bearThreshold,
  rrOk,
  midRangeBlock,
  regime,
}) {
  if (midRangeBlock) return 'low';
  if ((signal && rrOk) || bearSignal) return regime === 'trend' ? 'high' : 'medium';
  const nearBull = condCount >= Math.max(0, bullThreshold - 1);
  const nearBear = bearCondCount >= Math.max(0, bearThreshold - 1);
  return nearBull || nearBear ? 'medium' : 'low';
}
