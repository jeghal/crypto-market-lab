import { CFG } from './config.js';
import { el } from './dom.js';
import { fmt } from './utils.js';

export function renderScenario(result) {
  if (!el.scenarioStatus) return;
  const scenario = buildScenario(result);

  el.scenarioStatus.textContent = scenario.status.text;
  el.scenarioStatus.style.color = scenario.status.color;
  el.scenarioStatus.style.borderColor = scenario.status.color;

  el.scenarioBias.textContent = scenario.bias.text;
  el.scenarioBias.style.color = scenario.bias.color;

  el.scenarioTrigger.textContent = scenario.trigger;
  el.scenarioInvalid.textContent = scenario.invalid;

  el.scenarioConfidence.textContent = scenario.confidence.text;
  el.scenarioConfidence.style.color = scenario.confidence.color;

  if (el.scenarioSummary) {
    el.scenarioSummary.textContent = scenario.summary;
  }
}

function buildScenario(result) {
  const { signal, bearSignal, condCount, bearCondCount, bullThreshold, bearThreshold, regime, rangePosition, midRangeBlock } = result;

  const isBull  = signal && !bearSignal;
  const isBear  = bearSignal && !signal;
  const isBoth  = signal && bearSignal;
  const isNone  = !signal && !bearSignal;

  const res = {
    status:     { text: 'متذبذب', color: 'var(--yellow)' },
    bias:       { text: 'محايد', color: 'var(--yellow)' },
    trigger:    '—',
    invalid:    '—',
    confidence: { text: '—', color: 'var(--muted)' },
    summary:    '',
  };

  const trendDir = result.trend === 'bull' ? 'صاعد' : 'هابط';
  const regimeLbl = regime === 'trend' ? 'نشط' : regime === 'volatile' ? 'متذبذب بقوة' : 'هادئ/نطاق';

  if (isBoth) {
    res.status     = { text: 'تضارب إشارات', color: 'var(--yellow)' };
    res.bias       = { text: 'مختلط', color: 'var(--yellow)' };
    res.trigger    = 'انتظار وضوح';
    res.invalid    = '—';
    res.confidence = { text: 'ضعيف جداً', color: 'var(--red)' };
    res.summary    = `يوجد تضارب بين الاتجاه الصاعد والهابط. السوق في حالة تردد عالية حالياً.`;
    return res;
  }

  if (isBull) {
    res.status     = { text: 'إعداد صاعد', color: 'var(--green)' };
    res.bias       = { text: 'شراء (Long)', color: 'var(--green)' };
    res.confidence = getConfidenceMeta(result.analysisConfidence);
    res.trigger    = `اختراق $${fmt(result.price)}`;
    res.invalid    = `كسر $${fmt(result.sl)}`;
    res.summary    = `المسار ${trendDir} والسوق في نمط ${regimeLbl}. القوة الشرائية مسيطرة مع توافق الشروط.`;
    if (midRangeBlock) res.summary += " تنبيه: السعر في منتصف النطاق.";
    return res;
  }

  if (isBear) {
    res.status     = { text: 'انتظار', color: 'var(--yellow)' };
    res.bias       = { text: 'لا دخول (ضغط هبوطي)', color: 'var(--yellow)' };
    res.confidence = getConfidenceMeta(result.analysisConfidence);
    res.trigger    = 'انتظار زوال الضغط الهبوطي';
    res.invalid    = result.sl ? `كسر $${fmt(result.sl)}` : '—';
    res.summary    = `المسار ${trendDir} والسوق في نمط ${regimeLbl}. توجد هيمنة بيعية، لذلك القرار Buy-Only الحالي هو الانتظار.`;
    if (midRangeBlock) res.summary += " تنبيه: السعر في منتصف النطاق.";
    return res;
  }

  // No active signal
  const bullSetupWithoutRisk = result.d1TrendOk
    && result.trendOk
    && result.trend1hOk
    && !midRangeBlock
    && condCount >= bullThreshold;
  if (bullSetupWithoutRisk && !result.rrOk) {
    res.status     = { text: 'انتظار R/R', color: 'var(--yellow)' };
    res.bias       = { text: 'إعداد شراء غير مكتمل', color: 'var(--yellow)' };
    res.trigger    = 'انتظار هدف أفضل أو وقف أقرب';
    res.invalid    = result.sl ? `$${fmt(result.sl)}` : '—';
    res.confidence = getConfidenceMeta('low');
    res.summary    = `الشروط الفنية مكتملة تقريباً، لكن نسبة العائد إلى المخاطرة ${Number.isFinite(result.rr) ? `1:${result.rr.toFixed(2)}` : 'غير صالحة'} أقل من الحد المطلوب. لا توجد إشارة دخول حتى يتحسن R/R.`;
    return res;
  }

  const bullGap = bullThreshold - condCount;
  const bearGap = bearThreshold - bearCondCount;

  if (bullGap <= 1) {
    res.status     = { text: 'مراقبة شرائية', color: 'var(--accent)' };
    res.bias       = { text: 'شراء وشيك', color: 'var(--accent)' };
    res.trigger    = 'بانتظار تأكيد أخير';
    res.invalid    = result.sl ? `$${fmt(result.sl)}` : '—';
    res.confidence = getConfidenceMeta(result.analysisConfidence);
    res.summary    = `تحتاج لتأكيد شرط واحد إضافي لتفعيل إشارة الشراء.`;
  } else if (bearGap <= 1) {
    res.status     = { text: 'انتظار', color: 'var(--yellow)' };
    res.bias       = { text: 'لا دخول (ميل هبوطي)', color: 'var(--yellow)' };
    res.trigger    = 'انتظار تحسن شروط الشراء';
    res.invalid    = result.sl ? `$${fmt(result.sl)}` : '—';
    res.confidence = getConfidenceMeta(result.analysisConfidence);
    res.summary    = `الشروط الهبوطية قريبة من الاكتمال، لذلك لا توجد أفضلية شراء كافية الآن.`;
  } else {
    res.status  = { text: 'لا يوجد دخول', color: 'var(--muted)' };
    res.bias    = { text: 'انتظار', color: 'var(--muted)' };
    res.summary = `السوق لا يوفر إعداد دخولي كافٍ حالياً. ابحث عن فرص أخرى أو انتظر تحسن السيولة.`;
  }

  return res;
}

function getConfidenceMeta(level) {
  switch (level) {
    case 'high':   return { text: 'مرتفع', color: 'var(--green)' };
    case 'medium': return { text: 'متوسط', color: 'var(--accent)' };
    case 'low':    return { text: 'منخفض', color: 'var(--yellow)' };
    default:       return { text: 'ضعيف', color: 'var(--red)' };
  }
}
