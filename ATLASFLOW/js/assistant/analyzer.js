(function initAtlasFlowAssistantAnalyzer(global) {
  const SHARED = global.AtlasFlowShared || {};
  const latestFinite = SHARED.latestFinite || ((arr) => {
    if (!Array.isArray(arr)) return NaN;
    for (let i = arr.length - 1; i >= 0; i -= 1) if (Number.isFinite(arr[i])) return arr[i];
    return NaN;
  });

  function readAnalysisSnapshot(sourceSnapshot, assistantCfg) {
    const p = sourceSnapshot;
    if (!p || !Array.isArray(p.candles) || !p.candles.length) return null;

    const last = p.candles[p.candles.length - 1];
    const prev = p.candles[p.candles.length - 2];

    const ema7 = latestFinite(p.ema7);
    const ema21 = latestFinite(p.ema21);
    const ema50 = latestFinite(p.ema50);
    const trendBull = Number.isFinite(ema7) && Number.isFinite(ema21) && Number.isFinite(ema50) && ema7 > ema21 && ema21 > ema50 && last.c > ema21;
    const trendBear = Number.isFinite(ema7) && Number.isFinite(ema21) && Number.isFinite(ema50) && ema7 < ema21 && ema21 < ema50 && last.c < ema21;
    const trend = trendBull ? "bull" : trendBear ? "bear" : "side";

    const lookback = p.candles.slice(-Math.min(80, p.candles.length));
    let hi = -Infinity;
    let lo = Infinity;
    lookback.forEach((c) => {
      if (c.h > hi) hi = c.h;
      if (c.l < lo) lo = c.l;
    });
    const range = Math.max(hi - lo, 1e-9);
    const pos = (last.c - lo) / range;
    const inMiddle = pos > 0.4 && pos < 0.6;

    const supports = (p.sr?.supports || [])
      .map((x) => Number(x.price))
      .filter((x) => Number.isFinite(x) && x < last.c)
      .sort((a, b) => b - a);
    const resistances = (p.sr?.resistances || [])
      .map((x) => Number(x.price))
      .filter((x) => Number.isFinite(x) && x > last.c)
      .sort((a, b) => a - b);

    const nearestSupport = supports[0];
    const nearestResistance = resistances[0];
    const distSupPct = Number.isFinite(nearestSupport) ? Math.abs((last.c - nearestSupport) / last.c) * 100 : NaN;
    const distResPct = Number.isFinite(nearestResistance) ? Math.abs((nearestResistance - last.c) / last.c) * 100 : NaN;

    const wickWindow = p.candles.slice(-Math.min(20, p.candles.length));
    const avgWick = wickWindow.reduce((acc, c) => {
      const candleRange = Math.max(c.h - c.l, 1e-9);
      const body = Math.abs(c.c - c.o);
      return acc + (candleRange - body) / candleRange;
    }, 0) / Math.max(wickWindow.length, 1);

    const dojiCount = p.candles.slice(-5).filter((c) => {
      const candleRange = Math.max(c.h - c.l, 1e-9);
      return Math.abs(c.c - c.o) / candleRange < 0.2;
    }).length;
    const notHesitant = dojiCount <= 3;

    // Derived fields
    const direction = p.tradePlan?.direction === "short" ? "short" : "long";
    const bullBreak = !!(prev && last.c > prev.h && last.c > last.o);
    const bounceFromSupport = Number.isFinite(nearestSupport) && last.l <= nearestSupport * 1.002 && last.c > last.o;
    const bearBreak = !!(prev && last.c < prev.l && last.c < last.o);
    const bounceFromResistance = Number.isFinite(nearestResistance) && last.h >= nearestResistance * 0.998 && last.c < last.o;

    const confirmation = (direction === "short") ? (bearBreak || bounceFromResistance) : (bullBreak || bounceFromSupport);
    const rr = Number(p.tradePlan?.rr || 0);
    const entry = Number(p.tradePlan?.entry || 0);
    const stop = Number(p.tradePlan?.stop || 0);
    const target = Number(p.tradePlan?.target || 0);
    const stopDistPct = entry > 0 ? Math.abs((entry - stop) / entry) * 100 : NaN;
    const targetDistPct = entry > 0 ? Math.abs((target - entry) / entry) * 100 : NaN;

    // v10 Enrichments
    const trendStrength = (Math.abs(ema7 - ema21) + Math.abs(ema21 - ema50)) / last.c * 100;
    const timingSide = (direction === "long") ? (distSupPct < 1.5 ? "support" : (inMiddle ? "middle" : "high")) : (distResPct < 1.5 ? "resistance" : (inMiddle ? "middle" : "low"));
    const rrBucket = rr >= 3 ? "strong" : (rr >= 2 ? "ok" : "weak");
    const noiseLevel = avgWick > 0.4 ? "high" : (avgWick > 0.2 ? "medium" : "low");

    return {
      price: last.c,
      direction,
      trend,
      trendStrength,
      pos,
      inMiddle,
      distSupPct,
      distResPct,
      avgWick,
      notHesitant,
      timingSide,
      rrBucket,
      noiseLevel,
      rr,
      confirmation,
      stopDistPct,
      targetDistPct,
      entry, stop, target,
      nearestSupport, nearestResistance,
      mtf: p.mtf || {},
      sourceInterval: String(p.interval || "").toLowerCase()
    };
  }

  global.AtlasFlowAssistant = {
    ...(global.AtlasFlowAssistant || {}),
    readAnalysisSnapshot,
  };
})(window);
