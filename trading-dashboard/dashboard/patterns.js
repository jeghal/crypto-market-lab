/**
 * Detects candlestick patterns on the last 5 candles of an array.
 * Returns [{ name, ar, kind: 'bullish'|'bearish'|'neutral', index }]
 *
 * Improvements over v1:
 * - Hammer/Shooting Star require trend context (avoid false signals in ranging markets)
 * - Three White Soldiers/Black Crows require opens within previous body + small wicks
 * - Piercing Line and Dark Cloud Cover added (reliable 50%-body penetration patterns)
 * - Bullish and Bearish Harami added (body-inside-body confirmation patterns)
 */
export function detectPatterns(candles) {
  if (!candles || candles.length < 2) return [];

  const results = [];
  const n = candles.length;
  const start = Math.max(1, n - 5);

  for (let i = start; i < n; i++) {
    const c = candles[i];
    const p = candles[i - 1];

    const body = Math.abs(c.c - c.o);
    const range = c.h - c.l;
    if (range === 0) continue;

    const upperWick = c.h - Math.max(c.c, c.o);
    const lowerWick = Math.min(c.c, c.o) - c.l;
    const isBull = c.c >= c.o;
    const prevBull = p.c >= p.o;
    const prevBody = Math.abs(p.c - p.o);
    const prevRange = p.h - p.l;

    // ── 3-candle patterns (highest priority) ─────────────────────────────────
    if (i >= 2) {
      const pp = candles[i - 2];
      const ppBull = pp.c >= pp.o;
      const ppBody = Math.abs(pp.c - pp.o);
      const ppRange = pp.h - pp.l;
      const pBody = Math.abs(p.c - p.o);
      const pRange = p.h - p.l;
      const pSmall = pRange > 0 && pBody < pRange * 0.35;

      // Morning Star: pp bearish large + p small body (star) + c bullish closes above pp midpoint
      const ppMid = (pp.o + pp.c) / 2;
      if (
        !ppBull && ppBody > ppRange * 0.4 &&
        pSmall &&
        isBull && body > ppBody * 0.5 && c.c > ppMid
      ) {
        results.push({ name: 'Morning Star', ar: 'نجمة الصباح', kind: 'bullish', index: i });
        continue;
      }

      // Evening Star: pp bullish large + p small body (star) + c bearish closes below pp midpoint
      if (
        ppBull && ppBody > ppRange * 0.4 &&
        pSmall &&
        !isBull && body > ppBody * 0.5 && c.c < ppMid
      ) {
        results.push({ name: 'Evening Star', ar: 'نجمة المساء', kind: 'bearish', index: i });
        continue;
      }

      // Three White Soldiers: 3 consecutive bullish candles, higher closes,
      // each opens within the previous body, small upper wicks
      const pUpperWick = p.h - Math.max(p.c, p.o);
      const cUpperWick = c.h - Math.max(c.c, c.o);
      const pOpenInPpBody = p.o >= Math.min(pp.o, pp.c) && p.o <= Math.max(pp.o, pp.c);
      const cOpenInPBody  = c.o >= Math.min(p.o, p.c)  && c.o <= Math.max(p.o, p.c);
      if (
        ppBull && prevBull && isBull &&
        p.c > pp.c && c.c > p.c &&
        ppBody > ppRange * 0.4 && pBody > pRange * 0.4 && body > range * 0.4 &&
        pOpenInPpBody && cOpenInPBody &&
        pUpperWick < pBody * 0.3 && cUpperWick < body * 0.3
      ) {
        results.push({ name: 'Three White Soldiers', ar: 'ثلاثة جنود بيض', kind: 'bullish', index: i });
        continue;
      }

      // Three Black Crows: 3 consecutive bearish candles, lower closes,
      // each opens within the previous body, small lower wicks
      const pLowerWick = Math.min(p.c, p.o) - p.l;
      const cLowerWick = Math.min(c.c, c.o) - c.l;
      const pOpenInPpBodyBear = p.o >= Math.min(pp.o, pp.c) && p.o <= Math.max(pp.o, pp.c);
      const cOpenInPBodyBear  = c.o >= Math.min(p.o, p.c)  && c.o <= Math.max(p.o, p.c);
      if (
        !ppBull && !prevBull && !isBull &&
        p.c < pp.c && c.c < p.c &&
        ppBody > ppRange * 0.4 && pBody > pRange * 0.4 && body > range * 0.4 &&
        pOpenInPpBodyBear && cOpenInPBodyBear &&
        pLowerWick < pBody * 0.3 && cLowerWick < body * 0.3
      ) {
        results.push({ name: 'Three Black Crows', ar: 'ثلاثة غربان سوداء', kind: 'bearish', index: i });
        continue;
      }
    }

    // ── 2-candle patterns ─────────────────────────────────────────────────────

    // Piercing Line: prev large bearish, current gaps down then closes above 50% of prev body
    const prevBodyMid = (p.o + p.c) / 2;
    if (
      !prevBull && prevBody > prevRange * 0.4 &&
      isBull && c.o < p.c &&
      c.c > prevBodyMid && c.c < p.o
    ) {
      results.push({ name: 'Piercing Line', ar: 'خط الاختراق', kind: 'bullish', index: i });
      continue;
    }

    // Dark Cloud Cover: prev large bullish, current gaps up then closes below 50% of prev body
    if (
      prevBull && prevBody > prevRange * 0.4 &&
      !isBull && c.o > p.c &&
      c.c < prevBodyMid && c.c > p.o
    ) {
      results.push({ name: 'Dark Cloud Cover', ar: 'غطاء السحابة الداكنة', kind: 'bearish', index: i });
      continue;
    }

    // Bullish Harami: prev large bearish, current small body entirely within prev body
    const prevBodyHigh = Math.max(p.o, p.c);
    const prevBodyLow  = Math.min(p.o, p.c);
    const currBodyHigh = Math.max(c.o, c.c);
    const currBodyLow  = Math.min(c.o, c.c);
    if (
      !prevBull && prevBody > prevRange * 0.5 &&
      currBodyHigh < prevBodyHigh && currBodyLow > prevBodyLow &&
      body < prevBody * 0.5
    ) {
      results.push({ name: 'Bullish Harami', ar: 'حرامي صعودي', kind: 'bullish', index: i });
      continue;
    }

    // Bearish Harami: prev large bullish, current small body entirely within prev body
    if (
      prevBull && prevBody > prevRange * 0.5 &&
      currBodyHigh < prevBodyHigh && currBodyLow > prevBodyLow &&
      body < prevBody * 0.5
    ) {
      results.push({ name: 'Bearish Harami', ar: 'حرامي هبوطي', kind: 'bearish', index: i });
      continue;
    }

    // Tweezer Bottom: two adjacent lows nearly identical (≤0.1%), first bearish → second bullish
    const lowTol = Math.max(c.l, p.l) * 0.001;
    if (!prevBull && isBull && Math.abs(c.l - p.l) <= lowTol) {
      results.push({ name: 'Tweezer Bottom', ar: 'قاع مزدوج', kind: 'bullish', index: i });
      continue;
    }

    // Tweezer Top: two adjacent highs nearly identical (≤0.1%), first bullish → second bearish
    const highTol = Math.max(c.h, p.h) * 0.001;
    if (prevBull && !isBull && Math.abs(c.h - p.h) <= highTol) {
      results.push({ name: 'Tweezer Top', ar: 'قمة مزدوجة', kind: 'bearish', index: i });
      continue;
    }

    // Inside Bar: full range within previous range (volatility compression signal)
    if (c.h < p.h && c.l > p.l) {
      results.push({ name: 'Inside Bar', ar: 'شمعة داخلية', kind: 'neutral', index: i });
      continue;
    }

    // Bullish Engulfing: requires minimum body size to filter micro-engulfings
    if (
      !prevBull && isBull &&
      c.o < Math.min(p.c, p.o) &&
      c.c > Math.max(p.c, p.o) &&
      body > prevBody &&
      prevBody > prevRange * 0.2
    ) {
      results.push({ name: 'Bullish Engulfing', ar: 'ابتلاع صعودي', kind: 'bullish', index: i });
      continue;
    }

    // Bearish Engulfing: requires minimum body size to filter micro-engulfings
    if (
      prevBull && !isBull &&
      c.o > Math.max(p.c, p.o) &&
      c.c < Math.min(p.c, p.o) &&
      body > prevBody &&
      prevBody > prevRange * 0.2
    ) {
      results.push({ name: 'Bearish Engulfing', ar: 'ابتلاع هبوطي', kind: 'bearish', index: i });
      continue;
    }

    // ── 1-candle patterns ─────────────────────────────────────────────────────

    // Doji — body < 8% of total range
    if (body < range * 0.08) {
      results.push({ name: 'Doji', ar: 'دوجي', kind: 'neutral', index: i });
      continue;
    }

    // Hammer — long lower wick after a downtrend (last 2 closes declining)
    const inDowntrend = i >= 4
      && candles[i - 1].c < candles[i - 2].c
      && candles[i - 2].c < candles[i - 3].c;
    if (
      lowerWick > body * 2.5 &&
      upperWick < body * 0.6 &&
      body < range * 0.45 &&
      inDowntrend
    ) {
      results.push({ name: 'Hammer', ar: 'مطرقة', kind: 'bullish', index: i });
      continue;
    }

    // Shooting Star — long upper wick after an uptrend (last 2 closes rising)
    const inUptrend = i >= 4
      && candles[i - 1].c > candles[i - 2].c
      && candles[i - 2].c > candles[i - 3].c;
    if (
      upperWick > body * 2.5 &&
      lowerWick < body * 0.6 &&
      body < range * 0.45 &&
      inUptrend
    ) {
      results.push({ name: 'Shooting Star', ar: 'نجمة ساقطة', kind: 'bearish', index: i });
      continue;
    }
  }

  return results;
}
