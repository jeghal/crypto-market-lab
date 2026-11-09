/**
 * Web Worker — indicator calculations for the screener.
 * Imports pure modules (no DOM access) and runs computation off the main thread.
 */
import {
  CFG,
  getAnalysisProfileConfig,
  resolveAnalysisProfileKey,
  SIGNAL_ANALYSIS_LABEL,
} from './config.js';
import { ema, rsi, macd, stochRsi, atr, relativeVolume, bbWidthPercentile } from './indicators.js';
import { getSupportResistanceLevels } from './levels.js';
import { last } from './utils.js';
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

self.onmessage = async (e) => {
  const { type, sym, candles4h, candles15m, candles1h, candles1d, analysisProfile } = e.data;

  if (type === 'SCREENER_ROW') {
    try {
      const profileKey = resolveAnalysisProfileKey(analysisProfile);
      const profileConfig = getAnalysisProfileConfig(profileKey);

      // -- 4h trend -----------------------------------------------------------
      const cl4 = candles4h.map(c => c.c);
      const e7_4 = ema(cl4, CFG.ema7);
      const e21_4 = ema(cl4, CFG.ema21);
      const e50_4 = ema(cl4, CFG.ema50);
      const trendOk = isTrendHealthyShared(e7_4, e21_4, e50_4);

      // -- 1h trend -----------------------------------------------------------
      const cl1h = candles1h.map(c => c.c);
      const e7_1h = ema(cl1h, CFG.ema7);
      const e21_1h = ema(cl1h, CFG.ema21);
      const e50_1h = ema(cl1h, CFG.ema50);
      const trend1hOk = isTrendHealthyShared(e7_1h, e21_1h, e50_1h);

      // -- 15m indicators -----------------------------------------------------
      const cl15 = candles15m.map(c => c.c);
      const e7_15 = ema(cl15, CFG.ema7);
      const atr15 = last(atr(candles15m, CFG.atrP)) ?? cl15.at(-1) * 0.01;
      const curr = last(candles15m);
      const prev = last(candles15m, 2);

      const pullOk = wasPullbackRecentShared(candles15m, e7_15, atr15);
      const breakOk = isBreakoutCandleShared(curr, prev);

      const sr15 = stochRsi(cl15, CFG.rsiP, CFG.stochP, CFG.stochK, CFG.stochD);
      const sk15 = last(sr15.k), sd15 = last(sr15.d), skp15 = sr15.k[sr15.k.length - 2], sdp15 = sr15.d[sr15.d.length - 2];
      const stochSignal = getStochRsiReversalShared(sk15, sd15, skp15, sdp15);
      const rsiOk = stochSignal.ok;

      const mc15 = macd(cl15, CFG.macdF, CFG.macdS, CFG.macdSig);
      const mv = last(mc15.line), sv = last(mc15.signal), hc = last(mc15.hist), hp = mc15.hist[mc15.hist.length - 2];
      const macdOk = isMacdMomentumHealthyShared(mv, sv, hc, hp);

      const rvArr = relativeVolume(candles15m, 20);
      const rvol = last(rvArr);
      const rvolOk = rvol !== null && rvol > CFG.rvolMin;

      // -- Daily filters ------------------------------------------------------
      const cl1d = candles1d.map(c => c.c);
      const e7_1d = ema(cl1d, CFG.ema7);
      const e21_1d = ema(cl1d, CFG.ema21);
      const e50_1d = ema(cl1d, CFG.ema50);
      const d1Ok = isTrendHealthyShared(e7_1d, e21_1d, e50_1d);
      const bearD1Ok = isBearTrendHealthyShared(e7_1d, e21_1d, e50_1d);
      const rsiDailyOk = isDailyRsiAllowedShared(cl1d);

      const condCount = [trendOk, trend1hOk, pullOk, breakOk, rsiOk, macdOk, rvolOk, rsiDailyOk].filter(Boolean).length;

      // -- S/R and Risk -------------------------------------------------------
      const sr = getSupportResistanceLevels(candles4h);
      const mid = isMidRangeLocationShared(curr?.c ?? last(cl4), sr, profileConfig).midRange;
      const atr4h = last(atr(candles4h, CFG.atrP)) ?? 0;
      const regime = classifyRegimeShared(curr?.c ?? last(cl4), atr4h, last(e7_4), last(e50_4), profileConfig);
      const { bullThreshold, bearThreshold } = resolveThresholdsShared(regime, mid, profileConfig);

      // -- Bear conditions ----------------------------------------------------
      const bearTrendOk = isBearTrendHealthyShared(e7_4, e21_4, e50_4);
      const bearTrend1hOk = isBearTrendHealthyShared(e7_1h, e21_1h, e50_1h);
      const bearBreakdownOk = isBreakdownCandleShared(curr, prev);
      const bearRsiOk = getStochRsiBearReversalShared(sk15, sd15, skp15, sdp15);
      const bearMacdOk = isMacdBearMomentumShared(hc, hp);
      const bearRvolOk = rvolOk;
      const bearRsiDailyOk = isDailyRsiBearAllowedShared(cl1d);
      const bearCondCount = [bearTrendOk, bearTrend1hOk, bearBreakdownOk, bearRsiOk, bearMacdOk, bearRvolOk, bearRsiDailyOk].filter(Boolean).length;

      const bullSetupOk = d1Ok && trendOk && trend1hOk && !mid && condCount >= bullThreshold;
      const bearSigOk = bearD1Ok && bearTrendOk && bearTrend1hOk && !mid && bearCondCount >= bearThreshold;
      const riskSide = bearSigOk && !bullSetupOk ? 'short' : 'long';
      const riskLevels = computeRiskLevelsShared(curr?.c ?? last(cl4), atr15, sr, riskSide);
      const sigOk = bullSetupOk && riskLevels.rrOk;

      const confidence = resolveAnalysisConfidenceShared({
        signal: sigOk,
        bearSignal: bearSigOk,
        condCount,
        bearCondCount,
        bullThreshold,
        bearThreshold,
        rrOk: riskLevels.rrOk,
        midRangeBlock: mid,
        regime,
      });

      self.postMessage({
        id: e.data.id,
        result: {
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
          bearBreakOk: bearBreakdownOk,
          bearBreakdownOk,
          bearRsiOk,
          bearMacdOk,
          bearRvolOk,
          bearRsiDailyOk,
          d1TrendOk: d1Ok,
          bearD1TrendOk: bearD1Ok,
          regime,
          midRangeBlock: mid,
          rangePosition: isMidRangeLocationShared(curr?.c ?? last(cl4), sr, profileConfig).position,
          bullThreshold,
          bearThreshold,
          analysisConfidence: confidence,
          stochKPct: sk15 * 100,
          price: curr?.c ?? last(cl4),
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
        }
      });
    } catch (error) {
      self.postMessage({ id: e.data.id, error: error.message, sym });
    }
  }
};
