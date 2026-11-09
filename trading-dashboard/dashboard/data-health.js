import { state } from './state.js';
import { IV_LABELS } from './config.js';
export function healthView(data, now = Date.now()) {
  const age = data.receivedAt ? Math.max(0, now-data.receivedAt) : null;
  const stale = data.failed || age == null || age > 90000;
  return { age, stale, label:data.failed?'تعذّر التحديث':age==null?'في انتظار البيانات':stale?'بيانات متأخرة':'بيانات حديثة' };
}
export function renderDataHealth() {
  const root = document.getElementById('dataHealth');
  if (!root) return;
  const health = state.dataHealth || {};
  const view = healthView({...health, failed:health.failed || state.runtime.isOnline === false});
  const label = IV_LABELS[health.effectiveIv] || health.effectiveIv || '—';
  const requested = IV_LABELS[state.curIv] || state.curIv;
  const time = health.receivedAt ? new Date(health.receivedAt).toLocaleTimeString('ar', {hour12:false}) : '—';
  root.dataset.stale = String(Boolean(view.stale));
  root.textContent = `${view.label} · آخر تحديث ${time} · عمر البيانات ${view.age==null?'—':Math.floor(view.age/1000)+'ث'} · الفريم الفعلي ${label}${health.effectiveIv && health.effectiveIv!==state.curIv?' (المطلوب '+requested+')':''} · ${state.network.wsConnected?'بث متصل':'البث غير متصل'}${health.journalSaved===false?' · تعذّر حفظ سجل الإشارات':''}`;
  const signal = document.getElementById('sigTxt');
  if (signal) {
    signal.dataset.stale=String(Boolean(view.stale));
    signal.title=view.stale?'التحليل المعروض لم يعد حديثاً؛ انتظر نجاح التحديث.':'';
  }
}
