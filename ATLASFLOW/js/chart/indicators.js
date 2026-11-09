(function initCreptoChartIndicators(global) {
  const SHARED = global.CreptoShared || {};
  const clamp = SHARED.clamp || function clampFallback(v, min, max) {
    return Math.max(min, Math.min(max, v));
  };

  function ema(values, period) {
    return global.BinanceCore.ema(values, period, {seed: "first"});
  }

  function vwap(candles) {
    let pv = 0;
    let vol = 0;
    return candles.map((c) => {
      const tp = (c.h + c.l + c.c) / 3;
      pv += tp * c.v;
      vol += c.v;
      return vol > 0 ? pv / vol : NaN;
    });
  }

  function boll(values, p = 20, m = 2) {
    const u = [];
    const md = [];
    const l = [];
    for (let i = 0; i < values.length; i += 1) {
      if (i < p - 1) {
        u.push(NaN);
        md.push(NaN);
        l.push(NaN);
        continue;
      }
      const w = values.slice(i - p + 1, i + 1);
      const avg = w.reduce((a, b) => a + b, 0) / p;
      const vr = w.reduce((a, b) => a + (b - avg) * (b - avg), 0) / p;
      const sd = Math.sqrt(vr);
      md.push(avg);
      u.push(avg + m * sd);
      l.push(avg - m * sd);
    }
    return { u, md, l };
  }

  function sr(candles) {
    if (candles.length < 10) return { supports: [], resistances: [] };
    const piv = 3;
    const highs = [];
    const lows = [];
    for (let i = piv; i < candles.length - piv; i += 1) {
      let hi = true;
      let lo = true;
      for (let j = i - piv; j <= i + piv; j += 1) {
        if (j === i) continue;
        if (candles[j].h >= candles[i].h) hi = false;
        if (candles[j].l <= candles[i].l) lo = false;
      }
      if (hi) highs.push({ idx: i, price: candles[i].h });
      if (lo) lows.push({ idx: i, price: candles[i].l });
    }
    return { supports: lows.slice(-4), resistances: highs.slice(-4) };
  }

  function fib(candles) {
    if (candles.length < 8) return [];
    const hi = Math.max(...candles.map((c) => c.h));
    const lo = Math.min(...candles.map((c) => c.l));
    if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi <= lo) return [];
    return [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((r) => ({ ratio: r, price: hi - (hi - lo) * r }));
  }

  function tradePlan(candles, levels) {
    if (candles.length < 14) return null;
    const entry = candles[candles.length - 1].c;
    const atr = candles.slice(-14).reduce((a, c) => a + Math.max(0, c.h - c.l), 0) / 14;
    const sp = levels.supports.map((x) => Number(x.price)).filter(Number.isFinite).sort((a, b) => a - b);
    const rs = levels.resistances.map((x) => Number(x.price)).filter(Number.isFinite).sort((a, b) => a - b);
    const closes = candles.map((c) => c.c);
    const e7 = ema(closes, 7);
    const e21 = ema(closes, 21);
    const e50 = ema(closes, 50);
    const idx = closes.length - 1;
    const last = closes[idx];
    const prev = closes[idx - 1] ?? last;
    const fast = e7[idx];
    const mid = e21[idx];
    const slow = e50[idx];
    const recent = candles.slice(-20);
    const recentHi = Math.max(...recent.map((c) => c.h));
    const recentLo = Math.min(...recent.map((c) => c.l));
    const recentMid = (recentHi + recentLo) / 2;

    let direction = "long";
    if (Number.isFinite(fast) && Number.isFinite(mid) && Number.isFinite(slow)) {
      if (fast > mid && mid > slow && last >= mid) direction = "long";
      else if (fast < mid && mid < slow && last <= mid) direction = "short";
      else direction = last >= recentMid ? "long" : "short";
    } else {
      direction = last >= prev ? "long" : "short";
    }

    const stopDist = Math.max(entry * 0.005, atr * 1.15);
    const targetDist = Math.max(entry * 0.008, atr * 1.95);
    const minTargetGap = Math.max(entry * 0.002, atr * 0.4);

    let stop;
    let target;
    if (direction === "long") {
      const nearSupport = [...sp].filter((x) => x < entry).pop();
      const candidateRes = rs.find((x) => x > entry + minTargetGap);
      stop = nearSupport ?? (entry - stopDist);
      target = candidateRes ?? (entry + targetDist);
      if (!(stop < entry)) stop = entry - stopDist;
      if (!(target > entry)) target = entry + targetDist;
    } else {
      const nearRes = rs.find((x) => x > entry);
      const belowSupports = sp.filter((x) => x < entry);
      const candidateSup = belowSupports.length ? belowSupports[belowSupports.length - 1] : null;
      stop = nearRes ?? (entry + stopDist);
      target = candidateSup ?? (entry - targetDist);
      if (!(stop > entry)) stop = entry + stopDist;
      if (!(target < entry)) target = entry - targetDist;
    }

    const risk = direction === "long" ? entry - stop : stop - entry;
    const reward = direction === "long" ? target - entry : entry - target;
    const rr = risk > 0 ? reward / risk : 0;
    return { direction, planType: "preview", entry, stop, target, rr };
  }

  function volProfile(candles, bins = 24) {
    if (!candles.length) return null;
    const hi = Math.max(...candles.map((c) => c.h));
    const lo = Math.min(...candles.map((c) => c.l));
    if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi <= lo) return null;
    const step = (hi - lo) / bins;
    const arr = Array.from({ length: bins }, () => 0);
    candles.forEach((c) => {
      const p = (c.h + c.l + c.c) / 3;
      const i = clamp(Math.floor((p - lo) / step), 0, bins - 1);
      arr[i] += c.v;
    });
    return { lo, hi, step, arr, max: Math.max(...arr, 1) };
  }

  function toCandleRow(a) {
    return { t: Number(a[0]), o: Number(a[1]), h: Number(a[2]), l: Number(a[3]), c: Number(a[4]), v: Number(a[5]) };
  }

  function normalizeTradePlan(plan) {
    if (!plan) return null;
    return {
      direction: plan.direction || "long",
      planType: plan.planType || "preview",
      entry: Number(plan.entry),
      stop: Number(plan.stop),
      target: Number(plan.target),
      rr: Number(plan.rr),
    };
  }

  function buildFrameSnapshot(candles, interval) {
    if (!Array.isArray(candles) || !candles.length) {
      return {
        interval,
        candles: [],
        ema7: [],
        ema21: [],
        ema50: [],
        sr: { supports: [], resistances: [] },
        tradePlan: null,
      };
    }

    const closes = candles.map((c) => c.c);
    const ema7v = ema(closes, 7);
    const ema21v = ema(closes, 21);
    const ema50v = ema(closes, 50);
    const levels = sr(candles);
    const plan = tradePlan(candles, levels);

    return {
      interval,
      candles: candles.slice(-140).map((c) => ({ ...c })),
      ema7: ema7v.slice(-140),
      ema21: ema21v.slice(-140),
      ema50: ema50v.slice(-140),
      sr: {
        supports: (levels?.supports || []).map((x) => ({ idx: x.idx, price: Number(x.price) })),
        resistances: (levels?.resistances || []).map((x) => ({ idx: x.idx, price: Number(x.price) })),
      },
      tradePlan: normalizeTradePlan(plan),
    };
  }

  global.CreptoChart = {
    ...(global.CreptoChart || {}),
    ema,
    vwap,
    boll,
    sr,
    fib,
    tradePlan,
    volProfile,
    toCandleRow,
    normalizeTradePlan,
    buildFrameSnapshot,
  };
})(window);
