export function createProDecisionController({
  el,
  state,
  api,
  getCandles,
  buildScreenerRow,
  buildSignal,
  loadVolThreshold,
  getActiveAnalysisProfile,
} = {}) {
  let proDecisionController = null;

  function proNoEntry(reason) {
    return `لا تدخل\nالسبب: ${reason}`;
  }
  
  function proFmtPrice(value) {
    if (!Number.isFinite(value)) return '\u2014';
    const decimals = value >= 100 ? 2 : value >= 1 ? 4 : 6;
    return `$${value.toLocaleString('en', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }
  
  function proFmtRR(rr) {
    if (!Number.isFinite(rr) || rr <= 0) return '\u2014';
    return `1:${rr.toFixed(2)}`;
  }
  
  function proMtf(result, tf) {
    return result?.mtf?.find((row) => row.tf === tf) ?? null;
  }
  
  function proNearestLevels(result) {
    const resistances = (result.srLevels ?? []).filter((level) => level.kind === 'resistance');
    const supports = (result.srLevels ?? []).filter((level) => level.kind === 'support');
    return {
      r1: resistances[0] ?? null,
      r2: resistances[1] ?? null,
      s1: supports[0] ?? null,
      s2: supports[1] ?? null,
    };
  }
  
  function proIsMidRange(price, supportLevel, resistanceLevel) {
    if (!supportLevel || !resistanceLevel) return false;
    const range = resistanceLevel.price - supportLevel.price;
    if (!Number.isFinite(range) || range <= 0) return false;
    const pos = (price - supportLevel.price) / range;
    return pos > 0.35 && pos < 0.65;
  }
  
  function proClosedCandles(candles) {
    if (!Array.isArray(candles) || candles.length < 3) return [];
    return candles.slice(0, -1);
  }
  
  function proRangeStats(candles, lookback = 60) {
    const sample = candles.slice(-lookback);
    if (!sample.length) return null;
    let high = -Infinity;
    let low = Infinity;
    for (const candle of sample) {
      if (candle.h > high) high = candle.h;
      if (candle.l < low) low = candle.l;
    }
    if (!Number.isFinite(high) || !Number.isFinite(low) || high <= low) return null;
    return { high, low, range: high - low };
  }
  
  function proSwingPoints(candles, span = 2, maxPoints = 8) {
    const highs = [];
    const lows = [];
    for (let i = span; i < candles.length - span; i += 1) {
      let isHigh = true;
      let isLow = true;
      for (let j = i - span; j <= i + span; j += 1) {
        if (j === i) continue;
        if (candles[j].h >= candles[i].h) isHigh = false;
        if (candles[j].l <= candles[i].l) isLow = false;
      }
      if (isHigh) highs.push({ index: i, price: candles[i].h });
      if (isLow) lows.push({ index: i, price: candles[i].l });
    }
    return {
      highs: highs.slice(-maxPoints),
      lows: lows.slice(-maxPoints),
    };
  }
  
  function proStructureDirection(candles) {
    if (!candles.length) return 'unknown';
    const swings = proSwingPoints(candles);
    const h1 = swings.highs.at(-2)?.price;
    const h2 = swings.highs.at(-1)?.price;
    const l1 = swings.lows.at(-2)?.price;
    const l2 = swings.lows.at(-1)?.price;
    if ([h1, h2, l1, l2].every(Number.isFinite)) {
      if (h2 > h1 && l2 > l1) return 'bull';
      if (h2 < h1 && l2 < l1) return 'bear';
    }
    return 'unknown';
  }
  
  function proBodyRatio(candle) {
    if (!candle) return 0;
    const range = candle.h - candle.l;
    if (!(range > 0)) return 0;
    return Math.abs(candle.c - candle.o) / range;
  }
  
  function proHasIndecisionM15(candles15m) {
    const last1 = candles15m.at(-1);
    const last2 = candles15m.at(-2);
    if (!last1 || !last2) return true;
    const b1 = proBodyRatio(last1);
    const b2 = proBodyRatio(last2);
    return b1 < 0.28 && b2 < 0.28;
  }
  
  function proVolumeSpike(candles, period = 20, minMult = 1.15) {
    if (!Array.isArray(candles) || candles.length < period + 2) return false;
    const recent = candles.slice(-(period + 1), -1);
    const avg = recent.reduce((sum, candle) => sum + candle.v, 0) / recent.length;
    const lastVol = candles.at(-1)?.v ?? 0;
    return avg > 0 && lastVol >= avg * minMult;
  }
  
  function proBuildExecution(result, side, levels, setup) {
    const fallbackAtr = Number.isFinite(result.price) ? result.price * 0.008 : 0;
    const atrValue = Number.isFinite(result.atrV) && result.atrV > 0 ? result.atrV : fallbackAtr;
  
    if (side === 'buy') {
      const breakout = setup.mode === 'breakout' && Number.isFinite(setup.level);
      const orderType = breakout ? 'Stop-Limit' : 'Limit';
      const entry = breakout
        ? setup.level * 1.0008
        : (Number.isFinite(setup.level) ? setup.level * 1.0015 : result.price);
  
      if (breakout && Number.isFinite(result.price) && result.price > entry * 1.006) {
        return { error: 'الدخول متأخر بعد حركة انفجارية على M15.' };
      }
      if (!breakout && Number.isFinite(result.price) && result.price > entry * 1.012) {
        return { error: 'الدخول متأخر على ارتداد M15.' };
      }
  
      let stop = Number.isFinite(result.sl) && result.sl < entry
        ? result.sl
        : (levels.s1 ? levels.s1.price * 0.997 : entry - atrValue * 1.2);
      if (!(stop < entry)) stop = entry - atrValue * 1.2;
  
      const risk = entry - stop;
      if (!(risk > 0)) return { error: 'لا يوجد وقف فني منطقي أسفل نقطة الدخول.' };
  
      let tp = Number.isFinite(result.tp) && result.tp > entry
        ? result.tp
        : (levels.r2 ? levels.r2.price : entry + risk * 1.8);
      if (!(tp > entry)) tp = entry + risk * 1.8;
  
      return {
        orderType,
        entry,
        stop,
        tp,
        rr: (tp - entry) / risk,
        limitPrice: breakout ? entry * 1.0003 : entry,
      };
    }
  
    if (!result.bearBreakdownOk) return { error: 'تأكيد M15 غير كافٍ للبيع.' };
    if (!Number.isFinite(setup.level)) return { error: 'لا يوجد مستوى كسر واضح على H1 للبيع.' };
  
    const orderType = 'Stop-Limit';
    const entry = setup.level * 0.9992;
    if (Number.isFinite(result.price) && result.price < entry * 0.994) {
      return { error: 'الدخول متأخر بعد كسر قوي على M15.' };
    }
  
    let stop = levels.r1 ? levels.r1.price * 1.002 : entry + atrValue * 1.2;
    if (!(stop > entry)) stop = entry + atrValue * 1.2;
  
    const risk = stop - entry;
    if (!(risk > 0)) return { error: 'لا يوجد وقف فني منطقي أعلى نقطة الدخول.' };
  
    let tp = levels.s2 && levels.s2.price < entry ? levels.s2.price : entry - risk * 1.8;
    if (!(tp < entry)) tp = entry - risk * 1.8;
  
    return {
      orderType,
      entry,
      stop,
      tp,
      rr: (entry - tp) / risk,
      limitPrice: entry * 0.9998,
    };
  }
  
  function proEvaluateCandidate(result, side, tfContext) {
    const d1 = proMtf(result, '1d');
    const h4 = proMtf(result, '4h');
    const levels = proNearestLevels(result);
    const price = Number(result.price);
  
    const d1Candles = tfContext?.d1Candles ?? [];
    const h4Candles = tfContext?.h4Candles ?? [];
    const h1Candles = tfContext?.h1Candles ?? [];
    const m15Candles = tfContext?.m15Candles ?? [];
  
    if (!d1 || d1.emaTrend == null || !d1Candles.length) return { ok: false, reason: 'D1 غير واضح، لذلك لا تدخل.' };
    if (!h4 || h4.emaTrend == null || !h4Candles.length) return { ok: false, reason: 'H4 غير كافٍ للتوقيت.' };
    if (!h1Candles.length || !m15Candles.length) return { ok: false, reason: 'بيانات H1/M15 غير كافية.' };
  
    const d1Range = proRangeStats(d1Candles, 80);
    const h4Range = proRangeStats(h4Candles, 100);
    const h1Range = proRangeStats(h1Candles, 100);
    if (!d1Range || !h4Range || !h1Range) return { ok: false, reason: 'فشل تحديد نطاقات الفريمات.' };
  
    const d1Pos = (price - d1Range.low) / d1Range.range;
    const h4Pos = (price - h4Range.low) / h4Range.range;
    const d1Structure = proStructureDirection(d1Candles);
    const h4Structure = proStructureDirection(h4Candles);
  
    let d1Reason = '';
    let h4Reason = '';
  
    if (side === 'buy') {
      if (d1.emaTrend !== 'bull' || d1.macdDir !== 'bull') return { ok: false, reason: 'D1 لا يدعم الشراء.' };
      if (d1Structure !== 'bull') return { ok: false, reason: 'هيكل D1 غير صاعد بوضوح.' };
      if (d1Pos > 0.35 && d1Pos < 0.65) return { ok: false, reason: 'السعر في منتصف نطاق D1.' };
      if (d1Pos < 0.5) return { ok: false, reason: 'D1 صالح جزئيًا لكن دون أفضلية شراء واضحة.' };
      d1Reason = 'اتجاه D1 صاعد وهيكل القمم/القيعان داعم.';
  
      if (!result.trendOk || h4.emaTrend !== 'bull') return { ok: false, reason: 'H4 ضد سيناريو D1.' };
      if (h4Structure !== 'bull') return { ok: false, reason: 'هيكل H4 غير نظيف للشراء.' };
      if (h4Pos > 0.38 && h4Pos < 0.62) return { ok: false, reason: 'السعر في منتصف نطاق H4.' };
      h4Reason = 'H4 متوافق مع D1 والحركة نظيفة.';
    } else {
      if (d1.emaTrend !== 'bear' || d1.macdDir !== 'bear') return { ok: false, reason: 'D1 لا يدعم البيع.' };
      if (d1Structure !== 'bear') return { ok: false, reason: 'هيكل D1 غير هابط بوضوح.' };
      if (d1Pos > 0.35 && d1Pos < 0.65) return { ok: false, reason: 'السعر في منتصف نطاق D1.' };
      if (d1Pos > 0.5) return { ok: false, reason: 'D1 صالح جزئيًا لكن دون أفضلية بيع واضحة.' };
      d1Reason = 'اتجاه D1 هابط وهيكل القمم/القيعان داعم.';
  
      if (!result.bearTrendOk || h4.emaTrend !== 'bear') return { ok: false, reason: 'H4 ضد سيناريو D1.' };
      if (h4Structure !== 'bear') return { ok: false, reason: 'هيكل H4 غير نظيف للبيع.' };
      if (h4Pos > 0.38 && h4Pos < 0.62) return { ok: false, reason: 'السعر في منتصف نطاق H4.' };
      h4Reason = 'H4 متوافق مع D1 والحركة نظيفة.';
    }
  
    const h1Swings = proSwingPoints(h1Candles);
    const h1LastHigh = h1Swings.highs.at(-1)?.price ?? null;
    const h1LastLow = h1Swings.lows.at(-1)?.price ?? null;
    const h1Res = levels.r1?.price ?? h1LastHigh;
    const h1Sup = levels.s1?.price ?? h1LastLow;
    if (!Number.isFinite(h1Res) || !Number.isFinite(h1Sup) || h1Res <= h1Sup) {
      return { ok: false, reason: 'مستويات H1 غير واضحة.' };
    }
    if (proIsMidRange(price, { price: h1Sup }, { price: h1Res })) {
      return { ok: false, reason: 'السعر في منتصف النطاق على H1.' };
    }
  
    if (proHasIndecisionM15(m15Candles)) {
      return { ok: false, reason: 'شموع M15 مترددة وذيولها طويلة.' };
    }
  
    const m15Last = m15Candles.at(-1);
    const m15Body = proBodyRatio(m15Last);
    const m15VolSpike = proVolumeSpike(m15Candles, 20, 1.15);
  
    let setup = null;
    if (side === 'buy') {
      const breakoutConfirm = result.breakOk
        && m15Body >= 0.45
        && m15VolSpike
        && m15Last.c > h1Res * 1.0005;
  
      const reboundConfirm = result.pullOk
        && result.rsiOk
        && result.macdOk
        && m15Body >= 0.4
        && m15Last.l <= h1Sup * 1.0018
        && m15Last.c > m15Last.o;
  
      if (breakoutConfirm) {
        setup = {
          mode: 'breakout',
          level: h1Res,
          keyLevel: `مقاومة ${proFmtPrice(h1Res)} (آخر قمة/مقاومة H1)`,
          confirmation: 'اختراق واضح لمقاومة بإغلاق حقيقي وحجم داعم',
        };
      } else if (reboundConfirm) {
        setup = {
          mode: 'rebound',
          level: h1Sup,
          keyLevel: `دعم ${proFmtPrice(h1Sup)} (آخر قاع/دعم H1)`,
          confirmation: 'ارتداد واضح من دعم قوي',
        };
      } else {
        return { ok: false, reason: 'لا يوجد تأكيد فعلي صالح على M15 للشراء.' };
      }
    } else {
      const breakdownConfirm = result.bearBreakdownOk
        && result.bearRsiOk
        && result.bearMacdOk
        && m15Body >= 0.45
        && m15VolSpike
        && m15Last.c < h1Sup * 0.9995;
  
      if (!breakdownConfirm) {
        return { ok: false, reason: 'لا يوجد كسر واضح مؤكد على M15 للبيع.' };
      }
      setup = {
        mode: 'breakdown',
        level: h1Sup,
        keyLevel: `دعم ${proFmtPrice(h1Sup)} (آخر قاع/دعم H1)`,
        confirmation: 'كسر واضح لدعم بإغلاق حقيقي وحجم داعم',
      };
    }
  
    const execution = proBuildExecution(result, side, levels, setup);
    if (execution.error) return { ok: false, reason: execution.error };
    if (!Number.isFinite(execution.rr) || execution.rr < 1.5) {
      return { ok: false, reason: 'نسبة RR أقل من 1.5.' };
    }
  
    const orderDetails = execution.orderType === 'Stop-Limit'
      ? `${execution.orderType} (Trigger ${proFmtPrice(execution.entry)} / Limit ${proFmtPrice(execution.limitPrice)})`
      : execution.orderType;
  
    const text = [
      `- اسم الأصل: ${result.sym.replace('USDT', '/USDT')}`,
      `- نوع الصفقة: ${side === 'buy' ? 'شراء' : 'بيع'}`,
      `- الاتجاه العام باختصار: ${side === 'buy' ? 'صاعد' : 'هابط'}`,
      `- سبب صلاحية الأصل على D1: ${d1Reason}`,
      `- سبب التوافق أو الرفض على H4: ${h4Reason}`,
      `- المستوى الحاسم على H1: ${setup.keyLevel}`,
      `- نوع التأكيد على M15: ${setup.confirmation}`,
      `- منطقة الدخول الدقيقة: ${proFmtPrice(execution.entry)} عبر ${orderDetails}`,
      `- Stop Loss: ${proFmtPrice(execution.stop)}`,
      `- Take Profit: ${proFmtPrice(execution.tp)}`,
      `- نسبة العائد إلى المخاطرة: ${proFmtRR(execution.rr)}`,
      `- سبب مختصر جدًا للدخول: ${side === 'buy'
        ? 'اتجاه واضح + مستوى حاسم + تأكيد M15 فعلي غير متأخر.'
        : 'اتجاه هابط واضح + مستوى كسر حاسم + تأكيد M15 فعلي.'}`,
    ].join('\n');
  
    return { ok: true, text };
  }
  
  function proRenderDecision(text) {
    if (!el.proDecisionOutput) return;
    el.proDecisionOutput.textContent = text;
  }
  
  async function handleProDecisionClick() {
    proDecisionController?.abort();
    const controller = new AbortController();
    proDecisionController = controller;
  
    const button = el.proDecisionBtn;
    if (button) {
      button.disabled = true;
      button.textContent = 'جارٍ التحليل...';
    }
    proRenderDecision(`جارٍ تطبيق الفلترة الاحترافية على ${state.curSym} (D1 \u2192 H4 \u2192 H1 \u2192 M15) ...`);
  
    try {
      const currentSym = state.curSym;
      if (!currentSym) {
        proRenderDecision(proNoEntry('لا يوجد أصل مفتوح للتحليل.'));
        return;
      }
  
      const volMin = loadVolThreshold();
      let isLiquid = true;
  
      try {
        const ticker = await api(
          '/api/v3/ticker/24hr',
          { symbol: currentSym },
          { signal: controller.signal, retries: 1 },
        );
        const quoteVolume = +ticker?.quoteVolume || 0;
        isLiquid = quoteVolume >= volMin;
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') throw error;
        console.warn('Liquidity check failed. Proceeding with current symbol:', error);
      }
  
      if (!isLiquid) {
        proRenderDecision(proNoEntry(`الأصل المفتوح ${currentSym.replace('USDT', '/USDT')} أقل من حد السيولة المطلوب.`));
        return;
      }
  
      const row = await buildScreenerRow(currentSym, controller.signal, getActiveAnalysisProfile());
      if (controller.signal.aborted) return;
  
      const [d1Raw, h4Raw, h1Raw, m15Raw] = await Promise.all([
        getCandles(currentSym, '1d', 140, controller.signal),
        getCandles(currentSym, '4h', 180, controller.signal),
        getCandles(currentSym, '1h', 180, controller.signal),
        getCandles(currentSym, '15m', 220, controller.signal),
      ]);
      if (controller.signal.aborted) return;
  
      const tfContext = {
        d1Candles: proClosedCandles(d1Raw),
        h4Candles: proClosedCandles(h4Raw),
        h1Candles: proClosedCandles(h1Raw),
        m15Candles: proClosedCandles(m15Raw),
      };
  
      const candidates = [];
      if (row.signal) {
        const score = row.condCount * 10 + (Number.isFinite(row.rr) ? row.rr * 20 : 0);
        candidates.push({ sym: currentSym, side: 'buy', score });
      }
      if (!candidates.length) {
        candidates.push({ sym: currentSym, side: 'buy', score: 0 });
      }
  
      candidates.sort((a, b) => b.score - a.score);
      let lastReason = 'السوق الحالي متذبذب أو غير واضح.';
  
      for (const candidate of candidates) {
        const result = await buildSignal(candidate.sym, '1h', 120, controller.signal, getActiveAnalysisProfile());
        if (controller.signal.aborted) return;
        const decision = proEvaluateCandidate(result, candidate.side, tfContext);
        if (decision.ok) {
          proRenderDecision(decision.text);
          return;
        }
        lastReason = decision.reason || lastReason;
      }
  
      proRenderDecision(proNoEntry(lastReason));
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      console.error('Professional decision failed:', error);
      proRenderDecision(proNoEntry('تعذّر إكمال التحليل الآن. حاول مرة أخرى.'));
    } finally {
      if (proDecisionController === controller) proDecisionController = null;
      if (button) {
        button.disabled = false;
        button.textContent = 'قرار احترافي';
      }
    }
  }
  

  return {
    run: handleProDecisionClick,
    abort: () => { proDecisionController?.abort(); proDecisionController = null; },
    dispose: () => { proDecisionController?.abort(); proDecisionController = null; },
  };
}

