import { CFG, IV_LABELS, SIGNAL_PILLS } from './config.js';
import { el } from './dom.js';
import { state } from './state.js';
import { MIN_RR } from './signal-shared.js';
import { fmt, getChartDurationLabel, getChartRangeLabel, last } from './utils.js';
import { syncChartSymbolSelect } from './ui.js';
import { updateOHLC } from './ui-tooltip.js';

export function renderSignalCard(result) {
  const hasBull = result.signal;
  const hasBear = result.bearSignal;

  let orbClass = 'w', orbTxt = '—', sigTxt = 'لا توجد إشارة', sigColor = 'var(--red)';
  if (hasBull && hasBear) {
    orbClass = 'w'; orbTxt = '—'; sigTxt = 'انتظار (تضارب في الإشارات)'; sigColor = 'var(--yellow)';
  } else if (hasBull) {
    orbClass = 'g'; orbTxt = '▲'; sigTxt = 'إشارة دخول - شراء'; sigColor = 'var(--green)';
  } else if (hasBear) {
    orbClass = 'w'; orbTxt = '—'; sigTxt = 'انتظار (ضغط هبوطي)'; sigColor = 'var(--red)';
  }

  el.sigOrb.className = `sig-orb ${orbClass}`;
  el.sigOrb.textContent = orbTxt;
  el.sigTxt.textContent = sigTxt;
  el.sigTxt.style.color = sigColor;

  const priceStr = `$${fmt(result.price, result.price > 100 ? 0 : 4)}`;
  const priceData = state.prices?.[result.sym];
  const sigSubParts = [makePill(priceStr, 'sig-price')];
  if (priceData) {
    const change = document.createElement('span');
    change.className = priceData.chg >= 0 ? 'up' : 'dn';
    change.textContent = `${priceData.chg >= 0 ? '+' : ''}${priceData.chg.toFixed(2)}%`;
    sigSubParts.push(document.createTextNode(' '), change);
  }
  sigSubParts.push(
    document.createTextNode(` · ${result.analysisIv} · ${result.condCount}/${SIGNAL_PILLS.length} شروط`),
  );
  if (hasBear) {
    sigSubParts.push(document.createTextNode(` · هبوط ${result.bearCondCount}/7`));
  }
  setTextContentChildren(el.sigSub, sigSubParts);

  renderPillGroup(el.sigPills, SIGNAL_PILLS, result, 'ok');

  // Buy-only UI: hide bear pills block permanently.
  const bearPillsEl = document.getElementById('bearSigPills');
  if (bearPillsEl) {
    bearPillsEl.style.display = 'none';
    bearPillsEl.replaceChildren();
  }
}

export function renderConditions(result) {
  const conds = [
    result.trendOk,
    result.trend1hOk,
    result.pullOk,
    result.breakOk,
    result.rsiOk,
    result.macdOk,
    result.rvolOk,
    result.rsiDailyOk,
  ];
  conds.forEach((isValid, index) => {
    const badge = el.conditionBadges[index];
    setConditionBadge(badge, isValid);
    if (index === 4 && badge) {
      badge.textContent = !isValid
        ? '\u2715 \u0641\u0627\u0634\u0644'
        : result.rsiStrength === 'strong'
          ? '\u2713\u2713 \u0642\u0648\u064A'
          : '\u2713 \u0639\u0627\u062F\u064A';
    }
  });
  if (el.condScore) {
    const met = conds.filter(Boolean).length;
    const total = conds.length;
    el.condScore.textContent = `${met}/${total}`;
    el.condScore.style.color = met === total
      ? 'var(--green)'
      : met >= CFG.minConditions
        ? 'var(--accent)'
        : 'var(--muted)';
  }
  setEntryFilterBadge(el.entryFilters?.d1, result.d1TrendOk);
  setEntryFilterBadge(el.entryFilters?.range, !result.midRangeBlock);
  setEntryFilterBadge(el.entryFilters?.rr, result.rrOk);
}

export function renderRsi(result) {
  const v = result.chartRsiV ?? 50;
  const pct = v / 100;
  const [label, color] = getRsiDescriptor(v);
  const ivLabel = IV_LABELS[result.chartIv] || result.chartIv;
  const arcLen = Math.PI * 82;
  el.gFill.setAttribute('stroke-dasharray', `${pct * arcLen} ${arcLen}`);
  el.gNeedle.style.transform = `rotate(${-90 + pct * 180}deg)`;
  el.rsiN.textContent = result.chartRsiV != null ? v.toFixed(1) : '—';
  el.rsiL.textContent = `${label} · ${ivLabel}`;
  el.rsiL.style.color = color;

  if (el.stochK) {
    const sk = result.chartStochK;
    const sd = result.chartStochD;
    const skPct = sk != null ? (sk * 100).toFixed(1) : '—';
    const sdPct = sd != null ? (sd * 100).toFixed(1) : '—';
    const skColor = sk != null && sk * 100 < 20 ? 'var(--green)' : sk != null && sk * 100 > 80 ? 'var(--red)' : 'var(--muted)';
    const sdColor = sd != null && sd * 100 < 20 ? 'var(--green)' : sd != null && sd * 100 > 80 ? 'var(--red)' : 'var(--muted)';
    el.stochK.textContent = skPct;
    el.stochK.style.color = skColor;
    el.stochD.textContent = sdPct;
    el.stochD.style.color = sdColor;
    if (el.stochState) {
      const stochState = getStochDescriptor(sk, sd);
      el.stochState.textContent = stochState.text;
      el.stochState.style.color = stochState.color;
      el.stochState.style.borderColor = stochState.borderColor;
      el.stochState.style.background = stochState.background;
    }
  }
}

export function renderMacd(result) {
  const validHist = result.chartHistSlice.filter(Number.isFinite);
  const maxAbs = Math.max(...validHist.map(Math.abs), 0.0001);
  const bullish = result.chartMacdV > result.chartSigV;
  const ivLabel = IV_LABELS[result.chartIv] || result.chartIv;
  el.mHist.replaceChildren(
    ...result.chartHistSlice.map((value) => {
      const bar = document.createElement('div');
      if (!Number.isFinite(value)) {
        bar.className = 'mb mb-null';
        return bar;
      }

      const height = Math.abs(value) / maxAbs * 100;
      bar.className = `mb ${value >= 0 ? 'p' : 'n'}`;
      bar.style.height = `${height}%`;
      return bar;
    }),
  );

  const pFcn = (val) => {
    if (val == null) return '—';
    const absVal = Math.abs(val);
    if (absVal === 0) return '0.00';
    if (absVal < 0.001) return val.toFixed(5);
    if (absVal < 0.1) return val.toFixed(4);
    return val.toFixed(2);
  };

  el.mM.textContent = pFcn(result.chartMacdV);
  el.mS.textContent = pFcn(result.chartSigV);
  el.mH.textContent = pFcn(result.chartHistCurr);
  el.mH.style.color = (result.chartHistCurr ?? 0) >= 0 ? 'var(--green)' : 'var(--red)';
  el.mDir.textContent = `${bullish ? '▲ صاعد' : '▼ هابط'} · ${ivLabel}`;
  el.mDir.style.color = bullish ? 'var(--green)' : 'var(--red)';
  if (el.macdState) {
    const state = getMacdDescriptor(result.chartHistSlice, bullish);
    el.macdState.textContent = state.text;
    el.macdState.style.color = state.color;
    el.macdState.style.borderColor = state.borderColor;
    el.macdState.style.background = state.background;
  }
}

export function renderRiskLevels(result) {
  const riskSide = result.riskSide || 'long';
  el.tpV.textContent = `$${fmt(result.tp)}`;
  el.slV.textContent = `$${fmt(result.sl)}`;
  const tpPct = Math.abs(result.tpPct);
  const slPct = Math.abs(result.slPct);
  el.tpPct.textContent = `+${tpPct.toFixed(2)}%`;
  el.slPct.textContent = `-${slPct.toFixed(2)}%`;
  el.rrValue.textContent = `1 : ${result.rr.toFixed(2)}`;
  el.rrValue.style.color = result.rr >= 1.5 ? 'var(--green)'
    : result.rr >= 1.0 ? 'var(--accent)'
    : 'var(--red)';
  const riskLabel = result.riskAnalysisIv || (IV_LABELS[result.chartIv] || result.chartIv);
  const sideLabel = riskSide === 'short' ? 'بيع' : 'شراء';
  el.riskMeta.textContent = `ATR (${CFG.atrP}) · ${riskLabel} · ${sideLabel}`;
  if (el.riskState) {
    const rrOk = result.rr >= MIN_RR;
    el.riskState.textContent = rrOk
      ? `R:R مقبول للدخول (الحد ${MIN_RR.toFixed(1)})`
      : `R:R ضعيف، الأفضل انتظار سعر أفضل`;
    el.riskState.style.color = rrOk ? 'var(--green)' : 'var(--red)';
    el.riskState.style.borderColor = rrOk ? 'rgba(0, 232, 150, 0.22)' : 'rgba(255, 58, 92, 0.24)';
    el.riskState.style.background = rrOk ? 'rgba(0, 232, 150, 0.05)' : 'rgba(255, 58, 92, 0.055)';
  }
}

export function renderOrderBook(result) {
  const ivLabel = IV_LABELS[result.chartIv] || result.chartIv;
  const spreadText = result.spreadPct < 0.001
    ? `${result.spreadPct.toFixed(6)}%`
    : `${result.spreadPct.toFixed(4)}%`;

  el.bkA.textContent = `$${fmt(result.ask, result.ask < 1 ? 4 : 2)}`;
  el.bkB.textContent = `$${fmt(result.bid, result.bid < 1 ? 4 : 2)}`;
  const spreadOk = result.spreadPct < CFG.maxSpread;
  el.bkSp.textContent = `${spreadText} · ${spreadOk ? 'مقبول' : 'مرتفع'}`;
  el.bkSp.style.color = spreadOk ? 'var(--green)' : 'var(--red)';
  if (el.bkE7) el.bkE7.textContent = `$${fmt(result.ema7_4h, result.ema7_4h < 1 ? 4 : 2)}`;
  if (el.bkE21) el.bkE21.textContent = `$${fmt(result.ema21_4h, result.ema21_4h < 1 ? 4 : 2)}`;
  if (el.bkE50) el.bkE50.textContent = `$${fmt(result.ema50_4h, result.ema50_4h < 1 ? 4 : 2)}`;
  if (el.atrLbl) el.atrLbl.textContent = `ATR (${CFG.atrP}) · ${ivLabel}`;
  if (el.rvolLbl) el.rvolLbl.textContent = `RVOL (20) · ${ivLabel}`;
  
  if (Number.isFinite(result.atrV) && result.atrV > 0) {
    const atrDecimals = result.atrV > 100 ? 0 : result.atrV < 0.01 ? 5 : result.atrV < 0.1 ? 4 : 2;
    el.atrVal.textContent = `$${fmt(result.atrV, atrDecimals)}`;
  } else {
    el.atrVal.textContent = '—';
  }

  if (el.rvolVal && result.currentRvol != null) {
    const rv = result.currentRvol;
    el.rvolVal.textContent = `${rv.toFixed(2)}x`;
    el.rvolVal.style.color = rv >= CFG.rvolMin ? 'var(--green)' : rv < 0.7 ? 'var(--muted)' : 'var(--accent)';
  }
}

export function renderSupportResistance(result) {
  const supports = result.srLevels.filter(level => level.kind === 'support');
  const resistances = result.srLevels.filter(level => level.kind === 'resistance');
  const price = result.price;
  const ivLabel = IV_LABELS[result.chartIv] || result.chartIv;

  const setLevel = (node, level) => {
    if (!node) return;
    if (!level) {
      node.replaceChildren(document.createTextNode('—'));
      return;
    }
    const pct = ((level.price - price) / price * 100);
    const sign = pct >= 0 ? '+' : '';
    const decimals = Math.abs(pct) < 1 ? 2 : 1;
    const pctNode = document.createElement('span');
    pctNode.className = 'sr-pct';
    pctNode.textContent = `${sign}${pct.toFixed(decimals)}%`;
    node.replaceChildren(document.createTextNode(`${level.display} `), pctNode);
  };

  if (el.srTitle) {
    el.srTitle.textContent = `الدعوم والمقاومات · ${ivLabel}`;
  }
  [el.srR1, el.srR2, el.srR3, el.srR4].forEach((node, i) => setLevel(node, resistances[i]));
  [el.srS1, el.srS2, el.srS3, el.srS4].forEach((node, i) => setLevel(node, supports[i]));
}

export function renderMtf(result) {
  if (!el.mtfBody || !result.mtf) return;
  const summary = buildMtfSummary(result.mtf);
  if (el.mtfSummary) {
    const summaryText = document.createElement('div');
    summaryText.textContent = summary.text;
    const statusLine = document.createElement('div');
    statusLine.className = 'mtf-status-line';
    statusLine.textContent = summary.status;
    el.mtfSummary.replaceChildren(summaryText, statusLine);
    el.mtfSummary.style.color = summary.color;
    el.mtfSummary.style.borderColor = summary.borderColor;
    el.mtfSummary.style.background = summary.background;
  }

  el.mtfBody.replaceChildren(
    ...result.mtf.map((row) => {
      const tr = document.createElement('tr');
      if (row.emaTrend === 'bull' && row.macdDir === 'bull') tr.className = 'mtf-row-bull';
      if (row.emaTrend === 'bear' && row.macdDir === 'bear') tr.className = 'mtf-row-bear';
      const ivLabel = IV_LABELS[row.tf] || row.tf;

      const frame = document.createElement('td');
      frame.style.color = 'var(--accent)';
      frame.style.fontFamily = 'var(--mono)';
      frame.textContent = ivLabel;
      tr.append(frame);

      if (row.emaTrend == null) {
        const empty = document.createElement('td');
        empty.colSpan = 3;
        empty.style.color = 'var(--muted)';
        empty.textContent = '—';
        tr.append(empty);
        return tr;
      }

      const ema = document.createElement('td');
      ema.style.color = row.emaTrend === 'bull' ? 'var(--green)' : 'var(--red)';
      ema.style.textAlign = 'center';
      ema.textContent = row.emaTrend === 'bull' ? 'صاعد' : 'هابط';

      const stoch = document.createElement('td');
      stoch.style.textAlign = 'center';
      const stochWrap = document.createElement('div');
      stochWrap.className = 'mtf-k';
      const stochNumber = document.createElement('span');
      const stochState = getMtfStochState(row.stochKPct);
      stochNumber.style.color = stochState.color;
      stochNumber.textContent = row.stochKPct != null ? row.stochKPct.toFixed(0) : '—';
      const stochNote = document.createElement('span');
      stochNote.className = 'mtf-k-note';
      stochNote.style.color = stochState.color;
      stochNote.textContent = stochState.text;
      stochWrap.append(stochNumber, stochNote);
      stoch.append(stochWrap);

      const macd = document.createElement('td');
      macd.style.color = row.macdDir === 'bull' ? 'var(--green)' : 'var(--red)';
      macd.style.textAlign = 'center';
      macd.textContent = row.macdDir === 'bull' ? 'صاعد' : 'هابط';

      tr.append(ema, stoch, macd);
      return tr;
    }),
  );
}

export function renderPatterns(result) {
  if (!el.patternBadges) return;
  const patterns = normalizePatterns(result.patterns ?? []);
  if (!patterns.length) {
    el.patternBadges.replaceChildren();
    return;
  }
  el.patternBadges.replaceChildren(...patterns.map((p) => {
    const color = p.kind === 'bullish' ? 'var(--green)' : p.kind === 'bearish' ? 'var(--red)' : 'var(--yellow)';
    return makePill(p.ar, 'pill', { borderColor: color, color });
  }));
}

export function renderChartMeta(result) {
  const visibleCandles = result.candles.length;
  const rangeLabel = getChartRangeLabel(result.candles, result.chartIv);
  const durationLabel = getChartDurationLabel(result.candles);
  const ivLabel = IV_LABELS[result.chartIv] || result.chartIv;

  updateOHLC(last(result.candles));
  const makeBadgeSep = () => {
    const sep = document.createElement('span');
    sep.className = 'badge-sep';
    sep.textContent = '•';
    return sep;
  };
  const makeBadge = (text, className) => {
    const badge = document.createElement(className === 'badge-ltr' ? 'bdi' : 'span');
    badge.className = className;
    badge.textContent = text;
    return badge;
  };
  el.chartLbl.replaceChildren(
    makeBadge('المبيان', 'badge-ar'),
    makeBadgeSep(),
    makeBadge(result.sym, 'badge-ltr'),
    makeBadgeSep(),
    makeBadge(ivLabel, 'badge-ltr'),
    makeBadgeSep(),
    makeBadge(String(visibleCandles), 'badge-ltr'),
    makeBadgeSep(),
    makeBadge(rangeLabel, 'badge-ar'),
  );
  if (el.chartSpanIndicator) {
    el.chartSpanIndicator.textContent = `المدة الإجمالية ${durationLabel}`;
  }
  syncChartSymbolSelect(result.sym);
}

function setConditionBadge(node, ok) {
  node.textContent = ok ? '✓ محقق' : '✕ فاشل';
  node.className = `cbadge ${ok ? 'ok' : 'no'}`;
}

function setEntryFilterBadge(node, ok) {
  if (!node) return;
  node.textContent = ok ? '✓' : '✕';
  node.className = `entry-filter-badge ${ok ? 'ok' : 'no'}`;
}

function setTextContentChildren(container, parts) {
  container.replaceChildren(...parts.filter(Boolean));
}

function makePill(label, className, style = {}) {
  const pill = document.createElement('span');
  pill.className = className;
  pill.textContent = label;
  Object.assign(pill.style, style);
  return pill;
}
function renderPillGroup(container, defs, result, activeClass) {
  if (!container) return;
  container.replaceChildren(
    ...defs.map(([label, key]) => makePill(label, `pill ${result[key] ? activeClass : 'no'}`)),
  );
}

function normalizePatterns(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return [];

  const uniqueByPattern = new Map();
  [...patterns]
    .sort((a, b) => (b.index ?? -1) - (a.index ?? -1))
    .forEach((pattern) => {
      const key = `${pattern.name}:${pattern.kind}`;
      if (!uniqueByPattern.has(key)) uniqueByPattern.set(key, pattern);
    });

  const uniquePatterns = [...uniqueByPattern.values()]
    .sort((a, b) => (b.index ?? -1) - (a.index ?? -1));
  const latestDirectional = uniquePatterns.find((pattern) => pattern.kind !== 'neutral');

  return uniquePatterns
    .filter((pattern) => pattern.kind === 'neutral' || !latestDirectional || pattern.kind === latestDirectional.kind)
    .slice(0, 3);
}





function getRsiDescriptor(rsiValue) {
  if (rsiValue < 30) return ['تشبع بيعي', 'var(--red)'];
  if (rsiValue > 70) return ['تشبع شرائي', 'var(--red)'];
  if (rsiValue > 55) return ['منطقة قوة', 'var(--green)'];
  return ['محايد', 'var(--yellow)'];
}

function getStochDescriptor(k, d) {
  if (k == null || d == null) {
    return {
      text: 'StochRSI غير متاح',
      color: 'var(--muted)',
      borderColor: 'rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.025)',
    };
  }
  const kPct = k * 100;
  const dPct = d * 100;
  if (kPct >= 80 && dPct >= 80) {
    return {
      text: 'StochRSI في تشبع شرائي',
      color: 'var(--red)',
      borderColor: 'rgba(255, 58, 92, 0.24)',
      background: 'rgba(255, 58, 92, 0.055)',
    };
  }
  if (kPct <= 20 && dPct <= 20) {
    return {
      text: 'StochRSI في منطقة ارتداد محتمل',
      color: 'var(--green)',
      borderColor: 'rgba(0, 232, 150, 0.22)',
      background: 'rgba(0, 232, 150, 0.05)',
    };
  }
  if (k > d) {
    return {
      text: 'StochRSI يميل للصعود',
      color: 'var(--green)',
      borderColor: 'rgba(0, 232, 150, 0.18)',
      background: 'rgba(0, 232, 150, 0.04)',
    };
  }
  return {
    text: 'StochRSI يميل للتهدئة',
    color: 'var(--yellow)',
    borderColor: 'rgba(255, 200, 0, 0.18)',
    background: 'rgba(255, 200, 0, 0.045)',
  };
}

function getMacdDescriptor(histSlice, bullish) {
  const hist = (histSlice ?? []).filter(Number.isFinite);
  const curr = hist.at(-1);
  const prev = hist.at(-2);
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) {
    return {
      text: 'زخم MACD غير كافٍ للتقييم',
      color: 'var(--muted)',
      borderColor: 'rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.025)',
    };
  }
  const improving = curr > prev;
  if (bullish && curr >= 0 && improving) {
    return {
      text: 'زخم صاعد يتسارع',
      color: 'var(--green)',
      borderColor: 'rgba(0, 232, 150, 0.22)',
      background: 'rgba(0, 232, 150, 0.05)',
    };
  }
  if (bullish && curr >= 0) {
    return {
      text: 'زخم صاعد يهدأ',
      color: 'var(--accent)',
      borderColor: 'rgba(57, 213, 255, 0.18)',
      background: 'rgba(57, 213, 255, 0.05)',
    };
  }
  if (!bullish && curr < 0 && !improving) {
    return {
      text: 'ضغط هابط يتسارع',
      color: 'var(--red)',
      borderColor: 'rgba(255, 58, 92, 0.24)',
      background: 'rgba(255, 58, 92, 0.055)',
    };
  }
  if (!bullish && curr < 0) {
    return {
      text: 'ضغط هابط يضعف',
      color: 'var(--yellow)',
      borderColor: 'rgba(255, 200, 0, 0.18)',
      background: 'rgba(255, 200, 0, 0.045)',
    };
  }
  return {
    text: bullish ? 'تقاطع صاعد مبكر' : 'تقاطع هابط مبكر',
    color: bullish ? 'var(--green)' : 'var(--red)',
    borderColor: bullish ? 'rgba(0, 232, 150, 0.18)' : 'rgba(255, 58, 92, 0.2)',
    background: bullish ? 'rgba(0, 232, 150, 0.04)' : 'rgba(255, 58, 92, 0.045)',
  };
}

function getMtfStochState(value) {
  if (value == null) return { text: '—', color: 'var(--muted)' };
  if (value >= 80) return { text: 'تشبع شرائي', color: 'var(--red)' };
  if (value >= 70) return { text: 'قوي', color: 'var(--yellow)' };
  if (value <= 20) return { text: 'تشبع بيعي', color: 'var(--green)' };
  return { text: 'محايد', color: 'var(--muted)' };
}

function buildMtfSummary(rows) {
  const validRows = rows.filter((row) => row.emaTrend != null);
  if (!validRows.length) {
    return {
      text: 'بيانات غير كافية لتقييم التوافق.',
      status: 'حالة التوافق: غير كافية',
      color: 'var(--muted)',
      borderColor: 'rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.025)',
    };
  }

  const bullCount = validRows.filter((row) => row.emaTrend === 'bull').length;
  const bearCount = validRows.length - bullCount;
  const macdBullCount = validRows.filter((row) => row.macdDir === 'bull').length;
  const macdBearCount = validRows.length - macdBullCount;
  const overboughtCount = validRows.filter((row) => (row.stochKPct ?? -1) >= 80).length;
  const oversoldCount = validRows.filter((row) => (row.stochKPct ?? 101) <= 20).length;

  if (bullCount >= 3 && macdBullCount >= 3) {
    return overboughtCount >= 2
      ? {
          text: 'اتجاه صاعد لكن ممتد. الأفضل انتظار Pullback أو اختراق مؤكد.',
          status: 'حالة التوافق: صاعد ممتد',
          color: 'var(--accent)',
          borderColor: 'rgba(57, 213, 255, 0.18)',
          background: 'rgba(57, 213, 255, 0.05)',
        }
      : {
          text: 'اتجاه صاعد متوافق عبر الأطر. ابحث عن دخول منظم قرب دعم.',
          status: 'حالة التوافق: صاعد',
          color: 'var(--green)',
          borderColor: 'rgba(0, 232, 150, 0.22)',
          background: 'rgba(0, 232, 150, 0.05)',
        };
  }

  if (bearCount >= 3 && macdBearCount >= 3) {
    return oversoldCount >= 2
      ? {
          text: 'اتجاه هابط ممتد. في وضع Buy-Only الأفضل الانتظار حتى يخف الضغط.',
          status: 'حالة التوافق: هابط ممتد',
          color: 'var(--accent)',
          borderColor: 'rgba(57, 213, 255, 0.18)',
          background: 'rgba(57, 213, 255, 0.05)',
        }
      : {
          text: 'اتجاه هابط واضح. في وضع Buy-Only: لا دخول حالياً.',
          status: 'حالة التوافق: هابط',
          color: 'var(--red)',
          borderColor: 'rgba(255, 58, 92, 0.22)',
          background: 'rgba(255, 58, 92, 0.05)',
        };
  }

  return {
    text: 'توافق مختلط بين الأطر. لا دخول حتى يظهر اتجاه أنظف.',
    status: 'حالة التوافق: مختلط',
    color: 'var(--yellow)',
    borderColor: 'rgba(255, 200, 0, 0.18)',
    background: 'rgba(255, 200, 0, 0.05)',
  };
}
