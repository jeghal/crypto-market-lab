import { CFG } from './config.js';
import { el } from './dom.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getNearestLevel(levels, kind, price) {
  return (levels ?? []).find((level) => level.kind === kind && (
    kind === 'resistance' ? level.price > price : level.price < price
  )) ?? null;
}

function getGapPct(price, levelPrice, direction) {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(levelPrice)) return null;
  const raw = direction === 'up'
    ? ((levelPrice - price) / price) * 100
    : ((price - levelPrice) / price) * 100;
  return Number.isFinite(raw) ? raw : null;
}

function getAction(result) {
  if (result.signal && !result.bearSignal) return 'مراقبة شراء';
  return 'انتظار';
}

function getConfidencePercent(result, action) {
  const baseMap = { high: 74, medium: 63, low: 52 };
  let score = baseMap[result.analysisConfidence] ?? 55;

  const activeCount = action === 'مراقبة شراء'
    ? result.condCount
    : Math.max(result.condCount ?? 0, result.bearCondCount ?? 0);
  const activeThreshold = action === 'مراقبة شراء'
    ? result.bullThreshold
    : Math.max(result.bullThreshold ?? 0, result.bearThreshold ?? 0, 1);

  if (Number.isFinite(activeCount) && Number.isFinite(activeThreshold) && activeThreshold > 0) {
    score += clamp(Math.round(((activeCount / activeThreshold) - 1) * 10), -4, 8);
  }

  if (result.rrOk) score += 2;
  if (result.regime === 'trend') score += 2;
  if (result.regime === 'volatile') score -= 3;
  if (result.midRangeBlock) score -= 6;
  if (action === 'انتظار') score -= 2;

  return clamp(Math.round(score), 35, 92);
}

export function buildDecisionExplanation(result) {
  const action = getAction(result);
  const reasons = [];
  const warnings = [];

  const price = Number(result.price);
  const ema7 = Number(result.ema7_4h);
  const ema21 = Number(result.ema21_4h);
  const ema50 = Number(result.ema50_4h);
  const bullStack = Number.isFinite(ema7) && Number.isFinite(ema21) && Number.isFinite(ema50) && ema7 > ema21 && ema21 > ema50;
  const bearStack = Number.isFinite(ema7) && Number.isFinite(ema21) && Number.isFinite(ema50) && ema7 < ema21 && ema21 < ema50;
  const momentumPositive = Number(result.chartHistCurr) > 0 && Number(result.chartMacdV) >= Number(result.chartSigV);
  const momentumNegative = Number(result.chartHistCurr) < 0 && Number(result.chartMacdV) <= Number(result.chartSigV);
  const currentRvol = Number(result.currentRvol);
  const volumeStrong = Number.isFinite(currentRvol) && currentRvol >= CFG.rvolMin;
  const volumeWeak = Number.isFinite(currentRvol) && currentRvol < 0.9;
  const nearestResistance = getNearestLevel(result.srLevels, 'resistance', price);
  const nearestSupport = getNearestLevel(result.srLevels, 'support', price);
  const resistanceGap = getGapPct(price, nearestResistance?.price, 'up');
  const supportGap = getGapPct(price, nearestSupport?.price, 'down');

  if (action === 'مراقبة شراء') {
    if (bullStack) reasons.push('EMA 7 أعلى من EMA 21 وEMA 50');
    if (result.trend1hOk || result.d1TrendOk) reasons.push('الاتجاه العام يدعم الصعود');
    if (price > ema7) reasons.push('السعر يتمركز أعلى متوسطات الاتجاه');
    if (momentumPositive || result.macdOk) reasons.push('الزخم إيجابي');
    if (volumeStrong) reasons.push('الحجم يدعم الحركة');
    if (result.breakOk) reasons.push('هناك اختراق يدعم الاستمرار');
    if (Number.isFinite(resistanceGap) && resistanceGap > 1.2) reasons.push('لا توجد مقاومة قريبة');
  } else {
    if (!bullStack && !bearStack) reasons.push('الاتجاه غير واضح');
    if (result.midRangeBlock) reasons.push('السعر في منتصف النطاق');
    if (result.regime === 'range') reasons.push('السوق بين دعم ومقاومة');
    if (!momentumPositive && !momentumNegative) reasons.push('الزخم ضعيف أو مختلط');
    if (!volumeStrong) reasons.push('الحجم لا يدعم قرارًا واضحًا');
  }

  if (result.regime === 'range') warnings.push('السوق جانبي');
  if (result.regime === 'volatile') warnings.push('السوق متذبذب');
  if (volumeWeak) warnings.push('الحجم ضعيف');
  if (Number.isFinite(resistanceGap) && resistanceGap < 1) {
    warnings.push(`مقاومة قريبة على بعد ${resistanceGap.toFixed(1)}%`);
  }
  if (action !== 'مراقبة شراء' && Number.isFinite(supportGap) && supportGap < 1) {
    warnings.push(`دعم قريب على بعد ${supportGap.toFixed(1)}%`);
  }
  if (!result.rrOk) warnings.push('العائد إلى المخاطرة غير مثالي');

  if (!reasons.length) reasons.push('المعطيات الحالية لا تمنح أفضلية واضحة');
  if (!warnings.length) warnings.push('لا يوجد تحذير مهم حاليًا');

  return {
    action,
    confidence: getConfidencePercent(result, action),
    reasons: reasons.slice(0, 3),
    warning: warnings[0],
  };
}

export function renderDecisionExplanation(result) {
  if (!el.decisionExplanation) return;
  if (!result) {
    el.decisionExplanation.replaceChildren();
    return;
  }

  const explanation = buildDecisionExplanation(result);

  const card = document.createElement('div');
  card.className = 'decision-card';

  const title = document.createElement('div');
  title.className = 'decision-title';
  title.textContent = 'لماذا هذه الإشارة؟';

  const summary = document.createElement('div');
  summary.className = 'decision-summary';

  const decisionMetric = document.createElement('div');
  decisionMetric.className = 'decision-metric';
  const decisionLabel = document.createElement('span');
  decisionLabel.textContent = 'القرار';
  const decisionValue = document.createElement('strong');
  decisionValue.textContent = explanation.action;
  decisionMetric.append(decisionLabel, decisionValue);

  const confidenceMetric = document.createElement('div');
  confidenceMetric.className = 'decision-metric';
  const confidenceLabel = document.createElement('span');
  confidenceLabel.textContent = 'الثقة';
  const confidenceValue = document.createElement('strong');
  confidenceValue.textContent = `${explanation.confidence}%`;
  confidenceMetric.append(confidenceLabel, confidenceValue);

  summary.append(decisionMetric, confidenceMetric);

  const reasonsBlock = document.createElement('div');
  reasonsBlock.className = 'decision-block';
  const reasonsTitle = document.createElement('div');
  reasonsTitle.className = 'decision-subtitle';
  reasonsTitle.textContent = 'لماذا؟';
  const reasonsList = document.createElement('ul');
  reasonsList.className = 'decision-list';
  explanation.reasons.forEach((reason) => {
    const item = document.createElement('li');
    item.textContent = reason;
    reasonsList.appendChild(item);
  });
  reasonsBlock.append(reasonsTitle, reasonsList);

  const warningBlock = document.createElement('div');
  warningBlock.className = 'decision-warning';
  const warningTitle = document.createElement('div');
  warningTitle.className = 'decision-subtitle';
  warningTitle.textContent = 'الحذر';
  const warningText = document.createElement('div');
  warningText.className = 'decision-warning-text';
  warningText.textContent = explanation.warning;
  warningBlock.append(warningTitle, warningText);

  card.append(title, summary, reasonsBlock, warningBlock);
  el.decisionExplanation.replaceChildren(card);
}
