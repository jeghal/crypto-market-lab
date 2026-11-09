export const JOURNAL_KEY = 'binance_signal_journal_v1';
export const MODEL = Object.freeze({ intervalMs: 900000, horizonBars: 192, feeRate: 0.001, slippageRate: 0.0005 });
const finite = value => Number.isFinite(value) && value > 0;
export function readJournal(storage = globalThis.localStorage) {
  try {
    const data = JSON.parse(storage?.getItem(JOURNAL_KEY) || '{}');
    return data.version === 1 && Array.isArray(data.records) ? data.records : [];
  } catch { return []; }
}
export function writeJournal(records, storage = globalThis.localStorage) {
  try { storage.setItem(JOURNAL_KEY, JSON.stringify({ version: 1, records: records.slice(-500) })); return true; }
  catch { return false; }
}
export function captureSignal(result, records, observedAt = Date.now()) {
  if (!result.signal || result.bearSignal || !/^[A-Z0-9]{5,25}$/.test(result.sym || '')) return records;
  if (![result.price, result.sl, result.tp].every(finite) || !(result.sl < result.price && result.price < result.tp)
    || !Number.isFinite(result.analysisCandleTime)) return records;
  const id = `${result.sym}:${result.analysisProfile || 'balanced'}:${result.analysisCandleTime}`;
  if (records.some(record => record.id === id)) return records;
  return [...records, { id, symbol: result.sym, profile: result.analysisProfile || 'balanced',
    observedAt, analysisCandleTime: result.analysisCandleTime, requestedInterval: result.requestedIv || result.chartIv,
    effectiveInterval: result.chartIv, referencePrice: result.price, stop: result.sl, target: result.tp,
    conditionCount: result.condCount, rr: result.rr, model: { ...MODEL }, status: 'pending',
    note: 'paper_forward_next_full_candle', dataSource: 'Binance Spot public market data' }].slice(-500);
}
export function evaluateRecord(record, candles, now = Date.now()) {
  if (record.status !== 'pending') return record;
  const model = record.model || MODEL;
  const start = (Math.floor(record.observedAt / model.intervalMs) + 1) * model.intervalMs;
  const deadline = start + model.horizonBars * model.intervalMs;
  const eligible = [...new Map(candles.filter(c => c.t >= start && c.t < deadline && c.t + model.intervalMs <= now)
    .map(c => [c.t, c])).values()].sort((a,b) => a.t-b.t);
  if (!eligible.length) return record;
  if (eligible[0].t !== start) return { ...record, evaluationWarning: 'missing_history' };
  const entry = eligible[0].o * (1 + model.slippageRate);
  if (!finite(entry) || record.stop >= entry || record.target <= entry) {
    return { ...record, status: 'skipped_gap', enteredAt: start, entry, evaluationWarning: 'entry_outside_plan' };
  }
  let expectedTime = start;
  for (const candle of eligible) {
    if (candle.t !== expectedTime || ![candle.o,candle.h,candle.l,candle.c].every(finite)) {
      return { ...record, entry, enteredAt: start, evaluationWarning: 'missing_history' };
    }
    expectedTime += model.intervalMs;
    const stopHit = candle.l <= record.stop;
    const targetHit = candle.h >= record.target;
    if (stopHit && targetHit) return { ...record, entry, enteredAt:start, exitedAt:candle.t+model.intervalMs,
      status:'ambiguous', netReturnPct:null, evaluationWarning:'both_levels_in_same_candle' };
    const expired = expectedTime === deadline;
    if (stopHit || targetHit || expired) {
      const exitReference = stopHit ? Math.min(record.stop, candle.o) : targetHit ? record.target : candle.c;
      const exit = exitReference * (1 - model.slippageRate);
      const netReturnPct = (exit * (1-model.feeRate) / (entry * (1+model.feeRate)) - 1) * 100;
      return { ...record, entry, exit, enteredAt:start, exitedAt:candle.t+model.intervalMs,
        status:stopHit?'stop':targetHit?'target':'expired', netReturnPct, evaluationWarning:null };
    }
  }
  return { ...record, entry, enteredAt:start, evaluationWarning:null };
}
export function journalStats(records) {
  const completed = records.filter(r => ['target','stop','expired'].includes(r.status) && Number.isFinite(r.netReturnPct));
  const wins = completed.filter(r => r.netReturnPct > 0).length;
  return { total:records.length, completed:completed.length, pending:records.filter(r=>r.status==='pending').length,
    ambiguous:records.filter(r=>r.status==='ambiguous').length,
    skipped:records.filter(r=>r.status==='skipped_gap').length,
    winRate:completed.length?wins/completed.length*100:null,
    meanNetReturnPct:completed.length?completed.reduce((sum,r)=>sum+r.netReturnPct,0)/completed.length:null,
    sufficientSample:completed.length>=30 };
}
export function updateJournal(result, storage = globalThis.localStorage, now = Date.now()) {
  const records = readJournal(storage).map(record => record.symbol === result.sym
    ? evaluateRecord(record, result.evaluationCandles || [], now) : record);
  const next = captureSignal(result, records, now);
  return { saved:writeJournal(next, storage), stats:journalStats(next) };
}
