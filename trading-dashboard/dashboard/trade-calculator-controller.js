import { api } from './api.js';
import { addListener } from './listener-registry.js';
import { calculateSpotTrade, parseNumericInput } from './trade-calculator.js';

const TC_KEY = 'td_trade_calc';

function fmt(v) {
  const n = +v;
  const d = n >= 1 ? 2 : 4;
  return n.toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtQty(v) {
  if (!Number.isFinite(v)) return '\u2014';
  return v.toLocaleString('en', {
    minimumFractionDigits: v < 1 ? 6 : 4,
    maximumFractionDigits: v < 1 ? 6 : 4,
  });
}

export function createTradeCalculatorController({ el, state, showToast } = {}) {
  if (!el) throw new Error('createTradeCalculatorController: el is required');
  if (!state) throw new Error('createTradeCalculatorController: state is required');

  let bound = false;
  let liveController = null;
  let liveResetTimerId = null;

  function tcAsset() {
    return String(state.curSym || '').replace('USDT', '');
  }

  function clearQuickButtons() {
    el.tpBtns?.querySelectorAll('.tc-qbtn').forEach((b) => b.classList.remove('active'));
    el.slBtns?.querySelectorAll('.tc-qbtn').forEach((b) => b.classList.remove('active'));
  }

  function persist() {
    try {
      localStorage.setItem(TC_KEY, JSON.stringify({
        amount: el.amount?.value ?? '',
        entry: el.entry?.value ?? '',
        target: el.target?.value ?? '',
        stop: el.stop?.value ?? '',
        trigger: el.trigger?.value ?? '',
        buyFee: el.buyFee?.value ?? '0.1',
        sellFee: el.sellFee?.value ?? '0.1',
      }));
    } catch { /* quota */ }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(TC_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.amount && el.amount) el.amount.value = s.amount;
      if (s.entry && el.entry) el.entry.value = s.entry;
      if (s.target && el.target) el.target.value = s.target;
      if (s.stop && el.stop) el.stop.value = s.stop;
      if (s.trigger && el.trigger) el.trigger.value = s.trigger;
      if (s.buyFee && el.buyFee) el.buyFee.value = s.buyFee;
      if (s.sellFee && el.sellFee) el.sellFee.value = s.sellFee;
    } catch {
      localStorage.removeItem(TC_KEY);
    }
  }

  function clearResults() {
    ['qty', 'buyFeeAmt', 'qtyNet', 'tpNet', 'tpFee', 'profitAmt', 'profitPct', 'slNet', 'slLoss', 'rr'].forEach((k) => {
      if (el[k]) el[k].textContent = '\u2014';
    });
    if (el.bepPrice) el.bepPrice.textContent = '\u2014';
    if (el.breakeven) el.breakeven.dataset.value = '';
    if (el.bepApply) el.bepApply.style.display = 'none';
  }

  function renderTriggerWarning() {
    if (!el.triggerWarn || !el.trigger || !el.stop) return;

    const triggerVal = el.trigger.value.trim();
    const stopVal = el.stop.value.trim();

    if (!triggerVal) {
      el.triggerWarn.style.display = 'none';
      return;
    }

    const trigger = Number(triggerVal.replace(',', '.'));
    const stop = Number(stopVal.replace(',', '.'));

    if (!Number.isFinite(trigger) || trigger <= 0) {
      el.triggerWarn.style.display = 'none';
      return;
    }

    let msg = '';
    let cls = '';

    if (!Number.isFinite(stop) || stop <= 0) {
      msg = 'أدخل سعر وقف الخسارة (SL) أولاً للمقارنة';
      cls = 'warn-info';
    } else if (trigger < stop) {
      msg = '\u26A0 خطأ: سعر التفعيل يجب أن يكون أعلى من سعر الوقف \u2014 وإلا سيتفعل الأمر فوراً';
      cls = 'warn-error';
    } else {
      const gapPct = ((trigger - stop) / stop) * 100;
      if (gapPct === 0) {
        msg = '\u26A0 التفعيل = الوقف: قد يُنفّذ الأمر مباشرة مع أقل حركة في السوق';
        cls = 'warn-caution';
      } else if (gapPct > 1) {
        msg = `\u26A0 فجوة كبيرة (${gapPct.toFixed(2)}%): الأمر بعيد عن الوقف وقد يسبب انزلاقاً \u2014 راجع الإعداد`;
        cls = 'warn-caution';
      } else {
        msg = `\u2713 فجوة منطقية: ${gapPct.toFixed(3)}% \u2014 الأمر سيُنفَّذ قرب ${Number(stop).toLocaleString('en')} $`;
        cls = 'warn-ok';
      }
    }

    el.triggerWarn.textContent = msg;
    el.triggerWarn.className = `tc-trigger-warn ${cls}`;
    el.triggerWarn.style.display = 'block';
  }

  function render() {
    if (!el.amount) return;

    const amountVal = el.amount.value.trim();
    const entryVal = el.entry?.value.trim();

    if (!amountVal) {
      clearResults();
      if (el.note) el.note.textContent = 'أدخل رأس المال (USDT) لبدء الحساب.';
      return;
    }
    if (!entryVal) {
      clearResults();
      if (el.note) el.note.textContent = 'أدخل سعر الدخول.';
      return;
    }

    const result = calculateSpotTrade({
      amount: amountVal,
      entry: entryVal,
      target: el.target?.value,
      stop: el.stop?.value,
      buyFeePct: el.buyFee?.value ?? 0.1,
      sellFeePct: el.sellFee?.value ?? 0.1,
    });

    const asset = tcAsset();

    if (!result) {
      clearResults();
      if (el.note) el.note.textContent = 'تحقق من القيم المدخلة — خاصة سعر الدخول والرسوم.';
      return;
    }

    if (el.qty) el.qty.textContent = `${fmtQty(result.qty)} ${asset}`;
    if (el.buyFeeAmt) el.buyFeeAmt.textContent = `$${fmt(result.buyFeeAmount)}`;
    if (el.qtyNet) el.qtyNet.textContent = `${fmtQty(result.qtyAfterBuy)} ${asset}`;

    if (el.breakeven) {
      if (el.bepPrice) el.bepPrice.textContent = Number.isFinite(result.breakeven) ? `$${fmt(result.breakeven)} ` : '\u2014';
      el.breakeven.dataset.value = Number.isFinite(result.breakeven) ? String(result.breakeven) : '';
      if (el.bepApply) el.bepApply.style.display = Number.isFinite(result.breakeven) ? 'inline' : 'none';
    }

    if (el.tpNet) el.tpNet.textContent = Number.isFinite(result.targetNet) ? `$${fmt(result.targetNet)}` : '\u2014';
    if (el.tpFee) el.tpFee.textContent = Number.isFinite(result.targetSellFee) ? `$${fmt(result.targetSellFee)}` : '\u2014';

    const profitIsLoss = Number.isFinite(result.rewardAmount) && result.rewardAmount < 0;
    if (el.profitBar) el.profitBar.className = `tc-profit-bar ${profitIsLoss ? 'negative' : 'positive'}`;
    if (el.profitLabel) el.profitLabel.textContent = profitIsLoss ? 'الخسارة الصافية' : 'الربح الصافي';
    if (el.profitAmt) {
      el.profitAmt.textContent = Number.isFinite(result.rewardAmount)
        ? `${profitIsLoss ? '-$' : '+$'}${fmt(Math.abs(result.rewardAmount))}`
        : '\u2014';
    }

    const amountNum = parseNumericInput(amountVal);
    const profitPct = Number.isFinite(result.rewardAmount) && amountNum > 0
      ? (result.rewardAmount / amountNum) * 100
      : null;
    if (el.profitPct) {
      el.profitPct.textContent = Number.isFinite(profitPct)
        ? `${profitIsLoss ? '\u2193 -' : '\u2191 +'}${Math.abs(profitPct).toFixed(2)}%`
        : '\u2014';
    }

    const stopPnl = Number.isFinite(result.stopNet) ? result.stopNet - amountNum : null;
    const stopIsLoss = !Number.isFinite(stopPnl) || stopPnl < 0;
    if (el.slCard) el.slCard.className = `tc-scenario ${stopIsLoss ? 'loss' : 'profit'}`;
    if (el.slLabel) el.slLabel.textContent = stopIsLoss ? '\uD83D\uDED1 سيناريو الإيقاف (SL)' : '\u2705 وقف مع ربح';
    if (el.slNet) el.slNet.textContent = Number.isFinite(result.stopNet) ? `$${fmt(result.stopNet)}` : '\u2014';
    if (el.slLoss) {
      el.slLoss.textContent = Number.isFinite(stopPnl)
        ? `${stopPnl < 0 ? '-$' : '+$'}${fmt(Math.abs(stopPnl))}`
        : '\u2014';
    }

    if (el.rr) {
      el.rr.textContent = Number.isFinite(result.riskReward) ? `1 : ${result.riskReward.toFixed(2)}` : '\u2014';
      el.rr.style.color = Number.isFinite(result.riskReward)
        ? (result.riskReward >= 1.5 ? 'var(--green)' : result.riskReward >= 1 ? 'var(--accent)' : 'var(--red)')
        : 'var(--accent)';
    }

    if (el.note) {
      el.note.textContent = Number.isFinite(result.riskReward)
        ? `خطر صافٍ $${fmt(result.riskAmount)} \u2190 عائد صافٍ $${fmt(result.rewardAmount)} (بعد الرسوم)`
        : 'أكمل حقول الهدف ووقف الخسارة لحساب نسبة المخاطرة/العائد.';
    }
  }

  function fillFromSignal() {
    const r = state.lastResult;
    if (!r) return;

    if (r.signal && r.bearSignal) {
      showToast?.('يوجد تضارب بين إشارة الشراء والبيع؛ تم إيقاف الملء التلقائي في حاسبة Spot.', 'info');
      return;
    }
    if (r.bearSignal) {
      showToast?.('الحاسبة الحالية مخصصة لصفقات Spot/شراء فقط؛ لا يتم الملء التلقائي لإشارات البيع.', 'info');
      return;
    }

    if (Number.isFinite(r.price) && el.entry) el.entry.value = r.price.toFixed(r.price > 100 ? 2 : 4);
    if (Number.isFinite(r.tp) && el.target) el.target.value = r.tp.toFixed(r.tp > 100 ? 2 : 4);
    if (Number.isFinite(r.sl) && el.stop) {
      el.stop.value = r.sl.toFixed(r.sl > 100 ? 2 : 4);
      if (el.trigger) {
        const suggestedTrigger = r.sl * 1.002;
        el.trigger.value = suggestedTrigger.toFixed(r.sl > 100 ? 2 : 4);
      }
    }

    clearQuickButtons();

    if (!r.signal) {
      showToast?.('تمت التعبئة من القراءة الحالية، لكنها ليست إشارة شراء مفعلة بعد.', 'info');
    }

    persist();
    render();
    renderTriggerWarning();
  }

  async function fillLiveEntry() {
    if (!el.liveBtn) return;

    const orig = el.liveBtn.textContent;
    if (liveResetTimerId) clearTimeout(liveResetTimerId);

    liveController?.abort();
    liveController = new AbortController();

    el.liveBtn.disabled = true;
    el.liveBtn.textContent = '\u27F3 جارٍ الجلب...';

    try {
      let price = state.prices?.[state.curSym]?.price ?? state.lastResult?.price;
      if (!Number.isFinite(price) || price <= 0) {
        const data = await api('/api/v3/ticker/price', { symbol: state.curSym }, { signal: liveController.signal });
        price = +data.price;
      }

      if (Number.isFinite(price) && price > 0) {
        if (el.entry) el.entry.value = price.toFixed(price > 100 ? 2 : 4);
        clearQuickButtons();
        persist();
        render();
        el.liveBtn.textContent = `\u2713 $${price.toLocaleString('en', { maximumFractionDigits: 2 })}`;
      } else {
        el.liveBtn.textContent = '\u2715 غير متوفر';
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      el.liveBtn.textContent = '\u2715 فشل';
    } finally {
      liveResetTimerId = setTimeout(() => {
        el.liveBtn.textContent = orig;
        el.liveBtn.disabled = false;
      }, 2500);
    }
  }

  function init() {
    if (bound) return;
    bound = true;

    restore();
    if (el.amount && !el.amount.value) el.amount.value = '100';
    render();
    renderTriggerWarning();

    const inputs = [el.amount, el.entry, el.target, el.stop, el.buyFee, el.sellFee].filter(Boolean);
    inputs.forEach((node) => {
      addListener(node, 'input', () => {
        if (node === el.entry) {
          clearQuickButtons();
        } else if (node === el.target) {
          el.tpBtns?.querySelectorAll('.tc-qbtn').forEach((b) => b.classList.remove('active'));
        } else if (node === el.stop) {
          el.slBtns?.querySelectorAll('.tc-qbtn').forEach((b) => b.classList.remove('active'));
        }
        persist();
        render();
        renderTriggerWarning();
      });
    });

    if (el.trigger) {
      addListener(el.trigger, 'input', () => {
        persist();
        renderTriggerWarning();
      });
    }

    if (el.tpBtns) {
      addListener(el.tpBtns, 'click', (e) => {
        const btn = e.target.closest('[data-tp]');
        if (!btn || !el.target) return;
        const entry = Number(el.entry?.value);
        if (!Number.isFinite(entry) || entry <= 0) return;
        el.target.value = (entry * (1 + Number(btn.dataset.tp) / 100)).toFixed(entry > 100 ? 2 : 4);
        el.tpBtns.querySelectorAll('.tc-qbtn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        persist();
        render();
      });
    }

    if (el.slBtns) {
      addListener(el.slBtns, 'click', (e) => {
        const btn = e.target.closest('[data-sl]');
        if (!btn || !el.stop) return;
        const entry = Number(el.entry?.value);
        if (!Number.isFinite(entry) || entry <= 0) return;
        el.stop.value = (entry * (1 - Number(btn.dataset.sl) / 100)).toFixed(entry > 100 ? 2 : 4);
        el.slBtns.querySelectorAll('.tc-qbtn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        persist();
        render();
        renderTriggerWarning();
      });
    }

    if (el.breakevenBtn) {
      addListener(el.breakevenBtn, 'click', () => {
        const bep = Number(el.breakeven?.dataset.value);
        if (!Number.isFinite(bep) || bep <= 0 || !el.stop) return;
        el.stop.value = bep.toFixed(bep > 100 ? 2 : 4);
        el.slBtns?.querySelectorAll('.tc-qbtn').forEach((b) => b.classList.remove('active'));
        el.breakevenBtn.classList.add('active');
        persist();
        render();
        renderTriggerWarning();
      });
    }

    if (el.bepApply) {
      addListener(el.bepApply, 'click', () => {
        const bep = Number(el.breakeven?.dataset.value);
        if (!Number.isFinite(bep) || bep <= 0 || !el.stop) return;
        el.stop.value = bep.toFixed(bep > 100 ? 2 : 4);
        el.slBtns?.querySelectorAll('.tc-qbtn').forEach((b) => b.classList.remove('active'));
        persist();
        render();
        renderTriggerWarning();
      });
    }

    if (el.liveBtn) addListener(el.liveBtn, 'click', fillLiveEntry);
    if (el.fillBtn) addListener(el.fillBtn, 'click', fillFromSignal);
  }

  function dispose() {
    liveController?.abort();
    liveController = null;
    if (liveResetTimerId) clearTimeout(liveResetTimerId);
    liveResetTimerId = null;
  }

  return {
    init,
    render,
    renderTriggerWarning,
    clearQuickButtons,
    persist,
    restore,
    fillFromSignal,
    dispose,
  };
}
