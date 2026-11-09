export const CFG = Object.freeze({
  ema7: 7,
  ema21: 21,
  ema50: 50,
  rsiP: 14,
  atrP: 14,
  rsiOB: 70,
  rsiOS: 30,
  macdF: 12,
  macdS: 26,
  macdSig: 9,
  slAtrMult: 1.5,
  tpAtrMult: 3,
  maxSpread: 0.08,
  stochP: 14,
  stochK: 3,
  stochD: 3,
  stochOB: 80,
  rvolMin: 1.8,
  rsiDailyMax: 70,
  minConditions: 5,
  pullAtrMult: 1.5,
  pullLookback: 5,
  trendSlopeLookback: 3,
  breakoutCloseMin: 0.55,
  midRangeLow: 0.35,
  midRangeHigh: 0.65,
  rangeAtrPctMax: 1.1,
  volatileAtrPctMin: 3.0,
  rangeEmaGapPctMax: 0.35,
  dynamicThresholdBoostRange: 1,
  dynamicThresholdBoostVolatile: 1,
  dynamicThresholdBoostMidRange: 1,
});

export const DEFAULT_ANALYSIS_PROFILE = 'balanced';

export const ANALYSIS_PROFILES = Object.freeze({
  balanced: Object.freeze({
    key: 'balanced',
    label: 'متوازن',
    minConditions: CFG.minConditions,
    minBearConditions: 4,
    midRangeLow: CFG.midRangeLow,
    midRangeHigh: CFG.midRangeHigh,
    rangeAtrPctMax: CFG.rangeAtrPctMax,
    volatileAtrPctMin: CFG.volatileAtrPctMin,
    rangeEmaGapPctMax: CFG.rangeEmaGapPctMax,
    dynamicThresholdBoostRange: CFG.dynamicThresholdBoostRange,
    dynamicThresholdBoostVolatile: CFG.dynamicThresholdBoostVolatile,
    dynamicThresholdBoostMidRange: CFG.dynamicThresholdBoostMidRange,
  }),
  conservative: Object.freeze({
    key: 'conservative',
    label: 'محافظ',
    minConditions: Math.min(CFG.minConditions + 1, 8),
    minBearConditions: 5,
    midRangeLow: 0.30,
    midRangeHigh: 0.70,
    rangeAtrPctMax: 1.3,
    volatileAtrPctMin: 2.7,
    rangeEmaGapPctMax: 0.45,
    dynamicThresholdBoostRange: 1,
    dynamicThresholdBoostVolatile: 1,
    dynamicThresholdBoostMidRange: 1,
  }),
});

export function resolveAnalysisProfileKey(key) {
  return ANALYSIS_PROFILES[key] ? key : DEFAULT_ANALYSIS_PROFILE;
}

export function getAnalysisProfileConfig(key) {
  const profileKey = resolveAnalysisProfileKey(key);
  return ANALYSIS_PROFILES[profileKey];
}

export const SYMS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];
export const STABLECOIN_BASES = Object.freeze([
  'BUSD', 'DAI', 'FDUSD', 'PYUSD', 'TUSD', 'USDB', 'USDC', 'USDD', 'USDE', 'USDP', 'USDS',
]);

export const BASE = 'https://api.binance.com';
export const DATA_API_BASE = 'https://data-api.binance.vision';
export const SIGNAL_ANALYSIS_LABEL = '15m + 4h';

export const IV_LABELS = Object.freeze({
  '5m': '5د',
  '15m': '15د',
  '1h': '1س',
  '4h': '4س',
  '1d': '1ي',
  '1w': '1أ',
  '1M': '1ش',
});

export const SIGNAL_PILLS = Object.freeze([
  ['EMA 4h', 'trendOk'],
  ['EMA 1h', 'trend1hOk'],
  ['Pullback', 'pullOk'],
  ['Breakout', 'breakOk'],
  ['StochRSI', 'rsiOk'],
  ['MACD', 'macdOk'],
  ['RVOL', 'rvolOk'],
  ['RSI Daily', 'rsiDailyOk'],
]);

export const BEAR_SIGNAL_PILLS = Object.freeze([
  ['EMA 4h ↓', 'bearTrendOk'],
  ['EMA 1h ↓', 'bearTrend1hOk'],
  ['كسر هبوطي', 'bearBreakdownOk'],
  ['StochRSI', 'bearRsiOk'],
  ['MACD', 'bearMacdOk'],
  ['RVOL', 'bearRvolOk'],
  ['RSI Daily', 'bearRsiDailyOk'],
]);

export const CHART_PADDING = Object.freeze({
  top: 26,
  bottom: 24,
  left: 6,
  right: 76,
  minHeight: 380,
});

export const FIB_COLORS = Object.freeze({
  '0': 'rgba(255,255,255,0.4)',
  '23.6': 'rgba(255,58,92,0.45)',
  '38.2': 'rgba(247,147,26,0.45)',
  '50': 'rgba(255,184,48,0.45)',
  '61.8': 'rgba(0,232,150,0.45)',
  '78.6': 'rgba(57,213,255,0.45)',
  '100': 'rgba(255,255,255,0.4)',
});
